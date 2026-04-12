const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const router = express.Router();
const mistral = require('../../services/infra/mistralClient');
const { transcribeWithGroq } = require('../../services/infra/audioProcessor');
const logger = require('../../logger');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max for short voice questions
});

// Cache product knowledge in memory — re-read from disk every 5 minutes
// so updates to product-knowledge.md take effect without restarting the server.
let knowledgeCache = null;
let knowledgeCachedAt = 0;
const KNOWLEDGE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const KNOWLEDGE_PATH = path.join(__dirname, '../data/product-knowledge.md');

function getProductKnowledge() {
  const now = Date.now();
  if (knowledgeCache && now - knowledgeCachedAt < KNOWLEDGE_TTL_MS) {
    return knowledgeCache;
  }
  try {
    knowledgeCache = fs.readFileSync(KNOWLEDGE_PATH, 'utf8');
    knowledgeCachedAt = now;
    return knowledgeCache;
  } catch (err) {
    logger.error('Failed to read product-knowledge.md', { err: err.message });
    return knowledgeCache || ''; // serve stale cache on failure
  }
}

function buildSystemPrompt(knowledge) {
  return `You are a friendly, helpful guide for SAS Edu AI — a classroom engagement platform built for SASTRA University.
Your job is to help teachers and students understand what the platform offers and encourage them to try it.

RULES — follow these strictly:
- Never mention any technology, database, cloud provider, API, framework, or company name that powers the platform behind the scenes.
- If asked how something works technically, describe only the benefit or outcome — not the mechanism.
- Keep answers concise: 2–4 sentences unless the question genuinely needs more detail.
- Be warm and encouraging, not pushy or salesy.
- Always end your reply with a gentle nudge to sign in, try the demo, or explore a relevant feature.
- If you don't know something, say: "I'm not sure about that yet — try signing in to explore, or check back soon!"
- Never make up features that are not listed in the platform knowledge below.

PLATFORM KNOWLEDGE:
${knowledge}`;
}

// POST /api/sales-agent/chat
router.post('/chat', async (req, res) => {
  const { message, history } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  const trimmed = message.trim().slice(0, 500); // hard cap at 500 chars
  if (!trimmed) {
    return res.status(400).json({ error: 'message cannot be empty' });
  }

  // Validate and sanitise history — accept up to 10 prior turns
  const safeHistory = Array.isArray(history)
    ? history
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content.slice(0, 1000) }))
    : [];

  const knowledge = getProductKnowledge();
  const systemPrompt = buildSystemPrompt(knowledge);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...safeHistory,
    { role: 'user', content: trimmed },
  ];

  try {
    const result = await mistral.chatComplete(
      mistral.models.small, // fast + cheap — conversational, not RAG
      messages,
      { temperature: 0.7, maxTokens: 300, retries: 2 }
    );

    return res.json({ reply: result.content.trim() });
  } catch (err) {
    logger.error('Sales agent Mistral error', { err: err.message });

    if (err.message?.includes('circuit breaker')) {
      return res.status(503).json({ error: 'Service temporarily unavailable. Please try again in a moment.' });
    }

    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/sales-agent/transcribe — Groq Whisper STT for the widget mic button
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file provided' });
  }

  try {
    const result = await transcribeWithGroq(
      req.file.buffer,
      req.file.originalname || 'audio.webm',
      req.file.mimetype || 'audio/webm'
    );

    const transcript = (result.transcript || '').trim();
    if (!transcript) {
      return res.json({ transcript: '' }); // silence or noise — let frontend handle gracefully
    }

    return res.json({ transcript });
  } catch (err) {
    logger.error('Sales agent transcription error', { err: err.message });
    return res.status(500).json({ error: 'Transcription failed. Please type your question instead.' });
  }
});

module.exports = router;
