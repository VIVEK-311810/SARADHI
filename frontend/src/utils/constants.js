// Constants for the educational platform

// User roles
export const USER_ROLES = {
  TEACHER: 'teacher',
  STUDENT: 'student',
};

// Session status
export const SESSION_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ENDED: 'ended',
};

// Poll status
export const POLL_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  CLOSED: 'closed',
};

// Resource types
export const RESOURCE_TYPES = {
  NOTE: 'note',
  DOCUMENT: 'document',
  LINK: 'link',
  TRANSCRIPT: 'transcript',
};

// AI Tutor modes
export const TUTOR_MODES = {
  CHECK_ERRORS: 'check_errors',
  REFACTOR: 'refactor',
  GIVE_HINT: 'give_hint',
  EXPLAIN_ANALOGY: 'explain_analogy',
  OUTLINE_STEPS: 'outline_steps',
  FULL_ANSWER: 'full_answer',
};

// AI Tutor mode labels for UI
export const TUTOR_MODE_LABELS = {
  [TUTOR_MODES.CHECK_ERRORS]: 'Check for Errors',
  [TUTOR_MODES.REFACTOR]: 'Refactor Code',
  [TUTOR_MODES.GIVE_HINT]: 'Give me a Hint',
  [TUTOR_MODES.EXPLAIN_ANALOGY]: 'Explain with an Analogy',
  [TUTOR_MODES.OUTLINE_STEPS]: 'Outline Steps',
  [TUTOR_MODES.FULL_ANSWER]: 'Give Full Answer',
};

// Default poll time limits (in seconds)
export const POLL_TIME_LIMITS = {
  SHORT: 30,
  MEDIUM: 60,
  LONG: 120,
  EXTENDED: 300,
};

// Local storage keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'authToken',
  CURRENT_USER: 'currentUser',
  IS_DEMO: 'isDemo',
  JOINED_SESSIONS: 'joinedSessions',
  CHAT_HISTORY_PREFIX: 'chat_history_', // append sessionId
};

// WebSocket configuration
export const WS_CONFIG = {
  MAX_RECONNECT_ATTEMPTS: 10,
  INITIAL_BACKOFF_MS: 3000,
  MAX_BACKOFF_MS: 30000,
};

// AI Assistant
export const AI_CONFIG = {
  COOLDOWN_SECONDS: 5,
  CHAT_SAVE_DEBOUNCE_MS: 1000,
};

// API
export const API_CONFIG = {
  REQUEST_TIMEOUT_MS: 15000,
};

// API endpoints
export const API_ENDPOINTS = {
  MOCK_LOGIN: '/mock-login',
  SESSIONS: '/sessions',
  POLLS: '/polls',
  RESOURCES: '/resources',
  TUTOR: '/tutor',
};

// Error messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  SESSION_NOT_FOUND: 'Session not found. Please check the Session ID.',
  ALREADY_JOINED: 'You have already joined this session.',
  POLL_EXPIRED: 'This poll has expired.',
  INVALID_SESSION_ID: 'Invalid Session ID format.',
  UNAUTHORIZED: 'You are not authorized to perform this action.',
};

// Success messages
export const SUCCESS_MESSAGES = {
  SESSION_CREATED: 'Session created successfully!',
  SESSION_JOINED: 'Successfully joined the session!',
  POLL_CREATED: 'Poll created successfully!',
  POLL_ACTIVATED: 'Poll activated and sent to students!',
  RESPONSE_SUBMITTED: 'Response submitted successfully!',
  RESOURCE_ADDED: 'Resource added successfully!',
};

// Validation rules
export const VALIDATION_RULES = {
  SESSION_ID_LENGTH: 6,
  MIN_POLL_OPTIONS: 2,
  MAX_POLL_OPTIONS: 6,
  MIN_QUESTION_LENGTH: 10,
  MAX_QUESTION_LENGTH: 500,
  MIN_SESSION_TITLE_LENGTH: 3,
  MAX_SESSION_TITLE_LENGTH: 100,
};

// UI Configuration
export const UI_CONFIG = {
  ITEMS_PER_PAGE: 10,
  POLL_REFRESH_INTERVAL: 3000, // 3 seconds
  AUTO_SAVE_INTERVAL: 30000, // 30 seconds
  NOTIFICATION_DURATION: 5000, // 5 seconds
};

// Color scheme
export const COLORS = {
  PRIMARY: {
    50: '#eff6ff',
    100: '#dbeafe',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
  },
  SUCCESS: {
    50: '#f0fdf4',
    100: '#dcfce7',
    500: '#22c55e',
    600: '#16a34a',
  },
  ERROR: {
    50: '#fef2f2',
    100: '#fee2e2',
    500: '#ef4444',
    600: '#dc2626',
  },
  WARNING: {
    50: '#fffbeb',
    100: '#fef3c7',
    500: '#f59e0b',
    600: '#d97706',
  },
};

// Mock data for development/demo
export const MOCK_DATA = {
  TEACHERS: [
    {
      id: 1,
      name: 'Dr. Sarah Johnson',
      email: 'sarah.johnson@university.edu',
      department: 'Computer Science',
      role: 'teacher',
    },
    {
      id: 2,
      name: 'Prof. Michael Chen',
      email: 'michael.chen@university.edu',
      department: 'Mathematics',
      role: 'teacher',
    },
  ],
  STUDENTS: [
    {
      id: 101,
      name: 'Alice Smith',
      email: 'alice.smith@student.edu',
      student_id: 'CS2021001',
      role: 'student',
    },
    {
      id: 102,
      name: 'Bob Wilson',
      email: 'bob.wilson@student.edu',
      student_id: 'CS2021002',
      role: 'student',
    },
    {
      id: 103,
      name: 'Carol Davis',
      email: 'carol.davis@student.edu',
      student_id: 'CS2021003',
      role: 'student',
    },
  ],
};

