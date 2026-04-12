/**
 * Test Helpers - Shared utilities for tests
 */
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

/**
 * Generate a valid JWT token for testing
 */
function generateToken(userId, role = 'teacher') {
  return jwt.sign(
    { userId, role },
    JWT_SECRET,
    { expiresIn: '1h', issuer: 'sas-edu-ai', audience: 'sas-edu-ai-client' }
  );
}

/**
 * Create a mock teacher user object
 */
function mockTeacher(overrides = {}) {
  return {
    id: 'teacher-123',
    full_name: 'Test Teacher',
    email: 'teacher@sastra.edu',
    role: 'teacher',
    register_number: null,
    ...overrides,
  };
}

/**
 * Create a mock student user object
 */
function mockStudent(overrides = {}) {
  return {
    id: '123456',
    full_name: 'Test Student',
    email: '123456@sastra.ac.in',
    role: 'student',
    register_number: '123456',
    ...overrides,
  };
}

/**
 * Create a mock session object
 */
function mockSession(overrides = {}) {
  return {
    id: 1,
    session_id: 'ABC123',
    title: 'Test Session',
    course_name: 'Test Course',
    teacher_id: 'teacher-123',
    is_active: true,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a mock poll object
 */
function mockPoll(overrides = {}) {
  return {
    id: 1,
    session_id: 1,
    question: 'What is 2+2?',
    options: JSON.stringify(['1', '2', '3', '4']),
    correct_answer: 3,
    justification: 'Basic math',
    time_limit: 60,
    is_active: false,
    activated_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a mock poll response object
 */
function mockPollResponse(overrides = {}) {
  return {
    id: 1,
    poll_id: 1,
    student_id: '123456',
    selected_option: 3,
    is_correct: true,
    response_time: 5000,
    responded_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Set up mockQuery to return user for authenticate middleware
 */
function setupAuthMock(mockQuery, user) {
  // The authenticate middleware queries: SELECT * FROM users WHERE id = $1
  mockQuery.mockImplementation((queryText, params) => {
    if (typeof queryText === 'string' && queryText.includes('SELECT * FROM users WHERE id')) {
      return Promise.resolve({ rows: [user] });
    }
    // Default: return empty result
    return Promise.resolve({ rows: [] });
  });
}

module.exports = {
  generateToken,
  mockTeacher,
  mockStudent,
  mockSession,
  mockPoll,
  mockPollResponse,
  setupAuthMock,
};
