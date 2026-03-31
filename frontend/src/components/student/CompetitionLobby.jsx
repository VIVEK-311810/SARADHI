import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { apiRequest, safeParseUser, studentAPI } from '../../utils/api';
import { isDemoMode } from '../../utils/demoData';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { StatCardsSkeleton, SessionListSkeleton } from '../shared/SkeletonLoader';

// ── Room status badge ─────────────────────────────────────────────────────────
function RoomStatusBadge({ status }) {
  if (status === 'active') return <Badge variant="live" dot>Live</Badge>;
  if (status === 'waiting') return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-saradhi-100 text-saradhi-700 dark:bg-saradhi-900/30 dark:text-saradhi-400">
      Waiting
    </span>
  );
  return <Badge variant="ended" dot>Ended</Badge>;
}

// ── Role selection modal ──────────────────────────────────────────────────────
function RoleSelectionModal({ room, onClose, onJoin, joining }) {
  const [selectedRole, setSelectedRole] = useState(room.status === 'active' ? 'spectator' : null);
  const isActive = room.status === 'active';

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const joinLabel = selectedRole === 'spectator' ? 'Join as Spectator' : selectedRole === 'player' ? 'Join as Player' : 'Choose a role first';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-card border border-slate-200/80 dark:border-slate-700/80 max-w-md w-full p-6">
        {/* Room summary */}
        <div className="mb-4">
          <h2 className="text-lg font-bold font-display text-slate-900 dark:text-white">{room.session_title}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Created by {room.creator_name}</p>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <RoomStatusBadge status={room.status} />
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {room.total_questions} questions · {room.time_per_question}s each
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {room.player_count || 0} players
            </span>
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 my-4" />

        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">How do you want to join?</p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Play card */}
          <button
            onClick={() => !isActive && setSelectedRole('player')}
            disabled={isActive}
            className={`border-2 rounded-xl p-4 text-center transition-all duration-150 ${
              isActive
                ? 'opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-600'
                : selectedRole === 'player'
                ? 'border-coral-500 bg-coral-50 dark:bg-coral-900/30'
                : 'border-slate-200 dark:border-slate-600 hover:border-coral-400 hover:bg-coral-50 dark:hover:bg-coral-900/20'
            }`}
          >
            <svg className="w-8 h-8 mx-auto mb-2 text-coral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="font-bold text-slate-900 dark:text-white text-sm">⚔ Play</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Compete for points</p>
            {isActive && <p className="text-xs text-coral-500 mt-1">Match in progress — join as spectator</p>}
          </button>

          {/* Watch card */}
          <button
            onClick={() => setSelectedRole('spectator')}
            className={`border-2 rounded-xl p-4 text-center transition-all duration-150 ${
              selectedRole === 'spectator'
                ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30'
                : 'border-slate-200 dark:border-slate-600 hover:border-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20'
            }`}
          >
            <svg className="w-8 h-8 mx-auto mb-2 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <p className="font-bold text-slate-900 dark:text-white text-sm">👁 Watch</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Spectate live</p>
          </button>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg py-2.5 px-4 text-sm transition-colors"
          >
            Cancel
          </button>
          <Button
            onClick={() => selectedRole && onJoin(room.room_code, selectedRole)}
            disabled={!selectedRole || joining}
            className={`flex-1 ${selectedRole === 'spectator' ? 'bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white' : 'bg-saradhi-700 hover:bg-saradhi-600 active:bg-saradhi-800 text-white'}`}
            title={!selectedRole ? 'Choose a role first' : ''}
          >
            {joining ? 'Joining…' : joinLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Question bank panel ───────────────────────────────────────────────────────
function QuestionBankPanel({ sessionId, currentUserId, onQuestionsChange }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [teacherPollCount, setTeacherPollCount] = useState(0);
  const [questions, setQuestions] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [genCount, setGenCount] = useState(5);
  const [genError, setGenError] = useState('');

  // Fetch summary counts on mount so the header shows correct numbers
  useEffect(() => {
    apiRequest(`/competition/sessions/${sessionId}/questions`)
      .then(res => {
        if (res.success) {
          setTeacherPollCount(res.data.teacherPollCount);
          setQuestions(res.data.studentQuestions);
          onQuestionsChange(res.data.teacherPollCount, res.data.studentQuestions.length);
        }
      })
      .catch(() => {});
  }, [sessionId]); // eslint-disable-line

  const loadQuestions = async () => {
    if (loaded) { setOpen(o => !o); return; }
    setOpen(true);
    setLoading(true);
    try {
      const res = await apiRequest(`/competition/sessions/${sessionId}/questions`);
      if (res.success) {
        setTeacherPollCount(res.data.teacherPollCount);
        setQuestions(res.data.studentQuestions);
        onQuestionsChange(res.data.teacherPollCount, res.data.studentQuestions.length);
        setLoaded(true);
      }
    } catch (err) {
      console.error('Failed to load questions', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (qId) => {
    try {
      await apiRequest(`/competition/sessions/${sessionId}/questions/${qId}`, { method: 'DELETE' });
      const updated = questions.filter(q => q.id !== qId);
      setQuestions(updated);
      onQuestionsChange(teacherPollCount, updated.length);
    } catch (err) {
      console.error('Delete failed', err);
    }
  };

  const handleGenerate = async () => {
    if (isDemoMode()) return;
    setGenerating(true);
    setGenError('');
    try {
      const res = await apiRequest(`/competition/sessions/${sessionId}/generate-questions`, {
        method: 'POST',
        body: JSON.stringify({ count: genCount })
      });
      if (res.success) {
        toast.success('Questions generated from your session materials!');
        // Re-fetch to get updated list
        const fresh = await apiRequest(`/competition/sessions/${sessionId}/questions`);
        if (fresh.success) {
          setTeacherPollCount(fresh.data.teacherPollCount);
          setQuestions(fresh.data.studentQuestions);
          onQuestionsChange(fresh.data.teacherPollCount, fresh.data.studentQuestions.length);
          setLoaded(true);
        }
      } else {
        setGenError(res.error || 'Generation failed.');
      }
    } catch (err) {
      setGenError('Generation failed. Try again or contact your teacher to add more polls.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="mt-3 border border-slate-200 dark:border-slate-600 rounded-xl overflow-hidden">
      {/* Panel header */}
      <button
        onClick={loadQuestions}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Question Bank</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {teacherPollCount} teacher · {questions.length} AI-generated
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="p-4 bg-white dark:bg-slate-800 space-y-3">
          {loading ? (
            <SessionListSkeleton rows={2} />
          ) : questions.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-2">
              No AI questions yet. Use the button below to generate some from your session materials.
            </p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {questions.map(q => (
                <div key={q.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <p className="truncate text-sm text-slate-700 dark:text-slate-300 flex-1">{q.question}</p>
                  <span className="bg-saradhi-100 text-saradhi-700 text-xs rounded-full px-1.5 py-0.5 flex-shrink-0">AI</span>
                  {String(q.created_by) === String(currentUserId) && (
                    <span className="bg-saradhi-100 text-saradhi-700 text-xs px-1.5 py-0.5 rounded-full flex-shrink-0">(You)</span>
                  )}
                  {String(q.created_by) === String(currentUserId) && (
                    <button
                      onClick={() => handleDelete(q.id)}
                      className="text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Generate with AI */}
          {isDemoMode() ? (
            <p className="text-xs text-slate-400 italic">AI generation requires a real account.</p>
          ) : (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-slate-600 dark:text-slate-400">Generate</span>
                <div className="flex items-center border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden bg-white dark:bg-slate-700">
                  <button
                    type="button"
                    onClick={() => setGenCount(c => Math.max(1, c - 1))}
                    disabled={generating || genCount <= 1}
                    className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                  >−</button>
                  <span className="px-3 py-1.5 text-sm font-semibold text-slate-900 dark:text-white min-w-[2rem] text-center select-none">{genCount}</span>
                  <button
                    type="button"
                    onClick={() => setGenCount(c => Math.min(10, c + 1))}
                    disabled={generating || genCount >= 10}
                    className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                  >+</button>
                </div>
                <span className="text-sm text-slate-600 dark:text-slate-400">questions</span>
                <Button
                  size="sm"
                  onClick={handleGenerate}
                  disabled={generating}
                  className={`bg-saradhi-700 hover:bg-saradhi-600 active:bg-saradhi-800 text-white font-medium transition-colors ${generating ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {generating ? (
                    <span className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Generating…
                    </span>
                  ) : '✨ Generate with AI'}
                </Button>
              </div>
              {genError && (
                <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {genError}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
const CompetitionLobby = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionParam = searchParams.get('session');

  const currentUser = safeParseUser();

  const [activeRooms, setActiveRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionTitle, setSessionTitle] = useState('');

  // Role selection modal state
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [joining, setJoining] = useState(false);

  // Per-session form state
  const [expandedSession, setExpandedSession] = useState(sessionParam || null);
  const [timePerQuestion, setTimePerQuestion] = useState({});
  const [teacherQCount, setTeacherQCount] = useState({}); // { sessionId: number } — how many teacher questions to use
  const [creating, setCreating] = useState({});
  const [questionCounts, setQuestionCounts] = useState({}); // { sessionId: { teacherPollCount, aiCount } }

  const demo = isDemoMode();

  const fetchActiveRooms = useCallback(async () => {
    try {
      const res = await apiRequest('/competition/rooms/active');
      if (res.success) setActiveRooms(res.data);
    } catch (err) {
      console.error('Failed to fetch active rooms', err);
    } finally {
      setRoomsLoading(false);
    }
  }, []);

  const fetchSessions = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const data = await studentAPI.getDashboardSummary(currentUser.id);
      const mapped = (data.sessions ?? []).map(s => ({
        id: s.join_code,
        session_id: s.join_code,
        title: s.title,
        course_name: s.course_name,
        teacher_name: s.teacher_name,
      }));
      setSessions(mapped);
      if (sessionParam) {
        const match = mapped.find(s => s.session_id === sessionParam);
        if (match) setSessionTitle(match.title);
      }
    } catch (err) {
      console.error('Failed to fetch sessions', err);
    } finally {
      setSessionsLoading(false);
    }
  }, [currentUser?.id, sessionParam]);

  useEffect(() => {
    fetchActiveRooms();
    fetchSessions();
    const interval = setInterval(fetchActiveRooms, 10000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line

  const handleJoinRoom = async (roomCode, role) => {
    setJoining(true);
    try {
      await apiRequest(`/competition/rooms/${roomCode}/join`, {
        method: 'POST',
        body: JSON.stringify({ role })
      });
      navigate(`/student/competition/room/${roomCode}`);
    } catch (err) {
      console.error('Join failed', err);
      toast.error('Failed to join room. Please try again.');
    } finally {
      setJoining(false);
    }
  };

  const handleCreateRoom = async (sessionId) => {
    setCreating(prev => ({ ...prev, [sessionId]: true }));
    try {
      const tpq = parseInt(timePerQuestion[sessionId]) || 20;
      const maxTeacher = (questionCounts[sessionId] || {}).teacherPollCount || 0;
      const tqc = teacherQCount[sessionId] !== undefined
        ? parseInt(teacherQCount[sessionId])
        : maxTeacher;
      const res = await apiRequest('/competition/rooms', {
        method: 'POST',
        body: JSON.stringify({ sessionId, timePerQuestion: tpq, teacherQuestionCount: tqc })
      });
      if (res.success) {
        navigate(`/student/competition/room/${res.data.roomCode}`);
      } else {
        toast.error(res.error || 'Failed to create room.');
      }
    } catch (err) {
      console.error('Create room failed', err);
      toast.error('Failed to create room. Please try again.');
    } finally {
      setCreating(prev => ({ ...prev, [sessionId]: false }));
    }
  };

  const getQCounts = (sessionId) => questionCounts[sessionId] || { teacherPollCount: 0, aiCount: 0 };
  const getEffectiveTeacherCount = (sessionId) => {
    const max = getQCounts(sessionId).teacherPollCount;
    const selected = teacherQCount[sessionId];
    return selected !== undefined ? Math.min(parseInt(selected) || 0, max) : max;
  };
  const totalQs = (sessionId) => getEffectiveTeacherCount(sessionId) + getQCounts(sessionId).aiCount;

  if (demo) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 px-4 sm:px-6 pb-8">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-card border border-slate-200/80 dark:border-slate-700/80 p-6 text-center">
          <p className="text-slate-700 dark:text-slate-300 mb-4">Competition mode requires a real account.</p>
          <Button onClick={() => navigate('/auth')}>Sign in</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 px-4 sm:px-6 pb-8">

      {/* ── Section 1: Active Competitions ─────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-card border border-slate-200/80 dark:border-slate-700/80">
        <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg sm:text-xl font-bold font-display text-slate-900 dark:text-white">
            Active Competitions
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">Join a room in progress or waiting to start</p>

          {/* Soft cue when ?session= param present */}
          {sessionParam && sessionTitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-2">
              Or scroll down to start a new room for{' '}
              <span className="font-medium text-saradhi-600 dark:text-saradhi-400">{sessionTitle}</span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </p>
          )}
        </div>

        {roomsLoading ? (
          <div className="p-4 sm:p-6">
            <StatCardsSkeleton count={3} />
          </div>
        ) : activeRooms.length === 0 ? (
          <div className="p-8 sm:p-12 text-center">
            <div className="animate-float inline-block text-4xl mb-4">⚔️</div>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              No active competitions right now — be the first to start one!
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {activeRooms.map(room => (
              <div
                key={room.room_code}
                className="p-4 sm:p-6 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors duration-200"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-slate-900 dark:text-white">{room.session_title}</span>
                      <RoomStatusBadge status={room.status} />
                      {room.course_name && (
                        <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">{room.course_name}</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      by {room.creator_name} · {room.player_count || 0} players · {room.time_per_question}s/question
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedRoom(room)}
                    className="bg-slate-600 hover:bg-slate-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm w-full sm:w-auto flex-shrink-0"
                  >
                    View Room →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 2: Start a Competition ─────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-card border border-slate-200/80 dark:border-slate-700/80">
        <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg sm:text-xl font-bold font-display text-slate-900 dark:text-white">
            Start a Competition
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">Pick a session and create your own room</p>
        </div>

        {sessionsLoading ? (
          <div className="p-4 sm:p-6">
            <SessionListSkeleton rows={3} />
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
            No sessions found. Join a session first.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {sessions.map(session => {
              const isExpanded = expandedSession === session.session_id;
              const tpq = timePerQuestion[session.session_id] || 20;
              const qTotal = totalQs(session.session_id);
              const qCounts = getQCounts(session.session_id);
              const isCreating = creating[session.session_id];

              return (
                <div key={session.session_id} className="p-4 sm:p-6 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 dark:text-white">{session.title}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {session.course_name} · {session.teacher_name}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setExpandedSession(isExpanded ? null : session.session_id)}
                      className="bg-saradhi-700 hover:bg-saradhi-600 active:bg-saradhi-800 text-white font-medium w-full sm:w-auto"
                    >
                      {isExpanded ? 'Close' : '+ Create Room'}
                    </Button>
                  </div>

                  {/* Inline form */}
                  {isExpanded && (
                    <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-700/40 rounded-xl border border-slate-200 dark:border-slate-600/60 space-y-4">

                      {/* Seconds per question — preset chips */}
                      <div>
                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">
                          Seconds per question
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {[10, 15, 20, 30, 45, 60].map(t => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setTimePerQuestion(prev => ({ ...prev, [session.session_id]: t }))}
                              className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all duration-150 ${
                                tpq === t
                                  ? 'bg-saradhi-600 border-saradhi-600 text-white shadow-sm'
                                  : 'bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-500 text-slate-600 dark:text-slate-300 hover:border-saradhi-400 hover:text-saradhi-600 dark:hover:border-saradhi-400'
                              }`}
                            >
                              {t}s
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Teacher question count — stepper, only shown when polls exist */}
                      {qCounts.teacherPollCount > 0 && (() => {
                        const maxTq = qCounts.teacherPollCount;
                        const curTq = teacherQCount[session.session_id] !== undefined
                          ? teacherQCount[session.session_id]
                          : maxTq;
                        const setTq = (v) => setTeacherQCount(prev => ({ ...prev, [session.session_id]: Math.min(maxTq, Math.max(0, v)) }));
                        return (
                          <div>
                            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">
                              Questions from teacher's bank
                            </p>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => setTq(curTq - 1)}
                                disabled={curTq <= 0}
                                className="w-8 h-8 rounded-lg border-2 border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-lg flex items-center justify-center hover:border-saradhi-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >−</button>
                              <div className="text-center min-w-[3rem]">
                                <span className="text-xl font-black text-saradhi-700 dark:text-saradhi-300">{curTq}</span>
                                <p className="text-xs text-slate-400 leading-none">of {maxTq}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setTq(curTq + 1)}
                                disabled={curTq >= maxTq}
                                className="w-8 h-8 rounded-lg border-2 border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-lg flex items-center justify-center hover:border-saradhi-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >+</button>
                              <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">teacher questions</span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Question bank panel */}
                      <QuestionBankPanel
                        sessionId={session.session_id}
                        currentUserId={currentUser?.id}
                        onQuestionsChange={(teacherCount, aiCount) =>
                          setQuestionCounts(prev => ({
                            ...prev,
                            [session.session_id]: { teacherPollCount: teacherCount, aiCount }
                          }))
                        }
                      />

                      {/* Total count indicator */}
                      <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-2">
                        {qTotal} questions in this competition
                        <span className="ml-1 text-slate-400 dark:text-slate-500">
                          ({getEffectiveTeacherCount(session.session_id)} from teacher · {qCounts.aiCount} AI-generated)
                        </span>
                      </p>
                      {qTotal === 0 && (
                        <p className="text-xs text-red-500 text-center">
                          No questions available. Generate some with AI first.
                        </p>
                      )}

                      <Button
                        onClick={() => handleCreateRoom(session.session_id)}
                        disabled={isCreating || qTotal === 0}
                        className="w-full bg-saradhi-700 hover:bg-saradhi-600 active:bg-saradhi-800 text-white font-medium py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isCreating ? 'Creating…' : '▶ Start Competition'}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Role selection modal */}
      {selectedRoom && (
        <RoleSelectionModal
          room={selectedRoom}
          onClose={() => setSelectedRoom(null)}
          onJoin={handleJoinRoom}
          joining={joining}
        />
      )}
    </div>
  );
};

export default CompetitionLobby;
