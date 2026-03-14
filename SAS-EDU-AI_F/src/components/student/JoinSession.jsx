import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { apiRequest, safeParseUser } from '../../utils/api';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
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
    <div className="max-w-2xl mx-auto px-4 sm:px-6">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white">Join a Session</h1>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 mt-2">Enter the Session Code provided by your teacher</p>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <form onSubmit={handleJoinSession} className="space-y-4 sm:space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Session Code *</label>
              <Input
                type="text"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value.toUpperCase())}
                className="text-center text-xl sm:text-2xl font-mono tracking-wider h-14"
                placeholder="ABC123"
                maxLength="6"
                required
                autoComplete="off"
                autoCapitalize="characters"
              />
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1.5 text-center">
                Session codes are 6 characters (letters and numbers)
              </p>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 sm:p-4 flex items-start gap-2">
                <svg className="w-4 h-4 text-red-500 dark:text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || !sessionId.trim()}
              className="w-full h-12 text-base"
            >
              {loading ? 'Joining...' : 'Join Session'}
            </Button>
          </form>

          <div className="mt-4 sm:mt-5 text-center">
            <button
              onClick={() => navigate('/student/dashboard')}
              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm sm:text-base py-2 font-medium"
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
