import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { utils, apiRequest } from '../../utils/api';
import { useAIChat } from '../../hooks/useAIChat';
import QuizCard from './QuizCard';
import ResourceViewerModal from './ResourceViewerModal';
import DOMPurify from 'dompurify';

const AIAssistant = () => {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const currentUser = utils.getCurrentUser();
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const [inputMessage, setInputMessage] = useState('');
  const [sessionInfo, setSessionInfo] = useState(null);
  const [activeMode, setActiveMode] = useState('answer');
  const [viewerResource, setViewerResource] = useState(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [doubtedMessages, setDoubtedMessages] = useState(new Set());
  const [resources, setResources] = useState([]);
  const [selectedResource, setSelectedResource] = useState(null);
  const [showResourcePicker, setShowResourcePicker] = useState(false);
  const resourcePickerRef = useRef(null);

  const {
    messages, isStreaming, currentStatus, conversations, activeConversationId,
    error, sendMessage, cancelStream, loadConversations, loadConversation,
    startNewConversation, deleteConversation, markAsDoubt, setError,
  } = useAIChat(sessionId);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'student') { navigate('/auth'); return; }
    if (!sessionId) { navigate('/student/dashboard'); return; }
    apiRequest(`/sessions/${sessionId}`).then(data => setSessionInfo(data)).catch(() => {});
    apiRequest(`/resources/session/${sessionId}`).then(data => setResources(data.resources || [])).catch(() => {});
    loadConversations();
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e) => {
      if (resourcePickerRef.current && !resourcePickerRef.current.contains(e.target)) {
        setShowResourcePicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSend = () => {
    if (!inputMessage.trim() || isStreaming) return;
    sendMessage(inputMessage.trim(), activeMode, selectedResource?.id || null);
    setInputMessage('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleSuggestionClick = (suggestion) => {
    sendMessage(suggestion, activeMode, selectedResource?.id || null);
  };

  const handleDoubt = async (messageId) => {
    const success = await markAsDoubt(messageId);
    if (success) setDoubtedMessages(prev => new Set([...prev, messageId]));
  };

  const modes = [
    { key: 'answer', label: 'Answer' },
    { key: 'explain', label: 'Explain' },
    { key: 'quiz', label: 'Quiz' },
    { key: 'summarize', label: 'Summary' },
  ];

  const statusMessages = {
    starting: 'Starting...', classifying: 'Understanding your question...',
    retrieving: 'Searching course materials...', generating: 'Generating answer...',
    summarizing: 'Creating summary...', 'generating quiz': 'Creating quiz questions...',
  };

  const confidenceColors = { high: 'bg-emerald-500', medium: 'bg-amber-500', low: 'bg-red-500', none: 'bg-slate-400' };

  const suggestions = selectedResource ? [
    `Summarize "${selectedResource.title || selectedResource.file_name}"`,
    'What are the key concepts?', 'Quiz me on this document', 'Most important points?',
  ] : ['What topics are covered?', 'List all resources', 'Explain the main concepts', 'Generate a practice quiz'];

  return (
    <>
    <div className="flex h-[calc(100vh-56px)] bg-slate-50 dark:bg-slate-950">

      {/* ── Conversation sidebar ── */}
      <div className={`flex-col bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-r border-slate-200/60 dark:border-slate-700/60 transition-all duration-200 overflow-hidden flex-shrink-0 ${showSidebar ? 'w-72 flex' : 'w-0 hidden md:flex md:w-0'}`}>
        {showSidebar && (
          <>
            <div className="p-3 border-b border-slate-200/60 dark:border-slate-700/60">
              <button
                onClick={() => { startNewConversation(); setShowSidebar(false); }}
                className="w-full bg-primary-600 hover:bg-primary-500 active:bg-primary-700 text-white text-sm font-medium py-2 px-3 rounded-xl transition-colors cursor-pointer"
              >
                + New Chat
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {conversations.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => { loadConversation(conv.id); setShowSidebar(false); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer text-sm transition-colors ${conv.id === activeConversationId ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
                >
                  <span className="flex-1 truncate">{conv.title || 'Untitled'}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                    className="text-slate-400 hover:text-red-500 transition-colors p-0.5 cursor-pointer flex-shrink-0"
                    title="Delete"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              {conversations.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-6">No conversations yet</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Main chat area ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-700/60 flex-shrink-0">
          <button
            onClick={() => setShowSidebar(v => !v)}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors cursor-pointer"
            aria-label="Toggle sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">AI Study Assistant</h2>
                {sessionInfo && (
                  <p className="text-xs text-slate-400 truncate">{sessionInfo.name || sessionInfo.session_name || sessionId}</p>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={() => navigate('/student/dashboard')}
            className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            ← Back
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center pb-8">
              <div className="w-16 h-16 rounded-2xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-1">AI Study Assistant</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-6">
                {selectedResource
                  ? `Asking about: ${selectedResource.title || selectedResource.file_name}`
                  : 'Ask questions about your course materials, get explanations, generate quizzes, or summarize resources.'}
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(s)}
                    className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-sm text-slate-700 dark:text-slate-300 hover:border-primary-300 dark:hover:border-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <MessageBubble
              key={msg.id || idx}
              msg={msg}
              currentStatus={currentStatus}
              statusMessages={statusMessages}
              confidenceColors={confidenceColors}
              doubtedMessages={doubtedMessages}
              onDoubt={handleDoubt}
              onSuggestionClick={handleSuggestionClick}
              onQuickAction={(text, mode) => sendMessage(text, mode, selectedResource?.id || null)}
              onSourceClick={setViewerResource}
            />
          ))}

          {error && (
            <div className="flex items-center justify-between gap-3 bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-xl px-4 py-3 text-sm text-error-700 dark:text-error-300">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-error-500 hover:text-error-700 cursor-pointer flex-shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-slate-200/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-3 flex-shrink-0">
          {/* Mode pills + resource picker */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {modes.map(m => (
              <button
                key={m.key}
                onClick={() => setActiveMode(m.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer border ${
                  activeMode === m.key
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-transparent text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-600'
                }`}
              >
                {m.label}
              </button>
            ))}

            <div ref={resourcePickerRef} className="ml-auto relative">
              {selectedResource ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary-100 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800 rounded-full text-xs text-primary-700 dark:text-primary-300">
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="max-w-[120px] truncate">{selectedResource.title || selectedResource.file_name}</span>
                  <button onClick={() => setSelectedResource(null)} className="hover:text-primary-900 cursor-pointer" title="Clear">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowResourcePicker(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-full hover:border-primary-300 transition-colors cursor-pointer"
                  title="Ask about a specific file"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  File
                </button>
              )}

              {showResourcePicker && !selectedResource && (
                <div className="absolute bottom-full right-0 mb-2 w-64 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl border border-slate-200/60 dark:border-slate-700/60 rounded-2xl shadow-glass overflow-hidden z-50">
                  <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-200/60 dark:border-slate-700/60">
                    Ask about a file
                  </div>
                  {resources.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-slate-400 text-center">No resources uploaded yet</div>
                  ) : (
                    resources.map(r => (
                      <button
                        key={r.id}
                        onClick={() => { setSelectedResource(r); setShowResourcePicker(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer border-b border-slate-100 dark:border-slate-700/50 last:border-0"
                      >
                        <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="truncate">{r.title || r.file_name}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Text + send */}
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                selectedResource ? `Ask about "${selectedResource.title || selectedResource.file_name}"...`
                : activeMode === 'explain' ? 'Ask me to explain a concept...'
                : activeMode === 'quiz' ? 'Enter a topic for quiz questions...'
                : activeMode === 'summarize' ? 'Enter a file name to summarize...'
                : 'Ask anything about your course materials...'
              }
              disabled={isStreaming}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent disabled:opacity-60 min-h-[42px] max-h-[120px] transition-colors"
              style={{ height: '42px' }}
            />
            {isStreaming ? (
              <button
                onClick={cancelStream}
                className="bg-error-500 hover:bg-error-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer flex-shrink-0 h-[42px]"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!inputMessage.trim()}
                className="bg-primary-600 hover:bg-primary-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white disabled:text-slate-400 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed flex-shrink-0 h-[42px]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>

    {viewerResource && (
      <ResourceViewerModal resource={viewerResource} onClose={() => setViewerResource(null)} />
    )}
    </>
  );
};

// ─── Message Bubble ──────────────────────────────────────────────────────────
function MessageBubble({ msg, currentStatus, statusMessages, confidenceColors, doubtedMessages, onDoubt, onSuggestionClick, onQuickAction, onSourceClick }) {
  const isUser = msg.role === 'user';
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    if (!msg.content) return;
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
        isUser
          ? 'bg-primary-600 text-white rounded-br-sm'
          : 'bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200/60 dark:border-slate-700/60 text-slate-800 dark:text-slate-100 rounded-bl-sm shadow-card'
      }`}>

        {/* Streaming indicator */}
        {msg.isStreaming && !msg.content && (
          <div className="flex items-center gap-2 text-slate-400">
            <span className="flex gap-1">
              {[0, 1, 2].map(i => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse-glow" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </span>
            <span className="text-xs">{statusMessages[currentStatus] || 'Thinking...'}</span>
          </div>
        )}

        {/* Content */}
        {msg.content && (
          <div
            className="break-words"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(formatContent(msg.content)) }}
          />
        )}

        {/* Quiz */}
        {msg.message_type === 'quiz' && msg.metadata?.questions && (
          <div className="mt-3">
            <QuizCard questions={msg.metadata.questions} />
          </div>
        )}

        {/* Resources */}
        {msg.metadata?.resources?.length > 0 && (
          <div className="mt-3 space-y-2">
            {msg.metadata.resources.map((r, i) => (
              <div key={i} className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-3 text-xs">
                <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1">{r.title || r.file_name}</div>
                {r.summary && <div className="text-slate-500">{r.summary.substring(0, 150)}{r.summary.length > 150 ? '...' : ''}</div>}
                {r.file_url && (
                  <a href={r.file_url} target="_blank" rel="noopener noreferrer" className="text-primary-600 dark:text-primary-400 text-xs mt-1 inline-block hover:underline">
                    View Document
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Sources */}
        {!isUser && !msg.isStreaming && msg.metadata?.sources?.length > 0 && (() => {
          const seen = new Set();
          const unique = msg.metadata.sources.filter(s => {
            const key = s.resourceId || s.resourceTitle || s.fileName;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          return (
            <div className="mt-3">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Sources</div>
              <div className="flex flex-wrap gap-1.5">
                {unique.map((s, i) => {
                  const label = s.resourceTitle || s.fileName || 'Document';
                  return (
                    <button
                      key={i}
                      onClick={() => onSourceClick(s)}
                      className="flex items-center gap-1 px-2.5 py-1 border rounded-full text-xs transition-colors cursor-pointer bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:border-primary-300 hover:text-primary-700 dark:hover:text-primary-300"
                    >
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Confidence */}
        {!isUser && !msg.isStreaming && msg.metadata?.confidenceLabel && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-400">
            <span className={`w-2 h-2 rounded-full ${confidenceColors[msg.metadata.confidenceLabel] || 'bg-slate-400'}`} />
            {msg.metadata.confidenceLabel.charAt(0).toUpperCase() + msg.metadata.confidenceLabel.slice(1)} confidence
            {msg.metadata.confidence ? ` (${Math.round(msg.metadata.confidence * 100)}%)` : ''}
          </div>
        )}

        {/* Copy + Doubt */}
        {!isUser && !msg.isStreaming && msg.content && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              onClick={handleCopy}
              className={`px-2.5 py-1 border rounded-full text-xs transition-colors cursor-pointer ${
                copied ? 'border-emerald-300 text-emerald-600' : 'border-slate-200 dark:border-slate-600 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
              }`}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>

            {msg.id && !msg.id.startsWith('temp-') && !msg.id.startsWith('stream-') && (
              !doubtedMessages.has(msg.id) ? (
                <button
                  onClick={() => onDoubt(msg.id)}
                  className="px-2.5 py-1 border border-slate-200 dark:border-slate-600 rounded-full text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  Still confused?
                </button>
              ) : (
                <span className="text-xs text-amber-500">Marked as doubt ✓</span>
              )
            )}
          </div>
        )}

        {/* Quick actions */}
        {!isUser && !msg.isStreaming && msg.content && !msg.metadata?.questions && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {[
              { label: 'Explain simpler', text: 'Can you explain that more simply?', mode: 'explain' },
              { label: 'Give example', text: 'Can you give a concrete example of that?', mode: 'answer' },
              { label: 'Quiz me', text: 'Quiz me on what you just explained', mode: 'quiz' },
            ].map((action) => (
              <button
                key={action.label}
                onClick={() => onQuickAction(action.text, action.mode)}
                className="px-2.5 py-1 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600 rounded-full text-xs text-slate-500 dark:text-slate-400 hover:border-primary-300 hover:text-primary-600 transition-colors cursor-pointer"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}

        {/* Suggested follow-ups */}
        {!isUser && !msg.isStreaming && msg.metadata?.suggestedFollowups?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {msg.metadata.suggestedFollowups.map((s, i) => (
              <button
                key={i}
                onClick={() => onSuggestionClick(s)}
                className="px-2.5 py-1 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-full text-xs text-primary-600 dark:text-primary-400 hover:bg-primary-100 transition-colors cursor-pointer"
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

  // Strip suggestions tags that may leak through from the stream
  text = text.replace(/<suggestions>[\s\S]*?<\/suggestions>/g, '').trim();

  const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const inline = (s) =>
    s
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-1 py-0.5 rounded text-xs font-mono">$1</code>');

  const lines = text.split('\n');
  const output = [];
  let inUL = false;
  let inOL = false;

  const closeList = () => {
    if (inUL) { output.push('</ul>'); inUL = false; }
    if (inOL) { output.push('</ol>'); inOL = false; }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^-{3,}$/.test(trimmed)) {
      closeList();
      output.push('<hr class="border-slate-200 dark:border-slate-700 my-2"/>');
      continue;
    }

    if (trimmed === '') {
      closeList();
      output.push('<div class="h-1.5"></div>');
      continue;
    }

    if (trimmed.startsWith('### ')) {
      closeList();
      output.push(`<h3 class="text-sm font-semibold mt-3 mb-0.5">${inline(escape(trimmed.slice(4)))}</h3>`);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      closeList();
      output.push(`<h2 class="text-sm font-bold mt-3 mb-0.5">${inline(escape(trimmed.slice(3)))}</h2>`);
      continue;
    }
    if (trimmed.startsWith('# ')) {
      closeList();
      output.push(`<h1 class="text-base font-bold mt-3 mb-1">${inline(escape(trimmed.slice(2)))}</h1>`);
      continue;
    }

    if (/^[-*•] /.test(trimmed)) {
      if (inOL) { output.push('</ol>'); inOL = false; }
      if (!inUL) { output.push('<ul class="list-disc pl-4 space-y-0.5 my-1">'); inUL = true; }
      output.push(`<li>${inline(escape(trimmed.replace(/^[-*•] /, '')))}</li>`);
      continue;
    }

    if (/^\d+\. /.test(trimmed)) {
      if (inUL) { output.push('</ul>'); inUL = false; }
      if (!inOL) { output.push('<ol class="list-decimal pl-4 space-y-0.5 my-1">'); inOL = true; }
      output.push(`<li>${inline(escape(trimmed.replace(/^\d+\. /, '')))}</li>`);
      continue;
    }

    closeList();
    output.push(`<p class="leading-relaxed">${inline(escape(line))}</p>`);
  }

  closeList();
  return output.join('');
}

export default AIAssistant;
