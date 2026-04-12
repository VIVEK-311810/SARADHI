'use strict';

/**
 * sessionContextStore.js — In-memory vector store for PDFs uploaded during a live recording.
 *
 * Files are parsed → chunked → embedded and held in RAM only.
 * Nothing is written to Supabase or Pinecone.
 * The store is keyed by session_id and cleared when the session ends.
 *
 * Used by mcqAgent to retrieve context when the teacher uploads a PDF mid-session
 * via POST /api/transcription/upload-context.
 */

const embeddingService = require('./embeddingService');
const documentProcessor = require('./documentProcessor');
const logger = require('../logger');

// Map<sessionId, { filename, chunks: Array<{ text, embedding }> }>
const store = new Map();

/**
 * Parse a PDF buffer, chunk it, embed each chunk, store in memory.
 * @param {string} sessionId
 * @param {Buffer} pdfBuffer
 * @param {string} filename
 * @returns {Promise<number>} number of chunks indexed
 */
async function indexPDF(sessionId, pdfBuffer, filename) {
  // Extract text using existing PDF parser
  const parsed = await documentProcessor.extractFromPDF(pdfBuffer);
  const text = parsed.text;
  if (!text || text.trim().length === 0) {
    throw new Error('Could not extract text from PDF');
  }

  // Chunk
  const chunks = embeddingService.chunkText(text, 512, 50);
  if (!chunks.length) throw new Error('No chunks produced from PDF');

  // Embed
  const texts = chunks.map(c => c.text);
  const embeddings = await embeddingService.generateBatchEmbeddings(texts);

  const indexed = chunks.map((chunk, i) => ({
    text: chunk.text,
    embedding: embeddings[i],
  }));

  store.set(sessionId, { filename, chunks: indexed });
  logger.info(`[SessionContextStore] Indexed ${indexed.length} chunks for session: ${sessionId} (${filename})`);
  return indexed.length;
}

/**
 * Retrieve the top-k most similar chunks for a query.
 * Returns [] if no in-session PDF has been indexed for this session.
 * @param {string} sessionId
 * @param {string} queryText
 * @param {number} topK
 * @returns {Promise<Array<{ text, score }>>}
 */
async function search(sessionId, queryText, topK = 5) {
  const entry = store.get(sessionId);
  if (!entry || !entry.chunks.length) return [];

  const queryEmbedding = await embeddingService.generateEmbedding(queryText);

  // Cosine similarity
  const scored = entry.chunks.map(chunk => ({
    text: chunk.text,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * Check whether an in-session PDF has been indexed for this session.
 */
function hasContext(sessionId) {
  return store.has(sessionId);
}

/**
 * Get the filename of the indexed PDF for a session (for logging/UI).
 */
function getFilename(sessionId) {
  return store.get(sessionId)?.filename || null;
}

/**
 * Clear in-memory context when session ends.
 */
function clearSession(sessionId) {
  if (store.delete(sessionId)) {
    logger.info(`[SessionContextStore] Cleared context for session: ${sessionId}`);
  }
}

function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

module.exports = { indexPDF, search, hasContext, getFilename, clearSession };
