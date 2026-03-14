/**
 * Sessions Route Tests
 */
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
      const sessionData = { title: 'Test Session', course_name: 'CS101', teacher_id: teacher.id };
      const createdSession = mockSession(sessionData);

      mockQuery.mockResolvedValueOnce({ rows: [createdSession] }); // INSERT

      const res = await request(app)
        .post('/api/sessions')
        .send(sessionData);

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Test Session');
    });

    it('should return 400 if required fields are missing', async () => {
      const res = await request(app)
        .post('/api/sessions')
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

      mockQuery.mockResolvedValueOnce({ rows: sessions });

      const res = await request(app).get(`/api/sessions/teacher/${teacher.id}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].title).toBe('Session 1');
    });

    it('should return empty array for teacher with no sessions', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get(`/api/sessions/teacher/${teacher.id}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // --- GET /:sessionId ---
  describe('GET /:sessionId', () => {
    it('should return session by session_id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockSession()] });

      const res = await request(app).get('/api/sessions/ABC123');

      expect(res.status).toBe(200);
      expect(res.body.session_id).toBe('ABC123');
    });

    it('should return 404 for non-existent session', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/sessions/NONEXIST');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });

    it('should uppercase session_id for lookup', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockSession()] });

      await request(app).get('/api/sessions/abc123');

      expect(mockQuery.mock.calls[0][1][0]).toBe('ABC123');
    });
  });

  // --- POST /:sessionId/join ---
  describe('POST /:sessionId/join', () => {
    it('should allow student to join an active session', async () => {
      const session = mockSession();

      mockQuery
        .mockResolvedValueOnce({ rows: [session] }) // SELECT session
        .mockResolvedValueOnce({ rows: [] }) // no existing participant
        .mockResolvedValueOnce({ rows: [] }); // INSERT participant

      const res = await request(app)
        .post('/api/sessions/ABC123/join')
        .send({ student_id: student.id });

      expect(res.status).toBe(201);
      expect(res.body.message).toContain('Successfully joined');
      expect(res.body.session.session_id).toBe('ABC123');
    });

    it('should return 200 if student already joined', async () => {
      const session = mockSession();

      mockQuery
        .mockResolvedValueOnce({ rows: [session] }) // SELECT session
        .mockResolvedValueOnce({ rows: [{ session_id: 1, student_id: student.id }] }); // existing

      const res = await request(app)
        .post('/api/sessions/ABC123/join')
        .send({ student_id: student.id });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Already joined');
    });

    it('should return 404 for non-existent session', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/sessions/NONEXIST/join')
        .send({ student_id: student.id });

      expect(res.status).toBe(404);
    });

    it('should return 403 for inactive session', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockSession({ is_active: false })] });

      const res = await request(app)
        .post('/api/sessions/ABC123/join')
        .send({ student_id: student.id });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('not active');
    });

    it('should return 400 if student_id missing', async () => {
      const res = await request(app)
        .post('/api/sessions/ABC123/join')
        .send({});

      expect(res.status).toBe(400);
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

      const res = await request(app).get('/api/sessions/ABC123/participants');

      expect(res.status).toBe(200);
      expect(res.body.participants).toHaveLength(2);
      expect(res.body.count).toBe(2);
    });

    it('should return 404 for non-existent session', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/sessions/NONEXIST/participants');

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

      const res = await request(app).get('/api/sessions/ABC123/polls');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });
  });

  // --- DELETE /:sessionId ---
  describe('DELETE /:sessionId', () => {
    it('should delete a session', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // getNumericSessionId
        .mockResolvedValueOnce({ rows: [] }); // DELETE

      const res = await request(app).delete('/api/sessions/ABC123');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted');
    });

    it('should return 404 for non-existent session', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).delete('/api/sessions/NONEXIST');

      expect(res.status).toBe(404);
    });
  });
});
