import '@testing-library/jest-dom';

// Mock environment variables
process.env.REACT_APP_API_URL = 'http://localhost:3001/api';
process.env.REACT_APP_AUTH_URL = 'http://localhost:3001';

// Mock localStorage using a simple backing store
let localStore = {};

const localStorageMock = {
  getItem: jest.fn((key) => {
    return localStore[key] !== undefined ? localStore[key] : null;
  }),
  setItem: jest.fn((key, value) => {
    localStore[key] = String(value);
  }),
  removeItem: jest.fn((key) => {
    delete localStore[key];
  }),
  clear: jest.fn(() => {
    localStore = {};
  }),
};

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock window.location
delete window.location;
window.location = { href: '', assign: jest.fn(), replace: jest.fn(), reload: jest.fn() };

// Mock window.alert
window.alert = jest.fn();

// Mock fetch globally
global.fetch = jest.fn();

// Reset between tests - only clear call history, not implementations
beforeEach(() => {
  // Clear localStorage store
  localStore = {};
  // Clear mock call history (but NOT implementations)
  localStorage.getItem.mockClear();
  localStorage.setItem.mockClear();
  localStorage.removeItem.mockClear();
  localStorage.clear.mockClear();
  // Reset fetch
  global.fetch.mockReset();
  window.alert.mockClear();
  window.location.href = '';
});

// Suppress noisy console output in tests
const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
  console.error = (...args) => {
    if (typeof args[0] === 'string' && (
      args[0].includes('act(') ||
      args[0].includes('Warning:') ||
      args[0].includes('Not implemented') ||
      args[0].includes('API request failed')
    )) return;
    originalError.call(console, ...args);
  };
  console.warn = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('Warning:')) return;
    originalWarn.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});
