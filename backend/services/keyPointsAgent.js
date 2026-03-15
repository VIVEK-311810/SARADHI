'use strict';

/**
 * keyPointsAgent.js — LangGraph agent for live key-point extraction
 *
 * 2-node StateGraph: extract_points → broadcast → END
 *
 * Runs alongside the MCQ agent after each transcript segment timer fires.
 * Uses Mistral Small for speed/cost, extracts 2-3 key takeaways, and
 * broadcasts them to students via WebSocket. No DB storage (ephemeral).
 */

const { StateGraph, END, Annotation } = require('@langchain/langgraph');
const { ChatMistralAI } = require('@langchain/mistralai');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { StringOutputParser } = require('@langchain/core/output_parsers');

// ── State Definition ──────────────────────────────────────────────────────────
const StateAnnotation = Annotation.Root({
  transcript: Annotation,
  sessionId:  Annotation,
  keyPoints:  Annotation,
});

// ── LLM (Mistral Small — fast + cheap for extraction) ──────────────────────────
const llm = new ChatMistralAI({
  model:       'mistral-small-latest',
  apiKey:      process.env.MISTRAL_API_KEY,
  temperature: 0.2,
  maxTokens:   500,
});

// ── Node 1: Extract key points from transcript segment ─────────────────────────
const EXTRACT_SYSTEM = `You are a concise educational assistant. Extract 2-3 key takeaways from the given lecture transcript segment.

Return ONLY a JSON array of strings. Each string should be one concise sentence (max 20 words).
Example: ["Newton's third law states every action has an equal and opposite reaction", "Friction force always opposes the direction of motion"]

If the transcript is too short or unclear to extract meaningful points, return an empty array: []`;

async function extractPoints(state) {
  const { transcript, sessionId } = state;

  if (!transcript || transcript.trim().length < 50) {
    console.log(`[KeyPointsAgent] Transcript too short for session: ${sessionId}, skipping`);
    return { keyPoints: '[]' };
  }

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', EXTRACT_SYSTEM],
    ['human', '{transcript}'],
  ]);
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());
  const rawOutput = await chain.invoke({ transcript: transcript.substring(0, 5000) });

  // Parse JSON array from response
  let keyPoints = [];
  try {
    // Extract JSON array even if wrapped in markdown code fences
    const jsonMatch = rawOutput.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      keyPoints = JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    console.warn(`[KeyPointsAgent] Failed to parse key points JSON: ${err.message}`);
  }

  // Validate: must be array of strings
  if (!Array.isArray(keyPoints)) keyPoints = [];
  keyPoints = keyPoints.filter(p => typeof p === 'string' && p.trim().length > 0);

  console.log(`[KeyPointsAgent] Extracted ${keyPoints.length} key points for session: ${sessionId}`);
  return { keyPoints: JSON.stringify(keyPoints) };
}

// ── Node 2: Broadcast key points via WebSocket ────────────────────────────────
async function broadcast(state) {
  const { sessionId } = state;
  const keyPoints = JSON.parse(state.keyPoints);

  if (!keyPoints.length) {
    console.log(`[KeyPointsAgent] No key points to broadcast for session: ${sessionId}`);
    return { keyPoints: state.keyPoints };
  }

  if (global.broadcastToSession) {
    global.broadcastToSession(sessionId.toUpperCase(), {
      type: 'key-points-update',
      sessionId,
      keyPoints,
      timestamp: new Date().toISOString(),
    });
    console.log(`[KeyPointsAgent] Broadcasted ${keyPoints.length} key points for session: ${sessionId}`);
  }

  return { keyPoints: state.keyPoints };
}

// ── Graph ─────────────────────────────────────────────────────────────────────
const graph = new StateGraph(StateAnnotation)
  .addNode('extract_points', extractPoints)
  .addNode('broadcast',      broadcast)
  .addEdge('__start__',      'extract_points')
  .addEdge('extract_points', 'broadcast')
  .addEdge('broadcast',      END)
  .compile();

// ── Public API ────────────────────────────────────────────────────────────────
async function runKeyPointsAgent(transcript, sessionId) {
  console.log(`[KeyPointsAgent] Starting for session: ${sessionId} (${transcript.length} chars)`);

  const result = await graph.invoke({
    transcript,
    sessionId,
    keyPoints: '[]',
  });

  return JSON.parse(result.keyPoints);
}

module.exports = { runKeyPointsAgent };
