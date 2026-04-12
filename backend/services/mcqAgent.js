'use strict';
require('dotenv').config();

const { StateGraph, END, Annotation } = require('@langchain/langgraph');
const { ChatMistralAI, MistralAIEmbeddings } = require('@langchain/mistralai');
const { PineconeStore } = require('@langchain/pinecone');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { StringOutputParser } = require('@langchain/core/output_parsers');
const { index: pineconeIndex } = require('../config/pinecone');
const sessionContextStore = require('./sessionContextStore');
const pool = require('../db');

// ── State Definition ──────────────────────────────────────────────────────────
const StateAnnotation = Annotation.Root({
  transcript:  Annotation,
  sessionId:   Annotation,
  resourceId:  Annotation,
  mcqTypes:    Annotation,
  mcqCount:    Annotation,
  context:     Annotation,
  mcqText:     Annotation,
  mcqs:        Annotation,
});

// ── Shared model instances ────────────────────────────────────────────────────
const embeddings = new MistralAIEmbeddings({
  model:  'mistral-embed',
  apiKey: process.env.MISTRAL_API_KEY,
});

const llm = new ChatMistralAI({
  model:       'mistral-medium-latest',
  apiKey:      process.env.MISTRAL_API_KEY,
  temperature: 0.3,
  maxTokens:   2000,
});

// ── Node 1: Retrieve course-material context from Pinecone ────────────────────
// Only runs if teacher explicitly selected a resource. Skipped when resourceId is null.
async function retrieveContext(state) {
  // Priority 1: in-session PDF uploaded during recording (in-memory, no DB)
  if (sessionContextStore.hasContext(state.sessionId)) {
    try {
      const results = await sessionContextStore.search(state.sessionId, state.transcript.substring(0, 300), 5);
      if (results.length && results[0].score >= 0.3) {
        const context = results.map((r, i) => `[${i + 1}] ${r.text}`).join('\n\n').slice(0, 3000);
        console.log(`[MCQAgent] Using in-session PDF context (top score: ${results[0].score.toFixed(2)}) for session: ${state.sessionId}`);
        return { context };
      }
      console.log(`[MCQAgent] In-session PDF not relevant to transcript — skipping`);
    } catch (err) {
      console.warn(`[MCQAgent] In-session context search failed: ${err.message}`);
    }
    return { context: '' };
  }

  // Priority 2: pre-uploaded resource selected by teacher
  if (!state.resourceId) {
    console.log(`[MCQAgent] No resource selected — skipping context retrieval for session: ${state.sessionId}`);
    return { context: '' };
  }

  try {
    const queryText = state.transcript.substring(0, 300);
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex,
      filter: { session_id: state.sessionId, resource_id: state.resourceId },
    });
    const docs = await vectorStore.similaritySearch(queryText, 5);

    if (!docs.length) {
      console.log(`[MCQAgent] No matching chunks found for resource: ${state.resourceId}`);
      return { context: '' };
    }

    // Relevance check: if top result score is very low the resource is off-topic — skip it.
    // PineconeStore.similaritySearchWithScore returns [doc, score] pairs.
    const docsWithScore = await vectorStore.similaritySearchWithScore(queryText, 1);
    if (docsWithScore.length && docsWithScore[0][1] < 0.3) {
      console.log(`[MCQAgent] Resource context not relevant to transcript (score: ${docsWithScore[0][1].toFixed(2)}) — ignoring for session: ${state.sessionId}`);
      return { context: '' };
    }

    const context = docs
      .map((doc, i) => `[${i + 1}] ${doc.pageContent}`)
      .join('\n\n')
      .slice(0, 3000);
    console.log(`[MCQAgent] Retrieved ${docs.length} context chunks for resource: ${state.resourceId}`);
    return { context };
  } catch (err) {
    console.warn(`[MCQAgent] Context retrieval failed (continuing without): ${err.message}`);
    return { context: '' };
  }
}

