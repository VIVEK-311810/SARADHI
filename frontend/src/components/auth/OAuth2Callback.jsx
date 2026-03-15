import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import LoadingSpinner from '../shared/LoadingSpinner';

const ALLOWED_ROLES = ['teacher', 'student'];

const OAuth2Callback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('processing');
  const [error, setError] = useState('');

  useEffect(() => {
    const processCallback = async () => {
      try {
        const token = searchParams.get('token');
        const userParam = searchParams.get('user');
        const errorParam = searchParams.get('error');

        if (errorParam) {
          let errorMessage = 'Authentication failed';
          switch (errorParam) {
            case 'auth_failed':
              errorMessage = 'Authentication failed. Please try again.';
              break;
            case 'token_generation_failed':
              errorMessage = 'Failed to generate authentication token.';
              break;
            default:
              errorMessage = 'An unknown error occurred during authentication.';
          }
          setError(errorMessage);
          setStatus('error');
          return;
        }

        if (!token || !userParam) {
          setError('Missing authentication data. Please try logging in again.');
          setStatus('error');
          return;
        }

        // Parse user data — guard against malformed URL param
        let user;
        try {
          user = JSON.parse(decodeURIComponent(userParam));
        } catch {
          setError('Invalid authentication data. Please try logging in again.');
          setStatus('error');
          return;
        }

        // Validate user data — strict allowlist to prevent prototype pollution / unexpected fields being trusted
        if (
          !user ||
          user.id == null ||
          typeof user.email !== 'string' || !user.email ||
          typeof user.role !== 'string' || !ALLOWED_ROLES.includes(user.role) ||
          typeof user.fullName !== 'string' || !user.fullName.trim()
        ) {
          setError('Invalid user data received. Please try logging in again.');
          setStatus('error');
          return;
        }

        // Validate SASTRA domain (allow exact @sastra.edu and dept subdomains)
        const isValidTeacher = user.role === 'teacher' && (user.email.endsWith('@sastra.edu') || user.email.endsWith('.sastra.edu'));
        const isValidStudent = user.role === 'student' && /^\d+@sastra\.ac\.in$/.test(user.email);
        
        if (!isValidTeacher && !isValidStudent) {
          setError('Access denied. Only @sastra.edu (teachers) and @sastra.ac.in (students) email addresses are allowed.');
          setStatus('error');
          return;
        }

        // Store authentication data
        localStorage.setItem('authToken', token);
        localStorage.setItem('currentUser', JSON.stringify(user));

        setStatus('success');

        // Redirect based on role
        setTimeout(() => {
          if (user.role === 'teacher') {
            navigate('/teacher/dashboard');
          } else if (user.role === 'student') {
            navigate('/student/dashboard');
          } else {
            navigate('/auth');
          }
        }, 1500);

      } catch {
        setError('Failed to process authentication. Please try again.');
        setStatus('error');
      }
    };

    processCallback();
  }, [searchParams, navigate]);

  const handleRetry = () => {
    navigate('/auth');
  };

  if (status === 'processing') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="card p-8 w-full max-w-md text-center">
          <LoadingSpinner text="Processing authentication..." />
          <p className="text-slate-600 dark:text-slate-300 mt-4">Please wait while we verify your SASTRA credentials.</p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="card p-8 w-full max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Authentication Successful!</h2>
          <p className="text-slate-600 dark:text-slate-300 mb-4">Welcome to SARADHY-AI: SARA MODULE</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Redirecting to your dashboard...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="card p-8 w-full max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Authentication Failed</h2>
          <p className="text-red-600 dark:text-red-400 mb-6">{error}</p>
          <button
            onClick={handleRetry}
            className="btn-primary w-full"
          >
            Try Again
          </button>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mt-6">
            <p className="text-sm text-yellow-800 dark:text-yellow-300 mb-2">
              <strong>Remember:</strong>
            </p>
            <ul className="text-xs text-yellow-700 dark:text-yellow-400 text-left space-y-1">
              <li>• Teachers must use @sastra.edu email addresses</li>
              <li>• Students must use @sastra.ac.in email addresses</li>
              <li>• Make sure you're signed into the correct Google account</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default OAuth2Callback;

