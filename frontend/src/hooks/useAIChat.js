import { useState, useCallback, useRef } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://vk-edu-b2.onrender.com/api';

const isDemoMode = () => localStorage.getItem('isDemo') === 'true';

/**
 * Custom hook for AI Study Assistant — handles SSE streaming, conversations, and state
 */
export function useAIChat(sessionId) {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStreamText, setCurrentStreamText] = useState('');
  const [currentStatus, setCurrentStatus] = useState('');
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [error, setError] = useState(null);

  const abortControllerRef = useRef(null);

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('authToken');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }, []);

  /**
   * Send a message and stream the AI response via SSE
   */
  const sendMessage = useCallback(async (text, mode = 'answer', resourceId = null) => {
    if (!text.trim() || isStreaming) return;

    setError(null);
    setIsStreaming(true);
    setCurrentStreamText('');
    setCurrentStatus('starting');

    // Add user message immediately
    const userMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text,
      message_type: 'text',
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);

    // Create a placeholder for the assistant response
    const assistantPlaceholder = {
      id: `stream-${Date.now()}`,
      role: 'assistant',
      content: '',
      message_type: 'text',
      metadata: {},
      created_at: new Date().toISOString(),
      isStreaming: true,
    };
    setMessages(prev => [...prev, assistantPlaceholder]);

    try {
      abortControllerRef.current = new AbortController();

      // Demo mode: simulate streaming with fake SSE data
      if (isDemoMode()) {
        const { simulateDemoStream } = await import('../utils/demoData');
        await simulateDemoStream(text, mode, {
          onStatus: (stage) => setCurrentStatus(stage),
          onToken: (streamedText) => {
            setCurrentStreamText(streamedText);
            setMessages(prev => prev.map(msg =>
              msg.isStreaming ? { ...msg, content: streamedText } : msg
            ));
          },
          onSources: (sources, confidence) => {
            setMessages(prev => prev.map(msg =>
              msg.isStreaming ? { ...msg, metadata: { ...msg.metadata, sources, confidence: confidence || {} } } : msg
            ));
          },
          onSuggestions: (followups) => {
            setMessages(prev => prev.map(msg =>
              msg.isStreaming ? { ...msg, metadata: { ...msg.metadata, suggestedFollowups: followups } } : msg
            ));
          },
          onResources: (resources, count) => {
            setMessages(prev => prev.map(msg =>
              msg.isStreaming ? { ...msg, metadata: { ...msg.metadata, resources, resourceCount: count }, message_type: 'resource_list' } : msg
            ));
          },
          onQuiz: (questions) => {
            setMessages(prev => prev.map(msg =>
              msg.isStreaming ? { ...msg, metadata: { ...msg.metadata, questions }, message_type: 'quiz' } : msg
            ));
          },
          onDone: (messageId, conversationId) => {
            if (conversationId) setActiveConversationId(conversationId);
            setMessages(prev => prev.map(msg =>
              msg.isStreaming ? { ...msg, id: messageId, isStreaming: false } : msg
            ));
          },
        });
        return;
      }

      const response = await fetch(`${API_BASE_URL}/ai-assistant/session/${sessionId}/chat`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          message: text,
          conversationId: activeConversationId,
          mode,
          ...(resourceId ? { resourceId } : {}),
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamedText = '';
      let metadata = {};
      let buffer = '';
      let currentEventType = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          // Track event type from "event: xxx" line
          if (line.startsWith('event: ')) {
            currentEventType = line.slice(7).trim();
            continue;
          }

          // Skip empty lines (SSE event separators)
          if (line.trim() === '') {
            continue;
          }

          if (!line.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(line.slice(6));

            switch (currentEventType) {
              case 'status':
                setCurrentStatus(data.stage);
                break;

              case 'token':
                streamedText += data.text;
                setCurrentStreamText(streamedText);
                setMessages(prev => prev.map(msg =>
                  msg.isStreaming
                    ? { ...msg, content: streamedText }
                    : msg
                ));
                break;

              case 'sources':
                metadata.sources = data.sources;
                metadata.confidence = data.confidence;
                metadata.confidenceLabel = data.confidenceLabel;
                break;

              case 'suggestions':
                metadata.suggestedFollowups = data.followups;
                break;

              case 'resources':
                metadata.resources = data.resources;
                metadata.resourceCount = data.count;
                break;

              case 'quiz':
                metadata.questions = data.questions;
                break;

              case 'error':
                setError(data.message);
                break;

              case 'done':
                if (data.conversationId) {
                  setActiveConversationId(data.conversationId);
                }
                setMessages(prev => prev.map(msg =>
                  msg.isStreaming
                    ? {
                        ...msg,
                        id: data.messageId || msg.id,
                        content: streamedText,
                        metadata,
                        isStreaming: false,
                        message_type: metadata.questions ? 'quiz'
                          : metadata.resources ? 'resource_list'
                          : 'text',
                      }
                    : msg
                ));
                break;

              default:
                break;
            }
          } catch {
            // Skip malformed SSE data
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        // User cancelled
      } else {
        setError(err.message || 'Something went wrong');
        // Remove the streaming placeholder on error
        setMessages(prev => prev.filter(msg => !msg.isStreaming));
      }
    } finally {
      setIsStreaming(false);
      setCurrentStreamText('');
      setCurrentStatus('');
      abortControllerRef.current = null;
    }
  }, [sessionId, activeConversationId, isStreaming, getAuthHeaders]);

  /**
   * Parse SSE events properly (event type comes before data line)
   * This replaces the inline parsing above with a more robust approach
   */

  /**
   * Cancel the current streaming response
   */
  const cancelStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
      setCurrentStreamText('');
      // Finalize any streaming message
      setMessages(prev => prev.map(msg =>
        msg.isStreaming ? { ...msg, isStreaming: false } : msg
      ));
    }
  }, []);

  /**
   * Load conversations for this session
   */
  const loadConversations = useCallback(async () => {
    try {
      if (isDemoMode()) {
        const { DEMO_AI_CONVERSATIONS } = await import('../utils/demoData');
        setConversations(DEMO_AI_CONVERSATIONS);
        return;
      }
      const response = await fetch(
        `${API_BASE_URL}/ai-assistant/session/${sessionId}/conversations`,
        { headers: getAuthHeaders() }
      );
      if (!response.ok) throw new Error('Failed to load conversations');
      const data = await response.json();
      setConversations(data.conversations || []);
    } catch (err) {
      console.error('Error loading conversations:', err);
    }
  }, [sessionId, getAuthHeaders]);

  /**
   * Load messages for a specific conversation
   */
  const loadConversation = useCallback(async (conversationId) => {
    try {
      if (isDemoMode()) {
        const { DEMO_AI_MESSAGES } = await import('../utils/demoData');
        setMessages(DEMO_AI_MESSAGES[conversationId] || []);
        setActiveConversationId(conversationId);
        return;
      }
      const response = await fetch(
        `${API_BASE_URL}/ai-assistant/conversations/${conversationId}/messages`,
        { headers: getAuthHeaders() }
      );
      if (!response.ok) throw new Error('Failed to load messages');
      const data = await response.json();
      setMessages(data.messages || []);
      setActiveConversationId(conversationId);
    } catch (err) {
      console.error('Error loading conversation:', err);
      setError('Failed to load conversation');
    }
  }, [getAuthHeaders]);

  /**
   * Start a new conversation
   */
  const startNewConversation = useCallback(() => {
    setMessages([]);
    setActiveConversationId(null);
    setError(null);
  }, []);

  /**
   * Delete a conversation
   */
  const deleteConversation = useCallback(async (conversationId) => {
    try {
      if (!isDemoMode()) {
        const response = await fetch(
          `${API_BASE_URL}/ai-assistant/conversations/${conversationId}`,
          { method: 'DELETE', headers: getAuthHeaders() }
        );
        if (!response.ok) throw new Error('Failed to delete');
      }
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      if (activeConversationId === conversationId) {
        startNewConversation();
      }
    } catch (err) {
      console.error('Error deleting conversation:', err);
    }
  }, [activeConversationId, startNewConversation, getAuthHeaders]);

  /**
   * Mark a message as "still confused"
   */
  const markAsDoubt = useCallback(async (messageId) => {
    try {
      if (isDemoMode()) return true;
      const response = await fetch(
        `${API_BASE_URL}/ai-assistant/messages/${messageId}/doubt`,
        { method: 'POST', headers: getAuthHeaders() }
      );
      if (!response.ok) throw new Error('Failed to mark doubt');
      return true;
    } catch (err) {
      console.error('Error marking doubt:', err);
      return false;
    }
  }, [getAuthHeaders]);

  /**
   * Get study summary for this session
   */
  const getStudySummary = useCallback(async () => {
    try {
      if (isDemoMode()) {
        const { DEMO_STUDY_SUMMARY } = await import('../utils/demoData');
        return DEMO_STUDY_SUMMARY;
      }
      const response = await fetch(
        `${API_BASE_URL}/ai-assistant/session/${sessionId}/study-summary`,
        { headers: getAuthHeaders() }
      );
      if (!response.ok) throw new Error('Failed to load summary');
      return await response.json();
    } catch (err) {
      console.error('Error loading study summary:', err);
      return null;
    }
  }, [sessionId, getAuthHeaders]);

  /**
   * Generate a quiz
   */
  const generateQuiz = useCallback(async (topic, count = 5) => {
    try {
      if (isDemoMode()) {
        const { DEMO_QUIZ_RESPONSE } = await import('../utils/demoData');
        return DEMO_QUIZ_RESPONSE;
      }
      const response = await fetch(
        `${API_BASE_URL}/ai-assistant/session/${sessionId}/generate-quiz`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ topic, count }),
        }
      );
      if (!response.ok) throw new Error('Failed to generate quiz');
      return await response.json();
    } catch (err) {
      console.error('Error generating quiz:', err);
      return null;
    }
  }, [sessionId, getAuthHeaders]);

  return {
    messages,
    isStreaming,
    currentStreamText,
    currentStatus,
    conversations,
    activeConversationId,
    error,
    sendMessage,
    cancelStream,
    loadConversations,
    loadConversation,
    startNewConversation,
    deleteConversation,
    markAsDoubt,
    getStudySummary,
    generateQuiz,
    setError,
  };
}
