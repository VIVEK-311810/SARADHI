const pool = require('../../db');
const logger = require('../../logger');

let mistralClient;
try {
  const client = require('../infra/mistralClient');
  if (client && typeof client.chatComplete === 'function') {
    mistralClient = client;
  } else {
    logger.warn('projectSuggestionService: mistralClient missing .chatComplete — fallback only');
  }
} catch (err) {
  logger.warn('projectSuggestionService: mistralClient unavailable', { error: err.message });
  mistralClient = null;
}

/**
 * Build fallback project suggestions from poll topic names when LLM is unavailable.
 */
function buildFallbackSuggestions(topics, subjects, sessionTitle) {
  const contextLabel = topics.length
    ? topics.slice(0, 3).join(', ')
    : (subjects.length ? subjects.slice(0, 2).join(', ') : sessionTitle);

  const templates = [
    {
      title: `Beginner: ${contextLabel} Explorer`,
      description: `Build a simple application that demonstrates the core concepts of ${contextLabel}. Focus on understanding fundamentals through a hands-on mini-project.`,
      difficulty: 'beginner',
      real_world_use_cases: ['Learning tool', 'Personal portfolio project'],
      tech_stack_hints: ['Any language covered in class'],
      estimated_duration: '1–2 days',
      learning_outcomes: [`Solidify understanding of ${contextLabel}`, 'Apply classroom theory to working code'],
    },
    {
      title: `Beginner: ${contextLabel} Quiz App`,
      description: `Create an interactive quiz application that tests knowledge of ${contextLabel} concepts covered in today's session.`,
      difficulty: 'beginner',
      real_world_use_cases: ['Study aid', 'Peer teaching tool'],
      tech_stack_hints: ['HTML/CSS/JS or any framework'],
      estimated_duration: '1–2 days',
      learning_outcomes: ['Reinforce core concepts', 'Practice UI development'],
    },
    {
      title: `Intermediate: ${contextLabel} Dashboard`,
      description: `Design and implement a data-driven dashboard that visualises patterns and insights related to ${contextLabel}. Integrate a small dataset and display meaningful metrics.`,
      difficulty: 'intermediate',
      real_world_use_cases: ['Business analytics', 'Academic reporting'],
      tech_stack_hints: ['React / Vue', 'Chart.js or D3'],
      estimated_duration: '3–5 days',
      learning_outcomes: ['Data presentation skills', 'API design basics'],
    },
    {
      title: `Intermediate: ${contextLabel} REST API`,
      description: `Build a RESTful API that exposes ${contextLabel} functionality, with authentication, validation, and structured error handling.`,
      difficulty: 'intermediate',
      real_world_use_cases: ['Backend for web/mobile apps', 'Microservice prototype'],
      tech_stack_hints: ['Node.js + Express', 'Python + FastAPI'],
      estimated_duration: '3–5 days',
      learning_outcomes: ['API design', 'Request validation', 'Auth patterns'],
    },
    {
      title: `Advanced: ${contextLabel} at Scale`,
      description: `Architect a production-grade solution that applies ${contextLabel} principles at scale. Include performance considerations, caching, and observability.`,
      difficulty: 'advanced',
      real_world_use_cases: ['Enterprise software', 'Cloud-native applications'],
      tech_stack_hints: ['Docker', 'Redis', 'PostgreSQL', 'CI/CD pipeline'],
      estimated_duration: '1–2 weeks',
      learning_outcomes: ['System design', 'Scalability thinking', 'DevOps basics'],
    },
    {
      title: `Advanced: ${contextLabel} Research Project`,
      description: `Conduct an original investigation into an open problem in ${contextLabel}. Implement a prototype, benchmark it, and write a short technical report.`,
      difficulty: 'advanced',
      real_world_use_cases: ['Research paper', 'Open-source contribution', 'Hackathon entry'],
      tech_stack_hints: ['Depends on domain', 'Jupyter / LaTeX for report'],
      estimated_duration: '2+ weeks',
      learning_outcomes: ['Research methodology', 'Technical writing', 'Independent problem solving'],
    },
  ];

  return templates;
}

/**
 * Generate AI project suggestions for a session using Mistral.
 * Mirrors the pattern of sessionSummaryService.generateSessionSummary.
 *
 * @param {number} numericSessionId - The integer sessions.id
 * @param {string|null} hint - Optional faculty hint to steer generation
 */
