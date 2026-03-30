/**
 * Analytics Route Tests
 */
const { mockQuery, createTestApp } = require('./setup');
const { generateToken, mockTeacher, mockStudent } = require('./helpers');

const request = require('supertest');

const analyticsRouter = require('../routes/analytics');
const app = createTestApp({ path: '/api/analytics', router: analyticsRouter });

describe('Analytics Routes - /api/analytics', () => {
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

  // --- GET /teacher/:teacherId/overview ---
  describe('GET /teacher/:teacherId/overview', () => {
    it('should return overview stats for a teacher', async () => {
      const overviewData = {
        total_sessions: '5', total_polls: '20', total_students: '50',
        avg_response_rate: '85.5', avg_correct_rate: '72.3',
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [teacher] }) // authenticate
        .mockResolvedValueOnce({ rows: [overviewData] });

      const res = await request(app)
        .get(`/api/analytics/teacher/${teacher.id}/overview`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalSessions).toBe(5);
      expect(res.body.data.totalPolls).toBe(20);
      expect(res.body.data.totalStudents).toBe(50);
    });

    it('should return zeros for teacher with no data', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [teacher] })
        .mockResolvedValueOnce({ rows: [{ total_sessions: '0', total_polls: '0', total_students: '0', avg_response_rate: null, avg_correct_rate: null }] });

      const res = await request(app)
        .get(`/api/analytics/teacher/${teacher.id}/overview`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalSessions).toBe(0);
      expect(res.body.data.avgResponseRate).toBe(0);
    });

    it('should reject student access', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [student] });

      const res = await request(app)
        .get(`/api/analytics/teacher/${teacher.id}/overview`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it('should reject unauthenticated requests', async () => {
      const res = await request(app).get(`/api/analytics/teacher/${teacher.id}/overview`);

      expect(res.status).toBe(401);
    });
  });

  // --- GET /teacher/:teacherId/sessions ---
  describe('GET /teacher/:teacherId/sessions', () => {
    it('should return per-session analytics', async () => {
      const sessionsData = [
        {
          id: 1, session_id: 'ABC123', title: 'Session 1', course_name: 'CS101',
          is_active: true, created_at: new Date(), poll_count: '5',
          participant_count: '20', avg_accuracy: '75.0', total_responses: '80',
        },
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [teacher] })             // authenticate
        .mockResolvedValueOnce({ rows: sessionsData })           // main sessions query (Promise.all[0])
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });     // count query (Promise.all[1])

      const res = await request(app)
        .get(`/api/analytics/teacher/${teacher.id}/sessions`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].pollCount).toBe(5);
    });
  });

  // --- GET /teacher/:teacherId/poll-performance ---
  describe('GET /teacher/:teacherId/poll-performance', () => {
    it('should return poll performance data', async () => {
      const pollData = [{
        poll_id: 1, question: 'What is OOP?', session_title: 'CS101',
        session_id: 'ABC123', total_responses: '25', correct_responses: '20',
        accuracy_rate: '80.0', avg_response_time_sec: '5.2', created_at: new Date(),
      }];

      mockQuery
        .mockResolvedValueOnce({ rows: [teacher] })
        .mockResolvedValueOnce({ rows: pollData });

      const res = await request(app)
        .get(`/api/analytics/teacher/${teacher.id}/poll-performance`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data[0].accuracyRate).toBe(80);
    });
  });

  // --- GET /teacher/:teacherId/engagement-trends ---
  describe('GET /teacher/:teacherId/engagement-trends', () => {
    it('should return engagement trends', async () => {
      const trendData = [
        { date: '2024-01-15', sessions_count: '2', polls_created: '5', responses_received: '40', avg_accuracy: '78.5' },
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [teacher] })
        .mockResolvedValueOnce({ rows: trendData });

      const res = await request(app)
        .get(`/api/analytics/teacher/${teacher.id}/engagement-trends`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data[0].sessionsCount).toBe(2);
    });
  });

  // --- GET /session/:sessionId/detailed ---
  describe('GET /session/:sessionId/detailed', () => {
    it('should return detailed session analytics', async () => {
      const sessionData = {
        id: 1, session_id: 'ABC123', title: 'Test Session', course_name: 'CS101',
        teacher_name: 'Prof X', is_active: true, created_at: new Date(), teacher_id: teacher.id,
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [teacher] })
        .mockResolvedValueOnce({ rows: [sessionData] })
        .mockResolvedValueOnce({ rows: [{ id: 1, question: 'Q1', options: ['A', 'B'], correct_answer: 0, time_limit: 30, created_at: new Date(), response_count: '10', correct_count: '8', avg_response_time: '4.5' }] })
        .mockResolvedValueOnce({ rows: [{ id: '123', full_name: 'Student A', email: 'a@sastra.ac.in', responses_count: '1', correct_count: '1', accuracy: '100.0', avg_response_time: '3.0' }] });

      const res = await request(app)
        .get('/api/analytics/session/ABC123/detailed')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.session.title).toBe('Test Session');
      expect(res.body.data.pollBreakdown).toHaveLength(1);
      expect(res.body.data.participantPerformance).toHaveLength(1);
    });

    it('should return 404 for non-existent session', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [teacher] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/analytics/session/NONEXIST/detailed')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(404);
    });
  });
});
