import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { apiRequest, sessionAPI, pollAPI, safeParseUser } from '../../utils/api';
import { Badge } from '../ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '../ui/alert-dialog';
import LoadingSpinner from '../shared/LoadingSpinner';
import GeneratedMCQs from './GeneratedMCQs';
import DoubtsDashboard from './DoubtsDashboard';
import AudioRecorder from './AudioRecorder';
import KnowledgeCards from './KnowledgeCards';
import useAudioRecorder from '../../hooks/useAudioRecorder';

// WebSocket URL configuration
const WS_BASE_URL = process.env.REACT_APP_API_URL ?
  process.env.REACT_APP_API_URL.replace('http://', 'ws://' ).replace('https://', 'wss://' ).replace('/api', '') :
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
  const [newPoll, setNewPoll] = useState({
    question: '',
    options: ['', '', '', ''],
    correctAnswer: 0,
    justification: '',
    timeLimit: 60,
    difficulty: 1
  });
  const [editingMCQ, setEditingMCQ] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [pollStats, setPollStats] = useState({});
  const [confirmDeleteMCQ, setConfirmDeleteMCQ] = useState(null);
  const [liveResponseCount, setLiveResponseCount] = useState(0);

  // Activity tracking state
  const [lastSegmentTime, setLastSegmentTime] = useState(null);
  const [segmentCount, setSegmentCount] = useState(0);
  const [newMCQsCount, setNewMCQsCount] = useState(0);
  const [activityPulse, setActivityPulse] = useState(false);

  // Live class control state
  const [isGoingLive, setIsGoingLive] = useState(false);

  // Notes generation state
  const [notesStatus, setNotesStatus] = useState('none'); // 'none'|'generating'|'ready'|'failed'
  const [notesUrl, setNotesUrl] = useState(null);
  const notesPollingRef = useRef(null);

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
    setupWebSocketConnection();


    return () => {
      if (wsReconnectTimeoutRef.current) {
        clearTimeout(wsReconnectTimeoutRef.current);
      }
      if (notesPollingRef.current) {
        clearInterval(notesPollingRef.current);
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
      // Force re-render to update "Xm ago" displays
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
          case 'participant-count-updated':
            fetchParticipants();
            if ((data.count || 0) > 0) {
              window.dispatchEvent(new CustomEvent('saradhi:notification', { detail: { type: 'student', title: 'Student joined', body: `${data.count} student${data.count !== 1 ? 's' : ''} online` } }));
            }
            setOnlineCount(data.count || 0);
            break;
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
            fetchPolls(); // Refresh polls to see active status
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
              if (notesPollingRef.current) clearInterval(notesPollingRef.current);
              toast.success('Class notes are ready for students!');
            }
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
    } catch (error) {
      console.error('Error fetching session:', error);
    } finally {
      setLoading(false);
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
      const polls = data.polls || data;
      const normalized = Array.isArray(polls) ? polls.map(p => ({
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
      setNotesStatus('generating');
      startNotesPolling();
    } catch (error) {
      console.error('Error ending class:', error);
    } finally {
      setIsGoingLive(false);
    }
  };

  const startNotesPolling = () => {
    if (notesPollingRef.current) clearInterval(notesPollingRef.current);
    notesPollingRef.current = setInterval(async () => {
      try {
        const data = await apiRequest(`/sessions/${sessionId}/notes`);
        setNotesStatus(data.status);
        if (data.status === 'ready') {
          setNotesUrl(data.url);
          clearInterval(notesPollingRef.current);
        } else if (data.status === 'failed') {
          clearInterval(notesPollingRef.current);
          toast.error('Notes generation failed. Students can contact their teacher for notes.');
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

  const fetchPollStats = async (pollId) => {
    try {
      const stats = await pollAPI.getPollStats(pollId);
      setPollStats(prev => ({ ...prev, [pollId]: stats.data }));
      
    } catch (error) {
      console.error(`Error fetching stats for poll ${pollId}:`, error);
    }
  };


  const handleCreatePoll = async (e) => {
    e.preventDefault();
    try {
      const pollData = {
        session_id: sessionId,
        question: newPoll.question,
        options: newPoll.options.filter(opt => opt.trim() !== ''),
        correct_answer: newPoll.correctAnswer,
        justification: newPoll.justification,
        time_limit: newPoll.timeLimit,
        difficulty: newPoll.difficulty || 1
      };

      const data = await pollAPI.createPoll(pollData);

      setNewPoll({ question: '', options: ['', '', '', ''], correctAnswer: 0, justification: '', timeLimit: 60, difficulty: 1 });
      toast.success('Poll created!');
      await activatePoll(data);
      fetchPolls();
    } catch (error) {
      console.error('Error creating poll:', error);
      toast.error('Failed to create poll');
    }
  };

  const activatePoll = async (poll) => {
    try {
      const activatedPoll = await pollAPI.activatePoll(poll.id);
      setActivePoll(activatedPoll);
      setLiveResponseCount(0);
      fetchPolls();

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const message = { type: 'activate-poll', sessionId, poll: activatedPoll };
        wsRef.current.send(JSON.stringify(message));
        toast.success('Poll activated and sent to students!');
      } else {
        toast.warning('Poll activated, but WebSocket is not connected.');
      }
    } catch (error) {
      console.error('Error activating poll:', error);
      toast.error('Failed to activate poll: ' + error.message);
    }
  };

  const handleDeactivatePoll = async (pollId) => {
    try {
      await pollAPI.closePoll(pollId);
      setActivePoll(null);
      fetchPolls();

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'poll-deactivated', sessionId, pollId }));
      }
      toast.success('Poll ended');
    } catch (error) {
      console.error('Error deactivating poll:', error);
      toast.error('Failed to end poll');
    }
  };

  const updatePollOption = (index, value) => {
    const updatedOptions = [...newPoll.options];
    updatedOptions[index] = value;
    setNewPoll({ ...newPoll, options: updatedOptions });
  };

  const handleEditMCQ = (mcq) => {
    setEditingMCQ({
      id: mcq.id,
      question: mcq.question,
      options: Array.isArray(mcq.options) ? mcq.options : JSON.parse(mcq.options),
      correctAnswer: mcq.correct_answer,
      justification: mcq.justification || '',
      timeLimit: mcq.time_limit || 60
    });
    setShowEditModal(true);
  };

  const handleUpdateMCQ = async () => {
    if (!editingMCQ) return;
    try {
      await apiRequest(`/generated-mcqs/${editingMCQ.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          question: editingMCQ.question,
          options: editingMCQ.options,
          correct_answer: editingMCQ.correctAnswer,
          justification: editingMCQ.justification,
          time_limit: editingMCQ.timeLimit
        })
      });
      toast.success('MCQ updated successfully!');
      setShowEditModal(false);
      setEditingMCQ(null);
      fetchGeneratedMCQs();
    } catch (error) {
      console.error('Error updating MCQ:', error);
      toast.error('Failed to update MCQ');
    }
  };

  const handleDeleteMCQ = async (mcqId) => {
    try {
      await apiRequest(`/generated-mcqs/${mcqId}`, { method: 'DELETE' });
      toast.success('MCQ deleted');
      setConfirmDeleteMCQ(null);
      fetchGeneratedMCQs();
    } catch (error) {
      console.error('Error deleting MCQ:', error);
      toast.error('Failed to delete MCQ');
      setConfirmDeleteMCQ(null);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading session management..." />;
  }

  if (!session) {
    return <div>Session not found</div>;
  }

  return (
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
              { id: 'gamification', name: 'Gamify', icon: '🏆' }
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

              {/* Notes Generation Status */}
              {notesStatus !== 'none' && (
                <div className={`rounded-lg p-3 sm:p-4 border ${
                  notesStatus === 'ready'
                    ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700'
                    : notesStatus === 'failed'
                      ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
                      : 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white text-sm sm:text-base">Auto Notes Generation</h3>
                      {notesStatus === 'generating' && (
                        <p className="text-xs text-primary-600 dark:text-primary-300 mt-1 flex items-center gap-2">
                          <span className="inline-block w-3 h-3 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                          Generating class notes from transcript + resources… (1–2 min)
                        </p>
                      )}
                      {notesStatus === 'ready' && (
                        <p className="text-xs text-indigo-600 dark:text-indigo-300 mt-1">
                          Notes generated and visible to students in Resources.
                        </p>
                      )}
                      {notesStatus === 'failed' && (
                        <p className="text-xs text-red-600 dark:text-red-300 mt-1">
                          Notes generation failed. Please share notes manually.
                        </p>
                      )}
                    </div>
                    {notesStatus === 'ready' && notesUrl && (
                      <a
                        href={notesUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap w-full sm:w-auto text-center"
                      >
                        Preview Notes PDF
                      </a>
                    )}
                  </div>
                </div>
              )}

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
            <div className="space-y-4 sm:space-y-6">
              {/* Live participant count banner */}
              <div className="flex flex-wrap items-center gap-4 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm sm:text-base font-medium text-slate-700 dark:text-slate-300">
                    <span className="font-bold text-green-600 dark:text-green-400">{onlineCount}</span> student{onlineCount !== 1 ? 's' : ''} online
                  </span>
                </div>
                {presentCount > 0 && (
                  <>
                    <span className="text-slate-300 dark:text-slate-600">|</span>
                    <span className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
                      <span className="font-bold text-primary-600 dark:text-primary-400">{presentCount}</span> marked present
                    </span>
                  </>
                )}
                {stuckCount > 0 && (
                  <>
                    <span className="text-slate-300 dark:text-slate-600">|</span>
                    <span className="flex items-center gap-1.5 text-sm sm:text-base">
                      <span className="font-bold text-orange-600 dark:text-orange-400">✋ {stuckCount}</span>
                      <span className="text-slate-600 dark:text-slate-400">student{stuckCount !== 1 ? 's' : ''} stuck</span>
                      <button
                        onClick={() => wsRef.current?.send(JSON.stringify({ type: 'stuck-reset', sessionId }))}
                        className="text-xs text-orange-600 dark:text-orange-400 border border-orange-300 dark:border-orange-600 rounded px-1.5 py-0.5 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                      >
                        Clear
                      </button>
                    </span>
                  </>
                )}
              </div>

              {/* Create New Poll Form */}
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 dark:text-white">Create New Poll</h3>
                <form onSubmit={handleCreatePoll} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Question *
                    </label>
                    <textarea
                      value={newPoll.question}
                      onChange={(e) => setNewPoll({ ...newPoll, question: e.target.value })}
                      className="w-full p-2.5 sm:p-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm sm:text-base bg-white dark:bg-slate-700 dark:text-white"
                      rows="3"
                      placeholder="Enter your poll question..."
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Options *
                    </label>
                    {newPoll.options.map((option, index) => (
                      <div key={index} className="flex items-center space-x-2 mb-2">
                        <input
                          type="radio"
                          name="correctAnswer"
                          checked={newPoll.correctAnswer === index}
                          onChange={() => setNewPoll({ ...newPoll, correctAnswer: index })}
                          className="text-primary-600 w-4 h-4"
                        />
                        <input
                          type="text"
                          value={option}
                          onChange={(e) => updatePollOption(index, e.target.value)}
                          className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm sm:text-base bg-white dark:bg-slate-700 dark:text-white"
                          placeholder={`Option ${index + 1}`}
                          required={index < 2}
                        />
                      </div>
                    ))}
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                      Select the correct answer by clicking the radio button
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Justification
                      </label>
                      <textarea
                        value={newPoll.justification}
                        onChange={(e) => setNewPoll({ ...newPoll, justification: e.target.value })}
                        className="w-full p-2.5 sm:p-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm sm:text-base bg-white dark:bg-slate-700 dark:text-white"
                        rows="2"
                        placeholder="Explain why this is the correct answer..."
                      />
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Time Limit (seconds)
                        </label>
                        <input
                          type="number"
                          value={newPoll.timeLimit}
                          onChange={(e) => setNewPoll({ ...newPoll, timeLimit: parseInt(e.target.value) })}
                          className="w-full p-2.5 sm:p-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm sm:text-base bg-white dark:bg-slate-700 dark:text-white"
                          min="10"
                          max="300"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Difficulty
                        </label>
                        <div className="flex gap-2">
                          {[{ v: 1, label: 'Easy', color: 'bg-green-100 text-green-700 border-green-300' },
                            { v: 2, label: 'Medium', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
                            { v: 3, label: 'Hard', color: 'bg-red-100 text-red-700 border-red-300' }].map(d => (
                            <button
                              key={d.v}
                              type="button"
                              onClick={() => setNewPoll({ ...newPoll, difficulty: d.v })}
                              className={`flex-1 py-1.5 text-xs font-medium rounded-lg border-2 transition-all
                                ${newPoll.difficulty === d.v ? `${d.color} border-current` : 'border-slate-200 text-slate-400 dark:border-slate-600'}`}
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full sm:w-auto bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white px-6 py-2.5 sm:py-3 rounded-lg font-medium text-sm sm:text-base"
                  >
                    Create Poll
                  </button>
                </form>
              </div>

              {/* Active Polls */}
              <div>
                {polls.length === 0 ? (
                  <p className="text-slate-500 dark:text-slate-400">No polls created yet.</p>
                ) : (
                  <div className="space-y-4">
                    {polls
                    .filter(poll => poll.isActive)
                    .map((poll) => (
                      <div key={poll.id} className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h4 className="font-medium text-slate-900 dark:text-white mb-2">{poll.question}</h4>
                            <div className="space-y-1">
                              {poll.options.map((option, index) => (
                                <div key={index} className="flex items-center space-x-2">
                                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm ${
                                    index === poll.correctAnswer ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-400'
                                  }`}>
                                    {String.fromCharCode(65 + index)}
                                  </span>
                                  <span className={index === poll.correctAnswer ? 'font-medium text-green-800 dark:text-green-300' : 'text-slate-700 dark:text-slate-300'}>
                                    {option}
                                  </span>
                                </div>
                              ))}
                            </div>
                            <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                              Responses: {poll.responses} • Created: {formatTimeAgo(poll.createdAt)}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">                            
                              <button
                                onClick={() => handleDeactivatePoll(poll.id)}
                                className="bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-800 dark:text-red-300 font-medium py-2 px-4 rounded-lg transition-colors duration-200"
                              >
                                End Poll
                              </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
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
            <div className="space-y-4 sm:space-y-6">
              {/* Attendance Controls */}
              <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-4">
                <h3 className="text-base sm:text-lg font-semibold text-primary-900 dark:text-primary-200 mb-3">Attendance</h3>
                {attendanceWindowOpen ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-2xl font-bold text-primary-700 dark:text-primary-300 tabular-nums w-12">
                        {attendanceCountdown}s
                      </div>
                      <div className="text-sm text-primary-600 dark:text-primary-400">window open</div>
                      <div className="flex flex-wrap gap-2 ml-auto">
                        <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 px-3 py-1 rounded-full text-sm font-medium">
                          {attendanceCounts.present} Present
                        </span>
                        <span className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 px-3 py-1 rounded-full text-sm font-medium">
                          {attendanceCounts.late} Late
                        </span>
                        <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 px-3 py-1 rounded-full text-sm font-medium">
                          {attendanceCounts.absent} Absent
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={handleCloseAttendance}
                      className="bg-red-600 hover:bg-red-700 active:bg-red-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium w-full sm:w-auto"
                    >
                      Close Attendance Window
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                    <div>
                      <label className="block text-xs font-medium text-primary-700 dark:text-primary-300 mb-1">
                        Duration (seconds)
                      </label>
                      <input
                        type="number"
                        value={attendanceDuration}
                        onChange={(e) => setAttendanceDuration(Math.min(300, Math.max(10, parseInt(e.target.value) || 60)))}
                        className="w-24 p-2 border border-primary-300 dark:border-primary-700 rounded-lg text-sm bg-white dark:bg-slate-700 dark:text-white"
                        min="10"
                        max="300"
                      />
                    </div>
                    <button
                      onClick={handleOpenAttendance}
                      disabled={!wsConnected}
                      className="bg-primary-600 hover:bg-primary-700 active:bg-primary-800 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-medium w-full sm:w-auto"
                    >
                      Take Attendance
                    </button>
                  </div>
                )}
              </div>

              {/* Attendance Summary (shown after attendance taken) */}
              {attendanceList.length > 0 && !attendanceWindowOpen && (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Present', count: attendanceCounts.present, color: 'green' },
                    { label: 'Late', count: attendanceCounts.late, color: 'yellow' },
                    { label: 'Absent', count: attendanceCounts.absent, color: 'red' },
                  ].map(({ label, count, color }) => (
                    <div key={label} className={`bg-${color}-50 dark:bg-${color}-900/20 rounded-lg p-3 text-center border border-${color}-200 dark:border-${color}-800`}>
                      <div className={`text-xl font-bold text-${color}-700 dark:text-${color}-300`}>{count}</div>
                      <div className={`text-xs text-${color}-600 dark:text-${color}-400`}>{label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Participants Header */}
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold dark:text-white">Session Participants</h3>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {participants.length} participant{participants.length !== 1 ? 's' : ''}
                </div>
              </div>

              {participants.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-slate-500 dark:text-slate-400 mb-2">No participants yet.</p>
                  <p className="text-sm text-slate-400 dark:text-slate-500">
                    Share session ID <strong>{session.session_id}</strong> with students to join.
                  </p>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                    <thead className="bg-slate-50 dark:bg-slate-700/50">
                      <tr>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Student
                        </th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden sm:table-cell">
                          Email
                        </th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden sm:table-cell">
                          Joined At
                        </th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {attendanceList.length > 0 ? 'Attendance' : 'Status'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                      {(attendanceList.length > 0 ? attendanceList : participants).map((participant) => {
                        const attendanceStatus = participant.attendance_status;
                        const attendanceBadge = {
                          present: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400',
                          late:    'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400',
                          absent:  'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400',
                        }[attendanceStatus] || 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-300';

                        return (
                          <tr key={participant.id}>
                            <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-slate-900 dark:text-white">
                                {participant.full_name || participant.name}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 sm:hidden">{participant.email}</div>
                            </td>
                            <td className="px-4 sm:px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                              <div className="text-sm text-slate-500 dark:text-slate-400">
                                {participant.email}
                              </div>
                            </td>
                            <td className="px-4 sm:px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                              <div className="text-sm text-slate-500 dark:text-slate-400">
                                {formatTimeAgo(participant.joined_at)}
                              </div>
                            </td>
                            <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                              {attendanceList.length > 0 && attendanceStatus ? (
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${attendanceBadge}`}>
                                  {attendanceStatus.charAt(0).toUpperCase() + attendanceStatus.slice(1)}
                                </span>
                              ) : (
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  participant.is_active
                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-300'
                                }`}>
                                  {participant.is_active ? 'Active' : 'Inactive'}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
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
              <h3 className="text-lg font-semibold dark:text-white">All Polls & Stats</h3>

              {polls.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400">No polls available.</p>
              ) : (
                <div className="space-y-4">
                  {polls.map(poll => (
                  <div key={poll.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 shadow-sm">
                    <h4 className="font-medium text-slate-900 dark:text-white mb-2">{poll.question}</h4>

                    <div className="space-y-1">
                      {poll.options.map((option, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm ${
                            index === poll.correctAnswer ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                          }`}>
                            {String.fromCharCode(65 + index)}
                          </span>
                          <span className={index === poll.correctAnswer ? 'font-medium text-green-800 dark:text-green-300' : 'text-slate-700 dark:text-slate-300'}>
                            {option}
                          </span>
                        </div>
                      ))}
                    </div>
                    {poll.justification &&
                      <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Justification: {poll.justification}
                      </div>}

                    {pollStats[poll.id] && (
                      <div className="mt-2 p-2 bg-slate-50 dark:bg-slate-700/50 rounded text-sm text-slate-700 dark:text-slate-300">
                        <div>Answered: {pollStats[poll.id].answered}</div>
                        <div>Not Answered: {pollStats[poll.id].not_answered}</div>
                        <div>Correct Percentage: {isNaN(pollStats[poll.id].correct_percentage) ? 0 : pollStats[poll.id].correct_percentage}%</div>
                        {pollStats[poll.id].first_correct_student_id && (
                          <div>First Correct: {pollStats[poll.id].first_correct_student_id}</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                </div>
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
              sessionId={session?.id || sessionId}
              wsRef={wsRef}
            />
          )}
        </div>
      </div>

      {/* Edit MCQ Modal */}
      {showEditModal && editingMCQ && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 sm:p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4 dark:text-white">Edit MCQ</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Question *
                </label>
                <textarea
                  value={editingMCQ.question}
                  onChange={(e) => setEditingMCQ({ ...editingMCQ, question: e.target.value })}
                  className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-slate-700 dark:text-white"
                  rows="3"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Options *
                </label>
                {editingMCQ.options.map((option, index) => (
                  <div key={index} className="flex items-center space-x-2 mb-2">
                    <input
                      type="radio"
                      name="editCorrectAnswer"
                      checked={editingMCQ.correctAnswer === index}
                      onChange={() => setEditingMCQ({ ...editingMCQ, correctAnswer: index })}
                      className="text-primary-600"
                    />
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => {
// ... (continuation of EnhancedSessionManagement.jsx)
                      const updatedOptions = [...editingMCQ.options];
                        updatedOptions[index] = e.target.value;
                        setEditingMCQ({ ...editingMCQ, options: updatedOptions });
                      }}
                      className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-slate-700 dark:text-white"
                      placeholder={`Option ${index + 1}`}
                      required
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Justification
                </label>
                <textarea
                  value={editingMCQ.justification}
                  onChange={(e) => setEditingMCQ({ ...editingMCQ, justification: e.target.value })}
                  className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-slate-700 dark:text-white"
                  rows="2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Time Limit (seconds)
                </label>
                <input
                  type="number"
                  value={editingMCQ.timeLimit}
                  onChange={(e) => setEditingMCQ({ ...editingMCQ, timeLimit: parseInt(e.target.value) })}
                  className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-slate-700 dark:text-white"
                  min="10"
                  max="300"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-4 mt-6">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingMCQ(null);
                }}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateMCQ}
                className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg"
              >
                Update MCQ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Gamification Recap Panel ───────────────────────────────────────────────
const GamificationRecap = ({ sessionId, wsRef }) => {
  const [recap, setRecap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [leaderboardVisible, setLeaderboardVisible] = useState(false);

  useEffect(() => {
    apiRequest(`/gamification/teacher/session/${sessionId}/recap`)
      .then(data => { if (data.success) setRecap(data.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  const toggleLeaderboard = () => {
    const newVisible = !leaderboardVisible;
    setLeaderboardVisible(newVisible);
    if (wsRef?.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: 'toggle-leaderboard', visible: newVisible }));
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-slate-400 text-sm">Loading gamification data...</div>;
  }

  if (!recap) {
    return <div className="py-8 text-center text-slate-400 text-sm">No gamification data yet. Create polls to start tracking.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">&#127942; Session Gamification</h3>
        <button
          onClick={toggleLeaderboard}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
            ${leaderboardVisible
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600'}`}
        >
          {leaderboardVisible ? '&#128065; Leaderboard Visible' : '&#128100; Show Leaderboard to Students'}
        </button>
      </div>

      {/* Class Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Participants', value: recap.totalParticipants, color: 'bg-primary-50 text-primary-700' },
          { label: 'Avg Accuracy', value: `${recap.classAvgAccuracy}%`, color: 'bg-green-50 text-green-700' },
          { label: 'Engagement', value: `${recap.engagementRate}%`, color: 'bg-primary-50 text-primary-700' },
          { label: 'Total Polls', value: recap.totalPolls, color: 'bg-orange-50 text-orange-700' }
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-3 text-center ${s.color} dark:bg-opacity-20`}>
            <p className="text-xl font-bold">{s.value}</p>
            <p className="text-xs font-medium mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Top 5 */}
      {recap.top5 && recap.top5.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Top Students</h4>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {recap.top5.map(s => (
              <div key={s.studentId} className="flex items-center px-4 py-2.5 gap-3">
                <span className="w-6 text-center font-bold text-slate-400 text-sm">#{s.rank}</span>
                <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-200">{s.studentName}</span>
                <span className="text-xs text-slate-500">{s.correctAnswers}/{s.totalAnswers} correct</span>
                <span className="text-sm font-bold text-primary-600 dark:text-primary-400">{s.points} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Needs Attention */}
      {recap.needsAttention && recap.needsAttention.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">&#9888; Needs Attention</h4>
          <div className="space-y-1">
            {recap.needsAttention.map(s => (
              <div key={s.studentId} className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                <span>&#8226;</span>
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
