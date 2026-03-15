const FormData = require('form-data');
const fetch = require('node-fetch');
require('dotenv').config();
const pool = require('../db');

// Configuration
const GPU_TRANSCRIPTION_URL = process.env.GPU_TRANSCRIPTION_URL || 'http://localhost:5000';
// Skip GPU when the URL is still the default (localhost) — avoids pointless ECONNREFUSED on Render
const GPU_ENABLED = !!(process.env.GPU_TRANSCRIPTION_URL && !process.env.GPU_TRANSCRIPTION_URL.includes('localhost'));
const TRANSCRIPT_WEBHOOK_URL = process.env.TRANSCRIPT_WEBHOOK_URL;
const FINAL_NOTES_WEBHOOK_URL = process.env.FINAL_NOTES_WEBHOOK_URL;
const SESSION_START_WEBHOOK_URL = process.env.SESSION_START_WEBHOOK_URL;

// Groq fallback configuration
const GROQ_API_KEY   = process.env.GROQ_API_KEY;
const GROQ_API_URL   = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_MODEL     = 'whisper-large-v3';
const GPU_TIMEOUT_MS = 30000;
const GROQ_TIMEOUT_MS = 30000;

// Store active session timers and metadata
const sessionTimers = new Map();
const activeSessions = new Map(); // Store { session_id: database_id }

// Log webhook/provider config once at startup (visible in Render boot logs)
console.log('[AudioProcessor] Config — TRANSCRIPT_WEBHOOK_URL:', TRANSCRIPT_WEBHOOK_URL ? TRANSCRIPT_WEBHOOK_URL.replace(/\/[^/]+$/, '/***') : 'NOT SET');
console.log('[AudioProcessor] Config — GPU_ENABLED:', GPU_ENABLED, '| GROQ_API_KEY:', GROQ_API_KEY ? 'set' : 'NOT SET');

/**
 * Transcribe audio using Groq's Whisper API (fallback provider)
 * @param {Buffer} audioBuffer - Audio file buffer
 * @param {string} filename - Original filename with extension
 * @param {string} mimetype - Audio MIME type
 * @returns {Promise<Object>} Transcription result normalised to { transcript, provider }
 */
async function transcribeWithGroq(audioBuffer, filename, mimetype) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not configured');

  const formData = new FormData();
  formData.append('file', audioBuffer, {
    filename: filename || 'audio.webm',
    contentType: mimetype || 'audio/webm'
  });
  formData.append('model', GROQ_MODEL);
  formData.append('language', 'en');
  formData.append('response_format', 'json');

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      ...formData.getHeaders()
    },
    body: formData,
    timeout: GROQ_TIMEOUT_MS
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return { transcript: data.text, provider: 'groq' };
}

/**
 * Forward audio chunk to GPU transcription server, with Groq as automatic fallback
 * @param {Buffer} audioBuffer - Audio file buffer
 * @param {string} sessionId - Session identifier
 * @param {string} filename - Original filename with extension
 * @param {string} mimetype - Audio MIME type
 * @returns {Promise<Object>} Transcription result
 */
