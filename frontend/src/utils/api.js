// API configuration for the Educational Platform
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://vk-edu-b2.onrender.com/api';
const AUTH_BASE_URL = process.env.REACT_APP_AUTH_URL || 'https://vk-edu-b2.onrender.com';

const REQUEST_TIMEOUT_MS = 15000; // 15 seconds

const HTTP_ERROR_MESSAGES = {
  400: 'Invalid request. Please check your input.',
  401: 'Your session has expired. Please log in again.',
  403: 'You do not have permission to perform this action.',
  404: 'Resource not found.',
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'Server error. Please try again later.',
  503: 'Service temporarily unavailable. Please try again shortly.',
};

// Safe JSON parse helper — never throws, clears corrupted data
export const safeParseUser = () => {
  try {
    const str = localStorage.getItem('currentUser');
    return str ? JSON.parse(str) : null;
  } catch {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('authToken');
    return null;
  }
};

// Generic API request function with error handling and authentication
export const apiRequest = async (endpoint, options = {}) => {
  // Demo mode: only available outside production to prevent auth bypass in live deployments
  if (localStorage.getItem('isDemo') === 'true') {
    const { handleDemoRequest } = await import('./demoData');
    return handleDemoRequest(endpoint, options);
  }

  const url = `${API_BASE_URL}${endpoint}`;

  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  // Add authentication token if available
  const token = localStorage.getItem('authToken');
  if (token) {
    defaultOptions.headers['Authorization'] = `Bearer ${token}`;
  }

  // Merge caller's AbortSignal with a timeout signal
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);

  const config = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers,
    },
    signal: options.signal || timeoutController.signal,
  };

  try {
    const response = await fetch(url, config);
    clearTimeout(timeoutId);

    // Handle authentication errors
    if (response.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('currentUser');
      window.location.href = '/auth';
      throw new Error('Authentication required');
    }

    if (!response.ok) {
      let message = HTTP_ERROR_MESSAGES[response.status] || `Request failed (${response.status})`;
      try {
        const body = await response.json();
        if (body?.error) message = body.error;
      } catch { /* ignore parse errors */ }
      throw new Error(message);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please check your connection and try again.');
    }
    if (process.env.NODE_ENV !== 'production') {
      console.error(`API request failed for ${endpoint}:`, error);
    }
    throw error;
  }
};

// Authentication API functions
export const authAPI = {
  // Initiate OAuth2 login
  initiateLogin: () => {
    window.location.href = `${AUTH_BASE_URL}/auth/google`;
  },

  // Verify token
  verifyToken: (token) =>
    fetch(`${AUTH_BASE_URL}/auth/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    }).then(res => res.json()),

  // Get current user info
  getCurrentUser: () =>
    apiRequest('/auth/me'),

  // Logout
  logout: () =>
    fetch(`${AUTH_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
      },
    })
    .catch(() => {})  // Always clear local state even if request fails
    .finally(() => {
      localStorage.removeItem('authToken');
      localStorage.removeItem('currentUser');
    }),

  // Check authentication status
  checkAuthStatus: () =>
    fetch(`${AUTH_BASE_URL}/auth/status`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
      },
    }).then(res => res.json()),
};

// Student API functions
export const studentAPI = {
  // Get student dashboard summary
  getDashboardSummary: (studentId) =>
    apiRequest(`/students/${studentId}/dashboard-summary`),

  // Get student sessions
  getSessions: (studentId) =>
    apiRequest(`/students/${studentId}/sessions`),

  // Get student activity
  getActivity: (studentId, limit = 20) =>
    apiRequest(`/students/${studentId}/activity?limit=${limit}`),

  // Get student statistics
  getStats: (studentId) =>
    apiRequest(`/students/${studentId}/stats`),

  // Get active polls
  getActivePolls: (studentId) =>
    apiRequest(`/students/${studentId}/active-polls`),

  // Submit poll response
  submitPollResponse: (studentId, pollId, answerData, responseTime, tabSwitches = 0, timeFocusedMs = null) =>
    apiRequest(`/students/${studentId}/polls/${pollId}/respond`, {
      method: 'POST',
      body: JSON.stringify({
        answer_data: answerData,
        response_time: responseTime,
        tab_switches: tabSwitches,
        time_focused_ms: timeFocusedMs,
      }),
    }),

  // Get student performance
  getPerformance: (studentId) =>
    apiRequest(`/students/${studentId}/performance`),

  // Get recent polls
  getRecentPolls: (studentId, limit = 10) =>
    apiRequest(`/students/${studentId}/recent-polls?limit=${limit}`),

  // Get student profile
  getProfile: (studentId) =>
    apiRequest(`/students/${studentId}/profile`),
};

// Session API functions
export const sessionAPI = {
  // Join a session
  joinSession: (sessionId, studentId) =>
    apiRequest(`/sessions/${sessionId}/join`, {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId }),
    }),
  
  // Get session details
  getSession: (sessionId) => 
    apiRequest(`/sessions/${sessionId}`),
  
  // Get session participants
  getParticipants: (sessionId) =>
    apiRequest(`/sessions/${sessionId}/participants`),

  // Create new session (teacher only)
  createSession: (sessionData) =>
    apiRequest('/sessions', {
      method: 'POST',
      body: JSON.stringify(sessionData),
    }),

  // Get teacher sessions (paginated)
  getTeacherSessions: (teacherId, page = 1, limit = 20) =>
    apiRequest(`/sessions/teacher/${teacherId}?page=${page}&limit=${limit}`),

  // 🔴 Delete a session (teacher only)
  endSession: (sessionId,teacherId) =>
    apiRequest(`/sessions/${sessionId}`, {
      method: 'DELETE',
    }),

  // Lock / unlock session (teacher only)
  lockSession: (sessionId, locked) =>
    apiRequest(`/sessions/${sessionId}/lock`, {
      method: 'PATCH',
      body: JSON.stringify({ locked }),
    }),

  // Generate AI session summary (async — fires and returns immediately)
  generateSessionSummary: (sessionId) =>
    apiRequest(`/sessions/${sessionId}/generate-summary`, { method: 'POST' }),

  // Get AI session summary status + text
  getSessionSummary: (sessionId) =>
    apiRequest(`/sessions/${sessionId}/summary`),
};

