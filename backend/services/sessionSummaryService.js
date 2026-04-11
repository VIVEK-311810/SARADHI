const pool = require('../db');
const logger = require('../logger');

// Reuse existing Mistral client for generation
let mistralClient;
try {
  const client = require('./mistralClient');
  if (client && typeof client.chatComplete === 'function') {
    mistralClient = client;
  } else {
    logger.warn('mistralClient loaded but missing .chatComplete method — falling back to rule-based summary');
  }
} catch (err) {
  logger.warn('mistralClient unavailable — falling back to rule-based summary', { error: err.message });
  mistralClient = null;
}

/**
 * Generate an AI post-class summary for a session.
 * Pulls poll questions + accuracy stats, sends to Mistral, persists result.
 */
async function generateSessionSummary(sessionId) {
  // 1. Fetch all polls with per-poll response stats
  let pollsRes;
  try {
    pollsRes = await pool.query(`
      SELECT
        p.question,
        p.question_type,
        p.topic,
        p.blooms_level,
        p.subject_tag,
        COUNT(pr.id)::int AS response_count,
        ROUND(
          AVG(CASE WHEN pr.is_correct = TRUE THEN 1.0 ELSE 0.0 END) * 100
        )::int AS accuracy_pct
      FROM polls p
      LEFT JOIN poll_responses pr ON pr.poll_id = p.id
      WHERE p.session_id = $1
      GROUP BY p.id
      ORDER BY p.id
    `, [sessionId]);
  } catch (queryErr) {
    // Fallback for schemas without migration 011 columns
    pollsRes = await pool.query(`
      SELECT
        p.question,
        NULL::text AS question_type,
        NULL::text AS topic,
        NULL::text AS blooms_level,
        NULL::text AS subject_tag,
        COUNT(pr.id)::int AS response_count,
        ROUND(
          AVG(CASE WHEN pr.is_correct = TRUE THEN 1.0 ELSE 0.0 END) * 100
        )::int AS accuracy_pct
      FROM polls p
      LEFT JOIN poll_responses pr ON pr.poll_id = p.id
      WHERE p.session_id = $1
      GROUP BY p.id
      ORDER BY p.id
    `, [sessionId]);
  }

  const polls = pollsRes.rows;

  if (polls.length === 0) {
    const noDataSummary = 'No questions were asked during this session.';
    await pool.query(
      `UPDATE sessions SET summary_text=$1, summary_status='completed', summary_generated_at=NOW() WHERE id=$2`,
      [noDataSummary, sessionId]
    );
    return noDataSummary;
  }

  // 2. Build structured context for the prompt
  const pollLines = polls.map((p, i) => {
    const type = p.question_type || 'mcq';
    const bloom = p.blooms_level ? `, ${p.blooms_level}` : '';
    const topic = p.topic ? ` [${p.topic}]` : '';
    const acc = p.response_count > 0 ? ` — ${p.accuracy_pct ?? '?'}% correct (${p.response_count} responses)` : ' — no responses';
    const flag = p.response_count > 0 && (p.accuracy_pct ?? 100) < 50 ? ' ⚠ CONFUSION' : '';
    return `Q${i + 1} [${type}${bloom}]${topic}: ${p.question}${acc}${flag}`;
  }).join('\n');

  const topics = [...new Set(polls.map(p => p.topic).filter(Boolean))];
  const subjects = [...new Set(polls.map(p => p.subject_tag).filter(Boolean))];
  const totalResponses = polls.reduce((s, p) => s + (p.response_count || 0), 0);
  const confusionPolls = polls.filter(p => p.response_count > 0 && (p.accuracy_pct ?? 100) < 50);

  const contextBlock = [
    subjects.length ? `Subject(s): ${subjects.join(', ')}` : null,
    topics.length ? `Topics covered: ${topics.join(', ')}` : null,
    `Total questions: ${polls.length}`,
    `Total student responses: ${totalResponses}`,
    `Confusion points (accuracy < 50%): ${confusionPolls.length}`,
  ].filter(Boolean).join('\n');

  const prompt = `You are a teaching assistant summarizing a university class session for the professor.

Session stats:
${contextBlock}

Questions asked (with accuracy):
${pollLines}

Write a concise post-class summary (under 220 words) with exactly these sections:
## Topics Covered
- (2–4 bullet points listing main topics)

## Confusion Points
- (For each question with < 50% accuracy, briefly explain what concept students likely misunderstood. If none, write "None — students performed well overall.")

## Recommendation
(1–2 sentences on what to review or reinforce in the next class.)`;

  // 3. Call Mistral
  let summaryText;
  try {
    if (!mistralClient) throw new Error('Mistral client unavailable');
    const response = await mistralClient.chatComplete(
      process.env.MISTRAL_MODEL_SMALL || 'mistral-small-latest',
      [{ role: 'user', content: prompt }],
      { maxTokens: 512, temperature: 0.4 }
    );
    summaryText = response?.content?.trim() || '';
  } catch (err) {
    logger.error('Mistral session summary failed, using fallback', { error: err.message });
    // Graceful fallback: build a rule-based summary
    summaryText = buildFallbackSummary(polls, topics, confusionPolls);
  }

  // 4. Persist
  await pool.query(
    `UPDATE sessions SET summary_text=$1, summary_status='completed', summary_generated_at=NOW() WHERE id=$2`,
    [summaryText, sessionId]
  );

  logger.info('Session summary generated', { sessionId, pollCount: polls.length });
  return summaryText;
}

function buildFallbackSummary(polls, topics, confusionPolls) {
  const topicLine = topics.length
    ? topics.map(t => `- ${t}`).join('\n')
    : `- ${polls.length} question(s) covering various topics`;

  const confusionLine = confusionPolls.length
    ? confusionPolls.map(p => `- "${p.question.substring(0, 80)}…" (${p.accuracy_pct}% correct)`).join('\n')
    : '- None — students performed well overall.';

  const avgAcc = polls.filter(p => p.response_count > 0).length > 0
    ? Math.round(polls.filter(p => p.response_count > 0)
        .reduce((s, p) => s + (p.accuracy_pct ?? 0), 0) /
        polls.filter(p => p.response_count > 0).length)
    : null;

  const rec = confusionPolls.length > 0
    ? `Consider revisiting ${confusionPolls[0].topic || 'the low-accuracy topics'} at the start of the next class.`
    : avgAcc !== null
    ? `Overall accuracy was ${avgAcc}%. Class appears to have a good grasp of today's material.`
    : 'Review today\'s material to consolidate learning.';

  return `## Topics Covered\n${topicLine}\n\n## Confusion Points\n${confusionLine}\n\n## Recommendation\n${rec}`;
}

module.exports = { generateSessionSummary };
