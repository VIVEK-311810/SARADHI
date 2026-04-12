import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { sessionAPI, safeParseUser } from '../../utils/api';
import { StatCardsSkeleton, SessionListSkeleton } from '../shared/feedback/SkeletonLoader';
import ErrorScreen from '../shared/error/ErrorScreen';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Badge } from '../ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { SummaryContent } from './SummaryPanel';

const SESSIONS_PER_PAGE = 20;

const EnhancedTeacherDashboard = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [stats, setStats] = useState({ totalSessions: 0, totalStudents: 0, totalPolls: 0 });
  const [confirmEnd, setConfirmEnd] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [summaryModal, setSummaryModal] = useState(null); // { title, text }

  const currentUser = safeParseUser();

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'teacher') {
      navigate('/auth');
      return;
    }
    fetchSessions(page);
  }, [navigate, page]);

  const fetchSessions = async (pageNum = 1) => {
    try {
      if (!currentUser || !currentUser.id) { setLoading(false); return; }
      const data = await sessionAPI.getTeacherSessions(currentUser.id, pageNum, SESSIONS_PER_PAGE);
      // Handle both old (array) and new (paginated object) response shapes
      const rows = Array.isArray(data) ? data : (data.sessions || []);
      const totalCount = Array.isArray(data) ? rows.length : (data.total || rows.length);
      const pages = Array.isArray(data) ? 1 : (data.totalPages || 1);
      setSessions(rows);
      setTotal(totalCount);
      setTotalPages(pages);
      setStats({
        totalSessions: totalCount,
        totalStudents: rows.reduce((acc, s) => acc + parseInt(s.participant_count || 0, 10), 0),
        totalPolls: rows.reduce((acc, s) => acc + parseInt(s.poll_count || 0, 10), 0),
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
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        <div className="rounded-2xl skeleton-shimmer h-32 sm:h-36 w-full" />
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
        <svg className="w-5 h-5 sm:w-6 sm:h-6 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      iconBg: 'bg-primary-100 dark:bg-primary-900/30',
    },
    {
      label: 'Total Students',
      value: stats.totalStudents,
      icon: (
        <svg className="w-5 h-5 sm:w-6 sm:h-6 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
        </svg>
      ),
      iconBg: 'bg-teal-100 dark:bg-teal-900/30',
    },
    {
      label: 'Total Polls',
      value: stats.totalPolls,
      icon: (
        <svg className="w-5 h-5 sm:w-6 sm:h-6 text-accent-500 dark:text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      iconBg: 'bg-accent-100 dark:bg-accent-900/30',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">

      {/* AI Summary Modal */}
      {summaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setSummaryModal(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-white text-base">AI Session Summary</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-xs">{summaryModal.title}</p>
              </div>
              <button onClick={() => setSummaryModal(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none px-1">✕</button>
            </div>
            <div className="overflow-y-auto px-5 py-4">
              <SummaryContent summaryText={summaryModal.text} />
            </div>
          </div>
        </div>
      )}

      {/* End Session Dialog */}
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

      {/* Welcome Header — glass card with gradient accent */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 to-primary-800 dark:from-primary-700 dark:to-primary-950 p-5 sm:p-7 text-white shadow-glow-primary">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-accent-500/10 rounded-full translate-y-1/2 -translate-x-1/2 pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <p className="text-primary-200 text-sm font-medium mb-1">Good day</p>
            <h1 className="text-xl sm:text-3xl font-bold font-display">{currentUser?.fullName || 'Teacher'}</h1>
            <p className="text-primary-200 mt-1 text-sm">Manage your sessions and engage with students</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
            <Button
              variant="glass"
              onClick={() => navigate('/teacher/analytics')}
              className="w-full sm:w-auto bg-white/10 hover:bg-white/20 text-white border-white/20"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Analytics
            </Button>
            <Button
              variant="accent"
              onClick={() => navigate('/teacher/create-session')}
              className="w-full sm:w-auto"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Session
            </Button>
          </div>
        </div>
      </div>

      {/* Stats — 3-column bento */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {statCards.map((stat, i) => (
          <Card key={stat.label} variant="glass" className="hover:shadow-card-hover transition-shadow duration-200 animate-fade-up" style={{ animationDelay: `${i * 80}ms` }}>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className={`p-2.5 rounded-xl ${stat.iconBg} flex-shrink-0`}>
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

      {/* Sessions list */}
      <Card variant="glass">
        <CardHeader className="border-b border-slate-200/60 dark:border-slate-700/60">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
            <div>
              <CardTitle className="text-lg sm:text-xl">All Sessions</CardTitle>
              <CardDescription className="mt-1">Manage and revisit your class sessions</CardDescription>
            </div>
            <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-3 py-1 rounded-full">
              {total} sessions
            </span>
          </div>
        </CardHeader>

        {sessions.length === 0 ? (
          <CardContent className="py-12 sm:py-16 text-center">
            <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">No sessions yet</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Create your first session to get started</p>
            <Button onClick={() => navigate('/teacher/create-session')} className="w-full sm:w-auto">
              Create Your First Session
            </Button>
          </CardContent>
        ) : (
          <div className="divide-y divide-slate-200/60 dark:divide-slate-700/60">
            {sessions.map((session) => (
              <div key={session.id} className="p-4 sm:p-5 hover:bg-primary-50/50 dark:hover:bg-primary-900/10 transition-colors duration-200 cursor-pointer group">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white truncate group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">
                        {session.title}
                      </h3>
                      {session.is_active ? (
                        <Badge variant="live" dot>Active</Badge>
                      ) : (
                        <Badge variant="ended" dot>Ended</Badge>
                      )}
                      {session.subject && (
                        <span className="text-xs bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 px-2 py-0.5 rounded-full font-medium capitalize">
                          {session.subject}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{session.course_name}</p>
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        Code: <strong className="text-primary-600 dark:text-primary-400 font-mono">{session.session_id}</strong>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {session.participant_count || 0} students
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => navigate(`/teacher/session/${session.session_id}`)}>
                      Manage
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate(`/session/${session.session_id}/resources`)}>
                      Resources
                    </Button>
                    {session.summary_status === 'completed' && session.summary_text && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSummaryModal({ title: session.title, text: session.summary_text })}
                        className="text-indigo-600 border-indigo-300 hover:bg-indigo-50 dark:text-indigo-400 dark:border-indigo-700 dark:hover:bg-indigo-900/20"
                      >
                        AI Summary
                      </Button>
                    )}
                    {session.is_active && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setConfirmEnd({ sessionId: session.session_id, title: session.title })}
                      >
                        End
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-t border-slate-200/60 dark:border-slate-700/60">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Showing {(page - 1) * SESSIONS_PER_PAGE + 1}–{Math.min(page * SESSIONS_PER_PAGE, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs text-slate-500 dark:text-slate-400 px-1">
                {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default EnhancedTeacherDashboard;
