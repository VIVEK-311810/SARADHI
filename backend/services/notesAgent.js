'use strict';

/**
 * notesAgent.js — LangGraph agent for generating session notes
 *
 * 3-node StateGraph: fetch_session → generate_notes → notify → END
 *
 * Replaces the broken FINAL_NOTES_WEBHOOK_URL approach. Delegates heavy lifting
 * to notesGeneratorService.generateNotesAsync which handles:
 *   transcript fetch → resource fetch → budget → Mistral synthesis → PDF → Supabase → WS broadcast
 */

const { StateGraph, END, Annotation } = require('@langchain/langgraph');
const pool = require('../db');
const notesGeneratorService = require('./notesGeneratorService');
const logger = require('../logger');

// ── State Definition ──────────────────────────────────────────────────────────
const StateAnnotation = Annotation.Root({
  sessionId: Annotation,
  session:   Annotation,
  success:   Annotation,
  error:     Annotation,
});

// ── Node 1: Look up session from DB ───────────────────────────────────────────
async function fetchSession(state) {
  const { sessionId } = state;
  console.log(`[NotesAgent] Looking up session: ${sessionId}`);

  const result = await pool.query(
    `SELECT id, session_id, title, course_name, teacher_id,
            live_started_at, live_ended_at
     FROM sessions WHERE session_id = $1`,
    [sessionId.toUpperCase()]
  );

  if (result.rows.length === 0) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  console.log(`[NotesAgent] Session found: ${result.rows[0].title}`);
  return { session: JSON.stringify(result.rows[0]) };
}

// ── Node 2: Generate notes (transcript → Mistral → PDF → Supabase) ───────────
async function generateNotes(state) {
  const session = JSON.parse(state.session);
  console.log(`[NotesAgent] Generating notes for session: ${session.session_id}`);

  // Update status to 'generating'
  await pool.query(
    `UPDATE sessions SET notes_status = 'generating' WHERE id = $1`,
    [session.id]
  );

  // Delegate to the existing full pipeline
  await notesGeneratorService.generateNotesAsync(session);

  console.log(`[NotesAgent] Notes generation completed for session: ${session.session_id}`);
  return { success: 'true' };
}

// ── Node 3: Log completion ────────────────────────────────────────────────────
async function notify(state) {
  const session = JSON.parse(state.session);
  console.log(`[NotesAgent] Pipeline complete for session: ${session.session_id} — success: ${state.success}`);
  return {};
}

// ── Graph ─────────────────────────────────────────────────────────────────────
const graph = new StateGraph(StateAnnotation)
  .addNode('fetch_session',   fetchSession)
  .addNode('generate_notes',  generateNotes)
  .addNode('notify',          notify)
  .addEdge('__start__',       'fetch_session')
  .addEdge('fetch_session',   'generate_notes')
  .addEdge('generate_notes',  'notify')
  .addEdge('notify',          END)
  .compile();

// ── Public API ────────────────────────────────────────────────────────────────
async function runNotesAgent(sessionId) {
  console.log(`[NotesAgent] Starting for session: ${sessionId}`);

  try {
    const result = await graph.invoke({
      sessionId,
      session: '',
      success: 'false',
      error:   '',
    });
    console.log(`[NotesAgent] Completed for session: ${sessionId}`);
    return result;
  } catch (err) {
    logger.error('NotesAgent pipeline failed', { error: err.message, sessionId });
    throw err;
  }
}

module.exports = { runNotesAgent };