async function forwardToGPUServer(audioBuffer, sessionId, filename, mimetype) {
  // ── Primary: GPU server (only when configured) ─────────────────────────
  if (!GPU_ENABLED) {
    console.log(`[AudioProcessor] GPU not configured — using Groq directly for session: ${sessionId}`);
    return transcribeWithGroq(audioBuffer, filename, mimetype);
  }

  try {
    console.log(`[AudioProcessor] Forwarding audio to GPU server for session: ${sessionId}`);

    const formData = new FormData();
    formData.append('audio', audioBuffer, {
      filename: filename || 'audio.webm',
      contentType: mimetype || 'audio/webm'
    });
    formData.append('session_id', sessionId);
    formData.append('language', 'en');

    const response = await fetch(`${GPU_TRANSCRIPTION_URL}/transcribe`, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders(),
      timeout: GPU_TIMEOUT_MS
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GPU server error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    console.log(`[AudioProcessor] ✓ GPU transcript received: ${result.transcript?.substring(0, 50)}...`);
    return { ...result, provider: 'gpu' };

  } catch (gpuError) {
    // ── Fallback: Groq Whisper ─────────────────────────────────────────
    console.warn(`[AudioProcessor] GPU server failed (${gpuError.message}), falling back to Groq...`);

    try {
      const result = await transcribeWithGroq(audioBuffer, filename, mimetype);
      console.log(`[AudioProcessor] ✓ Groq transcript received: ${result.transcript?.substring(0, 50)}...`);
      return result;
    } catch (groqError) {
      console.error(`[AudioProcessor] Groq fallback also failed: ${groqError.message}`);
      throw new Error(`All transcription providers failed. GPU: ${gpuError.message} | Groq: ${groqError.message}`);
    }
  }
}

/**
 * Save transcript to database
 * @param {string} sessionId - Session identifier
 * @param {string} text - Transcript text
 * @param {string} detectedLanguage - Language detected by Whisper
 * @returns {Promise<Object>} Inserted transcript record
 */
async function saveTranscript(sessionId, text, detectedLanguage = null) {
  try {
    if (!text || text.trim().length === 0) {
      console.log(`[AudioProcessor] Empty transcript, skipping save for session: ${sessionId}`);
      return null;
    }

    // Get database ID from active sessions in memory
    let dbId = activeSessions.get(sessionId);

    if (!dbId) {
      // Fallback to database query if not in memory - get most recent session
      const sessionQuery = `
        SELECT id FROM transcription_sessions
        WHERE session_id = $1
        ORDER BY start_time DESC
        LIMIT 1
      `;
      const sessionResult = await pool.query(sessionQuery, [sessionId]);
      if (sessionResult.rows.length === 0) {
        throw new Error(`No session found for session_id: ${sessionId}`);
      }
      dbId = sessionResult.rows[0].id;
    }

    const query = `
      INSERT INTO transcripts (session_db_id, segment_text, detected_language, sent_to_webhook)
      VALUES ($1, $2, $3, false)
      RETURNING *
    `;

    const result = await pool.query(query, [dbId, text.trim(), detectedLanguage]);
    console.log(`[AudioProcessor] Transcript saved for session: ${sessionId} (db_id: ${dbId})`);

    return result.rows[0];
  } catch (error) {
    console.error(`[AudioProcessor] Error saving transcript:`, error.message);
    throw error;
  }
}

/**
 * Start interval timer for periodic webhook sends
 * @param {string} sessionId - Session identifier
 * @param {number} intervalMinutes - Interval in minutes
 */
function startSegmentTimer(sessionId, intervalMinutes) {
  // Clear any existing timer
  stopSegmentTimer(sessionId);

  const intervalMs = intervalMinutes * 60 * 1000;
  console.log(`[AudioProcessor] Starting segment timer for session ${sessionId}: ${intervalMinutes} minutes`);

  const timer = setInterval(() => {
    console.log(`[AudioProcessor] Timer fired for session: ${sessionId}`);
    sendTranscriptSegment(sessionId).catch(err =>
      console.error(`[AudioProcessor] Segment timer error (non-fatal):`, err.message)
    );
  }, intervalMs);

  sessionTimers.set(sessionId, timer);
}

/**
 * Send accumulated transcript segment to webhook
 * @param {string} sessionId - Session identifier
 * @returns {Promise<boolean>} Success status
 */
async function sendTranscriptSegment(sessionId) {
  try {
    console.log(`[AudioProcessor] ▶ Timer fired — sending segment for session: ${sessionId}`);

    // Get database ID for most recent session
    let dbId = activeSessions.get(sessionId);
    console.log(`[AudioProcessor]   activeSessions lookup '${sessionId}' → dbId=${dbId}`);
    if (!dbId) {
      const sessionQuery = `
        SELECT id FROM transcription_sessions
        WHERE session_id = $1
        ORDER BY start_time DESC
        LIMIT 1
      `;
      const sessionResult = await pool.query(sessionQuery, [sessionId]);
      if (sessionResult.rows.length === 0) {
        console.log(`[AudioProcessor]   No transcription_sessions row found for: ${sessionId}`);
        return false;
      }
      dbId = sessionResult.rows[0].id;
      console.log(`[AudioProcessor]   DB fallback resolved dbId=${dbId}`);
    }

    // Get all unsent transcripts for this session
    const query = `
      SELECT id, segment_text
      FROM transcripts
      WHERE session_db_id = $1
      AND sent_to_webhook = false
      ORDER BY id ASC
    `;

    const result = await pool.query(query, [dbId]);
    console.log(`[AudioProcessor]   Found ${result.rows.length} unsent transcript(s) for dbId=${dbId}`);

    if (result.rows.length === 0) {
      console.log(`[AudioProcessor]   No unsent transcripts for session: ${sessionId}`);
      return false;
    }

    // Join all transcript segments
    const transcriptSegment = result.rows
      .map(row => row.segment_text)
      .join(' ')
      .trim();

    if (!transcriptSegment) {
      console.log(`[AudioProcessor] Empty transcript segment for session: ${sessionId}`);
      return false;
    }

    if (!TRANSCRIPT_WEBHOOK_URL) {
      console.log(`[AudioProcessor] TRANSCRIPT_WEBHOOK_URL not set — skipping webhook for session: ${sessionId}`);
      return false;
    }

    // Send to webhook
    const payload = {
      transcript_segment: transcriptSegment,
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      segment_count: result.rows.length
    };

    console.log(`[AudioProcessor] Posting to webhook: ${TRANSCRIPT_WEBHOOK_URL}`);

    const response = await fetch(TRANSCRIPT_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SASEduAI-Webhook/1.0',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload),
      timeout: 15000
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '(unreadable)');
      throw new Error(`Webhook error: ${response.status} ${response.statusText} — ${errBody.substring(0, 300)}`);
    }

    const respBody = await response.text().catch(() => '');
    console.log(`[AudioProcessor] Webhook response body: ${respBody.substring(0, 200)}`);

    // Mark transcripts as sent
    const transcriptIds = result.rows.map(row => row.id);
    const updateQuery = `
      UPDATE transcripts
      SET sent_to_webhook = true
      WHERE id = ANY($1)
    `;

    await pool.query(updateQuery, [transcriptIds]);

    console.log(`[AudioProcessor] ✓ Segment sent successfully for session: ${sessionId} (${result.rows.length} transcripts)`);

    // Broadcast segment sent notification only to clients in this session
    if (global.broadcastToSession) {
      global.broadcastToSession(sessionId.toUpperCase(), {
        type: 'transcript-segment-sent',
        sessionId: sessionId,
        timestamp: new Date().toISOString(),
        segmentCount: result.rows.length,
        transcriptLength: transcriptSegment.length
      });
      console.log(`✓ Broadcasted segment sent notification for session: ${sessionId}`);
    }

    return true;

  } catch (error) {
    console.error(`[AudioProcessor] Error sending transcript segment:`, error.message);
    return false; // Non-fatal — don't rethrow; setInterval callers have no .catch()
  }
}

