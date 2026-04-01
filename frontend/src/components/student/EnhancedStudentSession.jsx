import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import LoadingSpinner from '../shared/LoadingSpinner';
import { apiRequest, studentAPI, safeParseUser } from '../../utils/api';
import { Badge } from '../ui/badge';
import { isDemoMode, DemoWebSocket } from '../../utils/demoData';
import KnowledgeCard from './KnowledgeCard';
import RichQuestionRenderer from '../shared/RichQuestionRenderer';
import SolutionStepsViewer from './SolutionStepsViewer';
import PassageView from './PassageView';

// WebSocket URL configuration
const WS_BASE_URL = process.env.REACT_APP_API_URL ?
  process.env.REACT_APP_API_URL.replace('http://', 'ws://').replace('https://', 'wss://').replace('/api', '') :
  'wss://vk-edu-b2.onrender.com';

const EnhancedStudentSession = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePoll, setActivePoll] = useState(null);
  const [activeCluster, setActiveCluster] = useState(null); // passage/case-study cluster

  // State related to poll interaction
  const [answerData, setAnswerData] = useState({});
  const [hasResponded, setHasResponded] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [pollLoading, setPollLoading] = useState(false);

  // New state for synchronized timer
  const [pollEndTime, setPollEndTime] = useState(null);
  const [clockOffset, setClockOffset] = useState(0); // Difference between server and client time
  const [pendingReveal, setPendingReveal] = useState(null); // Store reveal data until timer hits 0

  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [participants, setParticipants] = useState([]);
  const [ws, setWs] = useState(null);

  // Refs to avoid stale closures in WebSocket handlers and timer
  const clockOffsetRef = useRef(0);
  const pollEndTimeRef = useRef(null);
  const pendingRevealRef = useRef(null);
  const pollActivationTimeRef = useRef(null); // For precise response time tracking
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const attendanceTimerRef = useRef(null);
  const wsRef = useRef(null);

  // Attendance + class-ended state
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [attendanceCountdown, setAttendanceCountdown] = useState(0);
  const [attendanceMarked, setAttendanceMarked] = useState(false);
  const [attendanceStatus, setAttendanceStatus] = useState(null); // null | 'present' | 'late'
  const [classEndedNotice, setClassEndedNotice] = useState(false);

  // Knowledge Cards state
  const [knowledgeCard, setKnowledgeCard] = useState(null);       // { questions, answers }
  const [cardActivityActive, setCardActivityActive] = useState(false);
  const [cardActiveState, setCardActiveState] = useState(null);   // { type, pairId, questionHolderId, answerHolderId }

  // Live leaderboard state
  const [liveLeaderboard, setLiveLeaderboard] = useState(null);
  const [leaderboardVisible, setLeaderboardVisible] = useState(false);

  // Session summary overlay
  const [sessionSummary, setSessionSummary] = useState(null);

  // "I'm stuck" state
  const [stuckSent, setStuckSent] = useState(false);

  // Live key points from AI
  const [keyPoints, setKeyPoints] = useState([]);
  const [keyPointsExpanded, setKeyPointsExpanded] = useState(true);

  // Live auto-generated MCQs
  const [liveMcqs, setLiveMcqs] = useState([]);
  const [mcqsExpanded, setMcqsExpanded] = useState(false);

  // Doubt drawer state
  const [doubtDrawerOpen, setDoubtDrawerOpen] = useState(false);
  const [doubtTitle, setDoubtTitle] = useState('');
  const [doubtContent, setDoubtContent] = useState('');
  const [doubtSubmitting, setDoubtSubmitting] = useState(false);
  const [doubtSuccess, setDoubtSuccess] = useState(false);

  useEffect(() => {
    if (!sessionId || sessionId === 'undefined' || sessionId === 'null') {
      const pathParts = location.pathname.split('/');
      const extractedSessionId = pathParts[pathParts.length - 1];

      if (extractedSessionId && extractedSessionId !== 'undefined' && extractedSessionId !== 'null') {
        navigate(`/student/session/${extractedSessionId}`, { replace: true });
        return;
      }
    }

    // Track last visited session so sidebar AI Assistant can deep-link to it
    if (sessionId && sessionId !== 'undefined' && sessionId !== 'null') {
      try { localStorage.setItem('lastSessionId', sessionId); } catch {}
    }

    const currentUser = safeParseUser();
    if (!currentUser || currentUser.role !== 'student') {
      navigate('/auth');
      return;
    }

    fetchSession();
    joinSession();
    setupWebSocketConnection();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (attendanceTimerRef.current) {
        clearInterval(attendanceTimerRef.current);
      }
      if (ws) {
        ws.close();
      }
    };
  }, [sessionId, navigate, location]);

  // Timer effect using absolute time for synchronization
  // pendingReveal accessed via ref to avoid unnecessary interval restarts
  useEffect(() => {
    let timer;
    if (activePoll && pollEndTime) {
      timer = setInterval(() => {
        const adjustedNow = Date.now() + clockOffsetRef.current;
        const remaining = Math.max(0, Math.floor((pollEndTimeRef.current - adjustedNow) / 1000));
        setTimeLeft(remaining);

        if (remaining <= 0) {
          if (pendingRevealRef.current) {
            setShowResults(true);
            setPendingReveal(null);
            pendingRevealRef.current = null;
            dismissPollAfterDelay(5000);
          }
          handleTimeUp();
          clearInterval(timer);
        }
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [activePoll, pollEndTime]);

  // Visibility change handler for background tabs
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && activePoll && pollEndTimeRef.current) {
        const adjustedNow = Date.now() + clockOffsetRef.current;
        const remaining = Math.max(0, Math.floor((pollEndTimeRef.current - adjustedNow) / 1000));
        setTimeLeft(remaining);

        if (remaining <= 0 && pendingRevealRef.current) {
          setShowResults(true);
          setPendingReveal(null);
          pendingRevealRef.current = null;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [activePoll, pollEndTime, clockOffset, pendingReveal]);

  const fetchSession = async () => {
    try {
      const data = await apiRequest(`/sessions/${sessionId}`);
      setSession(data);
      setConnectionStatus('connected');
      fetchParticipants();
    } catch (error) {
      console.error('Error fetching session:', error);
      setSession(null);
      setConnectionStatus('error');
    } finally {
      setLoading(false);
    }
  };

  // Fetch active poll for refresh/reconnection scenarios
  const fetchActivePoll = async () => {
    try {
      const data = await apiRequest(`/sessions/${sessionId}/active-poll`);

      if (data && data.poll_end_time && data.server_time) {
        const localNow = Date.now();
        const offset = data.server_time - localNow;
        const adjustedNow = localNow + offset;
        const remaining = Math.floor((data.poll_end_time - adjustedNow) / 1000);

        if (remaining > 0) {
          setActivePoll(data);
          setClockOffset(offset);
          setPollEndTime(data.poll_end_time);
          setTimeLeft(remaining);
          setHasResponded(false);
          setAnswerData({});
          setShowResults(false);
          setSubmissionResult(null);
          setPendingReveal(null);
        }
      }
    } catch (_) {
      // 404 = no active poll, which is normal
    }
  };

  const joinSession = async () => {
    try {
      const currentUser = safeParseUser();
      if (!currentUser || !currentUser.id) {
        navigate('/auth');
        return;
      }
      await apiRequest(`/sessions/${sessionId}/join`, {
        method: 'POST',
        body: JSON.stringify({ student_id: currentUser.id }),
      });
    } catch (_) {
      // Non-critical — WS join-session handles session tracking
    }
  };

  const fetchParticipants = async () => {
    try {
      const data = await apiRequest(`/sessions/${sessionId}/participants`);
      setParticipants(Array.isArray(data) ? data : (data.participants || []));
    } catch (error) {
      console.error('Error fetching participants:', error);
      setParticipants([]);
    }
  };

  const submitDoubt = async (e) => {
    e.preventDefault();
    if (!doubtTitle.trim() || !doubtContent.trim()) return;
    setDoubtSubmitting(true);
    try {
      await apiRequest('/community/tickets', {
        method: 'POST',
        body: JSON.stringify({ session_id: sessionId, title: doubtTitle.trim(), content: doubtContent.trim() }),
      });
      setDoubtTitle('');
      setDoubtContent('');
      setDoubtSuccess(true);
      setTimeout(() => { setDoubtSuccess(false); setDoubtDrawerOpen(false); }, 2000);
    } catch (_) {}
    finally { setDoubtSubmitting(false); }
  };

  const leaveSession = async () => {
    try {
      const currentUser = safeParseUser();
      if (currentUser && currentUser.id) {
        await apiRequest(`/sessions/${sessionId}/leave`, {
          method: 'POST',
          body: JSON.stringify({ student_id: currentUser.id }),
        });
      }
    } catch (_) {
      // Proceed with navigation even if leave call fails
    } finally {
      if (ws) ws.close();
      navigate('/student/dashboard');
    }
  };

  const setupWebSocketConnection = () => {
    if (!sessionId || sessionId === 'undefined' || sessionId === 'null' || sessionId.trim() === '') {
      return;
    }
    const currentUser = safeParseUser();
    if (!currentUser || !currentUser.id) {
      return;
    }

    const WebSocketClass = isDemoMode() ? DemoWebSocket : WebSocket;
    const token = localStorage.getItem('authToken');
    const websocket = new WebSocketClass(isDemoMode() ? WS_BASE_URL : `${WS_BASE_URL}?token=${token}`);
    wsRef.current = websocket;
    setWs(websocket);

    websocket.onopen = () => {
      reconnectAttemptsRef.current = 0;
      setConnectionStatus('connected');
      const joinMessage = {
        type: 'join-session',
        sessionId: sessionId.toString(),
        studentId: currentUser.id
      };
      websocket.send(JSON.stringify(joinMessage));
      updateConnectionStatus('online');

      // Also fetch active poll via API as a backup (for page refresh scenarios)
      // The WebSocket join-session will also send active poll, but this is a fallback
      setTimeout(() => {
        fetchActivePoll();
      }, 500); // Small delay to let WebSocket message arrive first
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'poll-activated':
          {
            if (!data.poll) break;
            window.dispatchEvent(new CustomEvent('saradhi:notification', { detail: { type: 'poll', title: 'New poll — answer now!', body: data.poll.question } }));
            setActivePoll(data.poll);
            setActiveCluster(data.cluster || null);
            setHasResponded(false);
            setAnswerData({});
            setShowResults(false);
            setSubmissionResult(null);
            setPendingReveal(null);
            pendingRevealRef.current = null;
            pollActivationTimeRef.current = Date.now();

            if (data.poll_end_time && data.server_time) {
              const localNow = Date.now();
              const offset = data.server_time - localNow;
              clockOffsetRef.current = offset;
              pollEndTimeRef.current = data.poll_end_time;
              setClockOffset(offset);
              setPollEndTime(data.poll_end_time);

              const adjustedNow = localNow + offset;
              const remaining = Math.max(0, Math.floor((data.poll_end_time - adjustedNow) / 1000));
              setTimeLeft(remaining);
            } else {
              const endTime = Date.now() + (data.poll.time_limit || 60) * 1000;
              pollEndTimeRef.current = endTime;
              clockOffsetRef.current = 0;
              setTimeLeft(data.poll.time_limit || 60);
              setPollEndTime(endTime);
            }
          }
          break;
        case 'poll-deactivated':
          setActivePoll(null);
          setActiveCluster(null);
          setPollEndTime(null);
          setPendingReveal(null);
          pollEndTimeRef.current = null;
          pendingRevealRef.current = null;
          pollActivationTimeRef.current = null;
          break;
        case 'reveal-answers':
          if (data.sessionId && sessionId && data.sessionId.toUpperCase() === sessionId.toUpperCase()) {
            const adjustedNow = Date.now() + clockOffsetRef.current;
            const remaining = pollEndTimeRef.current ? Math.floor((pollEndTimeRef.current - adjustedNow) / 1000) : 0;

            if (remaining <= 1) {
              setShowResults(true);
              setPendingReveal(null);
              pendingRevealRef.current = null;
              dismissPollAfterDelay(5000);
            } else {
              pendingRevealRef.current = data;
              setPendingReveal(data);
            }
          }
          break;
        case 'participant-count-updated':
          fetchParticipants();
          break;
        case 'class-ended':
          window.dispatchEvent(new CustomEvent('saradhi:notification', { detail: { type: 'class', title: 'Class ended', body: 'Check your session summary.' } }));
          setClassEndedNotice(true);
          setTimeout(() => navigate('/student/dashboard'), 2000);
          break;
        case 'attendance-opened':
          {
            window.dispatchEvent(new CustomEvent('saradhi:notification', { detail: { type: 'attendance', title: 'Mark your attendance', body: 'Attendance window is now open.' } }));
            const closesAt = data.closesAt;
            // Use clock offset for accurate countdown (closesAt is a server timestamp)
            const adjustedNowAtt = Date.now() + clockOffsetRef.current;
            const remaining = Math.max(0, Math.floor((closesAt - adjustedNowAtt) / 1000));
            setAttendanceCountdown(remaining);
            setAttendanceOpen(true);
            setAttendanceMarked(false);
            if (attendanceTimerRef.current) clearInterval(attendanceTimerRef.current);
            attendanceTimerRef.current = setInterval(() => {
              const adjNow = Date.now() + clockOffsetRef.current;
              const rem = Math.max(0, Math.floor((closesAt - adjNow) / 1000));
              setAttendanceCountdown(rem);
              if (rem <= 0) {
                clearInterval(attendanceTimerRef.current);
                setAttendanceOpen(false);
              }
            }, 1000);
          }
          break;
        case 'attendance-closed':
          window.dispatchEvent(new CustomEvent('saradhi:notification', { detail: { type: 'attendance', title: 'Attendance window closed' } }));
          if (attendanceTimerRef.current) clearInterval(attendanceTimerRef.current);
          setAttendanceOpen(false);
          break;
        case 'attendance-mark-ack':
          setAttendanceMarked(true);
          setAttendanceStatus('present');
          setAttendanceOpen(false);
          if (attendanceTimerRef.current) clearInterval(attendanceTimerRef.current);
          break;
        case 'attendance-late-join':
          setAttendanceStatus('late');
          break;

        // ── Knowledge Cards ──────────────────────────────────────────────
        case 'cards-distribute':
          if (data.card) {
            window.dispatchEvent(new CustomEvent('saradhi:notification', { detail: { type: 'cards', title: 'Knowledge cards ready', body: 'Review your knowledge cards.' } }));
            setKnowledgeCard(data.card);
            setCardActivityActive(true);
            setCardActiveState(null);
          }
          break;
        case 'card-activate-question':
          setCardActiveState({ type: 'question', pairId: data.pairId, questionHolderId: data.questionHolderId });
          break;
        case 'card-reveal-answer':
          setCardActiveState({ type: 'answer', pairId: data.pairId, answerHolderId: data.answerHolderId, questionHolderId: cardActiveState?.questionHolderId });
          break;
        case 'card-vote-result':
          // vote results update silently (shown in card)
          break;
        case 'cards-round-complete':
          setCardActiveState(prev => prev ? { ...prev, type: 'complete' } : null);
          break;
        case 'cards-activity-end':
          setCardActivityActive(false);
          setKnowledgeCard(null);
          setCardActiveState(null);
          break;

        case 'key-points-update':
          if (data.keyPoints && Array.isArray(data.keyPoints)) {
            setKeyPoints(prev => [...data.keyPoints, ...prev]);
            window.dispatchEvent(new CustomEvent('saradhi:notification', {
              detail: { type: 'keypoints', title: 'New key points', body: data.keyPoints[0] }
            }));
          }
          break;

        case 'mcqs-generated':
          if (data.mcqs && Array.isArray(data.mcqs) && data.mcqs.length > 0) {
            setLiveMcqs(prev => [...data.mcqs, ...prev]);
            setMcqsExpanded(true);
            window.dispatchEvent(new CustomEvent('saradhi:notification', {
              detail: { type: 'mcq', title: 'Practice questions ready', body: `${data.mcqs.length} new MCQs available` }
            }));
          }
          break;

        case 'notes-ready':
          // Class notes are ready — student can find them in the Resources page
          if (data.sessionId && data.sessionId.toUpperCase() === sessionId?.toUpperCase()) {
            window.dispatchEvent(new CustomEvent('saradhi:notification', { detail: { type: 'notes', title: 'Session notes ready', body: 'View them in Resources.' } }));
            toast?.success?.('Class notes are ready! View them in Resources.');
          }
          break;

        // ── Stuck ────────────────────────────────────────────────────────
        case 'stuck-ack':
          // server confirmed; keep button in "sent" state
          break;
        case 'stuck-update':
          // Teacher reset the count — allow student to signal again
          if (data.count === 0) setStuckSent(false);
          break;

        // ── Leaderboard ──────────────────────────────────────────────────
        case 'leaderboard-update':
          setLiveLeaderboard(data.leaderboard);
          break;
        case 'leaderboard-visibility':
          if (data.visible) window.dispatchEvent(new CustomEvent('saradhi:notification', { detail: { type: 'gamification', title: 'Leaderboard visible', body: 'Check your rank!' } }));
          setLeaderboardVisible(!!data.visible);
          break;

        case 'server-restarting':
          // Server is doing a graceful deploy — reconnect logic in onclose will handle it
          // Reset reconnect counter so we get fresh exponential backoff
          reconnectAttemptsRef.current = 0;
          setConnectionStatus('reconnecting');
          break;

        default:
          break;
      }
    };

    websocket.onclose = () => {
      setConnectionStatus('disconnected');
      updateConnectionStatus('offline');

      // Exponential backoff reconnection: 3s, 6s, 12s…30s max — stop after 10 attempts
      const attempt = reconnectAttemptsRef.current;
      if (attempt >= 10) {
        setConnectionStatus('failed');
        return;
      }
      const delay = Math.min(3000 * Math.pow(2, attempt), 30000);
      reconnectAttemptsRef.current = attempt + 1;
      reconnectTimeoutRef.current = setTimeout(() => {
        setupWebSocketConnection();
      }, delay);
    };

    websocket.onerror = () => {
      setConnectionStatus('error');
      updateConnectionStatus('offline');
    };

    const heartbeatInterval = setInterval(() => {
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({
          type: 'heartbeat',
          sessionId: sessionId.toString(),
          studentId: currentUser.id
        }));
        updateLastActivity();
      }
    }, 30000);

    return () => clearInterval(heartbeatInterval);
  };

  const updateConnectionStatus = async (status) => {
    try {
      const currentUser = safeParseUser();
      if (currentUser && currentUser.id) {
        await apiRequest(`/sessions/${sessionId}/update-connection`, {
          method: 'POST',
          body: JSON.stringify({
            student_id: currentUser.id,
            connection_status: status,
          }),
        });
      }
    } catch (_) {}
  };

  const updateLastActivity = async () => {
    try {
      const currentUser = safeParseUser();
      if (currentUser && currentUser.id) {
        await apiRequest(`/sessions/${sessionId}/update-activity`, {
          method: 'POST',
          body: JSON.stringify({ student_id: currentUser.id }),
        });
      }
    } catch (_) {}
  };

  const hasPollAnswer = (data, questionType) => {
    if (!data || Object.keys(data).length === 0) return false;
    const qt = questionType || 'mcq';
    if (qt === 'mcq' || qt === 'true_false') return data.selected_option !== undefined;
    if (qt === 'numeric') return data.value !== undefined && data.value !== '';
    if (qt === 'code') return data.selected_option !== undefined || !!(data.text?.trim());
    return !!(data.text?.trim());
  };

  const submitResponse = async () => {
    if (!hasPollAnswer(answerData, activePoll?.question_type) || hasResponded || pollLoading) return;
    setPollLoading(true);

    try {
      const currentUser = safeParseUser();
      if (!currentUser || !currentUser.id) {
        setPollLoading(false);
        return;
      }

      const responseTimeMs = pollActivationTimeRef.current
        ? Date.now() - pollActivationTimeRef.current
        : (activePoll.time_limit || 60) * 1000 - timeLeft * 1000;

      const result = await studentAPI.submitPollResponse(
        currentUser.id,
        activePoll.id,
        answerData,
        responseTimeMs
      );

      setHasResponded(true);
      setSubmissionResult(result);
      updateLastActivity();
    } catch (error) {
      console.error('Error submitting answer:', error);
      setHasResponded(true);
      setSubmissionResult({ is_correct: false, error: 'Submission failed' });
    } finally {
      setPollLoading(false);
    }
  };

  const dismissPollAfterDelay = (delayMs = 5000) => {
    setTimeout(() => {
      setActivePoll(null);
      setShowResults(false);
      setAnswerData({});
      setHasResponded(false);
      setPendingReveal(null);
      pendingRevealRef.current = null;
      pollEndTimeRef.current = null;
      setPollEndTime(null);
      setTimeLeft(null);
    }, delayMs);
  };

  const handleTimeUp = () => {
    // If we have a pending reveal, show it now
    if (pendingReveal) {
      setShowResults(true);
      setPendingReveal(null);
      dismissPollAfterDelay(5000);
    }
  };

  const markAttendance = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'mark-attendance' }));
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };


  if (loading) {
    return <LoadingSpinner text="Joining session..." />;
  }

  if (!session) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 sm:p-6 text-center">
          <h2 className="text-lg sm:text-xl font-semibold text-red-800 dark:text-red-300 mb-2">Session Not Found</h2>
          <p className="text-sm sm:text-base text-red-600 dark:text-red-400 mb-4">The session you're trying to join doesn't exist or has ended.</p>
          <button
            onClick={() => navigate('/student/dashboard')}
            className="w-full sm:w-auto bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-medium py-2.5 sm:py-2 px-4 rounded-lg"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const currentUser = safeParseUser();

  const handleCardVote = async (pairId, vote) => {
    try {
      await apiRequest('/knowledge-cards/vote', { method: 'POST', body: JSON.stringify({ pairId, vote }) });
    } catch (err) {
      console.error('Vote error:', err);
    }
  };

  return (
    <>
    {/* Knowledge Card Overlay — z-60, above everything */}
    {cardActivityActive && knowledgeCard && (
      <KnowledgeCard
        card={knowledgeCard}
        activeState={cardActiveState}
        currentUserId={currentUser?.id}
        onVote={handleCardVote}
        onClose={() => setCardActivityActive(false)}
      />
    )}

    {/* Live Leaderboard Panel — shown when teacher enables it */}
    {leaderboardVisible && liveLeaderboard && liveLeaderboard.length > 0 && (
      <div className="fixed top-4 right-4 z-50 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-3 py-2 flex items-center gap-2">
          <span>&#127942;</span>
          <span className="text-sm font-semibold">Live Rankings</span>
        </div>
        <div className="p-2 space-y-1">
          {liveLeaderboard.slice(0, 5).map((entry, i) => (
            <div key={entry.studentId} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs
              ${String(entry.studentId) === String(currentUser?.id) ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}>
              <span className="w-5 font-bold text-slate-500">#{entry.rank}</span>
              <span className="flex-1 truncate text-slate-800 dark:text-slate-200 font-medium">
                {String(entry.studentId) === String(currentUser?.id) ? 'You' : entry.studentName}
              </span>
              <span className="font-bold text-primary-600 dark:text-primary-400">{entry.points}</span>
            </div>
          ))}
        </div>
      </div>
    )}

    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6 p-3 sm:p-4">
      {/* Session Header */}
      <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white truncate">{session.title}</h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm sm:text-base">{session.course_name}</p>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2">Teacher: {session.teacher_name || 'Loading...'}</p>
          </div>
          <div className="flex items-center justify-start sm:justify-end gap-4 sm:gap-4">
            <div className="flex-shrink-0">
              {connectionStatus === 'connected'
                ? <Badge variant="live" dot>Connected</Badge>
                : <Badge variant="ended" dot>Disconnected</Badge>
              }
            </div>
            <div className="text-center flex-shrink-0">
              <div className="text-base sm:text-lg font-bold text-primary-600">
                {Array.isArray(participants) ? participants.filter(p => p.is_active).length : 0}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Online</div>
            </div>
          </div>
        </div>
      </div>

      {/* Class Ended Notice */}
      {classEndedNotice && (
        <div className="bg-slate-800 dark:bg-slate-900 rounded-lg shadow-md border border-slate-600 p-4 sm:p-6 text-center">
          <p className="text-white font-medium text-base sm:text-lg">The teacher has ended the class.</p>
          <p className="text-slate-400 text-sm mt-1">Redirecting to dashboard...</p>
        </div>
      )}

      {/* Attendance Banner */}
      {attendanceOpen && !attendanceMarked && (
        <div className="bg-primary-600 dark:bg-primary-700 rounded-lg p-4 sm:p-6 text-white shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold">Attendance</h2>
              <p className="text-sm text-primary-100">Teacher is taking attendance!</p>
              <p className="text-primary-200 text-sm tabular-nums">Closes in: <b>{attendanceCountdown}s</b></p>
            </div>
            <button
              onClick={markAttendance}
              className="w-full sm:w-auto bg-white text-primary-700 hover:bg-primary-50 active:bg-primary-100 font-bold py-3 px-6 rounded-xl text-base sm:text-lg"
            >
              Mark Present ✓
            </button>
          </div>
        </div>
      )}

      {/* Attendance Status - Present */}
      {attendanceStatus === 'present' && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm sm:text-base font-medium text-green-800 dark:text-green-300">Attendance marked as Present</span>
          </div>
        </div>
      )}

      {/* Attendance Status - Late */}
      {attendanceStatus === 'late' && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-sm sm:text-base font-medium text-yellow-800 dark:text-yellow-300">You joined after attendance was taken. Marked as Late.</span>
          </div>
        </div>
      )}

      {/* Live Key Points */}
      {keyPoints.length > 0 && (
        <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass overflow-hidden">
          <button
            onClick={() => setKeyPointsExpanded(prev => !prev)}
            className="w-full flex items-center justify-between px-4 sm:px-6 py-3 text-left"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                Key Takeaways ({keyPoints.length})
              </h3>
            </div>
            <svg
              className={`w-4 h-4 text-slate-400 transition-transform ${keyPointsExpanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {keyPointsExpanded && (
            <div className="px-4 sm:px-6 pb-4 space-y-2">
              {keyPoints.map((point, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">{point}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Live Auto-Generated MCQs */}
      {liveMcqs.length > 0 && (
        <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass overflow-hidden">
          <button
            onClick={() => setMcqsExpanded(prev => !prev)}
            className="w-full flex items-center justify-between px-4 sm:px-6 py-3 text-left"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
              <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                Practice Questions ({liveMcqs.length})
              </h3>
            </div>
            <svg
              className={`w-4 h-4 text-slate-400 transition-transform ${mcqsExpanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {mcqsExpanded && (
            <div className="px-4 sm:px-6 pb-4 space-y-4">
              {liveMcqs.map((mcq, i) => {
                const options = typeof mcq.options === 'string' ? JSON.parse(mcq.options) : mcq.options;
                return (
                  <div key={mcq.id || i} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                    <p className="text-sm font-medium text-slate-900 dark:text-white mb-2">{mcq.question}</p>
                    <div className="space-y-1">
                      {options.map((opt, j) => (
                        <div
                          key={j}
                          className={`text-xs px-2.5 py-1.5 rounded ${
                            j === mcq.correct_answer
                              ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 font-medium'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {String.fromCharCode(65 + j)}. {opt}
                        </div>
                      ))}
                    </div>
                    {mcq.justification && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 italic">{mcq.justification}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Active Poll */}
      {activePoll ? (
        <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6">
          {/* Poll Header with Timer */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4 sm:mb-6">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">Live Poll</h2>
            {!hasResponded && timeLeft > 0 && (
              <div className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg ${timeLeft <= 10 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-orange-100 dark:bg-orange-900/30'}`}>
                <svg className={`w-5 h-5 sm:w-6 sm:h-6 ${timeLeft <= 10 ? 'text-red-600 animate-pulse' : 'text-orange-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span className={`text-lg sm:text-xl font-bold ${timeLeft <= 10 ? 'text-red-600' : 'text-orange-600'}`}>
                  {formatTime(timeLeft)}
                </span>
              </div>
            )}
          </div>

          {activeCluster && <PassageView cluster={activeCluster} />}

          <div className="mb-4 sm:mb-6">
            <RichQuestionRenderer
              poll={activePoll}
              answerData={answerData}
              onAnswer={setAnswerData}
              disabled={hasResponded || timeLeft <= 0}
            />
          </div>

          {/* Submit button */}
          {hasPollAnswer(answerData, activePoll?.question_type) && !hasResponded && timeLeft > 0 && (
            <div className="mt-4">
              <button
                onClick={submitResponse}
                disabled={pollLoading}
                className="w-full sm:w-auto sm:mx-auto sm:flex sm:px-8 py-3 sm:py-3 text-base sm:text-lg bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white font-medium rounded-lg transition-colors duration-200 disabled:bg-primary-300"
              >
                {pollLoading ? 'Submitting...' : 'Submit Answer'}
              </button>
            </div>
          )}

          {/* Submitting in progress */}
          {hasResponded && !submissionResult && (
            <div className="text-center py-3 sm:py-4 text-primary-600">
              <p className="font-medium text-sm sm:text-base">Submitting answer...</p>
            </div>
          )}

          {/* Submitted — waiting for timer to end */}
          {hasResponded && submissionResult && !showResults && (
            <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-3 sm:p-4 mt-4">
              <div className="flex items-center justify-center gap-2">
                <svg className="h-5 w-5 sm:h-6 sm:w-6 text-primary-600 dark:text-primary-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium text-sm sm:text-base text-primary-800 dark:text-primary-300">
                  Answer submitted! Results will be revealed when the timer ends.
                </span>
              </div>
            </div>
          )}

          {/* Results revealed — show correct/wrong + justification */}
          {hasResponded && submissionResult && showResults && (() => {
            const isManual = submissionResult.is_correct === null;
            const isCorrect = submissionResult.is_correct === true;
            const colorCls = isManual
              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
              : isCorrect
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
            const textCls = isManual
              ? 'text-blue-800 dark:text-blue-300'
              : isCorrect ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300';
            const subTextCls = isManual
              ? 'text-blue-700 dark:text-blue-400'
              : isCorrect ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400';
            const qt = activePoll.question_type || 'mcq';
            const meta = activePoll.options_metadata || {};
            let correctAnswerLine = null;
            if (qt === 'mcq' || qt === 'true_false') {
              const idx = activePoll.correct_answer;
              const label = qt === 'true_false'
                ? activePoll.options?.[idx]
                : `${String.fromCharCode(65 + idx)}. ${activePoll.options?.[idx]}`;
              correctAnswerLine = <><strong>Correct Answer:</strong> {label}</>;
            } else if (qt === 'fill_blank' || qt === 'one_word') {
              correctAnswerLine = <><strong>Accepted:</strong> {(meta.accepted_answers || []).join(' / ')}</>;
            } else if (qt === 'numeric') {
              correctAnswerLine = <><strong>Correct Value:</strong> {meta.correct_value}{meta.unit ? ` ${meta.unit}` : ''} (±{meta.tolerance ?? 0})</>;
            } else if (qt === 'code') {
              if (meta.code_mode === 'fill_blank') {
                correctAnswerLine = <><strong>Accepted:</strong> {(meta.accepted_answers || []).join(' / ')}</>;
              } else {
                const idx = activePoll.correct_answer;
                correctAnswerLine = <><strong>Correct:</strong> {String.fromCharCode(65 + idx)}. {activePoll.options?.[idx]}</>;
              }
            }
            return (
              <div className={`border rounded-lg p-3 sm:p-4 mt-4 ${colorCls}`}>
                <div className="flex items-center">
                  <svg className={`h-5 w-5 sm:h-6 sm:w-6 mr-2 flex-shrink-0 ${textCls}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {isManual
                      ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      : isCorrect
                        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    }
                  </svg>
                  <span className={`font-medium text-sm sm:text-base ${textCls}`}>
                    {isManual ? 'Submitted! Your answer will be reviewed.' : isCorrect ? 'Correct! Well done!' : 'Incorrect, but good try!'}
                  </span>
                </div>
                {correctAnswerLine && (
                  <div className={`mt-3 text-xs sm:text-sm ${subTextCls}`}>{correctAnswerLine}</div>
                )}
                {activePoll.justification && (
                  <div className={`mt-3 text-xs sm:text-sm ${subTextCls}`}>
                    <strong>Explanation:</strong> {activePoll.justification}
                  </div>
                )}
                {activePoll.solution_steps && activePoll.solution_steps.length > 0 && (
                  <SolutionStepsViewer steps={activePoll.solution_steps} />
                )}
              </div>
            );
          })()}

          {/* Time's up without answering */}
          {timeLeft === 0 && !hasResponded && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 sm:p-4 text-center text-red-700 dark:text-red-400 mt-4">
              <p className="font-medium text-sm sm:text-base">Time's up! You can no longer respond to this poll.</p>
              {showResults && (() => {
                const qt = activePoll.question_type || 'mcq';
                const meta = activePoll.options_metadata || {};
                let correctAnswerLine = null;
                if (qt === 'mcq' || qt === 'true_false') {
                  const idx = activePoll.correct_answer;
                  const label = qt === 'true_false'
                    ? activePoll.options?.[idx]
                    : `${String.fromCharCode(65 + idx)}. ${activePoll.options?.[idx]}`;
                  correctAnswerLine = <><strong>Correct Answer:</strong> {label}</>;
                } else if (qt === 'fill_blank' || qt === 'one_word') {
                  correctAnswerLine = <><strong>Accepted:</strong> {(meta.accepted_answers || []).join(' / ')}</>;
                } else if (qt === 'numeric') {
                  correctAnswerLine = <><strong>Correct Value:</strong> {meta.correct_value}{meta.unit ? ` ${meta.unit}` : ''}</>;
                }
                return (
                  <>
                    {correctAnswerLine && (
                      <div className="mt-3 text-xs sm:text-sm text-red-700 dark:text-red-400">{correctAnswerLine}</div>
                    )}
                    {activePoll.justification && (
                      <div className="mt-3 text-xs sm:text-sm text-red-700 dark:text-red-400">
                        <strong>Explanation:</strong> {activePoll.justification}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

        </div>
      ) : (
        <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-6 sm:p-8 text-center">
          <div className="text-slate-400 mb-4">
            <svg className="w-12 h-12 sm:w-16 sm:h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
          </div>
          <h3 className="text-base sm:text-lg font-medium text-slate-900 dark:text-white mb-2">Waiting for Poll</h3>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">Your teacher will start a poll soon. Stay connected!</p>
        </div>
      )}

      {/* Session Controls */}
      <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h3 className="text-base sm:text-lg font-medium text-slate-900 dark:text-white">Session Controls</h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">Manage your session participation</p>
          </div>
          <div className="grid grid-cols-2 sm:flex gap-2 sm:gap-4">
            <button
              onClick={() => { setDoubtDrawerOpen(true); setDoubtSuccess(false); }}
              className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-medium py-2.5 sm:py-2 px-3 sm:px-4 rounded-lg text-sm sm:text-base"
            >
              Post a Doubt
            </button>
            <button
              onClick={leaveSession}
              className="bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-medium py-2.5 sm:py-2 px-3 sm:px-4 rounded-lg text-sm sm:text-base"
            >
              Leave Session
            </button>
          </div>
        </div>
      </div>
    </div>

    {/* Floating FABs — bottom-right stack */}
    {/* "I'm Stuck" button — above the doubt FAB */}
    <button
      onClick={() => {
        if (stuckSent || !ws) return;
        ws.send(JSON.stringify({ type: 'student-stuck', sessionId }));
        setStuckSent(true);
      }}
      title={stuckSent ? "Signal sent to teacher" : "Signal teacher you're confused"}
      className={`fixed bottom-24 right-6 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-xl text-sm font-semibold transition-all
        ${stuckSent
          ? 'bg-orange-100 text-orange-700 border border-orange-300 cursor-default'
          : 'bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white hover:scale-105'
        }`}
    >
      <span className="text-base">✋</span>
      {stuckSent ? "Signal sent!" : "I'm stuck"}
    </button>

    {/* Floating Doubt FAB — always visible bottom-right */}
    <button
      onClick={() => { setDoubtDrawerOpen(true); setDoubtSuccess(false); }}
      title="Post a Doubt"
      className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-full shadow-xl flex items-center justify-center transition-transform hover:scale-105"
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </button>

    {/* Doubt Drawer — slides up from bottom-right */}
    {doubtDrawerOpen && (
      <div className="fixed bottom-0 right-0 sm:bottom-6 sm:right-6 z-50 w-full sm:w-96">
        <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Post a Doubt</h3>
            </div>
            <button
              onClick={() => setDoubtDrawerOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          {doubtSuccess ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 gap-3">
              <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <svg className="w-7 h-7 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">Doubt posted!</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Your classmates can now see and answer it.</p>
            </div>
          ) : (
            <form onSubmit={submitDoubt} className="p-4 space-y-3">
              <div>
                <input
                  type="text"
                  value={doubtTitle}
                  onChange={(e) => setDoubtTitle(e.target.value)}
                  placeholder="Short title, e.g. 'What is LIFO?'"
                  maxLength={255}
                  required
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-400"
                />
              </div>
              <div>
                <textarea
                  value={doubtContent}
                  onChange={(e) => setDoubtContent(e.target.value)}
                  placeholder="Describe your doubt in detail..."
                  rows={4}
                  required
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none placeholder-gray-400"
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={doubtSubmitting || !doubtTitle.trim() || !doubtContent.trim()}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60 transition-colors"
                >
                  {doubtSubmitting ? 'Posting…' : 'Post Doubt'}
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/community/session/${sessionId}`)}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap px-2"
                >
                  View all →
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    )}
    </>
  );
};

export default EnhancedStudentSession;
