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

// ─── PDF Rendering Helpers ───────────────────────────────────────────────────

const PDF_COLORS = {
  primary:      '#4F46E5',
  primaryDark:  '#3730A3',
  primaryLight: '#EEF2FF',
  accent:       '#7C3AED',
  text:         '#1F2937',
  textMuted:    '#6B7280',
  textLight:    '#9CA3AF',
  border:       '#E5E7EB',
  borderDark:   '#D1D5DB',
  h3:           '#312E81',
  h4:           '#4338CA',
  tableHeader:  '#EEF2FF',
  tableAlt:     '#F9FAFB',
  bulletColor:  '#4F46E5',
};

/**
 * Renders a line of text with inline **bold** and *italic* support.
 * firstOpts are passed to the very first text segment (width, lineGap, etc.).
 */
function renderInlineText(doc, text, firstOpts = {}) {
  if (text === undefined || text === null) { doc.text('', firstOpts); return; }
  const str = String(text);

  const regex = /(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|`[^`\n]+?`)/g;
  const parts = [];
  let last = 0;
  let m;
  while ((m = regex.exec(str)) !== null) {
    if (m.index > last) parts.push({ t: str.slice(last, m.index), f: 'Helvetica' });
    const raw = m[0];
    if (raw.startsWith('**'))     parts.push({ t: raw.slice(2, -2), f: 'Helvetica-Bold' });
    else if (raw.startsWith('*')) parts.push({ t: raw.slice(1, -1), f: 'Helvetica-Oblique' });
    else                          parts.push({ t: raw.slice(1, -1), f: 'Courier' }); // code
    last = m.index + raw.length;
  }
  if (last < str.length) parts.push({ t: str.slice(last), f: 'Helvetica' });

  const valid = parts.filter(p => p.t);
  if (!valid.length) { doc.font('Helvetica').text('', firstOpts); return; }

  valid.forEach((p, i) => {
    doc.font(p.f);
    if (i === 0) {
      doc.text(p.t, { ...firstOpts, continued: i < valid.length - 1 });
    } else {
      doc.text(p.t, { continued: i < valid.length - 1 });
    }
  });
  doc.font('Helvetica');
}

/**
 * Strips markdown symbols for use in contexts that don't support inline rendering.
 */
function stripInlineMd(text) {
  return String(text || '')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1');
}

/**
 * Renders a markdown table (array of raw pipe-delimited lines) as a PDF grid.
 * Rows auto-size to fit wrapped content — no text is clipped.
 */
function renderTable(doc, tableLines, x, contentWidth) {
  const rows = tableLines
    .filter(l => !/^\|?[-:\s|]+\|?\s*$/.test(l.trim())) // drop separator rows
    .map(l =>
      l.split('|')
       .map(c => c.trim())
       .filter((_, i, a) => i > 0 && i < a.length - 1)
    )
    .filter(r => r.length > 0);

  if (!rows.length) return;

  const colCount = Math.max(...rows.map(r => r.length));
  if (!colCount) return;

  const CELL_PAD      = 5;
  const CELL_FONT     = 9;
  const MIN_HEADER_H  = 26;
  const MIN_ROW_H     = 20;
  const colW          = Math.floor(contentWidth / colCount);

  // Calculate dynamic row heights so wrapped text is never clipped
  const rowHeights = rows.map((row, ri) => {
    const minH = ri === 0 ? MIN_HEADER_H : MIN_ROW_H;
    let maxH = minH;
    row.forEach((cell, ci) => {
      const cellW = ci === colCount - 1 ? (x + contentWidth - (x + ci * colW)) : colW;
      const clean = stripInlineMd(cell);
      try {
        const h = doc.fontSize(CELL_FONT)
                     .font(ri === 0 ? 'Helvetica-Bold' : 'Helvetica')
                     .heightOfString(clean, { width: Math.max(10, cellW - CELL_PAD * 2) });
        maxH = Math.max(maxH, h + CELL_PAD * 2);
      } catch (_) { /* fall back to minimum */ }
    });
    return maxH;
  });

  const totalH = rowHeights.reduce((a, b) => a + b, 0);
  if (doc.y + totalH + 20 > doc.page.height - 80) doc.addPage();

  const startY = doc.y;
  let curY = startY;

  rows.forEach((row, ri) => {
    const isHeader = ri === 0;
    const rh = rowHeights[ri];

    // Row background
    doc.rect(x, curY, contentWidth, rh)
       .fill(isHeader ? PDF_COLORS.tableHeader : (ri % 2 === 0 ? PDF_COLORS.tableAlt : 'white'));
    doc.fillColor(PDF_COLORS.text);

    // Outer border
    doc.rect(x, curY, contentWidth, rh).stroke(PDF_COLORS.borderDark);

    row.forEach((cell, ci) => {
      const cellX = x + ci * colW;
      const cellW = ci === colCount - 1 ? (x + contentWidth - cellX) : colW;

      // Vertical divider (except first col)
      if (ci > 0) {
        doc.moveTo(cellX, curY).lineTo(cellX, curY + rh).stroke(PDF_COLORS.borderDark);
      }

      const clean = stripInlineMd(cell);
      doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
         .fontSize(CELL_FONT)
         .fillColor(isHeader ? PDF_COLORS.h4 : PDF_COLORS.text)
         .text(clean, cellX + CELL_PAD, curY + CELL_PAD, {
           width: Math.max(10, cellW - CELL_PAD * 2),
           lineBreak: true,
         });
    });

    curY += rh;
  });

  // Reposition cursor after table
  doc.font('Helvetica').fontSize(11).fillColor(PDF_COLORS.text);
  doc.text('', x, curY + 6);
  doc.moveDown(0.3);
}

/**
 * Renders a section header bar (indigo background, white text).
 */
function renderSectionHeader(doc, title) {
  const margin = 50;
  const contentWidth = doc.page.width - 100;
  const y = doc.y;
  doc.rect(margin, y, contentWidth, 22).fill(PDF_COLORS.primary);
  doc.fillColor('white').fontSize(12).font('Helvetica-Bold')
     .text(title, margin + 8, y + 5, { width: contentWidth - 16 });
  doc.fillColor(PDF_COLORS.text).moveDown(0.7);
}

/**
 * Main markdown-aware content renderer.
 * Handles: H1–H4+ headers, horizontal rules, bullet/sub-bullet/numbered lists,
 * tables (auto-height), bold-label lines, inline bold/italic.
 * No raw markdown symbols ever reach the rendered output.
 */
function renderMarkdownContent(doc, text, opts = {}) {
  if (!text) return;
  const margin       = opts.margin       ?? 50;
  const contentWidth = opts.contentWidth ?? (doc.page.width - 100);
  const baseFontSize = opts.baseFontSize ?? 11;

  const lines      = String(text).split('\n');
  let tableBuffer  = [];

  const flushTable = () => {
    if (!tableBuffer.length) return;
    renderTable(doc, tableBuffer, margin, contentWidth);
    tableBuffer = [];
  };

  lines.forEach(rawLine => {
    const line = rawLine.trimEnd();

    // Collect table rows for batch rendering
    if (/^\s*\|/.test(line)) {
      tableBuffer.push(line);
      return;
    }
    flushTable();

    // Empty line → small gap
    if (!line.trim()) {
      doc.moveDown(0.3);
      return;
    }

    // Horizontal rule (--- / *** / ___) → thin separator line, never show raw chars
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      doc.moveDown(0.4);
      doc.moveTo(margin, doc.y)
         .lineTo(margin + contentWidth, doc.y)
         .lineWidth(0.5).strokeColor(PDF_COLORS.border).stroke();
      doc.strokeColor(PDF_COLORS.text);
      doc.moveDown(0.5);
      return;
    }

    // 5+ hash headers — normalise to H4 styling so no raw '#' leaks
    const hDeep = line.match(/^#{5,}\s+(.*)/);
    if (hDeep) {
      if (doc.y > doc.page.height - 100) doc.addPage();
      doc.moveDown(0.4);
      doc.fontSize(baseFontSize).fillColor(PDF_COLORS.h4);
      renderInlineText(doc, hDeep[1], { width: contentWidth, lineGap: 2 });
      doc.fillColor(PDF_COLORS.text).fontSize(baseFontSize).moveDown(0.15);
      return;
    }

    // H4  ####
    const h4 = line.match(/^#{4}\s+(.*)/);
    if (h4) {
      if (doc.y > doc.page.height - 100) doc.addPage();
      doc.moveDown(0.4);
      doc.fontSize(baseFontSize).fillColor(PDF_COLORS.h4);
      renderInlineText(doc, h4[1], { width: contentWidth, lineGap: 2 });
      doc.fillColor(PDF_COLORS.text).fontSize(baseFontSize).moveDown(0.15);
      return;
    }

    // H3  ###
    const h3 = line.match(/^#{3}\s+(.*)/);
    if (h3) {
      if (doc.y > doc.page.height - 100) doc.addPage();
      doc.moveDown(0.5);
      doc.fontSize(baseFontSize + 1).fillColor(PDF_COLORS.h3);
      renderInlineText(doc, h3[1], { width: contentWidth, lineGap: 3 });
      doc.fillColor(PDF_COLORS.text).fontSize(baseFontSize).moveDown(0.2);
      return;
    }

    // H2  ##
    const h2 = line.match(/^#{2}\s+(.*)/);
    if (h2) {
      if (doc.y > doc.page.height - 120) doc.addPage();
      doc.moveDown(0.6);
      doc.fontSize(baseFontSize + 2).fillColor(PDF_COLORS.primaryDark);
      renderInlineText(doc, h2[1], { width: contentWidth, lineGap: 4 });
      doc.fillColor(PDF_COLORS.text).fontSize(baseFontSize).moveDown(0.25);
      return;
    }

    // H1  #
    const h1 = line.match(/^#\s+(.*)/);
    if (h1) {
      if (doc.y > doc.page.height - 140) doc.addPage();
      doc.moveDown(0.7);
      doc.fontSize(baseFontSize + 3).fillColor(PDF_COLORS.primary);
      renderInlineText(doc, h1[1], { width: contentWidth, lineGap: 5 });
      doc.fillColor(PDF_COLORS.text).fontSize(baseFontSize).moveDown(0.3);
      return;
    }

    // Sub-bullet  (2+ spaces then - or *)
    const subbullet = line.match(/^(\s{2,})[-*]\s+(.*)/);
    if (subbullet) {
      const indent = 25;
      doc.font('Helvetica').fontSize(baseFontSize - 0.5).fillColor(PDF_COLORS.textMuted);
      renderInlineText(doc, `◦  ${subbullet[2]}`, { width: contentWidth - indent, indent, lineGap: 2 });
      doc.fillColor(PDF_COLORS.text).fontSize(baseFontSize);
      return;
    }

    // Top-level bullet  (- * •)
    const bullet = line.match(/^\s*[-*•]\s+(.*)/);
    if (bullet) {
      const indent = 14;
      doc.font('Helvetica').fontSize(baseFontSize).fillColor(PDF_COLORS.text);
      renderInlineText(doc, `•  ${bullet[1]}`, { width: contentWidth - indent, indent, lineGap: 3 });
      return;
    }

    // Numbered list
    const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)/);
    if (numbered) {
      const indent = 14;
      doc.font('Helvetica').fontSize(baseFontSize).fillColor(PDF_COLORS.text);
      renderInlineText(doc, `${numbered[1]}.  ${numbered[2]}`, { width: contentWidth - indent, indent, lineGap: 3 });
      return;
    }

    // Standalone bold-label lines: **Label** or **Label**: (act as visual sub-headers)
    // These are common when the AI uses bold text as a category heading before a bullet list.
    const boldLabel = line.match(/^\*\*([^*\n]+)\*\*:?\s*$/);
    if (boldLabel) {
      const labelText = boldLabel[1] + (line.trimEnd().endsWith(':') ? ':' : '');
      doc.moveDown(0.2);
      doc.font('Helvetica-Bold').fontSize(baseFontSize).fillColor(PDF_COLORS.h4)
         .text(labelText, margin, doc.y, { width: contentWidth, lineGap: 2 });
      doc.fillColor(PDF_COLORS.text).font('Helvetica').moveDown(0.1);
      return;
    }

    // Regular text / paragraph — strip any stray leading # that somehow slipped through
    const safeLine = line.replace(/^#+\s*/, '');
    doc.font('Helvetica').fontSize(baseFontSize).fillColor(PDF_COLORS.text);
    renderInlineText(doc, safeLine, { width: contentWidth, lineGap: 3 });
  });

  flushTable();
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

async function fetchResourceTexts(sessionStringId, selectedResourceIds = null) {
  try {
    let query = supabase
      .from('resources')
      .select('id, title, file_name, resource_type, is_vectorized')
      .eq('session_id', sessionStringId)
      .neq('resource_type', 'auto_notes'); // exclude previously generated notes

    if (selectedResourceIds && selectedResourceIds.length > 0) {
      // Teacher manually selected specific resources — use those regardless of vectorization
      query = query.in('id', selectedResourceIds);
    } else {
      // Default: only include vectorized resources (have text available)
      query = query.eq('is_vectorized', true);
    }

    const { data: resources, error: resErr } = await query;
    if (resErr || !resources || resources.length === 0) return [];

    const result = [];
    for (const resource of resources) {
      let fullText = '';

      if (resource.is_vectorized) {
        const { data: chunks, error: chunkErr } = await supabase
          .from('resource_chunks')
          .select('chunk_text, chunk_index, page_number')
          .eq('resource_id', resource.id)
          .order('chunk_index');

        if (!chunkErr && chunks && chunks.length > 0) {
          fullText = chunks.map(c => c.chunk_text).join('\n\n');
        }
      }

      // Include even non-vectorized resources — their title/filename will be referenced in notes
      result.push({
        id: resource.id,
        title: resource.title,
        fileName: resource.file_name,
        resourceType: resource.resource_type,
        text: fullText, // may be empty for non-vectorized; that's fine
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

FORMATTING RULES — follow these exactly:
- Use ## for major topic headings, ### for sub-topics, #### for specific items. Never use more than 4 hash levels (#####+ is forbidden).
- Use markdown pipe-format tables (| Col | Col |) whenever presenting comparisons, frameworks, agent examples (PEAS), algorithms, or any data with multiple attributes across items. Example:
  | Aspect | Detail |
  | --- | --- |
  | Row | Value |
- Use - for bullet points. Use numbered lists (1. 2. 3.) for sequential steps.
- Bold important terms with **term**.
- Do NOT use horizontal rules (--- or *** or ___) as separators anywhere in your output.
- Do NOT add extra blank lines between a bold label and its bullets — keep them together.

Output EXACTLY the following sections separated by these exact markers (include the brackets):

[SUMMARY]
2-3 sentence overview of what was covered in this class.

[KEY_TOPICS]
- Topic 1: brief explanation
- Topic 2: brief explanation
(5-8 topics maximum)

[DETAILED_NOTES]
Thorough explanation organised by topic. Use ## and ### sub-headings. Where topics have multiple comparable items (e.g., agent types, algorithm variants, PEAS examples), present them in a markdown table instead of repeated bullet blocks.

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
    const doc = new PDFDocument({
      margin: 50,
      size: 'A4',
      bufferPages: true,
      info: {
        Title:   `Class Notes — ${session.title || 'Session'}`,
        Author:  'SAS Edu AI',
        Subject: `Session ${session.session_id}`,
        Creator: 'SAS Edu AI (SASTRA University)',
      },
    });

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const MARGIN       = 50;
    const pageWidth    = doc.page.width;
    const contentWidth = pageWidth - MARGIN * 2;
    const mdOpts       = { margin: MARGIN, contentWidth, baseFontSize: 10.5 };

    // ── Cover banner ───────────────────────────────────────────────────────
    doc.rect(0, 0, pageWidth, 140).fill(PDF_COLORS.primary);
    doc.rect(0, 137, pageWidth, 5).fill(PDF_COLORS.accent);

    doc.fillColor('white')
       .fontSize(28).font('Helvetica-Bold')
       .text('CLASS NOTES', MARGIN, 42, { align: 'center', width: contentWidth, characterSpacing: 1.5 });
    doc.fontSize(12).font('Helvetica')
       .text('AI-Generated Study Notes  ·  SAS Edu AI', MARGIN, 80, { align: 'center', width: contentWidth });

    // ── Session info card ──────────────────────────────────────────────────
    doc.fillColor(PDF_COLORS.text);
    const cardY = 158;
    doc.roundedRect(MARGIN, cardY, contentWidth, 80, 6)
       .fill(PDF_COLORS.primaryLight);
    // Left accent stripe
    doc.rect(MARGIN, cardY, 4, 80).fill(PDF_COLORS.primary);

    doc.fillColor(PDF_COLORS.primaryDark).fontSize(15).font('Helvetica-Bold')
       .text(session.title || 'Untitled Session', MARGIN + 14, cardY + 10, { width: contentWidth - 18 });

    const dateStr = session.live_started_at
      ? new Date(session.live_started_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
      : new Date().toLocaleDateString();

    const infoItems = [
      `Course: ${session.course_name || 'N/A'}`,
      `Date: ${dateStr}`,
      `Session ID: ${session.session_id}`,
      `Duration: ${computeDuration(session.live_started_at, session.live_ended_at)}`,
    ];
    doc.fillColor(PDF_COLORS.textMuted).fontSize(10).font('Helvetica');
    infoItems.forEach((item, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      doc.text(item, MARGIN + 14 + col * (contentWidth / 2), cardY + 36 + row * 16, {
        width: contentWidth / 2 - 18,
      });
    });

    doc.fillColor(PDF_COLORS.text);
    doc.text('', MARGIN, cardY + 92); // advance cursor past the card
    doc.moveDown(0.8);

    // ── Summary ────────────────────────────────────────────────────────────
    renderSectionHeader(doc, 'Session Summary');
    renderMarkdownContent(doc, notesData.summary || 'Summary not available.', mdOpts);
    doc.moveDown(1);

    // ── Key Topics ─────────────────────────────────────────────────────────
    if (doc.y > 650) doc.addPage();
    renderSectionHeader(doc, 'Key Topics Covered');
    renderMarkdownContent(doc, notesData.keyTopics || 'No topics extracted.', mdOpts);
    doc.moveDown(1);

    // ── Detailed Notes ─────────────────────────────────────────────────────
    doc.addPage();
    renderSectionHeader(doc, 'Detailed Notes');
    renderMarkdownContent(doc, notesData.detailedNotes || 'No detailed notes available.', mdOpts);
    doc.moveDown(1);

    // ── Key Takeaways ──────────────────────────────────────────────────────
    if (doc.y > 640) doc.addPage();
    renderSectionHeader(doc, 'Key Takeaways');
    renderMarkdownContent(doc, notesData.importantPoints || 'No key points extracted.', mdOpts);
    doc.moveDown(1);

    // ── Resources Referenced ───────────────────────────────────────────────
    if (doc.y > 650) doc.addPage();
    renderSectionHeader(doc, 'Referenced Resources');
    if (resources.length > 0) {
      resources.forEach(r => {
        const label = (r.resourceType || 'file').toUpperCase();
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor(PDF_COLORS.text)
           .text(`• ${r.title || r.fileName}`, { width: contentWidth, lineGap: 2 });
        doc.font('Helvetica').fontSize(9).fillColor(PDF_COLORS.textMuted)
           .text(`    ${label}  ·  ${r.fileName}`, { width: contentWidth, indent: 10, lineGap: 1 });
        doc.fillColor(PDF_COLORS.text).moveDown(0.4);
      });
    } else {
      renderMarkdownContent(doc, notesData.resourcesCovered || 'No uploaded resources for this session.', mdOpts);
    }

    // ── Footer on every page ───────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).font('Helvetica').fillColor(PDF_COLORS.textLight)
         .text(
           `SAS Edu AI  ·  Session ${session.session_id}  ·  Page ${i + 1} of ${range.count}`,
           MARGIN, doc.page.height - 30,
           { align: 'center', width: contentWidth }
         );
      // Footer line
      doc.moveTo(MARGIN, doc.page.height - 38)
         .lineTo(pageWidth - MARGIN, doc.page.height - 38)
         .lineWidth(0.5)
         .stroke(PDF_COLORS.border);
    }

    doc.end();
  });
}

// ─── Step 7: Upload to Supabase Storage ──────────────────────────────────

async function ensureNotesBucketExists() {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets && buckets.some(b => b.name === 'session-notes');
  if (!exists) {
    await supabase.storage.createBucket('session-notes', { public: true, fileSizeLimit: 52428800 });
  }
}

async function uploadNotesPDF(sessionStringId, pdfBuffer) {
  const filename = `notes_${sessionStringId}_${Date.now()}.pdf`;
  const storagePath = `${sessionStringId}/${filename}`;

  await ensureNotesBucketExists();

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
  try {
    // Only update if still 'generating' — don't overwrite a teacher-initiated cancel ('none')
    await pool.query(
      `UPDATE sessions
       SET notes_status       = $1::text,
           notes_url          = $2,
           notes_generated_at = CASE WHEN $1::text = 'ready' THEN CURRENT_TIMESTAMP ELSE NULL END,
           notes_error        = $3
       WHERE id = $4 AND notes_status = 'generating'`,
      [status, notesUrl, errorMessage, sessionNumericId]
    );
  } catch (err) {
    logger.warn('updateNotesStatus failed (columns may not exist yet)', { error: err.message });
  }
}

async function insertNotesAttempt(sessionNumericId, status, notesUrl, storagePath, transcriptLength, resourceCount, errorMessage) {
  try {
    await pool.query(
      `INSERT INTO session_notes (session_id, status, notes_url, storage_path, transcript_length, resource_count, generation_completed_at, error_message)
       VALUES ($1, $2::text, $3, $4, $5, $6, CASE WHEN $2::text = 'ready' THEN CURRENT_TIMESTAMP ELSE NULL END, $7)`,
      [sessionNumericId, status, notesUrl, storagePath, transcriptLength, resourceCount, errorMessage]
    );
  } catch (err) {
    logger.warn('Failed to insert session_notes row (non-fatal)', { error: err.message });
  }
}

// ─── Main orchestrator ────────────────────────────────────────────────────

async function generateNotesAsync(session, options = {}) {
  const sessionStringId = session.session_id;
  const sessionNumericId = session.id;
  const { selectedResourceIds = null } = options;

  logger.info('Starting notes generation', { sessionId: sessionStringId, selectedResourceIds });

  let transcriptText = '';
  let resources = [];

  try {
    // 1. Fetch transcript
    transcriptText = await fetchTranscript(sessionStringId, session.live_started_at, session.live_ended_at);

    // 2. Fetch resource texts (filtered by teacher selection if provided)
    resources = await fetchResourceTexts(sessionStringId, selectedResourceIds);

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
