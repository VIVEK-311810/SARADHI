import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { sessionAPI, safeParseUser } from '../../utils/api';
import { StatCardsSkeleton, SessionListSkeleton } from '../shared/SkeletonLoader';
import ErrorScreen from '../shared/ErrorScreen';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Badge } from '../ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';

const EnhancedTeacherDashboard = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [stats, setStats] = useState({ totalSessions: 0, totalStudents: 0, totalPolls: 0 });
  const [confirmEnd, setConfirmEnd] = useState(null); // { sessionId, title }

  const currentUser = safeParseUser();

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'teacher') {
      navigate('/auth');
      return;
    }
    fetchSessions();
  }, [navigate]);

  const fetchSessions = async () => {
    try {
      if (!currentUser || !currentUser.id) { setLoading(false); return; }
      const data = await sessionAPI.getTeacherSessions(currentUser.id);
      setSessions(data);
      setStats({
        totalSessions: data.length,
        totalStudents: data.reduce((acc, s) => acc + parseInt(s.participant_count || 0, 10), 0),
        totalPolls: data.reduce((acc, s) => acc + parseInt(s.poll_count || 0, 10), 0),
      });
    } catch (error) {
      console.error('Error fetching sessions:', error);
      setFetchError(error.message || 'Failed to load sessions');
      setSessions([]);
      setStats({ totalSessions: 0, totalStudents: 0, totalPolls: 0 });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const handleEndSession = async () => {
    if (!confirmEnd) return;
    const { sessionId, title } = confirmEnd;
    setConfirmEnd(null);
    try {
      await sessionAPI.endSession(sessionId, currentUser.id);
      toast.success(`Session "${title}" ended successfully`);
      fetchSessions();
    } catch (error) {
      console.error('Error ending session:', error);
      toast.error(`Failed to end session: ${error.message}`);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 px-3 sm:px-0">
        <div className="rounded-xl skeleton-shimmer h-32 sm:h-36 w-full" />
        <StatCardsSkeleton count={3} />
        <SessionListSkeleton rows={4} />
      </div>
    );
  }

  if (fetchError && sessions.length === 0) {
    return (
      <ErrorScreen
        errorType="network"
        message={fetchError}
        onRetry={() => { setFetchError(null); setLoading(true); fetchSessions(); }}
        onGoHome={() => navigate('/auth')}
      />
    );
  }

  const statCards = [
    {
      label: 'Total Sessions',
      value: stats.totalSessions,
      icon: (
        <svg className="w-5 h-5 sm:w-6 sm:h-6 text-saradhi-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      iconBg: 'bg-saradhi-100 dark:bg-saradhi-900/30',
    },
    {
      label: 'Total Students',
      value: stats.totalStudents,
      icon: (
        <svg className="w-5 h-5 sm:w-6 sm:h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
        </svg>
      ),
      iconBg: 'bg-teal-100 dark:bg-teal-900/30',
    },
    {
      label: 'Total Polls',
      value: stats.totalPolls,
      icon: (
        <svg className="w-5 h-5 sm:w-6 sm:h-6 text-coral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      iconBg: 'bg-coral-100 dark:bg-coral-900/30',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 px-3 sm:px-0">

      {/* End Session Confirmation Dialog */}
      <AlertDialog open={!!confirmEnd} onOpenChange={(open) => !open && setConfirmEnd(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End Session</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to end <strong>"{confirmEnd?.title}"</strong>?
              <br /><br />
              This will deactivate the session, close all active polls, and prevent new students from joining. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEndSession}>End Session</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-saradhi-700 to-saradhi-900 rounded-xl p-4 sm:p-6 text-white">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold font-display">Welcome back, {currentUser.fullName}!</h1>
            <p className="text-saradhi-100 mt-1 sm:mt-2 text-sm sm:text-base">Manage your sessions and engage with students</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={() => navigate('/teacher/analytics')}
              className="w-full sm:w-auto bg-white/10 hover:bg-white/20 text-white border-white/40 hover:border-white/60"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              View Analytics
            </Button>
            <Button
              onClick={() => navigate('/teacher/create-session')}
              className="w-full sm:w-auto bg-white text-saradhi-700 hover:bg-saradhi-50"
            >
              + Create New Session
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards — 3 columns */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-3 sm:p-6">
              <div className="flex flex-row sm:flex-col lg:flex-row lg:items-center gap-3 sm:gap-4">
                <div className={`p-2 sm:p-3 rounded-full ${stat.iconBg} flex-shrink-0 w-fit`}>
                  {stat.icon}
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">{stat.label}</p>
                  <p className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sessions List */}
      <Card>
        <CardHeader className="border-b border-slate-100 dark:border-slate-700">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
            <div>
              <CardTitle className="text-lg sm:text-xl">All My Sessions</CardTitle>
              <CardDescription className="mt-1">Manage and revisit your class sessions</CardDescription>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Total: {sessions.length} sessions</p>
          </div>
        </CardHeader>

        {sessions.length === 0 ? (
          <CardContent className="py-12 sm:py-16 text-center">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-lg sm:text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">No sessions yet</h3>
            <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mb-6">Create your first session to get started</p>
            <Button onClick={() => navigate('/teacher/create-session')} className="w-full sm:w-auto">
              Create Your First Session
            </Button>
          </CardContent>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {sessions.map((session) => (
              <div key={session.id} className="p-4 sm:p-6 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors duration-200">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white truncate">{session.title}</h3>
                      {session.is_active ? (
                        <Badge variant="live" dot>Active</Badge>
                      ) : (
                        <Badge variant="ended" dot>Ended</Badge>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-1">{session.course_name}</p>
                    <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 mb-2 line-clamp-1">{session.description}</p>
                    <div className="flex flex-wrap items-center gap-3 sm:gap-5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1 font-medium">
                        <svg className="w-3.5 h-3.5 text-saradhi-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        Join Code: <strong className="text-saradhi-600">{session.session_id}</strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {session.participant_count || 0} students
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => navigate(`/teacher/session/${session.session_id}`)}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Manage
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/session/${session.session_id}/resources`)}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Resources
                    </Button>
                    {session.is_active && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setConfirmEnd({ sessionId: session.session_id, title: session.title })}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10l6 6m0-6l-6 6" />
                        </svg>
                        End Session
                      </Button>
                    )}
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

export default EnhancedTeacherDashboard;