// Poll API functions
export const pollAPI = {
  // Get poll details
  getPoll: (pollId) => 
    apiRequest(`/polls/${pollId}`),
  
  // Get poll results
  getPollResults: (pollId) => 
    apiRequest(`/polls/${pollId}/results`),
  
  // Create new poll (teacher only)
  createPoll: (pollData) =>
    apiRequest('/polls', {
      method: 'POST',
      body: JSON.stringify(pollData),
    }),
  
  // Activate poll (teacher only)
  activatePoll: (pollId) =>
    apiRequest(`/polls/${pollId}/activate`, {
      method: 'PUT',
    }),
  
  // Close poll (teacher only)
  closePoll: (pollId) =>
    apiRequest(`/polls/${pollId}/close`, {
      method: 'PUT',
    }),
  
  // Get Poll Stats
  getPollStats: (pollId) =>
    apiRequest(`/polls/${pollId}/stats`),

  // Manually reveal answers to all students mid-poll
  revealPoll: (pollId) =>
    apiRequest(`/polls/${pollId}/reveal`, { method: 'POST' }),
};

// Resource API functions
export const resourceAPI = {
  // Upload file resource (teacher only) — sends multipart/form-data
  uploadFile: (sessionId, _userId, formData) => {
    const token = localStorage.getItem('authToken');
    formData.append('session_id', sessionId);
    return fetch(`${API_BASE_URL}/resources/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    }).then(r => r.json());
  },

  // Add URL resource (teacher only)
  addUrl: (sessionId, urlData) =>
    apiRequest('/resources/add-url', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, ...urlData }),
    }),

  // Get all resources for a session
  getSessionResources: (sessionId) =>
    apiRequest(`/resources/session/${sessionId}`),

  // Get specific resource
  getResource: (resourceId) =>
    apiRequest(`/resources/${resourceId}`),

  // Delete resource (teacher only)
  deleteResource: (resourceId) =>
    apiRequest(`/resources/${resourceId}`, { method: 'DELETE' }),

  // Track resource access (view/download)
  trackAccess: (resourceId, action) =>
    apiRequest(`/resources/${resourceId}/track`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),

  // Get vectorization status
  getVectorizationStatus: (resourceId) =>
    apiRequest(`/resources/${resourceId}/vectorization-status`),
};

// AI Assistant API functions
export const aiAssistantAPI = {
  getConversations: (sessionId) =>
    apiRequest(`/ai-assistant/session/${sessionId}/conversations`),

  getMessages: (conversationId) =>
    apiRequest(`/ai-assistant/conversations/${conversationId}/messages`),

  deleteConversation: (conversationId) =>
    apiRequest(`/ai-assistant/conversations/${conversationId}`, { method: 'DELETE' }),

  markDoubt: (messageId) =>
    apiRequest(`/ai-assistant/messages/${messageId}/doubt`, { method: 'POST' }),

  getStudySummary: (sessionId) =>
    apiRequest(`/ai-assistant/session/${sessionId}/study-summary`),

  getDoubts: (sessionId) =>
    apiRequest(`/ai-assistant/session/${sessionId}/doubts`),

  resolveDoubt: (doubtId) =>
    apiRequest(`/ai-assistant/doubts/${doubtId}/resolve`, { method: 'POST' }),

  generateQuiz: (sessionId, topic, count = 5) =>
    apiRequest(`/ai-assistant/session/${sessionId}/generate-quiz`, {
      method: 'POST',
      body: JSON.stringify({ topic, count }),
    }),
};

// Utility functions
export const utils = {
  // Check if user is authenticated
  isAuthenticated: () => {
    const token = localStorage.getItem('authToken');
    const user = localStorage.getItem('currentUser');
    return !!(token && user);
  },

  // Get current user from localStorage (safe — never throws on corrupt data)
  getCurrentUser: () => safeParseUser(),

  // Validate SASTRA domain
  validateSastraEmail: (email, role) => {
    if (role === 'teacher') {
      return email.endsWith('@sastra.edu') || email.endsWith('.sastra.edu');
    } else if (role === 'student') {
      return email.endsWith('@sastra.ac.in') && /^\d+@sastra\.ac\.in$/.test(email);
    }
    return false;
  },

  // Format file size for display
  formatFileSize: (bytes) => {
    if (bytes == null) return 'N/A';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
  },
};

export const clusterAPI = {
  createCluster: (data) =>
    apiRequest('/polls/clusters', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getCluster: (clusterId) =>
    apiRequest(`/polls/clusters/${clusterId}`),
  getSessionClusters: (sessionId) =>
    apiRequest(`/polls/session/${sessionId}/clusters`),
};

export default {
  authAPI,
  studentAPI,
  sessionAPI,
  pollAPI,
  clusterAPI,
  resourceAPI,
  aiAssistantAPI,
  utils,
  apiRequest,
};

