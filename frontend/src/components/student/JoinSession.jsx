import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { apiRequest, safeParseUser } from '../../utils/api';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Input } from '../ui/input';

const JoinSession = () => {
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const currentUser = safeParseUser();
    if (!currentUser || currentUser.role !== 'student') {
      navigate('/auth');
    }
  }, [navigate]);

  const handleJoinSession = async (e) => {
    e.preventDefault();
    if (!sessionId.trim()) return;

    const currentUser = safeParseUser();
    if (!currentUser || !currentUser.id) {
      toast.error('Please log in first to join a session.');
      navigate('/auth');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const joinData = await apiRequest(`/sessions/${sessionId.toUpperCase()}/join`, {
        method: 'POST',
        body: JSON.stringify({ student_id: currentUser.id }),
      });

      if (joinData && joinData.session) {
        const sessionData = joinData.session;
        const sessionInfo = {
          sessionId: sessionData.session_id,
          title: sessionData.title,
          course_name: sessionData.course_name,
          joinedAt: new Date().toISOString(),
        };
        const existingSessions = JSON.parse(localStorage.getItem('joinedSessions') || '[]');
        const updatedSessions = existingSessions.filter(s => s.sessionId !== sessionData.session_id);
        updatedSessions.unshift(sessionInfo);
        localStorage.setItem('joinedSessions', JSON.stringify(updatedSessions.slice(0, 10)));

        toast.success(`Joined "${sessionData.title}"!`);
        navigate(`/student/session/${sessionData.session_id}`);
      } else {
        setError('Failed to join session: Invalid response from server');
      }
    } catch (error) {
      console.error('Error joining session:', error);
      setError('Failed to join session. Check the session code and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6 sm:mb-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent-100 dark:bg-accent-900/30 mb-4">
          <svg className="w-7 h-7 text-accent-600 dark:text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold font-display text-slate-900 dark:text-white">Join a Session</h1>
        <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-1">Enter the Session Code provided by your teacher</p>
      </div>

      <Card variant="glass">
        <CardContent className="p-5 sm:p-7">
          <form onSubmit={handleJoinSession} className="space-y-4 sm:space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 text-center">
                Session Code
              </label>
              <Input
                type="text"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value.toUpperCase())}
                className="text-center text-xl sm:text-3xl font-mono tracking-[0.15em] sm:tracking-[0.3em] h-14 sm:h-16 border-2 border-slate-300 dark:border-slate-600 focus:border-primary-400"
                placeholder="ABC123"
                maxLength="6"
                required
                autoComplete="off"
                autoCapitalize="characters"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center">
                6 characters — letters and numbers
              </p>
            </div>

            {error && (
              <div className="bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-xl p-3 sm:p-4 flex items-start gap-2">
                <svg className="w-4 h-4 text-error-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-error-700 dark:text-error-300 text-sm">{error}</p>
              </div>
            )}

            <Button type="submit" disabled={loading || !sessionId.trim()} className="w-full h-12 text-base" variant="accent">
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Joining...
                </span>
              ) : 'Join Session'}
            </Button>
          </form>

          <div className="mt-5 text-center">
            <button
              onClick={() => navigate('/student/dashboard')}
              className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 text-sm font-medium py-2 cursor-pointer transition-colors"
            >
              ← Back to dashboard
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default JoinSession;
