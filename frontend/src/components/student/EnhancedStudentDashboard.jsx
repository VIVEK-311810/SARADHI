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
  const [stats, setStats] = useState({ sessionsJoined: 0, pollsAnswered: 0, averageScore: 0, activeSessions: 0 });
  const [gamificationStats, setGamificationStats] = useState({
    totalPoints: 0, totalXP: 0, rank: 1, totalStudents: 1,
    level: { level: 1, title: 'Newcomer', currentXP: 0, nextLevelXP: 100, xpToNextLevel: 100 },
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

    if (!isDemoMode()) {
      const WS_BASE_URL = process.env.REACT_APP_API_URL
        ? process.env.REACT_APP_API_URL.replace('http://', 'ws://').replace('https://', 'wss://').replace('/api', '')
        : 'wss://vk-edu-b2.onrender.com';
      const token = localStorage.getItem('authToken');
      const ws = new WebSocket(`${WS_BASE_URL}?token=${token}`);
      dashboardWsRef.current = ws;

      ws.onopen = () => { ws.send(JSON.stringify({ type: 'join-dashboard' })); };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'class-started' && data.sessionId) {
            setJoinedSessions(prev => prev.map(s => s.session_id === data.sessionId ? { ...s, is_live: true } : s));
          } else if (data.type === 'class-ended' && data.sessionId) {
            setJoinedSessions(prev => prev.map(s => s.session_id === data.sessionId ? { ...s, is_live: false } : s));
          }
        } catch (_) {}
      };
      ws.onerror = () => {};
      ws.onclose = () => {};
    }

    const refreshInterval = setInterval(() => { fetchStudentData(); }, 30000);
    return () => {
      clearInterval(refreshInterval);
      if (dashboardWsRef.current) { dashboardWsRef.current.close(); dashboardWsRef.current = null; }
    };
  }, [navigate]);

  const fetchStudentData = async () => {
    try {
      const currentUser = safeParseUser();
      if (!currentUser || !currentUser.id) { setLoading(false); return; }
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
          const [gamificationData, xpData] = await Promise.all([
            apiRequest(`/gamification/student/${studentId}/stats`),
            apiRequest(`/gamification/student/${studentId}/xp`)
          ]);
          if (gamificationData.success) {
            const stats = gamificationData.data;
            if (xpData.success) { stats.totalXP = xpData.data.totalXP; stats.level = xpData.data.level; }
            setGamificationStats(stats);
          }
        }
      } catch (_) {}

    } catch (error) {
      console.error('Error fetching student data:', error);
      setFetchError(error.message || 'Failed to load dashboard');
      setJoinedSessions([]);
      setStats({ sessionsJoined: 0, pollsAnswered: 0, averageScore: 0, activeSessions: 0 });
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
    } catch (_) {}
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        <div className="rounded-2xl skeleton-shimmer h-32 sm:h-36 w-full" />
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

  const xpPct = gamificationStats.level?.nextLevelXP
    ? Math.min(100, Math.round(((gamificationStats.totalXP || 0) / gamificationStats.level.nextLevelXP) * 100))
    : 0;

  const statCards = [
    { label: 'Sessions', value: stats.sessionsJoined, icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', iconBg: 'bg-primary-100 dark:bg-primary-900/30', iconColor: 'text-primary-600 dark:text-primary-400' },
    { label: 'Polls', value: stats.pollsAnswered, icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', iconBg: 'bg-teal-100 dark:bg-teal-900/30', iconColor: 'text-teal-600 dark:text-teal-400' },
    { label: 'Avg Score', value: `${stats.averageScore}%`, icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2z', iconBg: 'bg-accent-100 dark:bg-accent-900/30', iconColor: 'text-accent-500 dark:text-accent-400' },
    { label: 'Active', value: stats.activeSessions, icon: 'M13 10V3L4 14h7v7l9-11h-7z', iconBg: 'bg-emerald-100 dark:bg-emerald-900/30', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  ];

  const liveSession = joinedSessions.find(s => s.is_live);

  return (
    <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 pb-8">

      {/* Welcome Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent-500 to-primary-700 dark:from-accent-600 dark:to-primary-900 p-5 sm:p-7 text-white shadow-glow-accent">
        <div className="absolute top-0 right-0 w-56 h-56 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-primary-500/10 rounded-full translate-y-1/2 -translate-x-1/2 pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <p className="text-orange-200 text-sm font-medium mb-1">Welcome back</p>
            <h1 className="text-xl sm:text-3xl font-bold font-display">{currentUser?.fullName || 'Student'}</h1>
            <p className="text-orange-200 mt-1 text-sm">
              <span className="inline-flex items-center gap-1.5">
                <span className="font-mono text-xs bg-white/10 px-2 py-0.5 rounded">{currentUser?.id}</span>
                <span>·</span>
                <span>Level {gamificationStats.level?.level} {gamificationStats.level?.title}</span>
              </span>
            </p>
          </div>
          <Button
            variant="glass"
            onClick={() => navigate('/student/join')}
            className="w-full sm:w-auto bg-white/15 hover:bg-white/25 text-white border-white/20 font-semibold"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Join Session
          </Button>
        </div>
      </div>

      {/* Live session banner */}
      {liveSession && (
        <div className="rounded-2xl border border-teal-300/60 bg-teal-50/80 dark:bg-teal-900/20 dark:border-teal-700/60 backdrop-blur-md p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-glass">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-pulse-glow flex-shrink-0" />
            <div>
              <p className="font-bold text-teal-900 dark:text-teal-100 text-sm">Class is live right now!</p>
              <p className="text-teal-700 dark:text-teal-300 text-xs">{liveSession.title} — {liveSession.course_name}</p>
            </div>
          </div>
          <Button
            variant="teal"
            size="sm"
            onClick={async () => {
              await rejoinSession(liveSession.session_id, currentUser.id);
              navigate(`/student/session/${liveSession.session_id}`);
            }}
            className="w-full sm:w-auto"
          >
            Return to Class →
          </Button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((stat, i) => (
          <Card key={stat.label} variant="glass" className="hover:shadow-card-hover transition-shadow duration-200 animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
                <div className={`p-2 rounded-xl ${stat.iconBg} w-fit mb-2 sm:mb-0 flex-shrink-0`}>
                  <svg className={`w-5 h-5 ${stat.iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={stat.icon} />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{stat.label}</p>
                  <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gamification XP Card */}
      <Card variant="glass" className="overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 to-accent-500/5 pointer-events-none" />
        <CardContent className="p-4 sm:p-6 relative">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 px-2.5 py-0.5 rounded-full">
                  Lv{gamificationStats.level?.level} · {gamificationStats.level?.title}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4">
                {[
                  { v: gamificationStats.totalXP || 0, l: 'Total XP' },
                  { v: `#${gamificationStats.rank}`, l: 'Rank' },
                  { v: gamificationStats.totalPoints || 0, l: 'Points' },
                ].map(({ v, l }) => (
                  <div key={l}>
                    <p className="text-xl sm:text-3xl font-bold font-display text-slate-900 dark:text-white">{v}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{l}</p>
                  </div>
                ))}
              </div>
              {gamificationStats.level?.nextLevelXP && (
                <div className="max-w-xs">
                  <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mb-1">
                    <div
                      className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full transition-all duration-500"
                      style={{ width: `${xpPct}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400">{gamificationStats.level.xpToNextLevel} XP to next level</p>
                </div>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => {
                navigate(liveSession ? `/student/leaderboard/${liveSession.session_id}` : '/student/leaderboard');
              }}
              className="w-full sm:w-auto"
            >
              View Leaderboard
            </Button>
          </div>
        </CardContent>
      </Card>


      {/* Sessions */}
      <Card variant="glass">
        <CardHeader className="border-b border-slate-200/60 dark:border-slate-700/60">
          <CardTitle>Your Sessions</CardTitle>
          <CardDescription>Sessions you've joined</CardDescription>
        </CardHeader>

        {joinedSessions.length === 0 ? (
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">No sessions yet</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Join your first session to start learning</p>
            <Button onClick={() => navigate('/student/join')} className="w-full sm:w-auto">
              Join a Session
            </Button>
          </CardContent>
        ) : (
          <div className="divide-y divide-slate-200/60 dark:divide-slate-700/60">
            {joinedSessions.map((session) => (
              <div key={session.id} className="p-4 sm:p-5 hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors duration-200">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white truncate">{session.title}</h3>
                      {session.is_live ? (
                        <Badge variant="live" dot>Live</Badge>
                      ) : session.is_active ? (
                        <Badge variant="primary">Ready</Badge>
                      ) : (
                        <Badge variant="ended" dot>Ended</Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{session.course_name}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 font-mono">{session.session_id} · {session.teacher_name}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => navigate(`/student/competition?session=${session.session_id}`)}
                      className="bg-coral-500 hover:bg-coral-600 active:bg-coral-700 text-white"
                    >
                      ⚔ Compete
                    </Button>
                    {session.is_live && (
                      <Button
                        size="sm"
                        variant="teal"
                        onClick={async () => {
                          await rejoinSession(session.session_id, currentUser.id);
                          navigate(`/student/session/${session.session_id}`);
                        }}
                      >
                        Join Live
                      </Button>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => navigate(`/student/session/${session.session_id}/history`)}>
                      View
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate(`/session/${session.session_id}/resources`)}>
                      Resources
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate(`/community/session/${session.session_id}`)}>
                      Doubts
                    </Button>
                    <Button size="sm" onClick={() => navigate(`/student/ai-assistant/${session.session_id}`)}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      </Card>
    </div>
  );
};

export default EnhancedStudentDashboard;
