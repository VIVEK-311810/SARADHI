/**
 * Tests for Session Lock and AI Summary endpoints
 *
 * Covers:
 *   PATCH /:sessionId/lock
 *   POST  /:sessionId/join  — lock enforcement
 *   POST  /:sessionId/generate-summary
 *   GET   /:sessionId/summary
 */

jest.mock('../middleware/auth', () => ({
  authenticate: (req, res, next) => {
    const auth = req.header('Authorization');
    if (!auth) return res.status(401).json({ message: 'No token' });
    const token = auth.replace('Bearer ', '');
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test-jwt-secret');
      req.user = {
        id: decoded.userId,
        role: decoded.role,
        email: decoded.role === 'teacher' ? 'teacher@sastra.edu' : `${decoded.userId}@sastra.ac.in`,
        full_name: 'Test User',
      };
      next();
    } catch (e) {
      return res.status(401).json({ message: 'Invalid token' });
    }
  },
  authorize: (role) => (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    if (req.user.role !== role) return res.status(403).json({ message: `${role} role required` });
    next();
  },
  validateSastraDomain: (req, res, next) => next(),
}));

// Mock sessionSummaryService so generate-summary doesn't actually call AI
jest.mock('../services/content/sessionSummaryService', () => ({
  generateSessionSummary: jest.fn().mockResolvedValue('mocked summary'),
}));

// Mock rate limiter middleware (aiLimiter) — just pass through in tests
jest.mock('../middleware/rateLimiter', () => ({
  authLimiter: (req, res, next) => next(),
  apiLimiter: (req, res, next) => next(),
  aiLimiter: (req, res, next) => next(),
}));

const { mockQuery, mockClient, mockConnect, createTestApp } = require('./setup');
const { generateToken, mockTeacher, mockStudent, mockSession } = require('./helpers');
const request = require('supertest');

const sessionsRouter = require('../routes/session/sessions');
const app = createTestApp({ path: '/api/sessions', router: sessionsRouter });

describe('Session Lock — PATCH /:sessionId/lock', () => {
  const teacher = mockTeacher();
  let teacherToken, studentToken;

  beforeAll(() => {
    teacherToken = generateToken(teacher.id, 'teacher');
    studentToken = generateToken('student-456', 'student');
  });

  beforeEach(() => {
    mockQuery.mockReset();
    mockClient.query.mockReset();
    mockConnect.mockResolvedValue(mockClient);
  });

  it('should lock a session', async () => {
    const now = new Date().toISOString();
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, session_id: 'ABC123', locked_at: now }],
    });

    const res = await request(app)
      .patch('/api/sessions/ABC123/lock')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ locked: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.locked).toBe(true);
  });

  it('should unlock a session', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, session_id: 'ABC123', locked_at: null }],
    });

    const res = await request(app)
      .patch('/api/sessions/ABC123/lock')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ locked: false });

    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(false);
  });

  it('should return 400 when locked is not a boolean', async () => {
    const res = await request(app)
      .patch('/api/sessions/ABC123/lock')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ locked: 'yes' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/boolean/i);
  });

  it('should return 404 when session not found or teacher does not own it', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch('/api/sessions/XYZ999/lock')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ locked: true });

    expect(res.status).toBe(404);
  });

  it('should return 403 when a student tries to lock', async () => {
    const res = await request(app)
      .patch('/api/sessions/ABC123/lock')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ locked: true });

    expect(res.status).toBe(403);
  });
});