/**
 * Send complete session transcript (final notes) to webhook
 * @param {string} sessionId - Session identifier
 * @returns {Promise<boolean>} Success status
 */
async function sendFinalNotes(sessionId) {
  try {
    console.log(`[AudioProcessor] Sending final notes for session: ${sessionId}`);

    // Get database ID for most recent session
    let dbId = activeSessions.get(sessionId);
    if (!dbId) {
      const sessionQuery = `
        SELECT id FROM transcription_sessions
        WHERE session_id = $1
        ORDER BY start_time DESC
        LIMIT 1
      `;
      const sessionResult = await pool.query(sessionQuery, [sessionId]);
      if (sessionResult.rows.length === 0) {
        console.log(`[AudioProcessor] No session found for: ${sessionId}`);
        return false;
      }
      dbId = sessionResult.rows[0].id;
    }

    // Get ALL transcripts for this session (sent and unsent)
    const query = `
      SELECT segment_text
      FROM transcripts
      WHERE session_db_id = $1
      ORDER BY timestamp ASC
    `;

    const result = await pool.query(query, [dbId]);

    if (result.rows.length === 0) {
      console.log(`[AudioProcessor] No transcripts found for session: ${sessionId}`);
      return false;
    }

    // Join all transcripts into final notes
    const finalNotes = result.rows
      .map(row => row.segment_text)
      .join(' ')
      .trim();

    if (!finalNotes) {
      console.log(`[AudioProcessor] Empty final notes for session: ${sessionId}`);
      return false;
    }

    if (!FINAL_NOTES_WEBHOOK_URL) {
      console.log(`[AudioProcessor] FINAL_NOTES_WEBHOOK_URL not set — skipping webhook for session: ${sessionId}`);
      return false;
    }

    // Send to final notes webhook
    const payload = {
      final_notes: finalNotes,
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      total_segments: result.rows.length
    };

    console.log(`[AudioProcessor] Posting final notes to webhook: ${FINAL_NOTES_WEBHOOK_URL}`);

    const response = await fetch(FINAL_NOTES_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SASEduAI-Webhook/1.0',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload),
      timeout: 30000
    });

    if (!response.ok) {
      throw new Error(`Webhook error: ${response.status} ${response.statusText}`);
    }

    console.log(`[AudioProcessor] ✓ Final notes sent successfully for session: ${sessionId}`);
    return true;

  } catch (error) {
    console.error(`[AudioProcessor] Error sending final notes:`, error.message);
    throw error;
  }
}

