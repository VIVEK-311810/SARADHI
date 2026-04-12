/**
 * Poll Lifecycle Tests
 *
 * Tests the complete lifecycle: create -> activate -> respond -> close -> view results
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

describe('Poll Lifecycle - Complete Flow', () => {
  const teacher = mockTeacher();
  const student1 = mockStudent({ id: '111111', full_name: 'Student One' });
  const student2 = mockStudent({ id: '222222', full_name: 'Student Two' });
  let teacherToken, student1Token, student2Token;

  beforeAll(() => {
    teacherToken = generateToken(teacher.id, 'teacher');
    student1Token = generateToken(student1.id, 'student');
    student2Token = generateToken(student2.id, 'student');
  });

  beforeEach(() => {
    mockQuery.mockReset();
    mockClient.query.mockReset();
    mockConnect.mockResolvedValue(mockClient);
  });

  it('should complete full lifecycle: create -> activate -> respond -> close -> results', async () => {
    // Step 1: Create poll
    const createdPoll = mockPoll({
      id: 1, question: 'What is the capital of France?',
      options: JSON.stringify(['London', 'Berlin', 'Paris', 'Madrid']),
      correct_answer: 2, is_active: false,
    });

    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })     // getNumericSessionId
      .mockResolvedValueOnce({ rows: [{ 1: 1 }] })      // sessionOwnerCheck
      .mockResolvedValueOnce({ rows: [createdPoll] });   // INSERT

    const createRes = await request(app)
      .post('/api/polls')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        session_id: 'ABC123', question: 'What is the capital of France?',
        options: ['London', 'Berlin', 'Paris', 'Madrid'], correct_answer: 2,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.is_active).toBe(false);

    // Step 2: Activate poll
    const activatedPoll = { ...createdPoll, is_active: true, activated_at: new Date().toISOString() };

    mockClient.query
      .mockResolvedValueOnce()                                                        // BEGIN
      .mockResolvedValueOnce({ rows: [{ session_id: 1, teacher_id: teacher.id }] }) // get session+owner
      .mockResolvedValueOnce()                                                        // deactivate others
      .mockResolvedValueOnce({ rows: [activatedPoll] })                              // activate
      .mockResolvedValueOnce();                                                       // COMMIT

    const activateRes = await request(app)
      .put('/api/polls/1/activate')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(activateRes.status).toBe(200);
    expect(activateRes.body.is_active).toBe(true);

    // Step 3: Student 1 responds (correct)
    mockQuery
      .mockResolvedValueOnce({ rows: [activatedPoll] })                           // poll active
      .mockResolvedValueOnce({ rows: [] })                                        // no existing response
      .mockResolvedValueOnce({ rows: [{ student_id: student1.id }] })            // participant
      .mockResolvedValueOnce({ rows: [{ id: 1, is_correct: true, selected_option: 2 }] }) // INSERT
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })                         // online count
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });                        // response count

    const respond1 = await request(app)
      .post('/api/polls/1/respond')
      .set('Authorization', `Bearer ${student1Token}`)
      .send({ selected_option: 2, response_time: 5000 });

    expect(respond1.status).toBe(201);

    // Step 4: Student 2 responds (wrong)
    mockQuery
      .mockResolvedValueOnce({ rows: [activatedPoll] })                           // poll active
      .mockResolvedValueOnce({ rows: [] })                                        // no existing response
      .mockResolvedValueOnce({ rows: [{ student_id: student2.id }] })            // participant
      .mockResolvedValueOnce({ rows: [{ id: 2, is_correct: false, selected_option: 0 }] }) // INSERT
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })                         // online count
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })                         // all responded
      // triggerAnswerReveal queries
      .mockResolvedValueOnce({ rows: [activatedPoll] })                          // get poll
      .mockResolvedValueOnce({ rows: [{ session_id: 'ABC123' }] });              // get session

    const respond2 = await request(app)
      .post('/api/polls/1/respond')
      .set('Authorization', `Bearer ${student2Token}`)
      .send({ selected_option: 0, response_time: 12000 });

    expect(respond2.status).toBe(201);

    // Step 5: Close poll
    const closedPoll = { ...activatedPoll, is_active: false };

    mockQuery
      .mockResolvedValueOnce({ rows: [{ teacher_id: teacher.id }] }) // ownerCheck
      .mockResolvedValueOnce({ rows: [closedPoll] })                  // UPDATE
      .mockResolvedValueOnce({ rows: [{ session_id: 'ABC123' }] });  // session string id

    const closeRes = await request(app)
      .put('/api/polls/1/close')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.is_active).toBe(false);

    // Step 6: View results
    const allResponses = [
      { student_name: 'Student One', selected_option: 2, is_correct: true, response_time: 5000 },
      { student_name: 'Student Two', selected_option: 0, is_correct: false, response_time: 12000 },
    ];

    mockQuery
      .mockResolvedValueOnce({ rows: [{ teacher_id: teacher.id }] })                              // ownerCheck
      .mockResolvedValueOnce({ rows: allResponses })                                              // poll_responses
      .mockResolvedValueOnce({ rows: [{ ...closedPoll, options: ['London', 'Berlin', 'Paris', 'Madrid'] }] }); // poll details

    const resultsRes = await request(app)
      .get('/api/polls/1/responses')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(resultsRes.status).toBe(200);
    expect(resultsRes.body.responses).toHaveLength(2);
    expect(resultsRes.body.stats.totalResponses).toBe(2);
    expect(resultsRes.body.stats.correctResponses).toBe(1);
    expect(resultsRes.body.stats.accuracyRate).toBe('50.0');
  });

  it('should prevent duplicate responses from same student', async () => {
    const poll = mockPoll({ is_active: true });

    // First response
    mockQuery
      .mockResolvedValueOnce({ rows: [poll] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ student_id: student1.id }] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });

    const res1 = await request(app)
      .post('/api/polls/1/respond')
      .set('Authorization', `Bearer ${student1Token}`)
      .send({ selected_option: 0 });
    expect(res1.status).toBe(201);

    // Duplicate response
    mockQuery
      .mockResolvedValueOnce({ rows: [poll] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // existing response

    const res2 = await request(app)
      .post('/api/polls/1/respond')
      .set('Authorization', `Bearer ${student1Token}`)
      .send({ selected_option: 1 });

    expect(res2.status).toBe(400);
    expect(res2.body.error).toContain('Already responded');
  });

  it('should prevent responding to an inactive poll', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no active poll found

    const res = await request(app)
      .post('/api/polls/1/respond')
      .set('Authorization', `Bearer ${student1Token}`)
      .send({ selected_option: 0 });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not active');
  });

  it('should not allow editing an active poll', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ is_active: true, teacher_id: teacher.id }] }); // pollCheck

    const res = await request(app)
      .put('/api/polls/1')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ question: 'Changed?', options: ['A', 'B'] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('inactive');
  });

  it('should not allow deleting an active poll', async () => {
    // pollCheck returns is_active: true → 400 immediately
    mockQuery.mockResolvedValueOnce({ rows: [{ is_active: true, teacher_id: teacher.id }] });

    const res = await request(app)
      .delete('/api/polls/1')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('active');
  });
});
