/**
 * Tests for LangGraph agents: keyPointsAgent, notesAgent
 *
 * Uses standalone mocks (does not import shared setup.js which
 * depends on cloudinary and other optional modules).
 */

// Mock pg before anything else
const mockQuery = jest.fn();
jest.mock('pg', () => ({
  Pool: jest.fn(() => ({
    query: mockQuery,
    connect: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
  })),
}));

// Mock LangGraph + LangChain modules
const mockInvoke = jest.fn();
jest.mock('@langchain/langgraph', () => {
  const END = '__end__';
  const Annotation = { Root: (schema) => schema };
  class MockStateGraph {
    constructor() {}
    addNode() { return this; }
    addEdge() { return this; }
    compile() { return { invoke: mockInvoke }; }
  }
  return { StateGraph: MockStateGraph, END, Annotation };
});

jest.mock('@langchain/mistralai', () => ({
  ChatMistralAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn(),
  })),
}));

jest.mock('@langchain/core/prompts', () => ({
  ChatPromptTemplate: {
    fromMessages: jest.fn().mockReturnValue({
      pipe: jest.fn().mockReturnValue({
        pipe: jest.fn().mockReturnValue({
          invoke: jest.fn().mockResolvedValue('[]'),
        }),
      }),
    }),
  },
}));

jest.mock('@langchain/core/output_parsers', () => ({
  StringOutputParser: jest.fn().mockImplementation(() => ({})),
}));

// Mock Supabase
jest.mock('../config/supabase', () => ({
  supabase: {
    storage: { from: () => ({ upload: jest.fn(), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
    from: () => ({ insert: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), neq: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: [], error: null }) }),
  },
}));

// Mock Pinecone
jest.mock('../config/pinecone', () => ({ pinecone: {}, index: {} }));

// Mock notesGeneratorService
jest.mock('../services/content/notesGeneratorService', () => ({
  generateNotesAsync: jest.fn().mockResolvedValue(undefined),
  _fetchTranscript: jest.fn().mockResolvedValue('test transcript'),
  _fetchResourceTexts: jest.fn().mockResolvedValue([]),
  _buildContentBudget: jest.fn().mockResolvedValue({ transcript: 'test', resources: [] }),
}));

// Mock logger
jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Set required env
process.env.JWT_SECRET = 'test-secret';
process.env.MISTRAL_API_KEY = 'test-key';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('KeyPointsAgent', () => {
  let runKeyPointsAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.isolateModules(() => {
      ({ runKeyPointsAgent } = require('../services/agents/keyPointsAgent'));
    });
  });

  it('should return parsed key points from graph invoke', async () => {
    const mockPoints = ['Point one', 'Point two'];
    mockInvoke.mockResolvedValueOnce({
      transcript: 'test transcript segment about physics',
      sessionId: 'ABC123',
      keyPoints: JSON.stringify(mockPoints),
    });

    const result = await runKeyPointsAgent('test transcript segment about physics', 'ABC123');

    expect(mockInvoke).toHaveBeenCalledWith({
      transcript: 'test transcript segment about physics',
      sessionId: 'ABC123',
      keyPoints: '[]',
    });
    expect(result).toEqual(mockPoints);
  });

  it('should return empty array when graph returns empty', async () => {
    mockInvoke.mockResolvedValueOnce({
      transcript: 'short',
      sessionId: 'ABC123',
      keyPoints: '[]',
    });

    const result = await runKeyPointsAgent('short', 'ABC123');
    expect(result).toEqual([]);
  });

  it('should retry on failure and succeed on second attempt', async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error('API timeout'))
      .mockResolvedValueOnce({
        transcript: 'test',
        sessionId: 'ABC123',
        keyPoints: '["Retry succeeded"]',
      });

    const result = await runKeyPointsAgent('test transcript', 'ABC123', { retries: 1 });
    expect(result).toEqual(['Retry succeeded']);
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it('should throw after exhausting retries', async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error('API down'))
      .mockRejectedValueOnce(new Error('API still down'));

    await expect(
      runKeyPointsAgent('test', 'ABC123', { retries: 1 })
    ).rejects.toThrow('API still down');
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });
});

describe('NotesAgent', () => {
  let runNotesAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.isolateModules(() => {
      ({ runNotesAgent } = require('../services/agents/notesAgent'));
    });
  });

  it('should invoke graph with session ID and return result', async () => {
    const mockResult = {
      sessionId: 'ABC123',
      session: JSON.stringify({ id: 1, session_id: 'ABC123', title: 'Test' }),
      success: 'true',
      error: '',
    };
    mockInvoke.mockResolvedValueOnce(mockResult);

    const result = await runNotesAgent('ABC123');

    expect(mockInvoke).toHaveBeenCalledWith({
      sessionId: 'ABC123',
      session: '',
      success: 'false',
      error: '',
    });
    expect(result).toEqual(mockResult);
  });

  it('should retry on failure and succeed', async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error('Mistral rate limit'))
      .mockResolvedValueOnce({
        sessionId: 'ABC123',
        session: '{}',
        success: 'true',
        error: '',
      });

    const result = await runNotesAgent('ABC123', { retries: 1 });
    expect(result.success).toBe('true');
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it('should throw after exhausting retries', async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'));

    await expect(
      runNotesAgent('ABC123', { retries: 1 })
    ).rejects.toThrow('fail 2');
  });
});
