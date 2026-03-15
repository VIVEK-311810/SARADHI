'use strict';

/**
 * notesGeneratorService.js
 *
 * Automatically generates a structured Notes.pdf when a teacher ends a live class.
 * Pipeline:
 *   1. Fetch all transcript segments from the DB for the session
 *   2. Fetch all uploaded resource text from Supabase resource_chunks (full text, not truncated)
 *   3. Apply token budget (30K chars transcript + 25K chars resources)
 *   4. Call Mistral Large with a structured notes prompt
 *   5. Build a PDF with pdfkit
 *   6. Upload PDF to Supabase Storage (session-notes bucket)
 *   7. Insert a row into the resources table with resource_type = 'auto_notes'
 *   8. Update sessions.notes_status + broadcast 'notes-ready' via WebSocket
 */

const pool = require('../db');
const { supabase } = require('../config/supabase');
const mistralClient = require('./mistralClient');
const summarizationService = require('./summarizationService');
const logger = require('../logger');
const PDFDocument = require('pdfkit');
const { v4: uuidv4 } = require('uuid');

const TRANSCRIPT_CHAR_LIMIT = 30000;
const RESOURCE_CHAR_LIMIT_TOTAL = 25000;

// ─── Helpers ────────────────────────────────────────────────────────────────

function computeDuration(start, end) {
  if (!start || !end) return 'N/A';
  const mins = Math.round((new Date(end) - new Date(start)) / 60000);
  if (mins < 1) return 'less than a minute';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${m}m`;
}

function renderSectionHeader(doc, title) {
  const y = doc.y;
  doc.rect(50, y, doc.page.width - 100, 20).fill('#4F46E5');
  doc.fillColor('white').fontSize(12).font('Helvetica-Bold').text(title, 58, y + 4);
  doc.fillColor('black').moveDown(0.6);
}

// ─── Step 1: Fetch transcript ─────────────────────────────────────────────

async function fetchTranscript(sessionStringId, liveStartedAt, liveEndedAt) {
  try {
    // Find the transcription_session that overlaps the live window
    let tsResult = await pool.query(`
      SELECT id FROM transcription_sessions
      WHERE session_id = $1
        AND start_time <= $2
        AND (end_time IS NULL OR end_time >= $3)
      ORDER BY start_time DESC
      LIMIT 1
    `, [sessionStringId, liveEndedAt || new Date(), liveStartedAt || new Date(0)]);

    // Fallback: most recent transcription session for this session
    if (tsResult.rows.length === 0) {
      tsResult = await pool.query(`
        SELECT id FROM transcription_sessions
        WHERE session_id = $1
        ORDER BY start_time DESC LIMIT 1
      `, [sessionStringId]);
    }

    if (tsResult.rows.length === 0) {
      logger.warn('No transcription session found', { sessionId: sessionStringId });
      return '';
    }

    const dbId = tsResult.rows[0].id;
    const segResult = await pool.query(`
      SELECT segment_text FROM transcripts
      WHERE session_db_id = $1
      ORDER BY timestamp ASC
    `, [dbId]);

    return segResult.rows.map(r => r.segment_text).join(' ').trim();
  } catch (err) {
    logger.error('fetchTranscript error', { error: err.message, sessionId: sessionStringId });
    return '';
  }
}

// ─── Step 2: Fetch resource texts from Supabase resource_chunks ───────────

async function fetchResourceTexts(sessionStringId) {
  try {
    const { data: resources, error: resErr } = await supabase
      .from('resources')
      .select('id, title, file_name, resource_type')
      .eq('session_id', sessionStringId)
      .eq('is_vectorized', true)
      .neq('resource_type', 'auto_notes'); // exclude previously generated notes

    if (resErr || !resources || resources.length === 0) return [];

    const result = [];
    for (const resource of resources) {
      const { data: chunks, error: chunkErr } = await supabase
        .from('resource_chunks')
        .select('chunk_text, chunk_index, page_number')
        .eq('resource_id', resource.id)
        .order('chunk_index');

      if (chunkErr || !chunks) continue;

      const fullText = chunks.map(c => c.chunk_text).join('\n\n');
      result.push({
        id: resource.id,
        title: resource.title,
        fileName: resource.file_name,
        resourceType: resource.resource_type,
        text: fullText,
      });
    }

    return result;
  } catch (err) {
    logger.error('fetchResourceTexts error', { error: err.message, sessionId: sessionStringId });
    return [];
  }
}

// ─── Step 3: Apply token budget ───────────────────────────────────────────

async function buildContentBudget(transcriptText, resourceTexts) {
  let transcript = transcriptText;

  // Pre-summarise very long transcripts
  if (transcript.length > TRANSCRIPT_CHAR_LIMIT) {
    logger.info('Transcript too long, pre-summarising', { length: transcript.length });
    try {
      transcript = await summarizationService.generateSummary(transcript);
    } catch (_) {
      transcript = transcript.substring(0, TRANSCRIPT_CHAR_LIMIT) + '\n[transcript truncated]';
    }
  }

  // Distribute resource budget proportionally
  const perResource = resourceTexts.length > 0
    ? Math.floor(RESOURCE_CHAR_LIMIT_TOTAL / resourceTexts.length)
    : RESOURCE_CHAR_LIMIT_TOTAL;

  const resources = resourceTexts.map(r => ({
    ...r,
    text: r.text.length > perResource
      ? r.text.substring(0, perResource) + '\n[content truncated]'
      : r.text,
  }));

  return { transcript, resources };
}

// ─── Step 4: Call Mistral ─────────────────────────────────────────────────

async function callMistral(session, transcript, resources) {
  const resourceBlocks = resources.map(r =>
    `--- ${r.title} (${r.resourceType}) ---\n${r.text}`
  ).join('\n\n');

  const userContent =
    `Session: ${session.title} | Course: ${session.course_name || 'N/A'} | Date: ${session.live_started_at ? new Date(session.live_started_at).toLocaleDateString() : new Date().toLocaleDateString()} | Duration: ${computeDuration(session.live_started_at, session.live_ended_at)}\n\n` +
    (transcript ? `=== LECTURE TRANSCRIPT ===\n${transcript}\n\n` : '') +
    (resourceBlocks ? `=== UPLOADED RESOURCES ===\n${resourceBlocks}` : '');

  const messages = [
    {
      role: 'system',
      content: `You are an educational note-taking assistant for SASTRA University. Synthesise the live class lecture transcript and supporting course materials into comprehensive, well-structured study notes. Be factually accurate and grounded in the provided sources.

Output EXACTLY the following sections separated by these exact markers (include the brackets):

[SUMMARY]
2-3 sentence overview of what was covered in this class.

[KEY_TOPICS]
- Topic 1: brief explanation
- Topic 2: brief explanation
(5-8 topics maximum)

[DETAILED_NOTES]
Thorough explanation organised by topic. Use sub-headings where appropriate. Include examples and important definitions discussed in class.

[IMPORTANT_POINTS]
• Key fact, formula, or concept 1
• Key fact, formula, or concept 2
(Bullet points only — most exam-relevant content)

[RESOURCES_COVERED]
List the uploaded resources that were referenced as study materials.`,
    },
    { role: 'user', content: userContent },
  ];

  return await mistralClient.chatComplete(
    mistralClient.models.large,
    messages,
    { maxTokens: 4096, temperature: 0.3, timeout: 120000 }
  );
}

// ─── Step 5: Parse Mistral output ─────────────────────────────────────────

function parseNotesOutput(content) {
  const extract = (tag) => {
    const match = content.match(new RegExp(`\\[${tag}\\]([\\s\\S]*?)(?=\\[[A-Z_]+\\]|$)`));
    return match ? match[1].trim() : '';
  };
  return {
    summary: extract('SUMMARY'),
    keyTopics: extract('KEY_TOPICS'),
    detailedNotes: extract('DETAILED_NOTES'),
    importantPoints: extract('IMPORTANT_POINTS'),
    resourcesCovered: extract('RESOURCES_COVERED'),
  };
}

// ─── Step 6: Build PDF ────────────────────────────────────────────────────

async function buildNotesPDF(session, notesData, resources) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - 100;

    // ── Cover ──────────────────────────────────────────────────────────────
    doc.rect(0, 0, pageWidth, 120).fill('#4F46E5');
    doc.fillColor('white').fontSize(26).font('Helvetica-Bold')
       .text('Class Notes', 50, 35, { align: 'center', width: contentWidth });
    doc.fontSize(14).font('Helvetica')
       .text('AI-Generated Study Notes', 50, 70, { align: 'center', width: contentWidth });
    doc.fillColor('black').moveDown(3);

    doc.fontSize(18).font('Helvetica-Bold').text(session.title || 'Untitled Session');
    doc.fontSize(11).font('Helvetica')
       .text(`Course: ${session.course_name || 'N/A'}`)
       .text(`Session ID: ${session.session_id}`)
       .text(`Date: ${session.live_started_at ? new Date(session.live_started_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString()}`)
       .text(`Duration: ${computeDuration(session.live_started_at, session.live_ended_at)}`);
    doc.moveDown(1.5);

    // ── Summary ────────────────────────────────────────────────────────────
    renderSectionHeader(doc, 'Session Summary');
    doc.fontSize(11).font('Helvetica').text(notesData.summary || 'Summary not available.', { lineGap: 3 });
    doc.moveDown(1.5);

    // ── Key Topics ─────────────────────────────────────────────────────────
    if (doc.y > 650) doc.addPage();
    renderSectionHeader(doc, 'Key Topics Covered');
    doc.fontSize(11).font('Helvetica').text(notesData.keyTopics || 'No topics extracted.', { lineGap: 3 });
    doc.moveDown(1.5);

    // ── Detailed Notes ─────────────────────────────────────────────────────
    doc.addPage();
    renderSectionHeader(doc, 'Detailed Notes');
    doc.fontSize(10).font('Helvetica').text(notesData.detailedNotes || 'No detailed notes available.', { lineGap: 4 });
    doc.moveDown(1.5);

    // ── Key Takeaways ──────────────────────────────────────────────────────
    if (doc.y > 620) doc.addPage();
    renderSectionHeader(doc, 'Key Takeaways');
    doc.fontSize(10).font('Helvetica').text(notesData.importantPoints || 'No key points extracted.', { lineGap: 4 });
    doc.moveDown(1.5);

    // ── Resources Referenced ───────────────────────────────────────────────
    if (doc.y > 650) doc.addPage();
    renderSectionHeader(doc, 'Referenced Resources');
    if (resources.length > 0) {
      resources.forEach(r => {
        doc.fontSize(10).font('Helvetica-Bold').text(`• ${r.title}`);
        doc.fontSize(9).font('Helvetica').fillColor('#555555')
           .text(`  ${r.resourceType.toUpperCase()} — ${r.fileName}`, { indent: 10 });
        doc.fillColor('black').moveDown(0.3);
      });
    } else {
      doc.fontSize(10).font('Helvetica').text(notesData.resourcesCovered || 'No uploaded resources for this session.');
    }

    // ── Footer on every page ───────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).font('Helvetica').fillColor('#999999')
         .text(
           `SAS Edu AI — Session ${session.session_id} | Page ${i + 1} of ${range.count}`,
           50, doc.page.height - 35,
           { align: 'center', width: contentWidth }
         );
    }

    doc.end();
  });
}

// ─── Step 7: Upload to Supabase Storage ──────────────────────────────────

async function uploadNotesPDF(sessionStringId, pdfBuffer) {
  const filename = `notes_${sessionStringId}_${Date.now()}.pdf`;
  const storagePath = `${sessionStringId}/${filename}`;

  const { error } = await supabase.storage
    .from('session-notes')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      cacheControl: '86400',
      upsert: true,
    });

  if (error) throw new Error(`Supabase upload failed: ${error.message}`);

  const { data: urlData } = supabase.storage
    .from('session-notes')
    .getPublicUrl(storagePath);

  return { url: urlData.publicUrl, path: storagePath };
}

// ─── Step 8: Insert as a resource ────────────────────────────────────────

async function insertAsResource(session, url, storagePath, pdfBuffer) {
  const id = uuidv4();
  const fileName = `notes_${session.session_id}.pdf`;
  const { error } = await supabase.from('resources').insert({
    id,
    session_id: session.session_id,
    teacher_id: session.teacher_id,
    title: `Class Notes — ${session.title}`,
    resource_type: 'auto_notes',
    file_path: storagePath,
    file_url: url,
    file_name: fileName,
    file_size: pdfBuffer.length,
    is_vectorized: false,
  });

  if (error) {
    logger.warn('Failed to insert notes as resource (non-fatal)', { error: error.message });
  }
}

// ─── Step 9: Update DB status ─────────────────────────────────────────────

async function updateNotesStatus(sessionNumericId, status, notesUrl, errorMessage) {
  await pool.query(
    `UPDATE sessions
     SET notes_status       = $1,
         notes_url          = $2,
         notes_generated_at = CASE WHEN $1 = 'ready' THEN CURRENT_TIMESTAMP ELSE NULL END,
         notes_error        = $3
     WHERE id = $4`,
    [status, notesUrl, errorMessage, sessionNumericId]
  );
}

async function insertNotesAttempt(sessionNumericId, status, notesUrl, storagePath, transcriptLength, resourceCount, errorMessage) {
  try {
    await pool.query(
      `INSERT INTO session_notes (session_id, status, notes_url, storage_path, transcript_length, resource_count, generation_completed_at, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $2 = 'ready' THEN CURRENT_TIMESTAMP ELSE NULL END, $7)`,
      [sessionNumericId, status, notesUrl, storagePath, transcriptLength, resourceCount, errorMessage]
    );
  } catch (err) {
    logger.warn('Failed to insert session_notes row (non-fatal)', { error: err.message });
  }
}

// ─── Main orchestrator ────────────────────────────────────────────────────

async function generateNotesAsync(session) {
  const sessionStringId = session.session_id;
  const sessionNumericId = session.id;

  logger.info('Starting auto notes generation', { sessionId: sessionStringId });

  let transcriptText = '';
  let resources = [];

  try {
    // 1. Fetch transcript
    transcriptText = await fetchTranscript(sessionStringId, session.live_started_at, session.live_ended_at);

    // 2. Fetch resource texts
    resources = await fetchResourceTexts(sessionStringId);

    // Warn if no content at all — still proceed to generate a minimal PDF
    if (!transcriptText && resources.length === 0) {
      logger.warn('No transcript or resources found — generating minimal notes', { sessionId: sessionStringId });
    }

    // 3. Apply token budget
    const { transcript, resources: budgetedResources } = await buildContentBudget(transcriptText, resources);

    // 4. Call Mistral
    let notesData;
    try {
      const result = await callMistral(session, transcript, budgetedResources);
      notesData = parseNotesOutput(result.content || result);
    } catch (mistralErr) {
      logger.warn('Mistral failed, using fallback notes content', { error: mistralErr.message, sessionId: sessionStringId });
      notesData = {
        summary: 'AI synthesis was unavailable for this session.',
        keyTopics: transcript
          ? 'Transcript recorded — see detailed notes below for full content.'
          : 'No transcript available.',
        detailedNotes: transcript || 'No lecture transcript was recorded for this session.',
        importantPoints: resources.map(r => `• ${r.title}`).join('\n') || 'No resources uploaded.',
        resourcesCovered: resources.map(r => r.title).join(', ') || 'None',
      };
    }

    // 5. Build PDF
    const pdfBuffer = await buildNotesPDF(session, notesData, budgetedResources);

    // 6. Upload to Supabase Storage
    const { url, path: storagePath } = await uploadNotesPDF(sessionStringId, pdfBuffer);

    // 7. Insert as a resource (auto_notes type)
    await insertAsResource(session, url, storagePath, pdfBuffer);

    // 8. Update DB status
    await updateNotesStatus(sessionNumericId, 'ready', url, null);
    await insertNotesAttempt(sessionNumericId, 'ready', url, storagePath, transcriptText.length, resources.length, null);

    // 9. Broadcast notes-ready via WebSocket
    const wsPayload = {
      type: 'notes-ready',
      sessionId: sessionStringId.toUpperCase(),
      notesUrl: url,
      sessionTitle: session.title,
    };
    if (global.broadcastToSession) {
      global.broadcastToSession(sessionStringId.toUpperCase(), wsPayload);
    }
    if (global.broadcastToDashboardsForSession) {
      global.broadcastToDashboardsForSession(sessionStringId.toUpperCase(), wsPayload);
    }

    logger.info('Notes generation completed', { sessionId: sessionStringId, url });

  } catch (error) {
    logger.error('Notes generation pipeline failed', { error: error.message, sessionId: sessionStringId });
    await updateNotesStatus(sessionNumericId, 'failed', null, error.message).catch(() => {});
    await insertNotesAttempt(sessionNumericId, 'failed', null, null, transcriptText.length, resources.length, error.message);
  }
}

module.exports = {
  generateNotesAsync,
  // Exposed for notesAgent.js reuse
  _fetchTranscript: fetchTranscript,
  _fetchResourceTexts: fetchResourceTexts,
  _buildContentBudget: buildContentBudget,
};