/**
 * Stop interval timer for a session
 * @param {string} sessionId - Session identifier
 */
function stopSegmentTimer(sessionId) {
  if (sessionTimers.has(sessionId)) {
    clearInterval(sessionTimers.get(sessionId));
    sessionTimers.delete(sessionId);
    console.log(`[AudioProcessor] Stopped segment timer for session: ${sessionId}`);
  }
}

function hasSegmentTimer(sessionId) {
  return sessionTimers.has(sessionId);
}

function getDebugState() {
  return {
    timerKeys: Array.from(sessionTimers.keys()),
    activeSessionKeys: Array.from(activeSessions.keys())
  };
}

/**
 * Upload PDF to session start webhook
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {string} filename - PDF filename
 * @param {string} sessionId - Session identifier
 * @returns {Promise<boolean>} Success status
 */
async function uploadPDFToWebhook(pdfBuffer, filename, sessionId) {
  try {
    console.log(`[AudioProcessor] Uploading PDF for session: ${sessionId}`);

    const formData = new FormData();
    formData.append('Resource', pdfBuffer, {
      filename: filename,
      contentType: 'application/pdf'
    });
    formData.append('Session_ID', sessionId);

    const response = await fetch(SESSION_START_WEBHOOK_URL, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders(),
      timeout: 30000
    });

    if (!response.ok) {
      throw new Error(`PDF upload error: ${response.status} ${response.statusText}`);
    }

    console.log(`[AudioProcessor] ✓ PDF uploaded successfully for session: ${sessionId}`);
    return true;

  } catch (error) {
    console.error(`[AudioProcessor] Error uploading PDF:`, error.message);
    throw error;
  }
}

/**
 * Create new transcription session in database
 * @param {string} sessionId - Session identifier
 * @param {number} segmentInterval - Interval in minutes
 * @param {boolean} pdfUploaded - Whether PDF was uploaded
 * @param {string} pdfFilename - PDF filename if uploaded
 * @returns {Promise<Object>} Created session record
 */
async function createSession(sessionId, segmentInterval, pdfUploaded = false, pdfFilename = null) {
  try {
    const query = `
      INSERT INTO transcription_sessions (session_id, segment_interval, pdf_uploaded, pdf_filename, status)
      VALUES ($1, $2, $3, $4, 'active')
      RETURNING *
    `;

    const result = await pool.query(query, [sessionId, segmentInterval, pdfUploaded, pdfFilename]);
    const session = result.rows[0];

    // Store database ID in memory for quick transcript saves
    activeSessions.set(sessionId, session.id);

    console.log(`[AudioProcessor] Session created: ${sessionId} (db_id: ${session.id}) at ${session.start_time}`);

    return session;
  } catch (error) {
    console.error(`[AudioProcessor] Error creating session:`, error.message);
    throw error;
  }
}

