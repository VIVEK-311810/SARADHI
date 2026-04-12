/**
 * Export Route Tests
 */
const { mockQuery, createTestApp } = require('./setup');
const { generateToken, mockTeacher, mockStudent } = require('./helpers');

const request = require('supertest');

const exportRouter = require('../routes/analytics/export');
const app = createTestApp({ path: '/api/export', router: exportRouter });

describe('Export Routes - /api/export', () => {
  const teacher = mockTeacher();
  const student = mockStudent();
  let teacherToken, studentToken;

  beforeAll(() => {
    teacherToken = generateToken(teacher.id, 'teacher');
    studentToken = generateToken(student.id, 'student');
  });

  beforeEach(() => {
    mockQuery.mockReset();
  });

  // --- GET /poll/:pollId/csv ---
  describe('GET /poll/:pollId/csv', () => {
    it('should export poll results as CSV', async () => {
      const poll = { id: 1, question: 'Test?', teacher_id: teacher.id, session_title: 'Session' };
      const responses = [
        { student_name: 'Student A', email: 'a@sastra.ac.in', selected_option: 0, is_correct: true, response_time: 3000, responded_at: new Date() },
        { student_name: 'Student B', email: 'b@sastra.ac.in', selected_option: 1, is_correct: false, response_time: 5000, responded_at: new Date() },
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [teacher] }) // authenticate
        .mockResolvedValueOnce({ rows: [poll] })
        .mockResolvedValueOnce({ rows: responses });

      const res = await request(app)
        .get('/api/export/poll/1/csv')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('poll_1_results.csv');
      expect(res.text).toContain('student_name');
      expect(res.text).toContain('Student A');
      expect(res.text).toContain('Correct');
      expect(res.text).toContain('Incorrect');
    });

    it('should return 404 for non-existent poll', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [teacher] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/export/poll/999/csv')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 403 if teacher does not own the poll', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [teacher] })
        .mockResolvedValueOnce({ rows: [{ id: 1, teacher_id: 'other-teacher' }] });

      const res = await request(app)
        .get('/api/export/poll/1/csv')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(403);
    });

    it('should reject student access', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [student] });

      const res = await request(app)
        .get('/api/export/poll/1/csv')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });
  });

  // --- GET /session/:sessionId/all-responses/csv ---
  describe('GET /session/:sessionId/all-responses/csv', () => {
    it('should export all session responses as CSV', async () => {
      const session = { id: 1, session_id: 'ABC123', teacher_id: teacher.id };
      const responses = [{
        poll_question: 'What is 2+2?', student_name: 'Student A',
        email: 'a@sastra.ac.in', selected_option: 3, correct_answer: 3,
        is_correct: true, response_time: 3000, responded_at: new Date(),
      }];

      mockQuery
        .mockResolvedValueOnce({ rows: [teacher] })
        .mockResolvedValueOnce({ rows: [session] })
        .mockResolvedValueOnce({ rows: responses });

      const res = await request(app)
        .get('/api/export/session/ABC123/all-responses/csv')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('poll_question');
      expect(res.text).toContain('Student A');
    });

    it('should return 404 for non-existent session', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [teacher] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/export/session/NONEXIST/all-responses/csv')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 403 if teacher does not own session', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [teacher] })
        .mockResolvedValueOnce({ rows: [{ id: 1, session_id: 'ABC123', teacher_id: 'other' }] });

      const res = await request(app)
        .get('/api/export/session/ABC123/all-responses/csv')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(403);
    });
  });

  // --- GET /session/:sessionId/report/pdf ---
  describe('GET /session/:sessionId/report/pdf', () => {
    it('should export session report as PDF', async () => {
      const session = {
        id: 1, session_id: 'ABC123', title: 'Test Session', course_name: 'CS101',
        teacher_name: 'Prof X', teacher_id: teacher.id, is_active: false, created_at: new Date(),
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [teacher] })
        .mockResolvedValueOnce({ rows: [session] })
        .mockResolvedValueOnce({ rows: [{ full_name: 'Student A', email: 'a@sastra.ac.in', joined_at: new Date() }] })
        .mockResolvedValueOnce({ rows: [] })  // gamification leaderboard query
        .mockResolvedValueOnce({ rows: [{ question: 'Q1?', options: ['A', 'B'], correct_answer: 0, response_count: '10', correct_count: '8' }] });

      const res = await request(app)
        .get('/api/export/session/ABC123/report/pdf')
        .set('Authorization', `Bearer ${teacherToken}`)
        .buffer(true);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('session_ABC123_report.pdf');
    });

    it('should return 404 for non-existent session', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [teacher] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/export/session/NONEXIST/report/pdf')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(404);
    });
  });

  // --- GET /student/:studentId/performance/csv ---
  describe('GET /student/:studentId/performance/csv', () => {
    it('should export student performance as CSV', async () => {
      const responses = [{
        session_id: 'ABC123', session_title: 'Test Session',
        poll_question: 'Q1?', selected_option: 0, correct_answer: 0,
        is_correct: true, response_time: 3000, responded_at: new Date(),
      }];

      mockQuery
        .mockResolvedValueOnce({ rows: [teacher] })
        .mockResolvedValueOnce({ rows: [{ full_name: 'Student A', email: 'a@sastra.ac.in' }] })
        .mockResolvedValueOnce({ rows: responses });

      const res = await request(app)
        .get(`/api/export/student/${student.id}/performance/csv`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('Test Session');
    });

    it('should return 404 if student not found', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [teacher] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/export/student/nonexistent/performance/csv')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(404);
    });
  });
});
