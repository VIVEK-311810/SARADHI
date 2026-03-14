import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import LoadingSpinner from '../shared/LoadingSpinner';
import { apiRequest } from '../../utils/api';

const SessionResources = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSession();
    fetchResources();
  }, [sessionId]);

  const fetchSession = async () => {
    try {
      const data = await apiRequest(`/sessions/${sessionId}`);
      setSession(data);
    } catch (error) {
      console.error('Error fetching session:', error);
    }
  };

  const fetchResources = async () => {
    try {
      const data = await apiRequest(`/sessions/${sessionId}/resources`);
      setResources(data);
    } catch (error) {
      console.error('Error fetching resources:', error);
    } finally {
      setLoading(false);
    }
  };

  const getResourceIcon = (type) => {
    switch (type) {
      case 'note':
        return (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      case 'document':
        return (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      case 'link':
        return (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        );
      case 'transcript':
        return (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m-9 0h10a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2z" />
          </svg>
        );
      default:
        return (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return <LoadingSpinner text="Loading resources..." />;
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Session Header */}
      {session && (
        <div className="card mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-800 dark:text-white">{session.title}</h1>
              <p className="text-gray-600 dark:text-gray-400">{session.course_name}</p>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-primary-600 dark:text-blue-400">ID: {session.session_id}</div>
              <button
                onClick={() => navigate(`/student/session/${sessionId}`)}
                className="btn-secondary text-sm mt-2"
              >
                Back to Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resources */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-6">Session Resources</h2>

        {resources.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <svg className="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">No resources yet</h3>
            <p className="text-gray-500 dark:text-gray-400">Your teacher will share notes and materials here during the session.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {resources.map((resource) => (
              <div key={resource.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:shadow-md transition-all">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 text-primary-600 dark:text-blue-400">
                    {getResourceIcon(resource.resource_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-medium text-gray-800 dark:text-white">{resource.title}</h3>
                    {resource.description && (
                      <p className="text-gray-600 dark:text-gray-400 mt-1">{resource.description}</p>
                    )}
                    <div className="flex items-center justify-between mt-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 dark:bg-blue-900/30 text-primary-800 dark:text-blue-300 capitalize">
                        {resource.resource_type}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(resource.created_at)}
                      </span>
                    </div>

                    {/* Content Display */}
                    {resource.content && (
                      <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-sans">
                          {resource.content}
                        </pre>
                      </div>
                    )}

                    {/* File/Link Access */}
                    {resource.file_url && (
                      <div className="mt-3">
                        <a
                          href={resource.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-primary text-sm"
                        >
                          {resource.resource_type === 'link' ? 'Visit Link' : 'Download File'}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 text-center">
        <button
          onClick={() => navigate('/student/dashboard')}
          className="text-primary-600 dark:text-blue-400 hover:text-primary-800 dark:hover:text-blue-300 text-sm"
        >
          ← Back to dashboard
        </button>
      </div>
    </div>
  );
};

export default SessionResources;

