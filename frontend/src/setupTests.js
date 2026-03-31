import '@testing-library/jest-dom';

// Mock environment variables
process.env.REACT_APP_API_URL = 'http://localhost:3001/api';
process.env.REACT_APP_AUTH_URL = 'http://localhost:3001';

// localStorage backing store
let localStore = {};

// Mock window.location
delete window.location;
window.location = { href: '', assign: jest.fn(), replace: jest.fn(), reload: jest.fn() };

// Mock window.alert
window.alert = jest.fn();

// Mock fetch globally
global.fetch = jest.fn();

// Spy on Storage.prototype before each test (works reliably across all jsdom versions)
beforeEach(() => {
  localStore = {};
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => localStore[key] ?? null);
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => { localStore[key] = String(value); });
  jest.spyOn(Storage.prototype, 'removeItem').mockImplementation((key) => { delete localStore[key]; });
  jest.spyOn(Storage.prototype, 'clear').mockImplementation(() => { localStore = {}; });
  global.fetch.mockReset();
  window.alert.mockClear();
  window.location.href = '';
});

afterEach(() => {
  jest.restoreAllMocks();
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
