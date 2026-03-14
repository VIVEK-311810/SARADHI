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

    let pdfUploaded = false;
    let pdfFilename = null;

    if (req.file) {
      try {
        await audioProcessor.uploadPDFToWebhook(req.file.buffer, req.file.originalname, session_id);
        pdfUploaded = true;
        pdfFilename = req.file.originalname;
      } catch (error) {
        logger.error('PDF upload failed', { error: error.message, session_id });
        return res.status(500).json({ error: 'Failed to upload PDF to webhook', details: error.message });
      }
    }

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

    res.json({ success: true, transcript, detected_language: detectedLanguage, session_id });
  } catch (error) {
    logger.error('Error processing audio chunk', { error: error.message });
    res.status(500).json({ error: 'Failed to process audio chunk' });
  }
});

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

    const GPU_URL = process.env.GPU_TRANSCRIPTION_URL || 'http://localhost:5000';
    const gpuResponse = await fetch(`${GPU_URL}/transcribe-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio_data, sample_rate: sample_rate || 16000, session_id, language: 'en' }),
      timeout: 30000
    });

    if (!gpuResponse.ok) {
      const errorText = await gpuResponse.text();
      throw new Error(`GPU server error (${gpuResponse.status}): ${errorText.substring(0, 200)}`);
    }

    const result = await gpuResponse.json();
    const transcript = result.transcript || result.text || '';
    const detectedLanguage = result.detected_language;

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

// POST /api/transcription/generate-notes — Generate complete notes (teacher only)
router.post('/generate-notes', authenticate, authorize('teacher'), async (req, res) => {
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

    res.json({ success: true, session_id, message: 'Complete notes sent to webhook successfully' });
  } catch (error) {
    logger.error('Error generating notes', { error: error.message });
    res.status(500).json({ error: 'Failed to generate notes', details: error.message });
  }
});

// POST /api/transcription/send-notes — Send manual notes (teacher only)
router.post('/send-notes', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { session_id, notes } = req.body;
    if (!session_id || !notes) {
      return res.status(400).json({ error: 'session_id and notes are required' });
    }
    if (!(await verifySessionOwnership(session_id, req.user.id))) {
      return res.status(403).json({ error: 'Session not found or access denied' });
    }

    if (!process.env.FINAL_NOTES_WEBHOOK_URL) {
      return res.status(503).json({ error: 'Notes webhook not configured' });
    }

    const response = await fetch(process.env.FINAL_NOTES_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manual_notes: notes, session_id, timestamp: new Date().toISOString() }),
      timeout: 15000
    });

    if (!response.ok) throw new Error(`Webhook error: ${response.status}`);

    res.json({ success: true, session_id, message: 'Manual notes sent to webhook successfully' });
  } catch (error) {
    logger.error('Error sending manual notes', { error: error.message });
    res.status(500).json({ error: 'Failed to send manual notes', details: error.message });
  }
});

// GET /api/transcription/session/:sessionId — Get session status (teacher only)
router.get('/session/:sessionId', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { sessionId } = req.params;

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
      FROM transcripts WHERE session_id = $1
    `, [session.id]);

    res.json({ success: true, session, statistics: countResult.rows[0] });
  } catch (error) {
    logger.error('Error fetching transcription session', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch session details', details: error.message });
  }
});

module.exports = router;
