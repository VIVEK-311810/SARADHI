/**
 * Test Setup - Mock database and external dependencies
 *
 * Since routes create their own pg Pool instances, we mock the 'pg' module
 * at the module level so all route files get the mocked version.
 */

// Mock Redis so tests never attempt a real connection
jest.mock('../redis', () => ({
  redis: null,
  redisPub: null,
  redisSub: null,
  isRedisAvailable: () => false,
}));

// Mock pg module before anything imports it
const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockRelease = jest.fn();

const mockClient = {
  query: jest.fn(),
  release: mockRelease,
};

mockConnect.mockResolvedValue(mockClient);

const mockPool = {
  query: mockQuery,
  connect: mockConnect,
  end: jest.fn(),
  on: jest.fn(),
};

jest.mock('pg', () => ({
  Pool: jest.fn(() => mockPool),
}));

// Mock passport and OAuth config to prevent initialization errors
jest.mock('../config/oauth-dynamic', () => ({
  passport: {
    initialize: () => (req, res, next) => next(),
    session: () => (req, res, next) => next(),
    authenticate: () => (req, res, next) => next(),
    use: jest.fn(),
    serializeUser: jest.fn(),
    deserializeUser: jest.fn(),
  },
}));

// Mock uuid (ESM module that Jest can't handle)
jest.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}));

// Mock Supabase client
jest.mock('../config/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: jest.fn().mockResolvedValue({ data: {}, error: null }),
        download: jest.fn().mockResolvedValue({ data: Buffer.from('test'), error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'http://test.com/file.pdf' } }),
        remove: jest.fn().mockResolvedValue({ data: {}, error: null }),
      }),
    },
    from: () => ({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: {}, error: null }),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    }),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

// Mock Pinecone
jest.mock('../config/pinecone', () => ({
  pinecone: {},
  index: {
    upsert: jest.fn().mockResolvedValue({}),
    query: jest.fn().mockResolvedValue({ matches: [] }),
    deleteMany: jest.fn().mockResolvedValue({}),
  },
}));

// Mock services
jest.mock('../services/rag/documentProcessor', () => ({
  extractText: jest.fn().mockResolvedValue({ text: 'test text', pageCount: 1, pages: ['test text'] }),
}));

jest.mock('../services/rag/embeddingService', () => ({
  generateEmbedding: jest.fn().mockResolvedValue(new Array(384).fill(0)),
  generateBatchEmbeddings: jest.fn().mockResolvedValue([new Array(384).fill(0)]),
  chunkText: jest.fn().mockReturnValue([{ text: 'test chunk', startIndex: 0, endIndex: 10, tokenCount: 5 }]),
}));

jest.mock('../services/rag/vectorStore', () => ({
  upsertVectors: jest.fn().mockResolvedValue(1),
  searchSimilar: jest.fn().mockResolvedValue([]),
  deleteResource: jest.fn().mockResolvedValue(),
}));

// Set environment variables for testing
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-purposes-only-32+';
process.env.DB_USER = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_NAME = 'test_db';
process.env.DB_PASSWORD = 'test';
process.env.DB_PORT = '5432';
process.env.SESSION_SECRET = 'test-session-secret-for-testing-purposes-only-32+';
process.env.FRONTEND_URL = 'http://localhost:3000';

// Initialize global state that server.js sets up
global.wss = { clients: new Set() };
global.pollTimers = new Map();
global.activePollEndTimes = new Map();
global.clearPollTimer = jest.fn();

/**
 * Create a lightweight Express app for testing a specific router.
 * Avoids importing server.js (which starts listening on a port).
 */
const express = require('express');

function createTestApp(...routers) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  for (const { path, router } of routers) {
    app.use(path, router);
  }

  // Error handler
  app.use((err, req, res, next) => {
    console.error('Test app error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { mockPool, mockQuery, mockClient, mockConnect, mockRelease, createTestApp };
