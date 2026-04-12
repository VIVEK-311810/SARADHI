/**
 * Polls Route Tests
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
const { generateToken, mockTeacher, mockStudent, mockPoll } = require('./helpers');

const request = require('supertest');

const pollsRouter = require('../routes/session/polls');
const app = createTestApp({ path: '/api/polls', router: pollsRouter });

describe('Polls Routes - /api/polls', () => {
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
  describe('POST / - Create poll', () => {
    it('should create a poll with valid data', async () => {
      const pollData = {
        session_id: 'ABC123',
        question: 'What is 2+2?',
        options: ['1', '2', '3', '4'],
        correct_answer: 3,
        justification: 'Basic math',
        time_limit: 30,
        question_type: 'mcq',
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })                    // getNumericSessionId
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] })                     // sessionOwnerCheck
        .mockResolvedValueOnce({ rows: [mockPoll({ ...pollData, id: 1 })] }); // INSERT

      const res = await request(app)
        .post('/api/polls')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send(pollData);

      expect(res.status).toBe(201);
      expect(res.body.question).toBe('What is 2+2?');
    });

    it('should return 400 if question is missing', async () => {
      const res = await request(app)
        .post('/api/polls')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ session_id: 'ABC123', options: ['A', 'B'] });

      expect(res.status).toBe(400);
    });

    it('should return 400 if options has less than 2 items', async () => {
      const res = await request(app)
        .post('/api/polls')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ session_id: 'ABC123', question: 'Test?', options: ['Only one'] });

      expect(res.status).toBe(400);
    });

    it('should return 404 if session does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // no session

      const res = await request(app)
        .post('/api/polls')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ session_id: 'NONEXIST', question: 'Test?', options: ['A', 'B'], correct_answer: 0, question_type: 'mcq' });

      expect(res.status).toBe(404);
    });

    it('should default time_limit to 60 if not provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })           // getNumericSessionId
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] })            // sessionOwnerCheck
        .mockResolvedValueOnce({ rows: [mockPoll({ time_limit: 60 })] }); // INSERT

      await request(app)
        .post('/api/polls')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ session_id: 'ABC123', question: 'Test?', options: ['A', 'B'], correct_answer: 0, question_type: 'mcq' });

      // INSERT is now call index 2 (0: getNumericSessionId, 1: ownerCheck, 2: INSERT)
      const insertCall = mockQuery.mock.calls[2];
      expect(insertCall[1][5]).toBe(60);
    });
  });

  // --- GET /:pollId ---
  describe('GET /:pollId', () => {
    it('should return poll by ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockPoll()] });

      const res = await request(app)
        .get('/api/polls/1')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.question).toBe('What is 2+2?');
    });

    it('should return 404 for non-existent poll', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/polls/999')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(404);
    });
  });

  // --- PUT /:pollId/activate ---
  describe('PUT /:pollId/activate', () => {
    it('should activate a poll', async () => {
      const activatedPoll = mockPoll({ is_active: true, activated_at: new Date().toISOString() });

      mockClient.query
        .mockResolvedValueOnce()                                                        // BEGIN
        .mockResolvedValueOnce({ rows: [{ session_id: 1, teacher_id: teacher.id }] }) // get session+owner
        .mockResolvedValueOnce()                                                        // deactivate others
        .mockResolvedValueOnce({ rows: [activatedPoll] })                              // activate
        .mockResolvedValueOnce();                                                       // COMMIT

      const res = await request(app)
        .put('/api/polls/1/activate')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.is_active).toBe(true);
    });

    it('should return 404 for non-existent poll', async () => {
      mockClient.query
        .mockResolvedValueOnce()               // BEGIN
        .mockResolvedValueOnce({ rows: [] })   // not found
        .mockResolvedValueOnce();              // ROLLBACK

      const res = await request(app)
        .put('/api/polls/999/activate')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(404);
    });

    it('should deactivate other active polls in same session', async () => {
      mockClient.query
        .mockResolvedValueOnce()                                                        // BEGIN
        .mockResolvedValueOnce({ rows: [{ session_id: 1, teacher_id: teacher.id }] })
        .mockResolvedValueOnce()                                                        // deactivate others
        .mockResolvedValueOnce({ rows: [mockPoll({ is_active: true })] })
        .mockResolvedValueOnce();                                                       // COMMIT

      await request(app)
        .put('/api/polls/1/activate')
        .set('Authorization', `Bearer ${teacherToken}`);

      const deactivateCall = mockClient.query.mock.calls[2];
      expect(deactivateCall[0]).toContain('is_active = FALSE');
    });
  });

  // --- PUT /:pollId/close ---
  describe('PUT /:pollId/close', () => {
    it('should close an active poll', async () => {
      const closedPoll = mockPoll({ is_active: false });

      mockQuery
        .mockResolvedValueOnce({ rows: [{ teacher_id: teacher.id }] }) // ownerCheck
        .mockResolvedValueOnce({ rows: [closedPoll] })                 // UPDATE
        .mockResolvedValueOnce({ rows: [{ session_id: 'ABC123' }] });  // session string id

      const res = await request(app)
        .put('/api/polls/1/close')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.is_active).toBe(false);
    });

    it('should return 404 for non-existent poll', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // ownerCheck — poll not found

      const res = await request(app)
        .put('/api/polls/999/close')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(404);
    });
  });

  // --- POST /:pollId/respond ---
  describe('POST /:pollId/respond', () => {
    it('should accept a valid poll response', async () => {
      const poll = mockPoll({ is_active: true, correct_answer: 3 });
      const responseRow = { id: 1, poll_id: 1, student_id: student.id, selected_option: 3, is_correct: true };

      mockQuery
        .mockResolvedValueOnce({ rows: [poll] })                          // poll active
        .mockResolvedValueOnce({ rows: [] })                              // no existing response
        .mockResolvedValueOnce({ rows: [{ student_id: student.id }] })   // participant
        .mockResolvedValueOnce({ rows: [responseRow] })                   // INSERT
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })               // online count
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });              // response count

      const res = await request(app)
        .post('/api/polls/1/respond')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ selected_option: 3, response_time: 5000 });

      expect(res.status).toBe(201);
      expect(res.body.message).toContain('submitted');
    });

    it('should return 400 if required fields missing', async () => {
      const res = await request(app)
        .post('/api/polls/1/respond')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 404 if poll not active', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // not found/not active

      const res = await request(app)
        .post('/api/polls/999/respond')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ selected_option: 0 });

      expect(res.status).toBe(404);
    });

    it('should return 400 if already responded', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockPoll({ is_active: true })] }) // poll
        .mockResolvedValueOnce({ rows: [{ id: 1 }] });                    // existing response

      const res = await request(app)
        .post('/api/polls/1/respond')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ selected_option: 0 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Already responded');
    });

    it('should return 403 if student not part of session', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockPoll({ is_active: true })] }) // poll
        .mockResolvedValueOnce({ rows: [] })                              // no existing response
        .mockResolvedValueOnce({ rows: [] });                             // not a participant

      const res = await request(app)
        .post('/api/polls/1/respond')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ selected_option: 0 });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('not part');
    });
  });

  // --- GET /:pollId/responses ---
  describe('GET /:pollId/responses', () => {
    it('should return responses with statistics', async () => {
      const poll = mockPoll({ options: ['1', '2', '3', '4'], correct_answer: 3 });
      const responses = [
        { student_name: 'A', selected_option: 3, is_correct: true, response_time: 3000 },
        { student_name: 'B', selected_option: 1, is_correct: false, response_time: 5000 },
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [{ teacher_id: teacher.id }] }) // ownerCheck
        .mockResolvedValueOnce({ rows: responses })                     // poll_responses
        .mockResolvedValueOnce({ rows: [poll] });                       // poll details

      const res = await request(app)
        .get('/api/polls/1/responses')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.responses).toHaveLength(2);
      expect(res.body.stats.totalResponses).toBe(2);
      expect(res.body.stats.correctResponses).toBe(1);
    });

    it('should return 404 if poll not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // ownerCheck — poll not found

      const res = await request(app)
        .get('/api/polls/999/responses')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(404);
    });
  });

  // --- DELETE /:pollId ---
  describe('DELETE /:pollId', () => {
    it('should delete an inactive poll with no responses', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ is_active: false, teacher_id: teacher.id }] }) // pollCheck
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })                               // responseCheck
        .mockResolvedValueOnce({ rows: [] });                                            // DELETE

      const res = await request(app)
        .delete('/api/polls/1')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted');
    });

    it('should return 400 if poll has responses', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ is_active: false, teacher_id: teacher.id }] }) // pollCheck
        .mockResolvedValueOnce({ rows: [{ count: '5' }] });                              // responseCheck

      const res = await request(app)
        .delete('/api/polls/1')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('existing responses');
    });

    it('should return 400 if poll is active', async () => {
      // pollCheck returns active poll → 400 immediately (no responseCheck needed)
      mockQuery.mockResolvedValueOnce({ rows: [{ is_active: true, teacher_id: teacher.id }] });

      const res = await request(app)
        .delete('/api/polls/1')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('active poll');
    });

    it('should return 404 if poll not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // pollCheck — not found

      const res = await request(app)
        .delete('/api/polls/999')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(404);
    });
  });

  // --- PUT /:pollId ---
  describe('PUT /:pollId - Update poll', () => {
    it('should update an inactive poll', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ is_active: false, teacher_id: teacher.id }] }) // pollCheck
        .mockResolvedValueOnce({ rows: [mockPoll({ question: 'Updated' })] });           // UPDATE

      const res = await request(app)
        .put('/api/polls/1')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ question: 'Updated', options: ['A', 'B'], correct_answer: 0 });

      expect(res.status).toBe(200);
    });

    it('should return 400 if poll is active', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ is_active: true, teacher_id: teacher.id }] }); // pollCheck

      const res = await request(app)
        .put('/api/polls/1')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ question: 'Changed?', options: ['A', 'B'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('inactive');
    });
  });
});
