import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { apiRequest, sessionAPI, pollAPI, resourceAPI, safeParseUser } from '../../utils/api';
import { Badge } from '../ui/badge';
import LoadingSpinner from '../shared/LoadingSpinner';
import GeneratedMCQs from './GeneratedMCQs';
import DoubtsDashboard from './DoubtsDashboard';
import AudioRecorder from './AudioRecorder';
import KnowledgeCards from './KnowledgeCards';
import PollPanel from './PollPanel';
import ManualGradingPanel from './ManualGradingPanel';
import AttendancePanel from './AttendancePanel';
import NotesPanel from './NotesPanel';
import SummaryPanel from './SummaryPanel';
import ProjectSuggestionsPanel from './ProjectSuggestionsPanel';
import useAudioRecorder from '../../hooks/useAudioRecorder';

// WebSocket URL configuration
const WS_BASE_URL = process.env.REACT_APP_API_URL ?
  process.env.REACT_APP_API_URL.replace('http://', 'ws://').replace('https://', 'wss://').replace('/api', '') :
  'ws://localhost:3001';

const EnhancedSessionManagement = () => {
  const { sessionId } = useParams();

  // Helper to safely compare session IDs (guards against nullish values)
  const isCurrentSession = (dataSessionId) => {
    if (!sessionId || !dataSessionId) return false;
    return dataSessionId.toUpperCase() === sessionId.toUpperCase();
  };
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [participants, setParticipants] = useState([]);
  const [generatedMCQs, setGeneratedMCQs] = useState([]);
  const [polls, setPolls] = useState([]);
  const [activePoll, setActivePoll] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [pollStats, setPollStats] = useState({});
  const [liveResponseCount, setLiveResponseCount] = useState(0);
  const [pollPanelInitialData, setPollPanelInitialData] = useState(null);
  const [gradingPoll, setGradingPoll] = useState(null); // poll to manually grade

  // AI Project Lab badge (new suggestions or assignment notifications)
  const [newProjectsBadge, setNewProjectsBadge] = useState(0);

  // Activity tracking state
  const [lastSegmentTime, setLastSegmentTime] = useState(null);
  const [segmentCount, setSegmentCount] = useState(0);
  const [newMCQsCount, setNewMCQsCount] = useState(0);
  const [activityPulse, setActivityPulse] = useState(false);

  // Live class control state
  const [isGoingLive, setIsGoingLive] = useState(false);

  // Notes generation state
  const [notesStatus, setNotesStatus] = useState('none'); // 'none'|'generating'|'ready'|'failed'|'timeout'
  const [notesUrl, setNotesUrl] = useState(null);
  const [notesElapsed, setNotesElapsed] = useState(0); // seconds elapsed since generating started
  const notesPollingRef = useRef(null);
  const notesElapsedRef = useRef(null);

  // Session resources for notes generation selection
  const [sessionResources, setSessionResources] = useState([]);
  const [selectedResourceIds, setSelectedResourceIds] = useState(new Set());

  // Session lock state
  const [isLocked, setIsLocked] = useState(false);
  const [lockLoading, setLockLoading] = useState(false);

  // AI session summary state
  const [summaryStatus, setSummaryStatus] = useState('none'); // 'none'|'generating'|'completed'|'failed'
  const [summaryText, setSummaryText] = useState(null);
  const summaryPollingRef = useRef(null);

  // Track previous online count to only notify on actual joins (not every heartbeat update)
  const prevOnlineCountRef = useRef(0);
  // Skip notification on first count update (existing students when teacher opens the page)
  const isInitialCountRef = useRef(true);

  // Live participant count (from WebSocket)
  const [onlineCount, setOnlineCount] = useState(0);
  const [presentCount, setPresentCount] = useState(0);
  const [stuckCount, setStuckCount] = useState(0);

  // Attendance state
  const [attendanceWindowOpen, setAttendanceWindowOpen] = useState(false);
  const [attendanceDuration, setAttendanceDuration] = useState(60);
  const [attendanceCountdown, setAttendanceCountdown] = useState(0);
  const [attendanceCounts, setAttendanceCounts] = useState({ present: 0, late: 0, absent: 0 });
  const [attendanceList, setAttendanceList] = useState([]);
  const attendanceTimerRef = useRef(null);

  const wsRef = useRef(null);
  const wsReconnectAttemptsRef = useRef(0);
  const wsReconnectTimeoutRef = useRef(null);
  const pollDismissTimeoutRef = useRef(null);

  // Initialize audio recorder hook
  const audioRecorder = useAudioRecorder(sessionId);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const currentUser = safeParseUser();
    if (!currentUser || currentUser.role !== 'teacher') {
      navigate('/auth');
      return;
    }

    fetchSession();
    fetchParticipants();
    fetchPolls();
    fetchGeneratedMCQs();
    fetchSessionResources();
    setupWebSocketConnection();


    return () => {
      if (wsReconnectTimeoutRef.current) {
        clearTimeout(wsReconnectTimeoutRef.current);
      }
      if (notesPollingRef.current) {
        clearInterval(notesPollingRef.current);
      }
      if (notesElapsedRef.current) {
        clearInterval(notesElapsedRef.current);
      }
      if (summaryPollingRef.current) {
        clearInterval(summaryPollingRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [sessionId, navigate]);

  useEffect(() => {
    if (activeTab === 'existing-polls') {
      polls.forEach(poll => {
        fetchPollStats(poll.id);
      });
    }
  }, [activeTab, polls]);

  // Refresh relative timestamps every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastSegmentTime) {
        setLastSegmentTime(prev => new Date(prev));
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [lastSegmentTime]);

  const setupWebSocketConnection = () => {
    try {
      const token = localStorage.getItem('authToken');
      const ws = new WebSocket(`${WS_BASE_URL}?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        wsReconnectAttemptsRef.current = 0;
        setWsConnected(true);
        window.socket = ws;

        const currentUser = safeParseUser();
        if (currentUser && currentUser.id) {
          ws.send(JSON.stringify({
            type: 'join-session',
            sessionId: sessionId,
            studentId: currentUser.id,
            role: 'teacher'
          }));
        }
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'participant-count-updated': {
            fetchParticipants();
            const newCount = data.count || 0;
            if (isInitialCountRef.current) {
              // First update after teacher opens the page — just sync the count silently
              isInitialCountRef.current = false;
            } else if (newCount > prevOnlineCountRef.current) {
              window.dispatchEvent(new CustomEvent('saradhi:notification', { detail: { type: 'student', title: 'Student joined', body: `${newCount} student${newCount !== 1 ? 's' : ''} online` } }));
            }
            prevOnlineCountRef.current = newCount;
            setOnlineCount(newCount);
            break;
          }
          case 'stuck-update':
            if ((data.count || 0) > 0) {
              window.dispatchEvent(new CustomEvent('saradhi:notification', { detail: { type: 'stuck', title: `${data.count} student${data.count !== 1 ? 's' : ''} confused`, body: 'Check in with your class.' } }));
            }
            setStuckCount(data.count || 0);
            break;
          case 'attendance-count-updated':
            setAttendanceCounts(data.counts || { present: 0, late: 0, absent: 0 });
            setPresentCount((parseInt(data.counts?.present) || 0) + (parseInt(data.counts?.late) || 0));
            break;
          case 'attendance-closed':
            {
              const total = (parseInt(data.counts?.present) || 0) + (parseInt(data.counts?.late) || 0);
              if (total > 0) {
                window.dispatchEvent(new CustomEvent('saradhi:notification', { detail: { type: 'attendance', title: 'Attendance closed', body: `${total} student${total !== 1 ? 's' : ''} marked attendance.` } }));
              }
            }
            setAttendanceWindowOpen(false);
            if (attendanceTimerRef.current) clearInterval(attendanceTimerRef.current);
            if (data.counts) setAttendanceCounts(data.counts);
            fetchAttendanceList();
            break;
          case 'poll-activated':
            // Cancel any pending dismiss from a previous poll
            if (pollDismissTimeoutRef.current) {
              clearTimeout(pollDismissTimeoutRef.current);
              pollDismissTimeoutRef.current = null;
            }
            setActivePoll(data.poll);
            setLiveResponseCount(0);
            fetchPolls();
            break;
          case 'reveal-answers':
            pollDismissTimeoutRef.current = setTimeout(() => {
              setActivePoll(null);
              setLiveResponseCount(0);
              pollDismissTimeoutRef.current = null;
            }, 15000);
            fetchPolls();
            break;
          case 'poll-response-update':
            if (isCurrentSession(data.sessionId)) {
              window.dispatchEvent(new CustomEvent('saradhi:notification', { detail: { type: 'poll', title: 'Poll response received', body: `${data.responseCount} response${data.responseCount !== 1 ? 's' : ''} so far` } }));
              setLiveResponseCount(data.responseCount);
            }
            break;
          case 'transcript-segment-sent':
            if (isCurrentSession(data.sessionId)) {
              setLastSegmentTime(new Date(data.timestamp));
              setSegmentCount(prev => prev + 1);
              setActivityPulse(true);
              setTimeout(() => setActivityPulse(false), 2000);
            }
            break;
          case 'mcqs-generated':
            if (isCurrentSession(data.sessionId)) {
              window.dispatchEvent(new CustomEvent('saradhi:notification', { detail: { type: 'quiz', title: 'MCQs generated', body: `${data.count} question${data.count !== 1 ? 's' : ''} ready to send.` } }));
              setNewMCQsCount(prev => prev + data.count);
              setActivityPulse(true);
              setTimeout(() => setActivityPulse(false), 2000);
              fetchGeneratedMCQs();
            }
            break;
          case 'mcqs-sent':
            if (isCurrentSession(data.sessionId)) {
              fetchGeneratedMCQs();
              fetchPolls();
            }
            break;
          case 'notes-ready':
            if (isCurrentSession(data.sessionId)) {
              window.dispatchEvent(new CustomEvent('saradhi:notification', { detail: { type: 'notes', title: 'Session notes ready', body: 'Students can now view the notes.' } }));
              setNotesStatus('ready');
              setNotesUrl(data.notesUrl);
              stopNotesPolling();
              toast.success('Class notes are ready for students!');
            }
            break;
          case 'project-suggestions-ready':
            window.dispatchEvent(new CustomEvent('saradhi:project-event', { detail: data }));
            setNewProjectsBadge(c => c + 1);
            break;
          case 'project-notification':
            // Teacher sent it — no-op for their own view
            break;
          case 'server-restarting':
            wsReconnectAttemptsRef.current = 0;
            setWsConnected(false);
            break;
          default:
            break;
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        window.socket = null;
        const attempt = wsReconnectAttemptsRef.current;
        if (attempt >= 10) {
          return;
        }
        const delay = Math.min(3000 * Math.pow(2, attempt), 30000);
        wsReconnectAttemptsRef.current = attempt + 1;
        wsReconnectTimeoutRef.current = setTimeout(() => setupWebSocketConnection(), delay);
      };

      ws.onerror = () => {
        setWsConnected(false);
      };

    } catch (error) {
      console.error('Error setting up teacher WebSocket:', error);
      setWsConnected(false);
    }
  };

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'Unknown';
    const now = new Date();
    const time = new Date(timestamp);
    const diffInSeconds = Math.floor((now - time) / 1000);
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  const fetchSession = async () => {
    try {
      const data = await sessionAPI.getSession(sessionId);
      setSession(data);
      setIsLocked(!!data.locked_at);
      if (data.summary_status && data.summary_status !== 'none') {
        setSummaryStatus(data.summary_status);
        if (data.summary_text) setSummaryText(data.summary_text);
        // If generation was in progress when the page loaded, resume polling
        if (data.summary_status === 'generating') startSummaryPolling();
      }
    } catch (error) {
      console.error('Error fetching session:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSessionResources = async () => {
    try {
      const data = await resourceAPI.getSessionResources(sessionId);
      const resources = (data?.resources || []).filter(r => r.resource_type !== 'auto_notes');
      setSessionResources(resources);
      // Default: select all resources
      setSelectedResourceIds(new Set(resources.map(r => r.id)));
    } catch (error) {
      console.error('Error fetching session resources:', error);
    }
  };

  const fetchParticipants = async () => {
    try {
      const data = await sessionAPI.getParticipants(sessionId);
      setParticipants(Array.isArray(data) ? data : (data.participants || []));
    } catch (error) {
      console.error('Error fetching participants:', error);
      setParticipants([]);
    }
  };

  const fetchPolls = async () => {
    try {
      const data = await apiRequest(`/sessions/${sessionId}/polls`);
      const pollList = data.polls || data;
      const normalized = Array.isArray(pollList) ? pollList.map(p => ({
        ...p,
        correctAnswer: p.correctAnswer !== undefined ? p.correctAnswer : p.correct_answer,
        createdAt: p.createdAt || p.created_at,
        isActive: p.isActive !== undefined ? p.isActive : p.is_active,
        options: Array.isArray(p.options) ? p.options : (typeof p.options === 'string' ? JSON.parse(p.options) : []),
      })) : [];
      setPolls(normalized);
    } catch (error) {
      console.error('Error fetching polls:', error);
      setPolls([]);
    }
  };

  const fetchGeneratedMCQs = async () => {
    try {
      const data = await apiRequest(`/sessions/${sessionId}/generated-mcqs`);
      const mcqs = data.mcqs || data;
      setGeneratedMCQs(Array.isArray(mcqs) ? mcqs : []);
    } catch (error) {
      console.error('Error fetching generated MCQs:', error);
      setGeneratedMCQs([]);
    }
  };

  const fetchAttendanceList = async () => {
    try {
      const data = await apiRequest(`/sessions/${sessionId}/attendance`);
      setAttendanceList(data.participants || []);
      if (data.counts) {
        setAttendanceCounts(data.counts);
        setPresentCount((parseInt(data.counts.present) || 0) + (parseInt(data.counts.late) || 0));
      }
    } catch (error) {
      console.error('Error fetching attendance list:', error);
    }
  };

  const fetchPollStats = async (pollId) => {
    try {
      const stats = await pollAPI.getPollStats(pollId);
      setPollStats(prev => ({ ...prev, [pollId]: stats.data }));
    } catch (error) {
      console.error(`Error fetching stats for poll ${pollId}:`, error);
    }
  };

  const handleGoLive = async () => {
    setIsGoingLive(true);
    try {
      await apiRequest(`/sessions/${sessionId}/live`, {
        method: 'PATCH',
        body: JSON.stringify({ live: true })
      });
      setSession(prev => ({ ...prev, is_live: true }));
    } catch (error) {
      console.error('Error going live:', error);
    } finally {
      setIsGoingLive(false);
    }
  };

  const handleEndClass = async () => {
    setIsGoingLive(true);
    try {
      await apiRequest(`/sessions/${sessionId}/live`, {
        method: 'PATCH',
        body: JSON.stringify({ live: false })
      });
      setSession(prev => ({ ...prev, is_live: false }));
      // Auto-kick off AI summary after class ends
      handleGenerateSummary();
    } catch (error) {
      console.error('Error ending class:', error);
    } finally {
      setIsGoingLive(false);
    }
  };

  const handleToggleLock = async () => {
    setLockLoading(true);
    try {
      const next = !isLocked;
      await sessionAPI.lockSession(sessionId, next);
      setIsLocked(next);
      toast.success(next ? 'Session locked — new students cannot join.' : 'Session unlocked.');
    } catch (error) {
      console.error('Error toggling session lock:', error);
      toast.error('Failed to update session lock.');
    } finally {
      setLockLoading(false);
    }
  };

  const handleGenerateSummary = async () => {
    setSummaryStatus('generating');
    try {
      await sessionAPI.generateSessionSummary(sessionId);
      startSummaryPolling();
    } catch (error) {
      // 409 = already generating (e.g. double-click or post-refresh) — just poll for completion
      if (error.message?.includes('already in progress')) {
        startSummaryPolling();
      } else {
        console.error('Error starting summary generation:', error);
        setSummaryStatus('failed');
      }
    }
  };

  const startSummaryPolling = () => {
    if (summaryPollingRef.current) clearInterval(summaryPollingRef.current);
    summaryPollingRef.current = setInterval(async () => {
      try {
        const data = await sessionAPI.getSessionSummary(sessionId);
        setSummaryStatus(data.status);
        if (data.status === 'completed') {
          clearInterval(summaryPollingRef.current);
          summaryPollingRef.current = null;
          setSummaryText(data.summary);
          toast.success('AI session summary ready!');
        } else if (data.status === 'failed') {
          clearInterval(summaryPollingRef.current);
          summaryPollingRef.current = null;
          toast.error('Summary generation failed.');
        }
      } catch (err) {
        console.error('Summary polling error:', err);
      }
    }, 3000);
  };

  const handleGenerateNotes = async () => {
    try {
      const body = selectedResourceIds.size > 0
        ? JSON.stringify({ selectedResourceIds: Array.from(selectedResourceIds) })
        : JSON.stringify({});
      await apiRequest(`/sessions/${sessionId}/generate-notes`, {
        method: 'POST',
        body,
      });
      setNotesStatus('generating');
      startNotesPolling();
    } catch (error) {
      if (error.message?.includes('already in progress')) {
        setNotesStatus('generating');
        startNotesPolling();
      } else {
        console.error('Error starting notes generation:', error);
        toast.error(`Notes generation failed: ${error.message}`);
      }
    }
  };

  const handleStopNotes = async () => {
    try {
      await apiRequest(`/sessions/${sessionId}/cancel-notes`, { method: 'POST' });
    } catch (error) {
      console.error('Error stopping notes generation:', error);
    } finally {
      stopNotesPolling();
      setNotesStatus('none');
    }
  };

  const stopNotesPolling = () => {
    if (notesPollingRef.current) clearInterval(notesPollingRef.current);
    if (notesElapsedRef.current) clearInterval(notesElapsedRef.current);
  };

  const startNotesPolling = () => {
    stopNotesPolling();
    setNotesElapsed(0);
    const MAX_POLLS = 36; // 36 × 10s = 6 minutes max
    let pollCount = 0;

    // Tick elapsed seconds every second
    notesElapsedRef.current = setInterval(() => {
      setNotesElapsed(s => s + 1);
    }, 1000);

    notesPollingRef.current = setInterval(async () => {
      pollCount++;
      try {
        const data = await apiRequest(`/sessions/${sessionId}/notes`);
        setNotesStatus(data.status);
        if (data.status === 'ready') {
          setNotesUrl(data.url);
          stopNotesPolling();
        } else if (data.status === 'failed') {
          stopNotesPolling();
          toast.error('Notes generation failed. Students can contact their teacher for notes.');
        } else if (pollCount >= MAX_POLLS) {
          stopNotesPolling();
          setNotesStatus('timeout');
        }
      } catch (_) {}
    }, 10000);
  };

  // Load existing notes status on mount and resume polling if still generating
  useEffect(() => {
    apiRequest(`/sessions/${sessionId}/notes`).then(data => {
      if (data && data.status && data.status !== 'none') {
        setNotesStatus(data.status);
        if (data.url) setNotesUrl(data.url);
        if (data.status === 'generating') startNotesPolling();
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const handleOpenAttendance = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      type: 'open-attendance',
      sessionId,
      durationSeconds: attendanceDuration
    }));
    setAttendanceWindowOpen(true);
    setAttendanceCountdown(attendanceDuration);
    if (attendanceTimerRef.current) clearInterval(attendanceTimerRef.current);
    attendanceTimerRef.current = setInterval(() => {
      setAttendanceCountdown(prev => {
        if (prev <= 1) {
          clearInterval(attendanceTimerRef.current);
          setAttendanceWindowOpen(false);
          fetchAttendanceList();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleCloseAttendance = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'close-attendance', sessionId }));
    }
    if (attendanceTimerRef.current) clearInterval(attendanceTimerRef.current);
    setAttendanceWindowOpen(false);
    fetchAttendanceList();
  };

  if (loading) {
    return <LoadingSpinner text="Loading session management..." />;
  }

  if (!session) {
    return <div>Session not found</div>;
  }

  return (
    <>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-4 sm:space-y-6">
      {/* Session Header */}
      <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white truncate">{session.title}</h1>
              {session.is_active ? (
                <Badge variant="live" dot>Active</Badge>
              ) : (
                <Badge variant="ended" dot>Ended</Badge>
              )}
            </div>
            <p className="text-slate-600 dark:text-slate-300 text-sm sm:text-base">{session.course_name}</p>
            <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 mt-1 line-clamp-1">{session.description}</p>
          </div>
          <div className="w-full sm:w-auto">
            <div className="grid grid-cols-3 sm:flex sm:items-center gap-2 sm:gap-4">
              <div className="text-center p-2 bg-primary-50 dark:bg-primary-900/20 rounded-lg sm:bg-transparent dark:sm:bg-transparent sm:p-0">
                <div className="text-lg sm:text-2xl font-bold text-primary-600">{session.session_id}</div>
                <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Join Code</div>
              </div>
              <div className="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded-lg sm:bg-transparent dark:sm:bg-transparent sm:p-0">
                <div className="text-lg sm:text-2xl font-bold text-green-600">{participants.filter(p => p.is_active).length}</div>
                <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Active</div>
              </div>
              <div className="text-center p-2 bg-primary-50 dark:bg-primary-900/20 rounded-lg sm:bg-transparent dark:sm:bg-transparent sm:p-0">
                <div className="text-lg sm:text-2xl font-bold text-primary-600">{polls.length}</div>
                <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Polls</div>
              </div>
            </div>
            <div className="mt-2 text-center sm:text-right">
              {wsConnected ? (
                <Badge variant="live" dot>WS Connected</Badge>
              ) : (
                <Badge variant="ended" dot>WS Disconnected</Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Active Poll Alert */}
      {activePoll && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center min-w-0">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-green-800 dark:text-green-300 font-medium text-sm sm:text-base truncate">Active: {activePoll.question}</span>
              {liveResponseCount > 0 && (
                <span className="ml-2 bg-green-200 dark:bg-green-800 text-green-900 dark:text-green-200 text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                  {liveResponseCount} responded
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* WebSocket Status Alert */}
      {!wsConnected && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 sm:p-4">
          <div className="flex items-start sm:items-center">
            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5 sm:mt-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span className="text-yellow-800 dark:text-yellow-300 font-medium text-xs sm:text-sm">WebSocket Disconnected - Real-time features may not work. Reconnecting...</span>
          </div>
        </div>
      )}

      {/* Activity Status Bar */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 sm:p-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-4">
          {/* Recording Status */}
          <div className="flex items-center space-x-2">
            {audioRecorder.status === 'recording' ? (
              <>
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-semibold text-red-700">🎙️ Recording Active</span>
              </>
            ) : audioRecorder.status === 'paused' ? (
              <>
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                <span className="text-sm font-semibold text-yellow-700">⏸️ Recording Paused</span>
              </>
            ) : (
              <>
                <div className="w-3 h-3 bg-slate-400 rounded-full"></div>
                <span className="text-sm text-slate-600 dark:text-slate-300">Recording Idle</span>
              </>
            )}
          </div>

          {/* Segments Sent Counter */}
          {segmentCount > 0 && (
            <div className="flex items-center space-x-2">
              <span className="text-sm text-slate-700 dark:text-slate-300">
                📝 Segments sent:
                <span className="font-bold ml-1 text-primary-600">{segmentCount}</span>
              </span>
            </div>
          )}

          {/* Last Segment Sent Time */}
          {lastSegmentTime && (
            <div className="flex items-center space-x-2">
              <span className="text-sm text-slate-600 dark:text-slate-300">
                Last: <span className="font-medium text-slate-800 dark:text-slate-200">{formatTimeAgo(lastSegmentTime)}</span>
              </span>
            </div>
          )}

          {/* New MCQs Indicator */}
          {newMCQsCount > 0 && (
            <div className={`flex items-center space-x-2 px-3 py-1 bg-green-100 dark:bg-green-900/30 rounded-full ${activityPulse ? 'animate-pulse' : ''}`}>
              <span className="text-sm font-bold text-green-800 dark:text-green-400">
                🤖 {newMCQsCount} new MCQ{newMCQsCount > 1 ? 's' : ''} generated!
              </span>
              <button
                onClick={() => {
                  setActiveTab('generated-mcqs');
                  setNewMCQsCount(0);
                }}
                className="text-xs text-green-600 hover:text-green-800 dark:text-green-400 font-medium underline"
              >
                View
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass">
        <div className="border-b border-slate-200 dark:border-slate-700">
          <nav className="flex space-x-1 sm:space-x-2 px-3 sm:px-6 overflow-x-auto scrollbar-hide">
            {[
              { id: 'overview', name: 'Overview', icon: '📊' },
              { id: 'audio-transcription', name: 'Audio', icon: '🎙️', badge: segmentCount > 0 ? segmentCount : null, badgeColor: 'bg-green-500' },
              { id: 'polls', name: 'Polls', icon: '📝' },
              { id: 'generated-mcqs', name: 'MCQs', icon: '🤖', badge: newMCQsCount > 0 ? newMCQsCount : null, badgeColor: 'bg-red-500' },
              { id: 'participants', name: 'People', icon: '👥' },
              { id: 'analytics', name: 'Analytics', icon: '📈' },
              { id: 'existing-polls', name: 'Past Polls', icon: '📑' },
              { id: 'ai-doubts', name: 'AI Doubts', icon: '❓' },
              { id: 'knowledge-cards', name: 'Cards', icon: '🃏' },
              { id: 'gamification', name: 'Gamify', icon: '🏆' },
              { id: 'projects', name: 'Projects', icon: '💡', badge: newProjectsBadge > 0 ? newProjectsBadge : null, badgeColor: 'bg-indigo-500' }
            ].map((tab) => (
              <button
                key={tab.id}
                className={`relative py-3 sm:py-4 px-1.5 sm:px-3 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-200'
                }`}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id === 'generated-mcqs') setNewMCQsCount(0);
                  if (tab.id === 'projects') setNewProjectsBadge(0);
                }}
              >
                <span className="mr-1">{tab.icon}</span>
                <span className="hidden sm:inline">{tab.name}</span>
                <span className="sm:hidden">{tab.name.split(' ')[0]}</span>
                {tab.badge && (
                  <span className={`ml-1 sm:ml-1.5 ${tab.badgeColor} text-white text-xs font-bold px-1.5 py-0.5 rounded-full ${activityPulse && tab.id === 'generated-mcqs' ? 'animate-pulse' : ''}`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-4 sm:p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
                <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-3 sm:p-4">
                  <h3 className="font-semibold text-primary-900 dark:text-primary-200 mb-1 sm:mb-2 text-sm sm:text-base">Session Status</h3>
                  <p className="text-primary-700 dark:text-primary-300 text-sm sm:text-base">
                    {session.is_active ? '🟢 Active' : '🔴 Inactive'}
                  </p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 sm:p-4">
                  <h3 className="font-semibold text-green-900 dark:text-green-200 mb-1 sm:mb-2 text-sm sm:text-base">Participants</h3>
                  <p className="text-green-700 dark:text-green-300 text-sm sm:text-base">{participants.length} students joined</p>
                </div>
                <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-3 sm:p-4">
                  <h3 className="font-semibold text-primary-900 dark:text-primary-200 mb-1 sm:mb-2 text-sm sm:text-base">Generated MCQs</h3>
                  <p className="text-primary-700 dark:text-primary-300 text-sm sm:text-base">{generatedMCQs.length} available</p>
                </div>
              </div>

              {/* Live Class Control */}
              <div className={`rounded-lg p-3 sm:p-4 border ${session.is_live ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600'}`}>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-2 text-sm sm:text-base">Live Class Control</h3>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${session.is_live ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {session.is_live ? 'Class is Live — students can join' : 'Class not started — students cannot join yet'}
                    </span>
                  </div>
                  {session.is_live ? (
                    <button
                      onClick={handleEndClass}
                      disabled={isGoingLive}
                      className="bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-50 text-white px-4 py-2.5 sm:py-2 rounded-lg text-sm sm:text-base font-semibold w-full sm:w-auto"
                    >
                      {isGoingLive ? 'Ending...' : 'End Class'}
                    </button>
                  ) : (
                    <button
                      onClick={handleGoLive}
                      disabled={isGoingLive}
                      className="bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-50 text-white px-4 py-2.5 sm:py-2 rounded-lg text-sm sm:text-base font-semibold w-full sm:w-auto"
                    >
                      {isGoingLive ? 'Starting...' : 'Go Live'}
                    </button>
                  )}
                </div>
              </div>

              {/* Session Lock Control */}
              {session.is_live && (
                <div className={`rounded-lg p-3 sm:p-4 border ${isLocked ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600'}`}>
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-2 text-sm sm:text-base">Session Access</h3>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{isLocked ? '🔒' : '🔓'}</span>
                      <span className="text-sm text-slate-700 dark:text-slate-300">
                        {isLocked ? 'Locked — new students cannot join' : 'Open — new students can join'}
                      </span>
                    </div>
                    <button
                      onClick={handleToggleLock}
                      disabled={lockLoading}
                      className={`px-4 py-2.5 sm:py-2 rounded-lg text-sm sm:text-base font-semibold w-full sm:w-auto disabled:opacity-50 text-white ${isLocked ? 'bg-green-600 hover:bg-green-700 active:bg-green-800' : 'bg-red-600 hover:bg-red-700 active:bg-red-800'}`}
                    >
                      {lockLoading ? 'Updating...' : isLocked ? 'Unlock Session' : 'Lock Session'}
                    </button>
                  </div>
                </div>
              )}

              {/* AI Session Summary */}
              {!session.is_live && (
                <SummaryPanel
                  status={summaryStatus}
                  summaryText={summaryText}
                  onGenerate={handleGenerateSummary}
                />
              )}

              <NotesPanel
                notesStatus={notesStatus}
                notesUrl={notesUrl}
                elapsedSeconds={notesElapsed}
                isLive={session?.is_live}
                onGenerate={handleGenerateNotes}
                onStop={handleStopNotes}
                sessionResources={sessionResources}
                selectedResourceIds={selectedResourceIds}
                onResourceToggle={(id) => setSelectedResourceIds(prev => {
                  const next = new Set(prev);
                  next.has(id) ? next.delete(id) : next.add(id);
                  return next;
                })}
                onSelectAll={() => setSelectedResourceIds(new Set(sessionResources.map(r => r.id)))}
                onSelectNone={() => setSelectedResourceIds(new Set())}
              />

              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 sm:p-4">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-2 text-sm sm:text-base">Quick Actions</h3>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 flex-wrap">
                  <button
                    onClick={() => setActiveTab('polls')}
                    className="bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white px-4 py-2.5 sm:py-2 rounded-lg text-sm sm:text-base"
                  >
                    Create Poll
                  </button>
                  <button
                    onClick={() => setActiveTab('generated-mcqs')}
                    className="bg-green-600 hover:bg-green-700 active:bg-green-800 text-white px-4 py-2.5 sm:py-2 rounded-lg text-sm sm:text-base"
                  >
                    Send MCQs
                  </button>
                  <button
                    onClick={() => setActiveTab('participants')}
                    className="bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white px-4 py-2.5 sm:py-2 rounded-lg text-sm sm:text-base"
                  >
                    Take Attendance
                  </button>
                  <button
                    onClick={() => setActiveTab('ai-doubts')}
                    className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white px-4 py-2.5 sm:py-2 rounded-lg text-sm sm:text-base"
                  >
                    View AI Doubts
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-2">WebSocket Status</h3>
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className={`text-sm font-medium ${wsConnected ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                    {wsConnected ? 'Connected - Real-time features active' : 'Disconnected - Attempting to reconnect...'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Audio Transcription Tab */}
          {activeTab === 'audio-transcription' && (
            <AudioRecorder audioRecorder={audioRecorder} sessionId={sessionId} />
          )}

          {/* Polls Tab */}
          {activeTab === 'polls' && (
            <PollPanel
              sessionId={sessionId}
              polls={polls}
              activePoll={activePoll}
              liveResponseCount={liveResponseCount}
              onlineCount={onlineCount}
              presentCount={presentCount}
              stuckCount={stuckCount}
              wsRef={wsRef}
              setActivePoll={setActivePoll}
              setLiveResponseCount={setLiveResponseCount}
              onPollsChange={fetchPolls}
              initialData={pollPanelInitialData}
            />
          )}

          {/* Generated MCQs Tab */}
          {activeTab === 'generated-mcqs' && (
            <GeneratedMCQs
              sessionId={sessionId}
              generatedMCQs={generatedMCQs}
              onMCQsSent={() => {
                fetchGeneratedMCQs();
                fetchPolls();
              }}
            />
          )}

          {/* Participants Tab */}
          {activeTab === 'participants' && (
            <AttendancePanel
              sessionId={sessionId}
              wsConnected={wsConnected}
              attendanceWindowOpen={attendanceWindowOpen}
              attendanceDuration={attendanceDuration}
              setAttendanceDuration={setAttendanceDuration}
              attendanceCountdown={attendanceCountdown}
              attendanceCounts={attendanceCounts}
              attendanceList={attendanceList}
              participants={participants}
              session={session}
              onOpenAttendance={handleOpenAttendance}
              onCloseAttendance={handleCloseAttendance}
            />
          )}

          {/* Analytics Tab */}
          {activeTab === 'analytics' && (
            <div className="space-y-4 sm:space-y-6">
              <h3 className="text-base sm:text-lg font-semibold dark:text-white">Session Analytics</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6">
                <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-3 sm:p-4">
                  <h4 className="font-semibold text-primary-900 dark:text-primary-200 mb-1 sm:mb-2 text-xs sm:text-sm">Participants</h4>
                  <p className="text-xl sm:text-2xl font-bold text-primary-700 dark:text-primary-300">{participants.length}</p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 sm:p-4">
                  <h4 className="font-semibold text-green-900 dark:text-green-200 mb-1 sm:mb-2 text-xs sm:text-sm">Active Polls</h4>
                  <p className="text-xl sm:text-2xl font-bold text-green-700 dark:text-green-300">{polls.filter(p => p.isActive).length}</p>
                </div>
                <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-3 sm:p-4">
                  <h4 className="font-semibold text-primary-900 dark:text-primary-200 mb-1 sm:mb-2 text-xs sm:text-sm">Total Polls</h4>
                  <p className="text-xl sm:text-2xl font-bold text-primary-700 dark:text-primary-300">{polls.length}</p>
                </div>
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 sm:p-4">
                  <h4 className="font-semibold text-orange-900 dark:text-orange-200 mb-1 sm:mb-2 text-xs sm:text-sm">MCQs</h4>
                  <p className="text-xl sm:text-2xl font-bold text-orange-700 dark:text-orange-300">{generatedMCQs.length}</p>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                <p className="text-slate-600 dark:text-slate-300">
                  Detailed analytics and reporting features would be implemented here in a full application.
                </p>
              </div>
            </div>
          )}

          {/* Existing Polls Tab */}
          {activeTab === 'existing-polls' && (
            <div className="space-y-6">
              <PastPollsHeader polls={polls} />

              {polls.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400">No polls available.</p>
              ) : (
                <PastPollsList polls={polls} pollStats={pollStats} setGradingPoll={setGradingPoll} setPollPanelInitialData={setPollPanelInitialData} setActiveTab={setActiveTab} />
              )}
            </div>
          )}

          {/* AI Doubts Tab */}
          {activeTab === 'ai-doubts' && (
            <DoubtsDashboard sessionId={sessionId} />
          )}

          {/* Knowledge Cards Tab */}
          {activeTab === 'knowledge-cards' && (
            <KnowledgeCards
              sessionId={session?.session_id || sessionId}
              onlineCount={onlineCount}
            />
          )}

          {/* Gamification Recap Tab */}
          {activeTab === 'gamification' && (
            <GamificationRecap
              sessionId={session?.session_id || sessionId}
              wsRef={wsRef}
            />
          )}

          {/* AI Project Lab Tab */}
          {activeTab === 'projects' && (
            <ProjectSuggestionsPanel sessionId={sessionId} />
          )}
        </div>
      </div>
    </div>

    {/* Manual Grading overlay */}
    {gradingPoll && (
      <ManualGradingPanel
        poll={gradingPoll}
        onClose={() => setGradingPoll(null)}
      />
    )}
    </>
  );
};

// ─── Past Polls Sub-components ───────────────────────────────────────────────

const TYPE_FILTER_LABELS = {
  all: 'All',
  mcq: 'MCQ', true_false: 'T/F', fill_blank: 'Fill', numeric: 'Num',
  short_answer: 'Short Ans', essay: 'Essay', match_following: 'Match',
  ordering: 'Order', assertion_reason: 'A/R', code: 'Code',
  code_trace: 'Trace', truth_table: 'Truth Table', multi_correct: 'Multi ✓',
};

function PastPollsHeader({ polls }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold dark:text-white">All Polls & Stats</h3>
      <span className="text-xs text-slate-400">{polls.length} poll{polls.length !== 1 ? 's' : ''}</span>
    </div>
  );
}

function PastPollsList({ polls, pollStats, setGradingPoll, setPollPanelInitialData, setActiveTab }) {
  const [typeFilter, setTypeFilter] = useState('all');

  // Build filter options from types present in this session's polls
  const presentTypes = ['all', ...Array.from(new Set(polls.map(p => p.question_type || 'mcq')))];
  const filtered = typeFilter === 'all' ? polls : polls.filter(p => (p.question_type || 'mcq') === typeFilter);

  return (
    <div className="space-y-4">
      {/* Type filter pills */}
      {presentTypes.length > 2 && (
        <div className="flex flex-wrap gap-1.5">
          {presentTypes.map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                typeFilter === t
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              {TYPE_FILTER_LABELS[t] || t.replace(/_/g, ' ')}
              {t !== 'all' && (
                <span className="ml-1 opacity-60">
                  {polls.filter(p => (p.question_type || 'mcq') === t).length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <p className="text-sm text-slate-400">No polls of this type.</p>
      )}

      {filtered.map(poll => {
        const stats = pollStats[poll.id];
        const qType = poll.question_type || 'mcq';
        const meta = (() => { try { return typeof poll.options_metadata === 'string' ? JSON.parse(poll.options_metadata) : (poll.options_metadata || {}); } catch { return {}; } })();
        const breakdown = stats?.type_breakdown;

        const handleReuse = () => {
          const options = typeof poll.options === 'string' ? JSON.parse(poll.options || '[]') : (poll.options || []);
          const initialData = {
            questionType: qType, question: poll.question,
            questionLatex: poll.question_latex || '', questionImageUrl: poll.question_image_url || '',
            options: options.length === 4 ? options : ['', '', '', ''],
            correctAnswer: poll.correct_answer ?? 0,
            acceptedAnswers: meta.accepted_answers || [''],
            correctValue: meta.correct_value ?? '', tolerance: meta.tolerance ?? '0', unit: meta.unit || '',
            shortAnswerRubric: typeof meta.rubric === 'string' ? meta.rubric : '',
            shortAnswerKeyPoints: meta.key_points || '',
            justification: poll.justification || '', timeLimit: poll.time_limit || 60,
            bloomsLevel: poll.blooms_level || '', difficultyLevel: poll.difficulty_level || 'medium',
            marks: poll.marks || 1, topic: poll.topic || '',
          };
          setPollPanelInitialData(initialData);
          setActiveTab('polls');
          toast.success('Question loaded into editor — edit and send!');
        };

        return (
          <div key={poll.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex flex-wrap items-center gap-1.5 flex-1">
                <h4 className="font-medium text-slate-900 dark:text-white">{poll.question}</h4>
                {poll.question_type && poll.question_type !== 'mcq' && (
                  <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded">
                    {poll.question_type.replace(/_/g, ' ')}
                  </span>
                )}
                {poll.blooms_level && (
                  <span className="text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 px-1.5 py-0.5 rounded">
                    {poll.blooms_level}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {['essay', 'short_answer', 'differentiate'].includes(qType) && (
                  <button
                    onClick={() => setGradingPoll(poll)}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors font-medium"
                  >
                    ✏ Grade
                    {pollStats[poll.id]?.ungraded_count > 0 && (
                      <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-amber-500 text-white">
                        {pollStats[poll.id].ungraded_count}
                      </span>
                    )}
                  </button>
                )}
                <button
                  onClick={handleReuse}
                  className="text-xs px-2.5 py-1 rounded-lg border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors font-medium"
                >
                  ♻ Reuse
                </button>
              </div>
            </div>

            {(!poll.question_type || poll.question_type === 'mcq' || poll.question_type === 'true_false') && (
              <div className="space-y-1">
                {(typeof poll.options === 'string' ? JSON.parse(poll.options || '[]') : (poll.options || [])).map((option, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm ${
                      index === poll.correct_answer ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }`}>{String.fromCharCode(65 + index)}</span>
                    <span className={index === poll.correct_answer ? 'font-medium text-green-800 dark:text-green-300' : 'text-slate-700 dark:text-slate-300'}>{option}</span>
                  </div>
                ))}
              </div>
            )}
            {poll.justification && (
              <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">Justification: {poll.justification}</div>
            )}

            {stats && (
              <div className="mt-2 p-2 bg-slate-50 dark:bg-slate-700/50 rounded text-sm text-slate-700 dark:text-slate-300 space-y-1">
                <div className="flex flex-wrap gap-3">
                  <span>Answered: <strong>{stats.answered}</strong></span>
                  <span>Not answered: <strong>{stats.not_answered}</strong></span>
                  <span>Correct: <strong>{isNaN(stats.correct_percentage) ? 0 : stats.correct_percentage}%</strong></span>
                </div>
                {stats.confidence_dist && (() => {
                  const cd = stats.confidence_dist;
                  const total = cd.low + cd.medium + cd.high;
                  if (!total) return null;
                  return (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-slate-400 shrink-0">Confidence:</span>
                      <div className="flex-1 flex h-2 rounded-full overflow-hidden gap-px">
                        {cd.low > 0 && <div className="bg-red-400" style={{ width: `${Math.round(cd.low / total * 100)}%` }} title={`Low: ${cd.low}`} />}
                        {cd.medium > 0 && <div className="bg-amber-400" style={{ width: `${Math.round(cd.medium / total * 100)}%` }} title={`Medium: ${cd.medium}`} />}
                        {cd.high > 0 && <div className="bg-green-400" style={{ width: `${Math.round(cd.high / total * 100)}%` }} title={`High: ${cd.high}`} />}
                      </div>
                      <span className="text-xs text-slate-400 shrink-0">
                        🔴{cd.low} 🟡{cd.medium} 🟢{cd.high}
                      </span>
                    </div>
                  );
                })()}
                {breakdown?.type === 'option_frequency' && breakdown.data.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Option picks:</p>
                    {breakdown.data.map((d, i) => {
                      const total = breakdown.data.reduce((s, x) => s + x.count, 0);
                      const pct = total ? Math.round((d.count / total) * 100) : 0;
                      const isCorr = i === (poll.correct_answer ?? -1);
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs w-5 shrink-0 text-center font-medium">{String.fromCharCode(65 + i)}</span>
                          <div className="flex-1 bg-slate-200 dark:bg-slate-600 rounded-full h-1.5 overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${isCorr ? 'bg-green-500' : 'bg-blue-400'}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-slate-500 w-12 text-right">{d.count} ({pct}%)</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {breakdown?.type === 'pair_accuracy' && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Pair accuracy:</p>
                    <div className="space-y-1">
                      {breakdown.data.map((d, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs flex-1 truncate text-slate-600 dark:text-slate-400">{d.item}</span>
                          <div className="w-20 bg-slate-200 dark:bg-slate-600 rounded-full h-1.5 overflow-hidden">
                            <div className="h-full rounded-full bg-teal-500" style={{ width: `${d.pct}%` }} />
                          </div>
                          <span className="text-xs text-slate-500 w-10 text-right">{d.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {breakdown?.type === 'position_accuracy' && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Position accuracy:</p>
                    <div className="space-y-1">
                      {breakdown.data.map((d, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 w-5 shrink-0">#{d.position}</span>
                          <span className="text-xs flex-1 truncate text-slate-600 dark:text-slate-400">{d.item}</span>
                          <div className="w-16 bg-slate-200 dark:bg-slate-600 rounded-full h-1.5 overflow-hidden">
                            <div className="h-full rounded-full bg-orange-500" style={{ width: `${d.pct}%` }} />
                          </div>
                          <span className="text-xs text-slate-500 w-10 text-right">{d.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Gamification Recap Panel ───────────────────────────────────────────────
const GamificationRecap = ({ sessionId, wsRef }) => {
  const [recap, setRecap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [leaderboardVisible, setLeaderboardVisible] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeMsg, setFinalizeMsg] = useState(null);

  const fetchRecap = (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    apiRequest(`/gamification/teacher/session/${sessionId}/recap`)
      .then(data => { if (data.success) setRecap(data.data); })
      .catch(() => { if (isRefresh) toast.error('Failed to refresh gamification data. Please try again.'); })
      .finally(() => { setLoading(false); setRefreshing(false); });
  };

  useEffect(() => { fetchRecap(); }, [sessionId]); // eslint-disable-line

  const toggleLeaderboard = () => {
    const newVisible = !leaderboardVisible;
    setLeaderboardVisible(newVisible);
    if (wsRef?.current && wsRef.current.readyState === 1) {
      // Include sessionId so the backend can identify which session to broadcast to
      wsRef.current.send(JSON.stringify({ type: 'toggle-leaderboard', visible: newVisible, sessionId }));
    }
  };

  const finalizeSession = async () => {
    setFinalizing(true);
    setFinalizeMsg(null);
    try {
      const data = await apiRequest(`/gamification/session/${sessionId}/finalize`, { method: 'POST' });
      if (data.success) {
        setFinalizeMsg({ type: 'success', text: 'Session finalized! Completion bonuses & XP awarded.' });
        fetchRecap(true);
      } else {
        setFinalizeMsg({ type: 'error', text: data.error || 'Failed to finalize session.' });
      }
    } catch (err) {
      setFinalizeMsg({ type: 'error', text: 'Failed to finalize session.' });
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-slate-400 text-sm">Loading gamification data...</div>;
  }

  if (!recap) {
    return (
      <div className="py-8 text-center space-y-3">
        <p className="text-slate-400 text-sm">No gamification data yet. Create and activate polls to start tracking points.</p>
        <button
          onClick={() => fetchRecap(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
        >
          <svg className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
    );
  }

  const rankIcon = (rank) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  return (
    <div className="space-y-5">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">🏆 Session Leaderboard</h3>
        <div className="flex items-center gap-2 flex-wrap">

          {/* Refresh */}
          <button
            onClick={() => fetchRecap(true)}
            disabled={refreshing}
            className="p-1.5 rounded-lg border bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 hover:text-slate-700 dark:hover:text-slate-200 transition-colors disabled:opacity-40"
            title="Refresh leaderboard data"
          >
            <svg
              className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          {/* Finalize Session */}
          <button
            onClick={finalizeSession}
            disabled={finalizing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border bg-teal-50 text-teal-700 border-teal-300 hover:bg-teal-100 dark:bg-teal-900/20 dark:text-teal-400 dark:border-teal-700 dark:hover:bg-teal-900/40 transition-colors disabled:opacity-50"
            title="Award session-completion bonuses: attendance (+5 pts), all-polls-answered (+10 pts), top-3 XP, weekly consistency XP"
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
            <span>{finalizing ? 'Awarding...' : 'Finalize & Award Bonuses'}</span>
          </button>

          {/* Show/Hide Leaderboard to Students */}
          <button
            onClick={toggleLeaderboard}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
              ${leaderboardVisible
                ? 'bg-primary-600 text-white border-primary-600 hover:bg-primary-700'
                : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
            title={leaderboardVisible
              ? 'Students can see the live leaderboard overlay. Click to hide it.'
              : 'Broadcast live rankings to all students currently in this session.'}
          >
            {leaderboardVisible ? (
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            )}
            <span>{leaderboardVisible ? 'Leaderboard Live (Hide)' : 'Show Leaderboard to Students'}</span>
          </button>

        </div>
      </div>

      {/* Finalize feedback */}
      {finalizeMsg && (
        <div className={`px-3 py-2 rounded-lg text-xs font-medium ${
          finalizeMsg.type === 'success'
            ? 'bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-900/20 dark:text-teal-400 dark:border-teal-700'
            : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-700'
        }`}>
          {finalizeMsg.text}
        </div>
      )}

      {/* Leaderboard visibility indicator */}
      {leaderboardVisible && (
        <div className="flex items-center gap-2 px-3 py-2 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700 rounded-lg">
          <svg className="w-4 h-4 text-primary-500 dark:text-primary-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <p className="text-xs text-primary-700 dark:text-primary-400 font-medium">
            Live leaderboard is visible to all students in this session. They see a rankings overlay in real time.
          </p>
        </div>
      )}

      {/* Class Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Participants', value: recap.totalParticipants, color: 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400' },
          { label: 'Avg Accuracy', value: `${recap.classAvgAccuracy}%`, color: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' },
          { label: 'Engagement', value: `${recap.engagementRate}%`, color: 'bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-400' },
          { label: 'Total Polls', value: recap.totalPolls, color: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400' }
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-3 text-center ${s.color}`}>
            <p className="text-xl font-bold">{s.value}</p>
            <p className="text-xs font-medium mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Top 5 Leaderboard */}
      {recap.top5 && recap.top5.length > 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Top Students</h4>
            <span className="text-xs text-slate-400 dark:text-slate-500">Points earned this session</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {recap.top5.map(s => (
              <div key={s.studentId} className="flex items-center px-4 py-3 gap-3">
                <span className="w-8 text-center text-base flex-shrink-0">{rankIcon(s.rank)}</span>
                <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{s.studentName}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:block">{s.correctAnswers}/{s.totalAnswers} correct</span>
                <span className="text-sm font-bold text-primary-600 dark:text-primary-400 flex-shrink-0">
                  {s.points > 0 ? `${s.points} pts` : <span className="text-slate-400 font-normal text-xs">0 pts</span>}
                </span>
              </div>
            ))}
          </div>
          {recap.top5.every(s => s.points === 0) && (
            <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/10 border-t border-amber-100 dark:border-amber-800">
              <div className="flex items-start gap-2">
                <svg className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Points are awarded automatically when students answer polls. If all scores show 0, ensure polls are active and students are submitting answers. Click "Finalize &amp; Award Bonuses" after the session to add completion rewards.
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 text-center">
          <p className="text-slate-400 text-sm">No students ranked yet. Points appear as students answer polls.</p>
        </div>
      )}

      {/* Needs Attention */}
      {recap.needsAttention && recap.needsAttention.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <svg className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300">Needs Attention</h4>
          </div>
          <div className="space-y-1">
            {recap.needsAttention.map(s => (
              <div key={s.studentId} className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                <span className="w-1 h-1 rounded-full bg-amber-500 flex-shrink-0" />
                <span className="font-medium">{s.studentName}</span>
                <span>— {s.accuracy}% accuracy, {s.answered} polls answered</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedSessionManagement;
