/**
 * Auth Middleware Tests
 *
 * Tests for authenticate, authorize, and validateSastraDomain middleware.
 */
const { mockPool, mockQuery } = require('./setup');
const { generateToken, mockTeacher, mockStudent } = require('./helpers');

const { authenticate, authorize, validateSastraDomain } = require('../middleware/auth');

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      header: jest.fn(),
      user: null,
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
    mockQuery.mockReset();
  });

  // --- authenticate ---
  describe('authenticate', () => {
    it('should reject request with no token', async () => {
      req.header.mockReturnValue(undefined);

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('No token') })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with invalid token', async () => {
      req.header.mockReturnValue('Bearer invalid-token-here');

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('Invalid token') })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject expired token', async () => {
      const jwt = require('jsonwebtoken');
      const expiredToken = jwt.sign(
        { userId: 'teacher-123' },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' } // Already expired
      );
      req.header.mockReturnValue(`Bearer ${expiredToken}`);

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('expired') })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject valid token with non-existent user', async () => {
      const token = generateToken('nonexistent-user');
      req.header.mockReturnValue(`Bearer ${token}`);

      mockQuery.mockResolvedValueOnce({ rows: [] }); // No user found

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('User not found') })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should authenticate valid teacher token', async () => {
      const teacher = mockTeacher();
      const token = generateToken(teacher.id, 'teacher');
      req.header.mockReturnValue(`Bearer ${token}`);

      mockQuery.mockResolvedValueOnce({ rows: [teacher] });

      await authenticate(req, res, next);

      expect(req.user).toEqual(teacher);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should authenticate valid student token', async () => {
      const student = mockStudent();
      const token = generateToken(student.id, 'student');
      req.header.mockReturnValue(`Bearer ${token}`);

      mockQuery.mockResolvedValueOnce({ rows: [student] });

      await authenticate(req, res, next);

      expect(req.user).toEqual(student);
      expect(next).toHaveBeenCalled();
    });

    it('should query database with correct userId', async () => {
      const teacher = mockTeacher();
      const token = generateToken(teacher.id);
      req.header.mockReturnValue(`Bearer ${token}`);

      mockQuery.mockResolvedValueOnce({ rows: [teacher] });

      await authenticate(req, res, next);

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT id, email, role, full_name, created_at FROM users WHERE id = $1',
        [teacher.id]
      );
    });
  });

  // --- authorize ---
  describe('authorize', () => {
    it('should reject if no user attached to request', () => {
      req.user = null;
      const middleware = authorize('teacher');

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject if user role does not match', () => {
      req.user = mockStudent();
      const middleware = authorize('teacher');

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('teacher role required') })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow teacher access for teacher-only routes', () => {
      req.user = mockTeacher();
      const middleware = authorize('teacher');

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow student access for student-only routes', () => {
      req.user = mockStudent();
      const middleware = authorize('student');

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject teacher from student-only routes', () => {
      req.user = mockTeacher();
      const middleware = authorize('student');

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // --- validateSastraDomain ---
  describe('validateSastraDomain', () => {
    it('should reject if no user', () => {
      req.user = null;

      validateSastraDomain(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow valid teacher domain (@sastra.edu)', () => {
      req.user = mockTeacher({ email: 'prof@sastra.edu' });

      validateSastraDomain(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow faculty subdomain (*.sastra.edu)', () => {
      req.user = mockTeacher({ email: 'prof@cse.sastra.edu' });

      validateSastraDomain(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow valid student domain (@sastra.ac.in)', () => {
      req.user = mockStudent({ email: '123456@sastra.ac.in' });

      validateSastraDomain(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject teacher with wrong domain', () => {
      req.user = mockTeacher({ email: 'teacher@gmail.com' });

      validateSastraDomain(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('sastra') })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject student with wrong domain', () => {
      req.user = mockStudent({ email: 'student@gmail.com' });

      validateSastraDomain(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject teacher with student domain', () => {
      req.user = { ...mockTeacher(), email: '123456@sastra.ac.in' };

      validateSastraDomain(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject student with teacher domain', () => {
      req.user = { ...mockStudent(), email: 'prof@sastra.edu' };

      validateSastraDomain(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
