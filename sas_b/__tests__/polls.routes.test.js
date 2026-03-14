/**
 * Polls Route Tests
 */
const { mockQuery, mockClient, mockConnect, createTestApp } = require('./setup');
const { generateToken, mockTeacher, mockStudent, mockPoll } = require('./helpers');

const request = require('supertest');

const pollsRouter = require('../routes/polls');
const app = createTestApp({ path: '/api/polls', router: pollsRouter });

describe('Polls Routes - /api/polls', () => {
  const teacher = mockTeacher();
  const student = mockStudent();

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
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // getNumericSessionId
        .mockResolvedValueOnce({ rows: [mockPoll({ ...pollData, id: 1 })] }); // INSERT

      const res = await request(app)
        .post('/api/polls')
        .send(pollData);

      expect(res.status).toBe(201);
      expect(res.body.question).toBe('What is 2+2?');
    });

    it('should return 400 if question is missing', async () => {
      const res = await request(app)
        .post('/api/polls')
        .send({ session_id: 'ABC123', options: ['A', 'B'] });

      expect(res.status).toBe(400);
    });

    it('should return 400 if options has less than 2 items', async () => {
      const res = await request(app)
        .post('/api/polls')
        .send({ session_id: 'ABC123', question: 'Test?', options: ['Only one'] });

      expect(res.status).toBe(400);
    });

    it('should return 404 if session does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // no session

      const res = await request(app)
        .post('/api/polls')
        .send({ session_id: 'NONEXIST', question: 'Test?', options: ['A', 'B'], correct_answer: 0 });

      expect(res.status).toBe(404);
    });

    it('should default time_limit to 60 if not provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // getNumericSessionId
        .mockResolvedValueOnce({ rows: [mockPoll({ time_limit: 60 })] }); // INSERT

      await request(app)
        .post('/api/polls')
        .send({ session_id: 'ABC123', question: 'Test?', options: ['A', 'B'], correct_answer: 0 });

      const insertCall = mockQuery.mock.calls[1];
      expect(insertCall[1][5]).toBe(60);
    });
  });

  // --- GET /:pollId ---
  describe('GET /:pollId', () => {
    it('should return poll by ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockPoll()] });

      const res = await request(app).get('/api/polls/1');

      expect(res.status).toBe(200);
      expect(res.body.question).toBe('What is 2+2?');
    });

    it('should return 404 for non-existent poll', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/polls/999');

      expect(res.status).toBe(404);
    });
  });

  // --- PUT /:pollId/activate ---
  describe('PUT /:pollId/activate', () => {
    it('should activate a poll', async () => {
      const activatedPoll = mockPoll({ is_active: true, activated_at: new Date().toISOString() });

      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [{ session_id: 1 }] }) // get session_id
        .mockResolvedValueOnce() // deactivate others
        .mockResolvedValueOnce({ rows: [activatedPoll] }) // activate
        .mockResolvedValueOnce(); // COMMIT

      const res = await request(app).put('/api/polls/1/activate');

      expect(res.status).toBe(200);
      expect(res.body.is_active).toBe(true);
    });

    it('should return 404 for non-existent poll', async () => {
      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // not found
        .mockResolvedValueOnce(); // ROLLBACK

      const res = await request(app).put('/api/polls/999/activate');

      expect(res.status).toBe(404);
    });

    it('should deactivate other active polls in same session', async () => {
      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [{ session_id: 1 }] })
        .mockResolvedValueOnce() // deactivate others
        .mockResolvedValueOnce({ rows: [mockPoll({ is_active: true })] })
        .mockResolvedValueOnce(); // COMMIT

      await request(app).put('/api/polls/1/activate');

      const deactivateCall = mockClient.query.mock.calls[2];
      expect(deactivateCall[0]).toContain('is_active = FALSE');
    });
  });

  // --- PUT /:pollId/close ---
  describe('PUT /:pollId/close', () => {
    it('should close an active poll', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockPoll({ is_active: false })] }) // UPDATE
        .mockResolvedValueOnce({ rows: [{ session_id: 'ABC123' }] }); // session string id

      const res = await request(app).put('/api/polls/1/close');

      expect(res.status).toBe(200);
      expect(res.body.is_active).toBe(false);
    });

    it('should return 404 for non-existent poll', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).put('/api/polls/999/close');

      expect(res.status).toBe(404);
    });
  });

  // --- POST /:pollId/respond ---
  describe('POST /:pollId/respond', () => {
    it('should accept a valid poll response', async () => {
      const poll = mockPoll({ is_active: true, correct_answer: 3 });
      const responseRow = { id: 1, poll_id: 1, student_id: student.id, selected_option: 3, is_correct: true };

      mockQuery
        .mockResolvedValueOnce({ rows: [poll] }) // poll active
        .mockResolvedValueOnce({ rows: [] }) // no existing response
        .mockResolvedValueOnce({ rows: [{ student_id: student.id }] }) // participant
        .mockResolvedValueOnce({ rows: [responseRow] }) // INSERT
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // online count
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }); // response count

      const res = await request(app)
        .post('/api/polls/1/respond')
        .send({ student_id: student.id, selected_option: 3, response_time: 5000 });

      expect(res.status).toBe(201);
      expect(res.body.message).toContain('submitted');
    });

    it('should return 400 if required fields missing', async () => {
      const res = await request(app)
        .post('/api/polls/1/respond')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 404 if poll not active', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // not found/not active

      const res = await request(app)
        .post('/api/polls/999/respond')
        .send({ student_id: student.id, selected_option: 0 });

      expect(res.status).toBe(404);
    });

    it('should return 400 if already responded', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockPoll({ is_active: true })] }) // poll
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // existing response

      const res = await request(app)
        .post('/api/polls/1/respond')
        .send({ student_id: student.id, selected_option: 0 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Already responded');
    });

    it('should return 403 if student not part of session', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockPoll({ is_active: true })] }) // poll
        .mockResolvedValueOnce({ rows: [] }) // no existing response
        .mockResolvedValueOnce({ rows: [] }); // not a participant

      const res = await request(app)
        .post('/api/polls/1/respond')
        .send({ student_id: student.id, selected_option: 0 });

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
        .mockResolvedValueOnce({ rows: responses })
        .mockResolvedValueOnce({ rows: [poll] });

      const res = await request(app).get('/api/polls/1/responses');

      expect(res.status).toBe(200);
      expect(res.body.responses).toHaveLength(2);
      expect(res.body.stats.totalResponses).toBe(2);
      expect(res.body.stats.correctResponses).toBe(1);
    });

    it('should return 404 if poll not found', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // no responses
        .mockResolvedValueOnce({ rows: [] }); // no poll

      const res = await request(app).get('/api/polls/999/responses');

      expect(res.status).toBe(404);
    });
  });

  // --- DELETE /:pollId ---
  describe('DELETE /:pollId', () => {
    it('should delete an inactive poll with no responses', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // no responses
        .mockResolvedValueOnce({ rows: [{ is_active: false }] }) // inactive
        .mockResolvedValueOnce({ rows: [] }); // DELETE

      const res = await request(app).delete('/api/polls/1');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted');
    });

    it('should return 400 if poll has responses', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '5' }] });

      const res = await request(app).delete('/api/polls/1');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('existing responses');
    });

    it('should return 400 if poll is active', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ is_active: true }] });

      const res = await request(app).delete('/api/polls/1');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('active poll');
    });

    it('should return 404 if poll not found', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).delete('/api/polls/999');

      expect(res.status).toBe(404);
    });
  });

  // --- PUT /:pollId ---
  describe('PUT /:pollId - Update poll', () => {
    it('should update an inactive poll', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ is_active: false }] })
        .mockResolvedValueOnce({ rows: [mockPoll({ question: 'Updated' })] });

      const res = await request(app)
        .put('/api/polls/1')
        .send({ question: 'Updated', options: ['A', 'B'], correct_answer: 0 });

      expect(res.status).toBe(200);
    });

    it('should return 400 if poll is active', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ is_active: true }] });

      const res = await request(app)
        .put('/api/polls/1')
        .send({ question: 'Changed?', options: ['A', 'B'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('inactive');
    });
  });
});