// ── Node 2: Generate questions via Mistral ────────────────────────────────────
const TYPE_DESCRIPTIONS = {
  mcq:              '- mcq: 4-option multiple choice\n  Example: {{ "type": "mcq", "question": "...", "question_latex": null, "options_metadata": {{ "options": ["A","B","C","D"], "correct": 0 }}, "blooms_level": "Remember", "difficulty": 1, "justification": "..." }}',
  true_false:       '- true_false: statement that is true or false\n  Example: {{ "type": "true_false", "question": "...", "options_metadata": {{ "correct": 0 }}, "blooms_level": "Understand", "difficulty": 1, "justification": "..." }}',
  fill_blank:       '- fill_blank: short fill-in-the-blank (1-3 word answer, use ___ in the question)\n  Example: {{ "type": "fill_blank", "question": "The ___ law states ...", "options_metadata": {{ "accepted_answers": ["Newton"] }}, "blooms_level": "Remember", "difficulty": 1, "justification": "..." }}',
  numeric:          '- numeric: numerical answer with tolerance\n  Example: {{ "type": "numeric", "question": "Calculate ...", "options_metadata": {{ "correct_value": 9.81, "tolerance": 0.1, "unit": "m/s2" }}, "blooms_level": "Apply", "difficulty": 2, "justification": "..." }}',
  assertion_reason: '- assertion_reason: one assertion + one reason, options: A=both correct+reason explains, B=both correct+reason doesn\'t explain, C=assertion correct+reason wrong, D=assertion wrong\n  Example: {{ "type": "assertion_reason", "question": "Assertion: ... Reason: ...", "options_metadata": {{ "correct": 0 }}, "blooms_level": "Analyze", "difficulty": 2, "justification": "..." }}',
};

function buildMCQSystemPrompt(types, count) {
  const activeTypes = (types && types.length > 0) ? types : Object.keys(TYPE_DESCRIPTIONS);
  const typeLines = activeTypes
    .filter(t => TYPE_DESCRIPTIONS[t])
    .map(t => TYPE_DESCRIPTIONS[t])
    .join('\n');

  return `You are an AI question generator for university lectures. Generate exactly ${count} question${count !== 1 ? 's' : ''} using ONLY the allowed types below.

PRIORITY RULE: Base questions PRIMARILY on the transcript. Use course material context ONLY to add depth or clarify — never shift focus away from what was actually said in the transcript.

ALLOWED TYPES:
${typeLines}

Output ONLY a valid JSON array of exactly ${count} question${count !== 1 ? 's' : ''} — no markdown fences, no explanation outside the array.
blooms_level must be one of: Remember, Understand, Apply, Analyze, Evaluate, Create
difficulty: 1=easy, 2=medium, 3=hard`;
}

const MCQ_HUMAN = `Transcript Segment:
{transcript}

Course Materials Context:
{context}

Generate exactly the required number of questions. Focus on what was SAID IN THE TRANSCRIPT. Use course material context only if it directly relates to the transcript content. Output ONLY the JSON array.`;

async function generateMCQs(state) {
  const systemPrompt = buildMCQSystemPrompt(state.mcqTypes, state.mcqCount);
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', systemPrompt],
    ['human', MCQ_HUMAN],
  ]);
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());
  const mcqText = await chain.invoke({
    transcript: state.transcript,
    context: state.context || 'No additional context available.',
  });
  console.log(`[MCQAgent] Generated MCQ text (${mcqText.length} chars) for session: ${state.sessionId}`);
  return { mcqText };
}

// ── Node 3: Parse JSON → objects, store in DB, broadcast ─────────────────────
function parseAIOutput(text) {
  // Strip markdown fences if model wraps output in ```json ... ```
  const clean = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  try {
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Fallback: find JSON array anywhere in the text
    const match = clean.match(/\[[\s\S]*\]/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { return []; }
    }
    return [];
  }
}

