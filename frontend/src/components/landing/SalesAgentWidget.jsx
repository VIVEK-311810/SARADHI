import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MessageSquare, Send, X, MicOff } from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3 rounded-2xl bg-zinc-700 w-fit">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-zinc-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.9s' }}
        />
      ))}
    </div>
  );
}

// ── Individual message bubble ─────────────────────────────────────────────────
function MessageBubble({ role, content }) {
  const isUser = role === 'user';
  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed text-white whitespace-pre-wrap ${
          isUser ? 'bg-zinc-800 rounded-br-sm' : 'bg-zinc-700 rounded-bl-sm'
        }`}
      >
        {content}
      </div>
    </div>
  );
}

// ── Audio waveform bars (mic recording visual) ────────────────────────────────
function WaveformBars() {
  const heights = [3, 6, 10, 7, 12, 5, 9, 6, 11, 4, 8, 5, 10, 7, 4];
  return (
    <div className="flex items-center gap-[3px] h-5">
      {heights.map((h, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-red-400 animate-pulse"
          style={{
            height: `${h}px`,
            animationDelay: `${(i * 0.08) % 0.6}s`,
            animationDuration: `${0.5 + (i % 3) * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────
export default function SalesAgentWidget() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [activePanel, setActivePanel] = useState(null); // null | 'text' | 'mic'
  const [isListening, setIsListening] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const historyRef = useRef([]); // shadow of messages for API calls (avoids stale closure)

  const micSupported = typeof window !== 'undefined' &&
    !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  // Auto-scroll chat box to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Focus input when text panel opens
  useEffect(() => {
    if (activePanel === 'text') {
      setTimeout(() => inputRef.current?.focus(), 320);
    }
  }, [activePanel]);

  // Keep historyRef in sync with messages
  useEffect(() => {
    historyRef.current = messages;
  }, [messages]);

  // ── Send message ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    const trimmed = text.trim().slice(0, 500);
    if (!trimmed || isTyping) return;

    const userMsg = { role: 'user', content: trimmed };
    const updatedMessages = [...historyRef.current, userMsg];

    setMessages(updatedMessages);
    setInputText('');
    setChatOpen(true);
    setIsTyping(true);

    // Keep last 10 turns for context (exclude the message just added)
    const history = historyRef.current.slice(-10);

    try {
      const res = await fetch(`${API_URL}/sales-agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, history }),
      });

      const data = await res.json();

      if (res.ok && data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: "Sorry, I'm having a bit of trouble right now. Try again in a moment!",
        }]);
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Looks like I lost connection. Check your internet and try again!",
      }]);
    } finally {
      setIsTyping(false);
    }
  }, [isTyping]);

  // ── Text panel handlers ───────────────────────────────────────────────────────
  const handleTextPanelClick = () => {
    if (activePanel === 'text') return;
    stopListening();
    setActivePanel('text');
  };

  const handleMicPanelClick = () => {
    if (activePanel === 'mic') {
      // Already in mic mode — toggle recording
      isListening ? stopListening() : startListening();
      return;
    }
    setActivePanel('mic');
    setTimeout(() => startListening(), 50);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputText);
    }
  };

  // ── MediaRecorder → Groq Whisper transcription ────────────────────────────────
  const startListening = useCallback(async () => {
    if (!micSupported || isListening) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Stop all mic tracks to release the browser mic indicator
        stream.getTracks().forEach(t => t.stop());

        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size < 1000) {
          // Too short — likely silence
          setIsListening(false);
          return;
        }

        setIsListening(false);
        setIsTyping(true); // show typing indicator while Groq processes

        try {
          const formData = new FormData();
          formData.append('audio', blob, 'recording.webm');

          const res = await fetch(`${API_URL}/sales-agent/transcribe`, {
            method: 'POST',
            body: formData,
          });

          const data = await res.json();
          if (res.ok && data.transcript) {
            setIsTyping(false);
            await sendMessage(data.transcript);
            setActivePanel('text');
          } else {
            setIsTyping(false);
            // Nothing heard — just reset quietly
          }
        } catch {
          setIsTyping(false);
        }
      };

      recorder.start();
      setIsListening(true);
    } catch {
      // Mic permission denied or unavailable
      setIsListening(false);
    }
  }, [micSupported, isListening, sendMessage]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop(); // triggers onstop → sends to Groq
    }
    setIsListening(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // ── Derived layout values ─────────────────────────────────────────────────────
  // Pill sections: whichever panel is active takes 80%, the other takes 20%
  const micFlex = activePanel === 'text' ? '0 0 20%' : '1 1 80%';
  const textFlex = activePanel === 'text' ? '1 1 80%' : '0 0 20%';

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2"
      style={{ width: 'min(50vw, 600px)', minWidth: '320px' }}
    >
      {/* ── Chat box ────────────────────────────────────────────────────────── */}
      {chatOpen && (
        <div
          className="w-full rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          style={{
            background: '#0a0a0a',
            border: '1px solid #27272a',
            maxHeight: '420px',
            animation: 'slideUp 0.3s ease-out',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
              <span className="text-sm font-medium text-white">Ask SAS Edu AI</span>
            </div>
            <button
              onClick={() => setChatOpen(false)}
              className="text-zinc-500 hover:text-white transition-colors p-1 rounded"
              aria-label="Close chat"
            >
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto flex flex-col gap-3 p-4"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#9333ea #18181b',
            }}
          >
            {messages.length === 0 && (
              <p className="text-zinc-500 text-xs text-center mt-4">
                Your conversation will appear here
              </p>
            )}
            {messages.map((m, i) => (
              <MessageBubble key={i} role={m.role} content={m.content} />
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <TypingDots />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* ── Pill bar ─────────────────────────────────────────────────────────── */}
      <div
        className="w-full flex rounded-full overflow-hidden shadow-xl"
        style={{ background: '#3d1a2e', height: '52px' }}
      >
        {/* Mic section */}
        <button
          onClick={handleMicPanelClick}
          className="flex items-center gap-3 px-5 transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap"
          style={{ flex: micFlex, minWidth: 0, transition: 'flex 0.3s ease-in-out' }}
          aria-label={isListening ? 'Stop recording' : 'Tap to speak'}
          disabled={!micSupported}
        >
          <span
            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              isListening ? 'bg-red-500' : 'bg-white/10'
            }`}
          >
            {isListening
              ? <MicOff size={15} className="text-white" />
              : <Mic size={15} className="text-white" />
            }
          </span>

          {/* Expanded mic content */}
          <span
            className="flex items-center gap-2 overflow-hidden transition-all duration-300"
            style={{
              opacity: activePanel === 'text' ? 0 : 1,
              maxWidth: activePanel === 'text' ? 0 : '300px',
              transition: 'opacity 0.2s ease, max-width 0.3s ease',
            }}
          >
            {isListening ? (
              <>
                <span className="text-red-400 text-sm font-medium">Listening...</span>
                <WaveformBars />
              </>
            ) : (
              <span className="text-white/70 text-sm">
                {micSupported ? 'Tap to speak' : 'Voice unavailable'}
              </span>
            )}
          </span>
        </button>

        {/* Divider */}
        <div className="w-px bg-white/10 flex-shrink-0 my-3" />

        {/* Chat / text section */}
        <button
          onClick={handleTextPanelClick}
          className="flex items-center gap-3 px-5 transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap"
          style={{ flex: textFlex, minWidth: 0, transition: 'flex 0.3s ease-in-out' }}
          aria-label="Type a question"
        >
          {/* Collapsed: just the icon */}
          <span
            className="flex-shrink-0 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
            style={{ display: activePanel === 'text' ? 'none' : 'flex' }}
          >
            <MessageSquare size={15} className="text-white" />
          </span>

          {/* Expanded: input field + send button */}
          {activePanel === 'text' && (
            <div
              className="flex items-center gap-2 w-full"
              onClick={e => e.stopPropagation()}
            >
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me anything..."
                maxLength={500}
                className="flex-1 bg-transparent text-white text-sm placeholder-white/40 outline-none min-w-0"
              />
              <button
                onClick={() => sendMessage(inputText)}
                disabled={!inputText.trim() || isTyping}
                className="flex-shrink-0 w-8 h-8 rounded-full bg-white flex items-center justify-center disabled:opacity-40 transition-opacity hover:bg-white/90"
                aria-label="Send"
              >
                <Send size={14} className="text-black" />
              </button>
            </div>
          )}

          {/* Collapsed label */}
          {activePanel !== 'text' && (
            <span className="text-white/70 text-sm hidden">Chat</span>
          )}
        </button>
      </div>

      {/* CSS animation */}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Custom scrollbar for WebKit browsers */
        .overflow-y-auto::-webkit-scrollbar { width: 4px; }
        .overflow-y-auto::-webkit-scrollbar-track { background: #18181b; border-radius: 4px; }
        .overflow-y-auto::-webkit-scrollbar-thumb { background: #9333ea; border-radius: 4px; }
        .overflow-y-auto::-webkit-scrollbar-thumb:hover { background: #a855f7; }

        @media (max-width: 767px) {
          /* Full width on mobile — override inline style */
          .sales-widget-root {
            width: calc(100vw - 2rem) !important;
            min-width: unset !important;
          }
        }
      `}</style>
    </div>
  );
}