/**
 * Update session status
 * @param {string} sessionId - Session identifier
 * @param {string} status - New status (active, paused, stopped)
 * @param {boolean} isPaused - Pause state
 * @returns {Promise<Object>} Updated session record
 */
async function updateSessionStatus(sessionId, status, isPaused = null) {
  try {
    // Get database ID for most recent session
    let dbId = activeSessions.get(sessionId);
    if (!dbId) {
      const sessionQuery = `SELECT id FROM transcription_sessions WHERE session_id = $1 ORDER BY start_time DESC LIMIT 1`;
      const sessionResult = await pool.query(sessionQuery, [sessionId]);
      if (sessionResult.rows.length === 0) {
        throw new Error(`No session found for session_id: ${sessionId}`);
      }
      dbId = sessionResult.rows[0].id;
    }

    let query, params;

    if (isPaused !== null) {
      query = `UPDATE transcription_sessions SET status = $1, is_paused = $2 WHERE id = $3 RETURNING *`;
      params = [status, isPaused, dbId];
    } else {
      query = `UPDATE transcription_sessions SET status = $1 WHERE id = $2 RETURNING *`;
      params = [status, dbId];
    }

    const result = await pool.query(query, params);
    console.log(`[AudioProcessor] Session ${sessionId} (db_id: ${dbId}) status updated to: ${status}`);

    return result.rows[0];
  } catch (error) {
    console.error(`[AudioProcessor] Error updating session status:`, error.message);
    throw error;
  }
}

/**
 * End session and cleanup
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Object>} Updated session record
 */
async function endSession(sessionId) {
  try {
    console.log(`[AudioProcessor] Ending session: ${sessionId}`);

    // Send any remaining unsent transcripts before stopping (non-fatal if webhook is down)
    console.log(`[AudioProcessor] Checking for unsent transcripts before session end...`);
    try {
      const sent = await sendTranscriptSegment(sessionId);
      if (sent) {
        console.log(`[AudioProcessor] ✓ Remaining transcripts sent on session stop`);
      } else {
        console.log(`[AudioProcessor] No unsent transcripts found`);
      }
    } catch (webhookError) {
      console.warn(`[AudioProcessor] Webhook flush failed on stop (non-fatal): ${webhookError.message}`);
    }

    // Stop timer
    stopSegmentTimer(sessionId);

    // Get database ID before removing from memory
    let dbId = activeSessions.get(sessionId);
    if (!dbId) {
      const sessionQuery = `SELECT id FROM transcription_sessions WHERE session_id = $1 ORDER BY start_time DESC LIMIT 1`;
      const sessionResult = await pool.query(sessionQuery, [sessionId]);
      if (sessionResult.rows.length > 0) {
        dbId = sessionResult.rows[0].id;
      }
    }

    // Remove from active sessions
    activeSessions.delete(sessionId);

    if (!dbId) {
      console.log(`[AudioProcessor] No database session found to end for: ${sessionId}`);
      return null;
    }

    // Update the session as completed
    const query = `UPDATE transcription_sessions SET status = 'stopped', end_time = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`;
    const result = await pool.query(query, [dbId]);
    console.log(`[AudioProcessor] Session ended: ${sessionId} (db_id: ${dbId})`);

    return result.rows[0];
  } catch (error) {
    console.error(`[AudioProcessor] Error ending session:`, error.message);
    throw error;
  }
}

module.exports = {
  forwardToGPUServer,
  transcribeWithGroq,
  saveTranscript,
  startSegmentTimer,
  stopSegmentTimer,
  hasSegmentTimer,
  getDebugState,
  sendTranscriptSegment,
  sendFinalNotes,
  uploadPDFToWebhook,
  createSession,
  updateSessionStatus,
  endSession
};