async function generateProjectSuggestions(numericSessionId, hint = null) {
  // 1. Fetch session metadata
  const sessionRes = await pool.query(
    `SELECT title, course_name, summary_text, summary_status FROM sessions WHERE id = $1`,
    [numericSessionId]
  );
  if (sessionRes.rows.length === 0) {
    throw new Error(`Session ${numericSessionId} not found`);
  }
  const session = sessionRes.rows[0];

  // 2. Fetch poll context (same query as sessionSummaryService)
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
        ROUND(AVG(CASE WHEN pr.is_correct = TRUE THEN 1.0 ELSE 0.0 END) * 100)::int AS accuracy_pct
      FROM polls p
      LEFT JOIN poll_responses pr ON pr.poll_id = p.id
      WHERE p.session_id = $1
      GROUP BY p.id
      ORDER BY p.id
    `, [numericSessionId]);
  } catch {
    pollsRes = await pool.query(`
      SELECT p.question, NULL::text AS topic, NULL::text AS subject_tag,
             NULL::text AS blooms_level, NULL::text AS question_type,
             COUNT(pr.id)::int AS response_count,
             ROUND(AVG(CASE WHEN pr.is_correct = TRUE THEN 1.0 ELSE 0.0 END) * 100)::int AS accuracy_pct
      FROM polls p
      LEFT JOIN poll_responses pr ON pr.poll_id = p.id
      WHERE p.session_id = $1
      GROUP BY p.id ORDER BY p.id
    `, [numericSessionId]);
  }

  const polls = pollsRes.rows;
  const topics = [...new Set(polls.map(p => p.topic).filter(Boolean))];
  const subjects = [...new Set(polls.map(p => p.subject_tag).filter(Boolean))];

  // Compute average class accuracy for adaptive difficulty bias
  const answeredPolls = polls.filter(p => p.response_count > 0);
  const avgAccuracy = answeredPolls.length > 0
    ? Math.round(answeredPolls.reduce((s, p) => s + (p.accuracy_pct ?? 0), 0) / answeredPolls.length)
    : null;

  // Determine difficulty distribution based on class performance
  let difficultyInstruction = 'Generate exactly 2 beginner, 2 intermediate, and 2 advanced projects (6 total).';
  if (avgAccuracy !== null && avgAccuracy < 45) {
    difficultyInstruction = 'The class struggled (average accuracy below 45%). Generate 3 beginner, 2 intermediate, and 1 advanced project (6 total) to support consolidation.';
  } else if (avgAccuracy !== null && avgAccuracy > 80) {
    difficultyInstruction = 'The class performed strongly (average accuracy above 80%). Generate 1 beginner, 2 intermediate, and 3 advanced projects (6 total) to challenge them further.';
  }

  // Build the context block
  const contextParts = [
    `Session Title: ${session.title}`,
    session.course_name ? `Course: ${session.course_name}` : null,
    subjects.length ? `Subjects: ${subjects.join(', ')}` : null,
    topics.length ? `Topics covered: ${topics.join(', ')}` : null,
    polls.length ? `Total polls asked: ${polls.length}` : null,
    avgAccuracy !== null ? `Class average accuracy: ${avgAccuracy}%` : null,
    (session.summary_status === 'completed' && session.summary_text)
      ? `Post-class summary:\n${session.summary_text.substring(0, 600)}`
      : null,
    hint ? `Faculty focus area: ${hint}` : null,
  ].filter(Boolean).join('\n');

  const prompt = `You are an expert computer science educator. Based on the session context below, generate practical project ideas that students can build to apply what they learned.

Session context:
${contextParts}

${difficultyInstruction}

For each project return a JSON object with these exact keys:
- title: short descriptive name (under 10 words)
- description: 2–3 sentence explanation of what the student builds
- difficulty: exactly one of "beginner", "intermediate", "advanced"
- real_world_use_cases: array of 2 strings describing where this exists in industry
- tech_stack_hints: array of 2–3 technology suggestions relevant to the topic
- estimated_duration: realistic time estimate (e.g. "2–3 days")
- learning_outcomes: array of 2–3 skills the student will practise

Return ONLY valid JSON in this shape:
{"projects": [ ...6 project objects... ]}`;

  let suggestions;

  try {
    if (!mistralClient) throw new Error('mistralClient unavailable');

    const response = await mistralClient.chatComplete(
      process.env.MISTRAL_MODEL_SMALL || 'mistral-small-latest',
      [{ role: 'user', content: prompt }],
      {
        maxTokens: 2048,
        temperature: 0.65,
        responseFormat: { type: 'json_object' },
        timeout: 45000,
      }
    );

    const raw = JSON.parse(response.content);
    if (!Array.isArray(raw.projects) || raw.projects.length === 0) {
      throw new Error('LLM returned empty projects array');
    }

    // Validate and sanitise each project entry
    const validDifficulties = new Set(['beginner', 'intermediate', 'advanced']);
    suggestions = raw.projects.map((p, i) => ({
      title: p.title || `Project ${i + 1}`,
      description: p.description || '',
      difficulty: validDifficulties.has(p.difficulty) ? p.difficulty : 'intermediate',
      real_world_use_cases: Array.isArray(p.real_world_use_cases) ? p.real_world_use_cases : [],
      tech_stack_hints: Array.isArray(p.tech_stack_hints) ? p.tech_stack_hints : [],
      estimated_duration: p.estimated_duration || '',
      learning_outcomes: Array.isArray(p.learning_outcomes) ? p.learning_outcomes : [],
    }));

  } catch (err) {
    logger.error('Project suggestion LLM failed — using fallback', { error: err.message, sessionId: numericSessionId });
    suggestions = buildFallbackSuggestions(topics, subjects, session.title);
  }

  // 3. Persist — upsert so re-generation replaces the previous record
  await pool.query(`
    INSERT INTO session_projects (session_id, generated_by, generation_status, suggestions, generated_at, updated_at)
    VALUES ($1, NULL, 'completed', $2::jsonb, NOW(), NOW())
    ON CONFLICT (session_id) DO UPDATE
      SET generation_status = 'completed',
          suggestions       = $2::jsonb,
          generated_at      = NOW(),
          updated_at        = NOW(),
          generation_error  = NULL
  `, [numericSessionId, JSON.stringify(suggestions)]);

  logger.info('Project suggestions generated', { sessionId: numericSessionId, count: suggestions.length });
  return suggestions;
}

module.exports = { generateProjectSuggestions };