async function parseAndStore(state) {
  const questions = parseAIOutput(state.mcqText);
  if (!questions.length) {
    console.warn(`[MCQAgent] No questions parsed for session: ${state.sessionId}`);
    return { mcqs: [] };
  }

  // Resolve 6-char session code → numeric sessions.id
  const sessionResult = await pool.query(
    'SELECT id FROM sessions WHERE session_id = $1',
    [state.sessionId.toUpperCase()]
  );
  if (!sessionResult.rows.length) {
    console.warn(`[MCQAgent] Session not found: ${state.sessionId}`);
    return { mcqs: [] };
  }
  const numericSessionId = sessionResult.rows[0].id;

  const VALID_TYPES = [
    'mcq', 'true_false', 'fill_blank', 'numeric', 'short_answer', 'essay', 'code',
    'multi_correct', 'assertion_reason', 'match_following', 'ordering',
    'diagram_labeling', 'truth_table', 'code_trace', 'differentiate',
  ];

  const insertedMCQs = [];
  for (const q of questions) {
    // Skip questions with no question text — would violate NOT NULL constraint
    if (!q.question || typeof q.question !== 'string' || !q.question.trim()) {
      console.warn(`[MCQAgent] Skipping question with no text (type: ${q.type})`);
      continue;
    }

    const meta = q.options_metadata || {};
    const qType = VALID_TYPES.includes(q.type) ? q.type : 'mcq';

    // Backward-compat: derive legacy options[] + correct_answer for MCQ/TF
    // Other types use '[]' as fallback — options column is NOT NULL; real data is in options_metadata.
    let legacyOptions = '[]';
    let legacyCorrect = null;
    if (qType === 'mcq' && Array.isArray(meta.options) && meta.options.length >= 2) {
      legacyOptions = JSON.stringify(meta.options);
      legacyCorrect = meta.correct ?? 0;
    } else if (qType === 'true_false') {
      legacyOptions = JSON.stringify(['True', 'False']);
      legacyCorrect = meta.correct ?? 0;
    } else if (qType === 'assertion_reason') {
      legacyOptions = JSON.stringify(['A', 'B', 'C', 'D']);
      legacyCorrect = meta.correct ?? 0;
    }

    const diffNum = parseInt(q.difficulty);
    try {
      const res = await pool.query(
        `INSERT INTO generated_mcqs
           (session_id, question, options, correct_answer, justification, difficulty,
            question_type, options_metadata, blooms_level)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          numericSessionId,
          q.question.trim(),
          legacyOptions,
          legacyCorrect,
          q.justification || '',
          [1, 2, 3].includes(diffNum) ? diffNum : 1,
          qType,
          JSON.stringify(meta),
          q.blooms_level || null,
        ]
      );
      insertedMCQs.push(res.rows[0]);
    } catch (insertErr) {
      console.warn(`[MCQAgent] Failed to insert question "${q.question.substring(0, 50)}": ${insertErr.message}`);
    }
  }

  console.log(`[MCQAgent] ✓ Stored ${insertedMCQs.length} questions for session: ${state.sessionId}`);

  if (global.broadcastToSession) {
    global.broadcastToSession(state.sessionId.toUpperCase(), {
      type:      'mcqs-generated',
      sessionId: state.sessionId,
      count:     insertedMCQs.length,
      mcqs:      insertedMCQs,
    });
  }

  return { mcqs: insertedMCQs };
}

// ── Graph ─────────────────────────────────────────────────────────────────────
const graph = new StateGraph(StateAnnotation)
  .addNode('retrieve_context', retrieveContext)
  .addNode('generate_mcqs',    generateMCQs)
  .addNode('parse_and_store',  parseAndStore)
  .addEdge('__start__',        'retrieve_context')
  .addEdge('retrieve_context', 'generate_mcqs')
  .addEdge('generate_mcqs',    'parse_and_store')
  .addEdge('parse_and_store',  END)
  .compile();

// ── Public API ────────────────────────────────────────────────────────────────
async function runMCQAgent(transcript, sessionId, { types = null, count = 3, resourceId = null } = {}) {
  console.log(`[MCQAgent] Starting for session: ${sessionId} (${transcript.length} chars, types: ${(types || ['all']).join(',')}, count: ${count}, resource: ${resourceId || 'none'})`);
  const result = await graph.invoke({
    transcript,
    sessionId,
    resourceId,
    mcqTypes: types,
    mcqCount: count,
    context:  '',
    mcqText:  '',
    mcqs:     [],
  });
  return result.mcqs;
}

module.exports = { runMCQAgent };
