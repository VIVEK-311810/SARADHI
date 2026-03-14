import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { utils, apiRequest } from '../../utils/api';
import { useTheme } from '../../context/ThemeContext';
import { useAIChat } from '../../hooks/useAIChat';
import SourceCard from './SourceCard';
import QuizCard from './QuizCard';

const AIAssistant = () => {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const { theme } = useTheme();
  const darkMode = theme === 'dark';
  const currentUser = utils.getCurrentUser();
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const [inputMessage, setInputMessage] = useState('');
  const [sessionInfo, setSessionInfo] = useState(null);
  const [activeMode, setActiveMode] = useState('answer');
  const [showSidebar, setShowSidebar] = useState(false);
  const [doubtedMessages, setDoubtedMessages] = useState(new Set());
  const [resources, setResources] = useState([]);
  const [selectedResource, setSelectedResource] = useState(null); // { id, title, file_name }
  const [showResourcePicker, setShowResourcePicker] = useState(false);
  const resourcePickerRef = useRef(null);

  const {
    messages,
    isStreaming,
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
    setError,
  } = useAIChat(sessionId);

  // Scroll to bottom when messages change
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auth guard and session info
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'student') {
      navigate('/auth');
      return;
    }
    if (!sessionId) {
      navigate('/student/dashboard');
      return;
    }

    apiRequest(`/sessions/${sessionId}`)
      .then(data => setSessionInfo(data))
      .catch(() => {});

    apiRequest(`/resources/session/${sessionId}`)
      .then(data => setResources(data.resources || []))
      .catch(() => {});

    loadConversations();
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = () => {
    if (!inputMessage.trim() || isStreaming) return;
    sendMessage(inputMessage.trim(), activeMode, selectedResource?.id || null);
    setInputMessage('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (suggestion) => {
    sendMessage(suggestion, activeMode, selectedResource?.id || null);
  };

  // Close resource picker when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (resourcePickerRef.current && !resourcePickerRef.current.contains(e.target)) {
        setShowResourcePicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleDoubt = async (messageId) => {
    const success = await markAsDoubt(messageId);
    if (success) {
      setDoubtedMessages(prev => new Set([...prev, messageId]));
    }
  };

  // Theme colors
  const colors = {
    bg: darkMode ? '#0f172a' : '#f8fafc',
    surface: darkMode ? '#1e293b' : '#ffffff',
    border: darkMode ? '#334155' : '#e2e8f0',
    text: darkMode ? '#e2e8f0' : '#1e293b',
    textMuted: darkMode ? '#94a3b8' : '#64748b',
    primary: '#3b82f6',
    userBubble: '#3b82f6',
    assistantBubble: darkMode ? '#1e293b' : '#ffffff',
  };

  const modes = [
    { key: 'answer', label: 'Answer' },
    { key: 'explain', label: 'Explain' },
    { key: 'quiz', label: 'Quiz' },
    { key: 'summarize', label: 'Summary' },
  ];

  const confidenceColors = {
    high: '#22c55e',
    medium: '#f59e0b',
    low: '#ef4444',
    none: '#6b7280',
  };

  const statusMessages = {
    starting: 'Starting...',
    classifying: 'Understanding your question...',
    retrieving: 'Searching course materials...',
    generating: 'Generating answer...',
    summarizing: 'Creating summary...',
    'generating quiz': 'Creating quiz questions...',
  };

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      backgroundColor: colors.bg,
      color: colors.text,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* Sidebar */}
      <div style={{
        width: showSidebar ? '280px' : '0px',
        borderRight: showSidebar ? `1px solid ${colors.border}` : 'none',
        backgroundColor: colors.surface,
        overflow: 'hidden',
        transition: 'width 0.2s',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ padding: '16px', borderBottom: `1px solid ${colors.border}` }}>
          <button
            onClick={() => { startNewConversation(); setShowSidebar(false); }}
            style={{
              width: '100%',
              padding: '8px 12px',
              backgroundColor: colors.primary,
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            + New Chat
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {conversations.map(conv => (
            <div
              key={conv.id}
              onClick={() => { loadConversation(conv.id); setShowSidebar(false); }}
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                marginBottom: '4px',
                backgroundColor: conv.id === activeConversationId ? (darkMode ? '#334155' : '#e0e7ff') : 'transparent',
                fontSize: '13px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {conv.title || 'Untitled'}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                style={{
                  background: 'none', border: 'none', color: colors.textMuted,
                  cursor: 'pointer', fontSize: '14px', padding: '2px 4px',
                }}
                title="Delete"
              >
                x
              </button>
            </div>
          ))}
          {conversations.length === 0 && (
            <p style={{ color: colors.textMuted, fontSize: '12px', textAlign: 'center', padding: '20px' }}>
              No conversations yet
            </p>
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Header */}
        <div style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${colors.border}`,
          backgroundColor: colors.surface,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            style={{
              background: 'none', border: 'none', color: colors.text,
              cursor: 'pointer', fontSize: '18px', padding: '4px',
            }}
          >
            {showSidebar ? '\u2190' : '\u2630'}
          </button>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
              AI Study Assistant
            </h2>
            {sessionInfo && (
              <p style={{ margin: 0, fontSize: '12px', color: colors.textMuted }}>
                {sessionInfo.name || sessionInfo.session_name || sessionId}
              </p>
            )}
          </div>
          <button
            onClick={() => navigate('/student/dashboard')}
            style={{
              padding: '6px 12px',
              backgroundColor: 'transparent',
              color: colors.textMuted,
              border: `1px solid ${colors.border}`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Back
          </button>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}>
          {/* Welcome screen */}
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 600 }}>
                AI Study Assistant
              </h3>
              <p style={{ color: colors.textMuted, fontSize: '14px', maxWidth: '400px', margin: '0 auto 24px' }}>
                Ask questions about your course materials, get explanations, generate quizzes, or summarize resources.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                {[
                  'What topics are covered?',
                  'List all resources',
                  'Explain the main concepts',
                  'Generate a practice quiz',
                ].map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(s)}
                    style={{
                      padding: '8px 14px',
                      backgroundColor: colors.surface,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '20px',
                      color: colors.text,
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message list */}
          {messages.map((msg, idx) => (
            <MessageBubble
              key={msg.id || idx}
              msg={msg}
              colors={colors}
              darkMode={darkMode}
              currentStatus={currentStatus}
              statusMessages={statusMessages}
              confidenceColors={confidenceColors}
              doubtedMessages={doubtedMessages}
              onDoubt={handleDoubt}
              onSuggestionClick={handleSuggestionClick}
            />
          ))}

          {/* Error */}
          {error && (
            <div style={{
              padding: '10px 16px',
              backgroundColor: darkMode ? '#450a0a' : '#fef2f2',
              border: `1px solid ${darkMode ? '#7f1d1d' : '#fecaca'}`,
              borderRadius: '8px',
              color: darkMode ? '#fca5a5' : '#dc2626',
              fontSize: '13px',
              display: 'flex',
              justifyContent: 'space-between',
            }}>
              {error}
              <button onClick={() => setError(null)} style={{
                background: 'none', border: 'none', color: 'inherit', cursor: 'pointer',
              }}>x</button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div style={{
          borderTop: `1px solid ${colors.border}`,
          backgroundColor: colors.surface,
          padding: '12px 16px',
        }}>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {modes.map(m => (
              <button
                key={m.key}
                onClick={() => setActiveMode(m.key)}
                style={{
                  padding: '4px 12px',
                  backgroundColor: activeMode === m.key ? colors.primary : 'transparent',
                  color: activeMode === m.key ? '#fff' : colors.textMuted,
                  border: `1px solid ${activeMode === m.key ? colors.primary : colors.border}`,
                  borderRadius: '14px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: activeMode === m.key ? 600 : 400,
                }}
              >
                {m.label}
              </button>
            ))}

            {/* File picker */}
            <div ref={resourcePickerRef} style={{ marginLeft: 'auto', position: 'relative' }}>
              {selectedResource ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '3px 8px 3px 10px',
                    backgroundColor: darkMode ? '#1e3a5f' : '#dbeafe',
                    color: darkMode ? '#93c5fd' : '#1d4ed8',
                    border: `1px solid ${darkMode ? '#2563eb' : '#bfdbfe'}`,
                    borderRadius: '12px', fontSize: '11px', fontWeight: 500,
                  }}>
                    &#128196; {selectedResource.title || selectedResource.file_name}
                    <button
                      onClick={() => setSelectedResource(null)}
                      title="Clear file filter"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'inherit', fontSize: '13px', lineHeight: 1, padding: '0 2px',
                      }}
                    >
                      &times;
                    </button>
                  </span>
                </div>
              ) : (
                <button
                  onClick={() => setShowResourcePicker(v => !v)}
                  title="Ask about a specific file"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '4px 10px',
                    backgroundColor: 'transparent',
                    color: colors.textMuted,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '14px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  &#128196; File
                </button>
              )}

              {/* Dropdown */}
              {showResourcePicker && !selectedResource && (
                <div style={{
                  position: 'absolute', bottom: '110%', right: 0,
                  backgroundColor: colors.surface,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '10px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                  minWidth: '240px', maxWidth: '320px',
                  zIndex: 100, overflow: 'hidden',
                }}>
                  <div style={{
                    padding: '8px 12px',
                    fontSize: '11px', fontWeight: 600, color: colors.textMuted,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: `1px solid ${colors.border}`,
                  }}>
                    Ask about a specific file
                  </div>
                  {resources.length === 0 ? (
                    <div style={{ padding: '16px 12px', fontSize: '13px', color: colors.textMuted, textAlign: 'center' }}>
                      No resources uploaded yet
                    </div>
                  ) : (
                    resources.map(r => (
                      <button
                        key={r.id}
                        onClick={() => { setSelectedResource(r); setShowResourcePicker(false); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          width: '100%', padding: '9px 12px', textAlign: 'left',
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: colors.text, fontSize: '13px',
                          borderBottom: `1px solid ${colors.border}`,
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = darkMode ? '#334155' : '#f1f5f9'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <span style={{ fontSize: '16px', flexShrink: 0 }}>
                          {r.resource_type === 'pdf' ? '📄' : r.resource_type === 'pptx' ? '📊' : '📝'}
                        </span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.title || r.file_name}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                selectedResource
                  ? `Ask anything about "${selectedResource.title || selectedResource.file_name}"...`
                  : activeMode === 'explain' ? 'Ask me to explain a concept...'
                  : activeMode === 'quiz' ? 'Enter a topic for quiz questions...'
                  : activeMode === 'summarize' ? 'Enter a file name to summarize...'
                  : 'Ask anything about your course materials...'
              }
              disabled={isStreaming}
              rows={1}
              style={{
                flex: 1,
                padding: '10px 14px',
                backgroundColor: colors.bg,
                border: `1px solid ${colors.border}`,
                borderRadius: '10px',
                color: colors.text,
                fontSize: '14px',
                resize: 'none',
                outline: 'none',
                minHeight: '42px',
                maxHeight: '120px',
                fontFamily: 'inherit',
              }}
            />
            {isStreaming ? (
              <button
                onClick={cancelStream}
                style={{
                  padding: '10px 16px',
                  backgroundColor: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  minHeight: '42px',
                }}
              >
                Stop
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!inputMessage.trim()}
                style={{
                  padding: '10px 16px',
                  backgroundColor: inputMessage.trim() ? colors.primary : colors.border,
                  color: inputMessage.trim() ? '#fff' : colors.textMuted,
                  border: 'none',
                  borderRadius: '10px',
                  cursor: inputMessage.trim() ? 'pointer' : 'default',
                  fontSize: '14px',
                  fontWeight: 500,
                  minHeight: '42px',
                }}
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
};

// ─── Message Bubble Component ───────────────────────────────────────────────

function MessageBubble({ msg, colors, darkMode, currentStatus, statusMessages, confidenceColors, doubtedMessages, onDoubt, onSuggestionClick }) {
  const isUser = msg.role === 'user';

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
    }}>
      <div style={{
        maxWidth: isUser ? '70%' : '85%',
        padding: '12px 16px',
        borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        backgroundColor: isUser ? colors.userBubble : colors.assistantBubble,
        color: isUser ? '#fff' : colors.text,
        border: isUser ? 'none' : `1px solid ${colors.border}`,
        fontSize: '14px',
        lineHeight: 1.6,
      }}>
        {/* Streaming indicator */}
        {msg.isStreaming && !msg.content && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: colors.textMuted }}>
            <span style={{
              width: '6px', height: '6px', borderRadius: '50%',
              backgroundColor: colors.primary, animation: 'pulse 1.5s infinite',
            }} />
            {statusMessages[currentStatus] || 'Thinking...'}
          </div>
        )}

        {/* Content */}
        {msg.content && (
          <div
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
            dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }}
          />
        )}

        {/* Quiz */}
        {msg.message_type === 'quiz' && msg.metadata?.questions && (
          <div style={{ marginTop: '12px' }}>
            <QuizCard questions={msg.metadata.questions} />
          </div>
        )}

        {/* Resources */}
        {msg.metadata?.resources?.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            {msg.metadata.resources.map((r, i) => (
              <div key={i} style={{
                padding: '8px 12px',
                backgroundColor: darkMode ? '#0f172a' : '#f8fafc',
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                marginBottom: '6px',
                fontSize: '13px',
              }}>
                <div style={{ fontWeight: 600 }}>{r.title || r.file_name}</div>
                {r.summary && (
                  <div style={{ color: colors.textMuted, fontSize: '12px', marginTop: '4px' }}>
                    {r.summary.substring(0, 150)}{r.summary.length > 150 ? '...' : ''}
                  </div>
                )}
                {r.file_url && (
                  <a href={r.file_url} target="_blank" rel="noopener noreferrer"
                    style={{ color: colors.primary, fontSize: '11px', textDecoration: 'none' }}>
                    View Document
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Sources */}
        {!isUser && !msg.isStreaming && msg.metadata?.sources?.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: colors.textMuted, marginBottom: '6px', textTransform: 'uppercase' }}>
              Sources
            </div>
            {msg.metadata.sources.slice(0, 3).map((s, i) => (
              <SourceCard key={i} source={s} />
            ))}
          </div>
        )}

        {/* Confidence */}
        {!isUser && !msg.isStreaming && msg.metadata?.confidenceLabel && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            marginTop: '8px', fontSize: '11px', color: colors.textMuted,
          }}>
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%',
              backgroundColor: confidenceColors[msg.metadata.confidenceLabel],
            }} />
            {msg.metadata.confidenceLabel.charAt(0).toUpperCase() + msg.metadata.confidenceLabel.slice(1)} confidence
            {msg.metadata.confidence ? ` (${Math.round(msg.metadata.confidence * 100)}%)` : ''}
          </div>
        )}

        {/* Doubt button */}
        {!isUser && !msg.isStreaming && msg.id && !msg.id.startsWith('temp-') && !msg.id.startsWith('stream-') && (
          <div style={{ marginTop: '8px' }}>
            {!doubtedMessages.has(msg.id) ? (
              <button
                onClick={() => onDoubt(msg.id)}
                style={{
                  padding: '4px 10px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '12px',
                  color: colors.textMuted,
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                Still confused?
              </button>
            ) : (
              <span style={{ fontSize: '11px', color: '#f59e0b' }}>
                Marked as doubt - your teacher will see this
              </span>
            )}
          </div>
        )}

        {/* Follow-up suggestions */}
        {!isUser && !msg.isStreaming && msg.metadata?.suggestedFollowups?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
            {msg.metadata.suggestedFollowups.map((s, i) => (
              <button
                key={i}
                onClick={() => onSuggestionClick(s)}
                style={{
                  padding: '4px 10px',
                  backgroundColor: darkMode ? '#0f172a' : '#eff6ff',
                  border: `1px solid ${darkMode ? '#1e3a5f' : '#bfdbfe'}`,
                  borderRadius: '12px',
                  color: colors.primary,
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatContent(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:#334155;color:#e2e8f0;padding:1px 4px;border-radius:3px;font-size:12px">$1</code>')
    .replace(/\n/g, '<br/>');
}

export default AIAssistant;
