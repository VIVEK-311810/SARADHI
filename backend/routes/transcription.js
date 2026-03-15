const express = require('express');
const router = express.Router();
const multer = require('multer');
const fetch = require('node-fetch');
const audioProcessor = require('../services/audioProcessor');
const pool = require('../db');
const logger = require('../logger');
const { authenticate, authorize } = require('../middleware/auth');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Helper: verify teacher owns the session (prevents IDOR across all transcription routes)
async function verifySessionOwnership(sessionId, teacherId) {
  const result = await pool.query(
    'SELECT 1 FROM sessions WHERE session_id = $1 AND teacher_id = $2',
    [sessionId.toUpperCase(), teacherId]
  );
  return result.rows.length > 0;
}

// POST /api/transcription/start — Start transcription session (teacher only)
router.post('/start', authenticate, authorize('teacher'), upload.single('pdf'), async (req, res) => {
  try {
    const { session_id, segment_interval } = req.body;

    if (!session_id || !segment_interval) {
      return res.status(400).json({ error: 'Missing required fields: session_id, segment_interval' });
    }

    const intervalMinutes = parseInt(segment_interval);
    if (isNaN(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 60) {
      return res.status(400).json({ error: 'segment_interval must be between 1 and 60 minutes' });
    }

    // Verify teacher owns this session — prevents IDOR
    const sessionCheck = await pool.query(
      'SELECT 1 FROM sessions WHERE session_id = $1 AND teacher_id = $2',
      [session_id.toUpperCase(), req.user.id]
    );
    if (sessionCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Session not found or access denied' });
    }

    const pdfUploaded = !!req.file;
    const pdfFilename = req.file ? req.file.originalname : null;

    const session = await audioProcessor.createSession(session_id, intervalMinutes, pdfUploaded, pdfFilename);
    audioProcessor.startSegmentTimer(session_id, intervalMinutes);

    res.json({ success: true, session_id, session, message: 'Session started successfully' });
  } catch (error) {
    logger.error('Error starting transcription session', { error: error.message });
    res.status(500).json({ error: 'Failed to start session', details: error.message });
  }
});

// POST /api/transcription/audio-chunk — Receive audio chunk (teacher only)
router.post('/audio-chunk', authenticate, authorize('teacher'), upload.single('audio'), async (req, res) => {
  try {
    const { session_id } = req.body;

    if (!session_id) return res.status(400).json({ error: 'session_id is required' });
    if (!req.file) return res.status(400).json({ error: 'No audio file provided' });
    if (!(await verifySessionOwnership(session_id, req.user.id))) {
      return res.status(403).json({ error: 'Session not found or access denied' });
    }

    const transcriptionResult = await audioProcessor.forwardToGPUServer(
      req.file.buffer, session_id, req.file.originalname, req.file.mimetype
    );

    const transcript = transcriptionResult.transcript || transcriptionResult.text || '';
    const detectedLanguage = transcriptionResult.detected_language;

    if (transcript && transcript.trim().length > 0) {
      await audioProcessor.saveTranscript(session_id, transcript, detectedLanguage);

      // Broadcast only to clients in this session, not all connected clients
      if (global.broadcastToSession) {
        global.broadcastToSession(session_id.toUpperCase(), {
          type: 'transcript-received',
          session_id,
          transcript,
          detected_language: detectedLanguage,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Restart segment timer if it was lost (server restart wipes in-memory timers)
    if (!audioProcessor.hasSegmentTimer(session_id)) {
      try {
        const sessionRow = await pool.query(
          'SELECT segment_interval FROM transcription_sessions WHERE session_id = $1 AND status = $2 ORDER BY start_time DESC LIMIT 1',
          [session_id, 'active']
        );
        if (sessionRow.rows.length > 0) {
          const interval = sessionRow.rows[0].segment_interval;
          logger.info('Restarting lost segment timer', { session_id, interval });
          audioProcessor.startSegmentTimer(session_id, interval);
        }
      } catch (timerErr) {
        logger.warn('Could not restart segment timer', { error: timerErr.message, session_id });
      }
    }

    res.json({ success: true, transcript, detected_language: detectedLanguage, session_id });
  } catch (error) {
    logger.error('Error processing audio chunk', { error: error.message });
    res.status(500).json({ error: 'Failed to process audio chunk', details: error.message });
  }
});

// Convert a Float32 PCM sample array to a WAV Buffer (16-bit mono)
function float32ToWav(samples, sampleRate) {
  const numSamples = samples.length;
  const buf = Buffer.alloc(44 + numSamples * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + numSamples * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);              // PCM
  buf.writeUInt16LE(1, 22);              // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32);              // block align
  buf.writeUInt16LE(16, 34);             // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(numSamples * 2, 40);
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

// POST /api/transcription/audio-stream — Raw audio stream (teacher only)
router.post('/audio-stream', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { audio_data, sample_rate, session_id } = req.body;

    if (!session_id) return res.status(400).json({ error: 'session_id is required' });
    if (!audio_data || !Array.isArray(audio_data) || audio_data.length === 0) {
      return res.status(400).json({ error: 'audio_data must be a non-empty array' });
    }
    if (!(await verifySessionOwnership(session_id, req.user.id))) {
      return res.status(403).json({ error: 'Session not found or access denied' });
    }

    const sr = sample_rate || 16000;
    let transcript = '';
    let detectedLanguage = null;

    // ── Primary: GPU server ────────────────────────────────────────────────
    try {
      const GPU_URL = process.env.GPU_TRANSCRIPTION_URL || 'http://localhost:5000';
      const gpuResponse = await fetch(`${GPU_URL}/transcribe-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_data, sample_rate: sr, session_id, language: 'en' }),
        timeout: 30000
      });

      if (!gpuResponse.ok) {
        const errorText = await gpuResponse.text();
        throw new Error(`GPU server error (${gpuResponse.status}): ${errorText.substring(0, 200)}`);
      }

      const result = await gpuResponse.json();
      transcript = result.transcript || result.text || '';
      detectedLanguage = result.detected_language;

    } catch (gpuError) {
      // ── Fallback: Groq Whisper ─────────────────────────────────────────
      logger.warn('audio-stream: GPU failed, falling back to Groq', { error: gpuError.message, session_id });
      try {
        const wavBuffer = float32ToWav(audio_data, sr);
        const groqResult = await audioProcessor.transcribeWithGroq(wavBuffer, 'audio.wav', 'audio/wav');
        transcript = groqResult.transcript || '';
      } catch (groqError) {
        logger.error('audio-stream: Groq fallback also failed', { error: groqError.message, session_id });
        throw new Error(`All transcription providers failed. GPU: ${gpuError.message} | Groq: ${groqError.message}`);
      }
    }

    if (transcript && transcript.trim().length > 0) {
      await audioProcessor.saveTranscript(session_id, transcript, detectedLanguage);

      if (global.broadcastToSession) {
        global.broadcastToSession(session_id.toUpperCase(), {
          type: 'transcript-received',
          session_id,
          transcript,
          detected_language: detectedLanguage,
          timestamp: new Date().toISOString()
        });
      }
    }

    res.json({ success: true, transcript, detected_language: detectedLanguage, session_id });
  } catch (error) {
    logger.error('Error processing audio stream', { error: error.message });
    res.status(500).json({ error: 'Failed to process audio stream', details: error.message });
  }
});

// POST /api/transcription/pause — Pause session (teacher only)
router.post('/pause', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'session_id is required' });
    if (!(await verifySessionOwnership(session_id, req.user.id))) {
      return res.status(403).json({ error: 'Session not found or access denied' });
    }

    audioProcessor.stopSegmentTimer(session_id);
    const session = await audioProcessor.updateSessionStatus(session_id, 'paused', true);

    res.json({ success: true, session_id, session, message: 'Session paused' });
  } catch (error) {
    logger.error('Error pausing transcription session', { error: error.message });
    res.status(500).json({ error: 'Failed to pause session', details: error.message });
  }
});

// POST /api/transcription/resume — Resume session (teacher only)
router.post('/resume', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'session_id is required' });
    if (!(await verifySessionOwnership(session_id, req.user.id))) {
      return res.status(403).json({ error: 'Session not found or access denied' });
    }

    const result = await pool.query(
      'SELECT segment_interval FROM transcription_sessions WHERE session_id = $1',
      [session_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    audioProcessor.startSegmentTimer(session_id, result.rows[0].segment_interval);
    const session = await audioProcessor.updateSessionStatus(session_id, 'active', false);

    res.json({ success: true, session_id, session, message: 'Session resumed' });
  } catch (error) {
    logger.error('Error resuming transcription session', { error: error.message });
    res.status(500).json({ error: 'Failed to resume session', details: error.message });
  }
});

// POST /api/transcription/stop — Stop session (teacher only)
router.post('/stop', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'session_id is required' });
    if (!(await verifySessionOwnership(session_id, req.user.id))) {
      return res.status(403).json({ error: 'Session not found or access denied' });
    }

    const session = await audioProcessor.endSession(session_id);
    res.json({ success: true, session_id, session, message: 'Session stopped' });
  } catch (error) {
    logger.error('Error stopping transcription session', { error: error.message });
    res.status(500).json({ error: 'Failed to stop session', details: error.message });
  }
});

// Shared handler for notes generation (used by both routes below)
async function handleGenerateNotes(req, res) {
  try {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'session_id is required' });
    if (!(await verifySessionOwnership(session_id, req.user.id))) {
      return res.status(403).json({ error: 'Session not found or access denied' });
    }

    const success = await audioProcessor.sendFinalNotes(session_id);
    if (!success) {
      return res.status(404).json({ error: 'No transcripts found for this session', session_id });
    }

    res.json({ success: true, session_id, message: 'Notes generated successfully' });
  } catch (error) {
    logger.error('Error generating notes', { error: error.message });
    res.status(500).json({ error: 'Failed to generate notes', details: error.message });
  }
}

// POST /api/transcription/generate-notes — Generate notes via LangGraph agent (teacher only)
router.post('/generate-notes', authenticate, authorize('teacher'), handleGenerateNotes);

// POST /api/transcription/send-notes — Alias for generate-notes (backwards compat)
router.post('/send-notes', authenticate, authorize('teacher'), handleGenerateNotes);

// GET /api/transcription/session/:sessionId — Get session status (teacher only, must own session)
router.get('/session/:sessionId', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Verify teacher owns this session — prevents IDOR
    if (!(await verifySessionOwnership(sessionId, req.user.id))) {
      return res.status(403).json({ error: 'Session not found or access denied' });
    }

    const sessionResult = await pool.query(
      'SELECT * FROM transcription_sessions WHERE session_id = $1',
      [sessionId]
    );
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];
    const countResult = await pool.query(`
      SELECT
        COUNT(*) as total_transcripts,
        COUNT(*) FILTER (WHERE sent_to_webhook = true) as sent_count,
        COUNT(*) FILTER (WHERE sent_to_webhook = false) as unsent_count
      FROM transcripts WHERE session_db_id = $1
    `, [session.id]);

    res.json({ success: true, session, statistics: countResult.rows[0] });
  } catch (error) {
    logger.error('Error fetching transcription session', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch session details', details: error.message });
  }
});

// GET /api/transcription/debug — Timer + webhook diagnostic (teacher only)
router.get('/debug', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const timerState = audioProcessor.getDebugState();

    const recentSessions = await pool.query(
      `SELECT ts.session_id, ts.status, ts.segment_interval, ts.start_time,
              (SELECT COUNT(*) FROM transcripts WHERE session_db_id = ts.id) AS transcript_count,
              (SELECT COUNT(*) FROM transcripts WHERE session_db_id = ts.id AND sent_to_webhook = false) AS unsent_count
       FROM transcription_sessions ts
       ORDER BY ts.start_time DESC LIMIT 5`
    );

    res.json({
      timer_sessions: timerState.timerKeys,
      active_sessions_map: timerState.activeSessionKeys,
      recent_db_sessions: recentSessions.rows
    });
  } catch (error) {
    logger.error('Error fetching debug state', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch debug state', details: error.message });
  }
});

// POST /api/transcription/trigger-segment — Manually fire webhook for a session (teacher only)
router.post('/trigger-segment', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });
    if (!(await verifySessionOwnership(session_id, req.user.id))) {
      return res.status(403).json({ error: 'Session not found or access denied' });
    }

    const sent = await audioProcessor.sendTranscriptSegment(session_id);
    res.json({
      success: sent,
      session_id,
      message: sent ? 'Webhook triggered successfully' : 'No unsent transcripts or webhook not configured'
    });
  } catch (error) {
    logger.error('Error triggering segment webhook', { error: error.message });
    res.status(500).json({ error: 'Failed to trigger webhook', details: error.message });
  }
});

module.exports = router;
