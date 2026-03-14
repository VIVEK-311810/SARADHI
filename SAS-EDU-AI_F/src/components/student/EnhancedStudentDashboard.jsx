import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatCardsSkeleton, SessionListSkeleton } from '../shared/SkeletonLoader';
import ErrorScreen from '../shared/ErrorScreen';
import { studentAPI, apiRequest, safeParseUser } from '../../utils/api';
import { isDemoMode, DEMO_GAMIFICATION } from '../../utils/demoData';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Badge } from '../ui/badge';

const EnhancedStudentDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [joinedSessions, setJoinedSessions] = useState([]);
  const [stats, setStats] = useState({
    sessionsJoined: 0,
    pollsAnswered: 0,
    averageScore: 0,
    activeSessions: 0
  });
  const [gamificationStats, setGamificationStats] = useState({
    totalPoints: 0,
    rank: 1,
    totalStudents: 1,
    currentStreak: 0,
    badges: []
  });

  const currentUser = safeParseUser();
  const dashboardWsRef = useRef(null);

  useEffect(() => {
    const currentUser = safeParseUser();
    if (!currentUser || currentUser.role !== 'student') {
      navigate('/auth');
      return;
    }
    fetchStudentData();

    // WebSocket for real-time class-started / class-ended push
    if (!isDemoMode()) {
      const WS_BASE_URL = process.env.REACT_APP_API_URL
        ? process.env.REACT_APP_API_URL.replace('http://', 'ws://').replace('https://', 'wss://').replace('/api', '')
        : 'wss://vk-edu-b2.onrender.com';
      const token = localStorage.getItem('authToken');
      const ws = new WebSocket(`${WS_BASE_URL}?token=${token}`);
      dashboardWsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join-dashboard' }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'class-started' && data.sessionId) {
            setJoinedSessions(prev => prev.map(s =>
              s.session_id === data.sessionId ? { ...s, is_live: true } : s
            ));
          } else if (data.type === 'class-ended' && data.sessionId) {
            setJoinedSessions(prev => prev.map(s =>
              s.session_id === data.sessionId ? { ...s, is_live: false } : s
            ));
          }
        } catch (_) {}
      };

      ws.onerror = () => {};
      ws.onclose = () => {};
    }

    // Fallback poll every 30s
    const refreshInterval = setInterval(() => {
      fetchStudentData();
    }, 30000);

    return () => {
      clearInterval(refreshInterval);
      if (dashboardWsRef.current) {
        dashboardWsRef.current.close();
        dashboardWsRef.current = null;
      }
    };
  }, [navigate]);

  const fetchStudentData = async () => {
    try {
      const currentUser = safeParseUser();
      if (!currentUser || !currentUser.id) {
        console.error('No current user found');
        setLoading(false);
        return;
      }

      const studentId = currentUser.id;
      const data = await studentAPI.getDashboardSummary(studentId);

      setJoinedSessions((data.sessions ?? []).map(session => ({
        id: session.session_id,
        session_id: session.join_code,
        title: session.title,
        course_name: session.course_name,
        teacher_name: session.teacher_name,
        is_active: session.is_active,
        is_live: session.is_live || false,
        joined_at: session.joined_at,
        last_poll: null
      })));

      setStats({
        sessionsJoined: data.stats.sessions_joined,
        pollsAnswered: data.stats.polls_answered,
        averageScore: data.stats.average_score,
        activeSessions: data.stats.active_sessions
      });

      try {
        if (isDemoMode()) {
          setGamificationStats(DEMO_GAMIFICATION);
        } else {
          const gamificationData = await apiRequest(`/gamification/student/${studentId}/stats`);
          if (gamificationData.success) {
            setGamificationStats(gamificationData.data);
          }
        }
      } catch (gamErr) {
        // Non-critical
      }

    } catch (error) {
      console.error('Error fetching student data:', error);
      setFetchError(error.message || 'Failed to load dashboard');
      setJoinedSessions([]);
      setStats({
        sessionsJoined: 0,
        pollsAnswered: 0,
        averageScore: 0,
        activeSessions: 0
      });
    } finally {
      setLoading(false);
    }
  };

  async function rejoinSession(sessionId, studentId) {
    try {
      await apiRequest(`/sessions/${sessionId}/rejoin`, {
        method: 'POST',
        body: JSON.stringify({ student_id: studentId }),
      });
    } catch (err) {
      // Non-critical
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 px-4 sm:px-6 pb-8">
        <div className="rounded-xl skeleton-shimmer h-32 sm:h-36 w-full" />
        <StatCardsSkeleton count={4} />
        <SessionListSkeleton rows={3} />
      </div>
    );
  }

  if (fetchError && joinedSessions.length === 0) {
    return (
      <ErrorScreen
        errorType="network"
        message={fetchError}
        onRetry={() => { setFetchError(null); setLoading(true); fetchStudentData(); }}
        onGoHome={() => navigate('/auth')}
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 px-4 sm:px-6 pb-8">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-coral-500 to-saradhi-700 rounded-xl p-4 sm:p-6 text-white">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold font-display">Welcome, {currentUser.fullName}!</h1>
            <p className="text-coral-100 mt-1 sm:mt-2 text-sm sm:text-base">Ready to learn and participate</p>
            <p className="text-coral-200 text-xs sm:text-sm mt-1">ID: {currentUser.id}</p>
          </div>
          <button
            onClick={() => navigate('/student/join')}
            className="bg-white text-saradhi-700 hover:bg-saradhi-50 font-medium py-3 px-4 sm:px-6 rounded-lg transition-colors duration-200 shadow-lg text-center w-full sm:w-auto"
          >
            + Join Session
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 shadow-card border border-slate-200/80 dark:border-slate-700/80">
          <div className="flex flex-col sm:flex-row sm:items-center">
            <div className="p-2 sm:p-3 rounded-full bg-saradhi-100 dark:bg-saradhi-900/30 w-fit mb-2 sm:mb-0">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-saradhi-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div className="sm:ml-4">
              <p className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">Sessions</p>
              <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{stats.sessionsJoined}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 shadow-card border border-slate-200/80 dark:border-slate-700/80">
          <div className="flex flex-col sm:flex-row sm:items-center">
            <div className="p-2 sm:p-3 rounded-full bg-teal-100 dark:bg-teal-900/30 w-fit mb-2 sm:mb-0">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="sm:ml-4">
              <p className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">Polls</p>
              <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{stats.pollsAnswered}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 shadow-card border border-slate-200/80 dark:border-slate-700/80">
          <div className="flex flex-col sm:flex-row sm:items-center">
            <div className="p-2 sm:p-3 rounded-full bg-coral-100 dark:bg-coral-900/30 w-fit mb-2 sm:mb-0">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-coral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div className="sm:ml-4">
              <p className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">Score</p>
              <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{stats.averageScore}%</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 shadow-card border border-slate-200/80 dark:border-slate-700/80">
          <div className="flex flex-col sm:flex-row sm:items-center">
            <div className="p-2 sm:p-3 rounded-full bg-emerald-100 dark:bg-emerald-900/30 w-fit mb-2 sm:mb-0">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="sm:ml-4">
              <p className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">Active</p>
              <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{stats.activeSessions}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Gamification Card */}
      <div className="bg-gradient-to-r from-saradhi-600 to-saradhi-800 rounded-xl shadow-lg p-4 sm:p-6 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="grid grid-cols-3 gap-4 sm:flex sm:items-center sm:gap-6">
            <div className="text-center">
              <p className="text-2xl sm:text-4xl font-bold font-display">{gamificationStats.totalPoints}</p>
              <p className="text-xs sm:text-sm text-saradhi-200">Points</p>
            </div>
            <div className="text-center">
              <p className="text-2xl sm:text-4xl font-bold font-display">#{gamificationStats.rank}</p>
              <p className="text-xs sm:text-sm text-saradhi-200">Rank</p>
            </div>
            <div className="text-center">
              <p className="text-2xl sm:text-4xl font-bold font-display">{gamificationStats.currentStreak}</p>
              <p className="text-xs sm:text-sm text-saradhi-200">Streak</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/student/leaderboard')}
            className="bg-white/20 hover:bg-white/30 px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            View Leaderboard
          </button>
        </div>
      </div>

      {/* Return to Class Banner — shown when a live session exists */}
      {(() => {
        const liveSession = joinedSessions.find(s => s.is_live);
        if (!liveSession) return null;
        return (
          <div className="bg-teal-600 dark:bg-teal-700 rounded-xl p-4 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-white animate-pulse flex-shrink-0" />
              <div>
                <p className="font-bold text-sm sm:text-base">Class is live right now!</p>
                <p className="text-teal-100 text-xs sm:text-sm">{liveSession.title} — {liveSession.course_name}</p>
              </div>
            </div>
            <button
              onClick={async () => {
                await rejoinSession(liveSession.session_id, currentUser.id);
                navigate(`/student/session/${liveSession.session_id}`);
              }}
              className="bg-white text-teal-700 hover:bg-teal-50 active:bg-teal-100 font-bold py-2.5 px-5 rounded-lg text-sm w-full sm:w-auto text-center"
            >
              Return to Class →
            </button>
          </div>
        );
      })()}

      {/* Your Sessions */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-card border border-slate-200/80 dark:border-slate-700/80">
        <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg sm:text-xl font-bold font-display text-slate-900 dark:text-white">Your Sessions</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">Sessions you've joined</p>
        </div>

        {joinedSessions.length === 0 ? (
          <div className="p-8 sm:p-12 text-center">
            <svg className="w-12 h-12 sm:w-16 sm:h-16 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <h3 className="text-lg sm:text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">No sessions yet</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">Join your first session to start</p>
            <button
              onClick={() => navigate('/student/join')}
              className="bg-saradhi-700 hover:bg-saradhi-600 text-white font-medium py-3 px-6 rounded-xl transition-colors duration-200 w-full sm:w-auto"
            >
              Join a Session
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {joinedSessions.map((session) => (
              <div key={session.id} className="p-4 sm:p-6 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors duration-200">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white truncate">{session.title}</h3>
                      {session.is_live ? (
                        <Badge variant="live" dot>Live</Badge>
                      ) : session.is_active ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-saradhi-100 text-saradhi-700 dark:bg-saradhi-900/30 dark:text-saradhi-400">
                          Ready
                        </span>
                      ) : (
                        <Badge variant="ended" dot>Ended</Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 truncate">{session.course_name}</p>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                      <span className="font-medium">{session.session_id}</span>
                      <span className="mx-2">|</span>
                      <span>{session.teacher_name}</span>
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 w-full sm:w-auto">
                    {session.is_live && (
                      <button
                        onClick={async () => {
                          await rejoinSession(session.session_id, currentUser.id);
                          navigate(`/student/session/${session.session_id}`);
                        }}
                        className="bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-medium py-2.5 px-3 rounded-lg transition-colors duration-200 text-sm col-span-2 sm:col-span-1"
                      >
                        Join Live
                      </button>
                    )}

                    <button
                      onClick={() => navigate(`/student/session/${session.session_id}/history`)}
                      className="bg-slate-600 hover:bg-slate-700 text-white font-medium py-2.5 px-3 rounded-lg transition-colors duration-200 text-sm"
                    >
                      View
                    </button>

                    <Button
                      size="sm"
                      onClick={() => navigate(`/session/${session.session_id}/resources`)}
                    >
                      Resources
                    </Button>

                    <Button
                      size="sm"
                      onClick={() => navigate(`/community/session/${session.session_id}`)}
                      className="bg-teal-600 hover:bg-teal-700 text-white"
                    >
                      Doubts
                    </Button>

                    <Button
                      size="sm"
                      onClick={() => navigate(`/student/ai-assistant/${session.session_id}`)}
                      className="bg-saradhi-700 hover:bg-saradhi-600 text-white"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      AI Tutor
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EnhancedStudentDashboard;