describe('Session Join — Lock enforcement', () => {
  const teacher = mockTeacher();
  const student = mockStudent({ id: 'student-999' });
  let studentToken;

  beforeAll(() => {
    studentToken = generateToken(student.id, 'student');
  });

  beforeEach(() => {
    mockQuery.mockReset();
    mockClient.query.mockReset();
    mockConnect.mockResolvedValue(mockClient);
  });

  it('should block a new student from joining a manually locked session', async () => {
    // 1st query: find session (locked_at is set)
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 1,
        session_id: 'LCK001',
        title: 'Locked Session',
        is_active: true,
        is_live: true,
        locked_at: new Date().toISOString(),
        lock_after_minutes: null,
        live_started_at: new Date(Date.now() - 5 * 60000).toISOString(),
      }],
    });
    // 2nd query: check existing participant — not found (new student)
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/sessions/LCK001/join')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/locked/i);
  });

  it('should allow a returning student to rejoin a locked session', async () => {
    // 1st query: find session (locked_at is set)
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 1,
        session_id: 'LCK001',
        title: 'Locked Session',
        is_active: true,
        is_live: true,
        locked_at: new Date().toISOString(),
        lock_after_minutes: null,
        live_started_at: new Date(Date.now() - 5 * 60000).toISOString(),
      }],
    });
    // 2nd query: existing participant found
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 42 }] });
    // 3rd query: upsert participant
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Any subsequent queries (gamification etc.)
    mockQuery.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .post('/api/sessions/LCK001/join')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
  });

  it('should block new student when auto-lock time has elapsed', async () => {
    const liveStartedAt = new Date(Date.now() - 20 * 60000).toISOString(); // 20 min ago
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 1,
        session_id: 'AUT001',
        title: 'Auto Lock Session',
        is_active: true,
        is_live: true,
        locked_at: null,          // not manually locked
        lock_after_minutes: 10,   // auto-lock after 10 min
        live_started_at: liveStartedAt,
      }],
    });
    // New student — not in participants yet
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/sessions/AUT001/join')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/locked/i);
  });

  it('should allow join when auto-lock time has not elapsed', async () => {
    const liveStartedAt = new Date(Date.now() - 3 * 60000).toISOString(); // 3 min ago
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 1,
        session_id: 'AUT002',
        title: 'Auto Lock Session',
        is_active: true,
        is_live: true,
        locked_at: null,
        lock_after_minutes: 10,   // auto-lock after 10 min; only 3 min elapsed
        live_started_at: liveStartedAt,
      }],
    });
    // New student
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Upsert participant
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .post('/api/sessions/AUT002/join')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(201);
  });
});

describe('AI Session Summary — POST /:sessionId/generate-summary', () => {
  const teacher = mockTeacher();
  let teacherToken, otherTeacherToken;

  beforeAll(() => {
    teacherToken = generateToken(teacher.id, 'teacher');
    otherTeacherToken = generateToken('other-teacher', 'teacher');
  });

  beforeEach(() => {
    mockQuery.mockReset();
    mockClient.query.mockReset();
    mockConnect.mockResolvedValue(mockClient);
  });

  it('should start generation and return status=generating', async () => {
    // getNumericSessionId: find numeric id
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 5 }] });
    // ownerCheck: teacher owns session, status is 'none'
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 5, summary_status: 'none' }] });
    // UPDATE sessions SET summary_status='generating'
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/sessions/ABC123/generate-summary')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('generating');
  });

  it('should return 409 when generation is already in progress', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 5 }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 5, summary_status: 'generating' }] });

    const res = await request(app)
      .post('/api/sessions/ABC123/generate-summary')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already in progress/i);
  });

  it('should return 404 when session not found', async () => {
    // getNumericSessionId returns no rows
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/sessions/NOTFOUND/generate-summary')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(404);
  });

  it('should return 403 when teacher does not own session', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 5 }] });
    // ownerCheck: session exists but belongs to a different teacher
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/sessions/ABC123/generate-summary')
      .set('Authorization', `Bearer ${otherTeacherToken}`);

    expect(res.status).toBe(403);
  });

  it('should return 403 for non-teacher', async () => {
    const studentToken = generateToken('s1', 'student');
    const res = await request(app)
      .post('/api/sessions/ABC123/generate-summary')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
  });
});

describe('AI Session Summary — GET /:sessionId/summary', () => {
  const teacher = mockTeacher();
  let teacherToken;

  beforeAll(() => {
    teacherToken = generateToken(teacher.id, 'teacher');
  });

  beforeEach(() => {
    mockQuery.mockReset();
    mockClient.query.mockReset();
    mockConnect.mockResolvedValue(mockClient);
  });

  it('should return completed summary', async () => {
    const generatedAt = new Date().toISOString();
    mockQuery.mockResolvedValueOnce({
      rows: [{
        summary_text: 'Topics covered: Thermodynamics.',
        summary_status: 'completed',
        summary_generated_at: generatedAt,
      }],
    });

    const res = await request(app)
      .get('/api/sessions/ABC123/summary')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.summary).toBe('Topics covered: Thermodynamics.');
    expect(res.body.generated_at).toBe(generatedAt);
  });

  it('should return status=none when summary not yet generated', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        summary_text: null,
        summary_status: null,
        summary_generated_at: null,
      }],
    });

    const res = await request(app)
      .get('/api/sessions/ABC123/summary')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('none');
    expect(res.body.summary).toBeNull();
  });

  it('should return 404 when session not found or not owned by teacher', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/sessions/NOTMINE/summary')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(404);
  });

  it('should return 401 without auth', async () => {
    const res = await request(app).get('/api/sessions/ABC123/summary');
    expect(res.status).toBe(401);
  });
});
