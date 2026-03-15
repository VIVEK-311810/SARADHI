'use strict';
require('dotenv').config();

const { StateGraph, END, Annotation } = require('@langchain/langgraph');
const { ChatMistralAI, MistralAIEmbeddings } = require('@langchain/mistralai');
const { PineconeStore } = require('@langchain/pinecone');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { StringOutputParser } = require('@langchain/core/output_parsers');
const { index: pineconeIndex } = require('../config/pinecone');
const pool = require('../db');

// ── State Definition ──────────────────────────────────────────────────────────
const StateAnnotation = Annotation.Root({
  transcript: Annotation,
  sessionId:  Annotation,
  context:    Annotation,
  mcqText:    Annotation,
  mcqs:       Annotation,
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
async function retrieveContext(state) {
  try {
    const queryText = state.transcript.substring(0, 300);
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex,
      filter: { session_id: state.sessionId },
    });
    const docs = await vectorStore.similaritySearch(queryText, 5);
    const context = docs
      .map((doc, i) => `[${i + 1}] ${doc.pageContent}`)
      .join('\n\n')
      .slice(0, 3000);
    console.log(`[MCQAgent] Retrieved ${docs.length} context chunks for session: ${state.sessionId}`);
    return { context };
  } catch (err) {
    // Context retrieval is best-effort — MCQs can still be generated from transcript alone
    console.warn(`[MCQAgent] Context retrieval failed (continuing without): ${err.message}`);
    return { context: '' };
  }
}

// ── Node 2: Generate MCQs via Mistral ─────────────────────────────────────────
const MCQ_SYSTEM = `You are an expert MCQ generator for educational content.

Based on the transcript and course materials provided, generate 3-4 high-quality multiple-choice questions with 4 options (A, B, C, D), the correct answer, and a concise justification.

Format your output STRICTLY as:

---MCQ1---
Question: [Your question here]
A. [Option A]
B. [Option B]
C. [Option C]
D. [Option D]
Correct Answer: [A/B/C/D]
Justification: [Concise justification here]
Source: [Transcript/Additional Resource]

(Continue with ---MCQ2---, ---MCQ3---, ---MCQ4--- as needed)`;

const MCQ_HUMAN = `Transcript Segment:
{transcript}

Course Materials Context:
{context}

Generate 3-4 MCQs based on BOTH the transcript AND the course materials context above.`;

async function generateMCQs(state) {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', MCQ_SYSTEM],
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

// ── Node 3: Parse text → objects, store in DB, broadcast ─────────────────────
function parseMCQOutput(text) {
  const mcqs = [];
  const blocks = text.split(/---MCQ\d+---/).filter(b => b.trim().length > 0);

  for (const block of blocks) {
    let question = '', optionA = '', optionB = '', optionC = '', optionD = '';
    let correctAnswer = '', justification = '';
    let currentSection = '';

    for (const rawLine of block.split('\n')) {
      const line = rawLine.replace(/\*\*/g, '').trim();
      if (!line) continue;

      if (line.startsWith('Question:'))           { question = line.slice('Question:'.length).trim();       currentSection = 'question'; }
      else if (line.startsWith('A.'))              { optionA = line.slice(2).trim();                         currentSection = ''; }
      else if (line.startsWith('B.'))              { optionB = line.slice(2).trim();                         currentSection = ''; }
      else if (line.startsWith('C.'))              { optionC = line.slice(2).trim();                         currentSection = ''; }
      else if (line.startsWith('D.'))              { optionD = line.slice(2).trim();                         currentSection = ''; }
      else if (line.startsWith('Correct Answer:')) { correctAnswer = line.slice('Correct Answer:'.length).trim(); currentSection = ''; }
      else if (line.startsWith('Justification:'))  { justification = line.slice('Justification:'.length).trim(); currentSection = 'justification'; }
      else if (line.startsWith('Source:'))         { currentSection = ''; }
      else if (currentSection === 'question')      { question += ' ' + line; }
      else if (currentSection === 'justification') { justification += ' ' + line; }
    }

    if (question && optionA && optionB && optionC && optionD && correctAnswer) {
      mcqs.push({
        question:       question.trim(),
        option_a:       optionA,
        option_b:       optionB,
        option_c:       optionC,
        option_d:       optionD,
        correct_answer: correctAnswer.toUpperCase().charAt(0),
        justification:  justification.trim(),
      });
    }
  }
  return mcqs;
}

const ANSWER_INDEX = { A: 0, B: 1, C: 2, D: 3 };

async function parseAndStore(state) {
  const mcqs = parseMCQOutput(state.mcqText);
  if (!mcqs.length) {
    console.warn(`[MCQAgent] No MCQs parsed for session: ${state.sessionId}`);
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

  const insertedMCQs = [];
  for (const mcq of mcqs) {
    const correctIdx = ANSWER_INDEX[mcq.correct_answer] ?? 0;
    const res = await pool.query(
      `INSERT INTO generated_mcqs (session_id, question, options, correct_answer, justification)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        numericSessionId,
        mcq.question,
        JSON.stringify([mcq.option_a, mcq.option_b, mcq.option_c, mcq.option_d]),
        correctIdx,
        mcq.justification,
      ]
    );
    insertedMCQs.push(res.rows[0]);
  }

  console.log(`[MCQAgent] ✓ Stored ${insertedMCQs.length} MCQs for session: ${state.sessionId}`);

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
async function runMCQAgent(transcript, sessionId) {
  console.log(`[MCQAgent] Starting for session: ${sessionId} (${transcript.length} chars)`);
  const result = await graph.invoke({
    transcript,
    sessionId,
    context:  '',
    mcqText:  '',
    mcqs:     [],
  });
  return result.mcqs;
}

module.exports = { runMCQAgent };
