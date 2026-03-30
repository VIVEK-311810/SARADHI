/**
 * Sessions Route Tests
 */

// Mock auth middleware so tests don't need a live DB for token validation
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

const { mockQuery, mockClient, mockConnect, createTestApp } = require('./setup');
const { generateToken, mockTeacher, mockStudent, mockSession } = require('./helpers');

const request = require('supertest');

// Create test app with only the sessions router
const sessionsRouter = require('../routes/sessions');
const app = createTestApp({ path: '/api/sessions', router: sessionsRouter });

describe('Sessions Routes - /api/sessions', () => {
  const teacher = mockTeacher();
  const student = mockStudent();
  let teacherToken, studentToken;

  beforeAll(() => {
    teacherToken = generateToken(teacher.id, 'teacher');
    studentToken = generateToken(student.id, 'student');
  });

  beforeEach(() => {
    mockQuery.mockReset();
    mockClient.query.mockReset();
    mockConnect.mockResolvedValue(mockClient);
  });

  // --- POST / ---
  describe('POST / - Create session', () => {
    it('should create a session with valid data', async () => {
      const sessionData = { title: 'Test Session', course_name: 'CS101' };
      const createdSession = mockSession({ ...sessionData, teacher_id: teacher.id });

      mockQuery.mockResolvedValueOnce({ rows: [createdSession] }); // INSERT

      const res = await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send(sessionData);

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Test Session');
    });

    it('should return 400 if required fields are missing', async () => {
      const res = await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ title: 'Test' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing required fields');
    });
  });

  // --- GET /teacher/:teacherId ---
  describe('GET /teacher/:teacherId', () => {
    it('should return sessions for a teacher', async () => {
      const sessions = [
        mockSession({ title: 'Session 1', participant_count: '5', poll_count: '3' }),
        mockSession({ id: 2, session_id: 'XYZ789', title: 'Session 2', participant_count: '10', poll_count: '7' }),
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: sessions })          // main sessions query
        .mockResolvedValueOnce({ rows: [{ total: '2' }] }); // count query

      const res = await request(app)
        .get(`/api/sessions/teacher/${teacher.id}`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.sessions).toHaveLength(2);
      expect(res.body.sessions[0].title).toBe('Session 1');
      expect(res.body.total).toBe(2);
    });

    it('should return empty array for teacher with no sessions', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })                // main sessions query
        .mockResolvedValueOnce({ rows: [{ total: '0' }] }); // count query

      const res = await request(app)
        .get(`/api/sessions/teacher/${teacher.id}`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.sessions).toEqual([]);
      expect(res.body.total).toBe(0);
    });
  });

  // --- GET /:sessionId ---
  describe('GET /:sessionId', () => {
    it('should return session by session_id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockSession()] });

      const res = await request(app)
        .get('/api/sessions/ABC123')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.session_id).toBe('ABC123');
    });

    it('should return 404 for non-existent session', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/sessions/NONEXIST')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });

    it('should uppercase session_id for lookup', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockSession()] });

      await request(app)
        .get('/api/sessions/abc123')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(mockQuery.mock.calls[0][1][0]).toBe('ABC123');
    });
  });

  // --- POST /:sessionId/join ---
  describe('POST /:sessionId/join', () => {
    it('should allow student to join an active session', async () => {
      const session = mockSession({ is_active: true, is_live: true });

      mockQuery
        .mockResolvedValueOnce({ rows: [session] }) // SELECT session
        .mockResolvedValueOnce({ rows: [] })         // no existing participant
        .mockResolvedValueOnce({ rows: [] });        // INSERT participant

      const res = await request(app)
        .post('/api/sessions/ABC123/join')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.message).toContain('Successfully joined');
      expect(res.body.session.session_id).toBe('ABC123');
    });

    it('should return 200 if student already joined', async () => {
      const session = mockSession({ is_active: true, is_live: true });

      mockQuery
        .mockResolvedValueOnce({ rows: [session] })                                    // SELECT session
        .mockResolvedValueOnce({ rows: [{ session_id: 1, student_id: student.id }] }); // existing

      const res = await request(app)
        .post('/api/sessions/ABC123/join')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Already joined');
    });

    it('should return 404 for non-existent session', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/sessions/NONEXIST/join')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({});

      expect(res.status).toBe(404);
    });

    it('should return 403 for inactive session', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockSession({ is_active: false })] });

      const res = await request(app)
        .post('/api/sessions/ABC123/join')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('not active');
    });

    it('should return 403 when class is not live yet', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockSession({ is_active: true, is_live: false })] });

      const res = await request(app)
        .post('/api/sessions/ABC123/join')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('not live');
    });
  });

  // --- GET /:sessionId/participants ---
  describe('GET /:sessionId/participants', () => {
    it('should return participants for a session', async () => {
      const participants = [
        { id: '123', name: 'Student A', email: 'a@sastra.ac.in', joined_at: new Date(), is_active: true },
        { id: '456', name: 'Student B', email: 'b@sastra.ac.in', joined_at: new Date(), is_active: true },
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // getNumericSessionId
        .mockResolvedValueOnce({ rows: participants });

      const res = await request(app)
        .get('/api/sessions/ABC123/participants')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.participants).toHaveLength(2);
      expect(res.body.count).toBe(2);
    });

    it('should return 404 for non-existent session', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/sessions/NONEXIST/participants')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(404);
    });
  });

  // --- GET /:sessionId/polls ---
  describe('GET /:sessionId/polls', () => {
    it('should return polls for a session', async () => {
      const polls = [
        { id: 1, question: 'Q1', options: '["A","B","C","D"]', is_active: false },
        { id: 2, question: 'Q2', options: '["A","B","C","D"]', is_active: true },
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // getNumericSessionId
        .mockResolvedValueOnce({ rows: polls });

      const res = await request(app)
        .get('/api/sessions/ABC123/polls')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });
  });

  // --- DELETE /:sessionId ---
  describe('DELETE /:sessionId', () => {
    it('should delete a session', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })  // getNumericSessionId
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // DELETE RETURNING id (ownership check)

      const res = await request(app)
        .delete('/api/sessions/ABC123')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted');
    });

    it('should return 404 for non-existent session', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .delete('/api/sessions/NONEXIST')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(404);
    });
  });
});
