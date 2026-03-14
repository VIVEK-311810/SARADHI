import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { utils } from '../../utils/api';
import LoadingSpinner from './LoadingSpinner';

const SessionHistory = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const currentUser = utils.getCurrentUser();

  useEffect(() => {
    fetchSessionHistory();
  }, []);

  const fetchSessionHistory = async () => {
    try {
      setLoading(true);

      // Mock data for now - in real implementation, this would come from API
      const mockSessions = currentUser?.role === 'teacher'
        ? [
            {
              id: 1,
              session_id: 'ABC123',
              title: 'Introduction to React',
              course_name: 'Web Development',
              created_at: '2024-08-20T10:00:00Z',
              status: 'completed',
              participant_count: 25
            },
            {
              id: 2,
              session_id: 'DEF456',
              title: 'Advanced JavaScript Concepts',
              course_name: 'Programming Fundamentals',
              created_at: '2024-08-22T14:30:00Z',
              status: 'active',
              participant_count: 18
            },
            {
              id: 3,
              session_id: 'GHI789',
              title: 'Database Design Principles',
              course_name: 'Database Systems',
              created_at: '2024-08-19T09:15:00Z',
              status: 'completed',
              participant_count: 22
            }
          ]
        : [
            {
              id: 1,
              session_id: 'ABC123',
              title: 'Introduction to React',
              course_name: 'Web Development',
              teacher_name: 'Dr. Sarah Johnson',
              joined_at: '2024-08-20T10:05:00Z',
              status: 'completed',
              polls_answered: 8
            },
            {
              id: 2,
              session_id: 'DEF456',
              title: 'Advanced JavaScript Concepts',
              course_name: 'Programming Fundamentals',
              teacher_name: 'Prof. Michael Chen',
              joined_at: '2024-08-22T14:35:00Z',
              status: 'active',
              polls_answered: 3
            },
            {
              id: 4,
              session_id: 'JKL012',
              title: 'Machine Learning Basics',
              course_name: 'Artificial Intelligence',
              teacher_name: 'Dr. Priya Sharma',
              joined_at: '2024-08-21T11:20:00Z',
              status: 'completed',
              polls_answered: 12
            }
          ];

      setSessions(mockSessions);
    } catch (err) {
      setError('Failed to load session history');
      console.error('Error fetching session history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRejoinSession = (sessionId) => {
    if (currentUser?.role === 'teacher') {
      navigate(`/teacher/session/${sessionId}`);
    } else {
      navigate(`/student/session/${sessionId}`);
    }
  };

  const handleViewResources = (sessionId) => {
    navigate(`/session/${sessionId}/resources`);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status) => {
    const baseClasses = "px-2 py-0.5 sm:py-1 rounded-full text-xs font-medium whitespace-nowrap";
    if (status === 'active') {
      return `${baseClasses} bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300`;
    } else if (status === 'completed') {
      return `${baseClasses} bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300`;
    }
    return `${baseClasses} bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <LoadingSpinner text="Loading session history..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 px-4">
        <div className="text-red-600 dark:text-red-400 mb-4">{error}</div>
        <button
          onClick={fetchSessionHistory}
          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-6 rounded-lg"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
          {currentUser?.role === 'teacher' ? 'My Sessions' : 'Joined Sessions'}
        </h1>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300">
          {currentUser?.role === 'teacher'
            ? 'View and manage your previously created sessions'
            : 'Access your previously joined sessions and resources'
          }
        </p>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-8 sm:py-12">
          <div className="text-gray-500 dark:text-gray-400 mb-4 text-sm sm:text-base">
            {currentUser?.role === 'teacher'
              ? 'No sessions created yet'
              : 'No sessions joined yet'
            }
          </div>
          <button
            onClick={() => navigate(currentUser?.role === 'teacher' ? '/teacher/create-session' : '/student/join')}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-6 rounded-lg"
          >
            {currentUser?.role === 'teacher' ? 'Create First Session' : 'Join a Session'}
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:gap-6">
          {sessions.map((session) => (
            <div key={session.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
              <div className="flex flex-col gap-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                    <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">{session.title}</h3>
                    <span className={getStatusBadge(session.status)}>
                      {session.status}
                    </span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 mb-1 text-sm sm:text-base">{session.course_name}</p>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                    <span className="font-medium text-blue-600">ID: {session.session_id}</span>
                    {currentUser?.role === 'teacher' ? (
                      <>
                        <span className="hidden sm:inline">Created: {formatDate(session.created_at)}</span>
                        <span>{session.participant_count} participants</span>
                      </>
                    ) : (
                      <>
                        <span>Teacher: {session.teacher_name}</span>
                        <span className="hidden sm:inline">Joined: {formatDate(session.joined_at)}</span>
                        <span>{session.polls_answered} polls</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:flex gap-2 sm:gap-3">
                  <button
                    onClick={() => handleRejoinSession(session.session_id)}
                    className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium py-2.5 sm:py-2 px-4 rounded-lg text-sm"
                  >
                    {currentUser?.role === 'teacher' ? 'Manage' : 'Rejoin'}
                  </button>

                  <button
                    onClick={() => handleViewResources(session.session_id)}
                    className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 active:bg-gray-300 dark:active:bg-gray-500 text-gray-700 dark:text-gray-300 font-medium py-2.5 sm:py-2 px-4 rounded-lg text-sm flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Resources</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 sm:mt-8 text-center">
        <button
          onClick={() => navigate(currentUser?.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard')}
          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium py-2"
        >
          ← Back to Dashboard
        </button>
      </div>
    </div>
  );
};

export default SessionHistory;
