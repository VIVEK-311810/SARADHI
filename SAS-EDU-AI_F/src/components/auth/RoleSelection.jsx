import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { enterDemoMode, enterTeacherDemoMode } from '../../utils/demoData';

const GoogleIcon = () => (
  <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const RoleSelection = () => {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState('');

  const handleGoogleLogin = () => {
    const AUTH_URL = process.env.REACT_APP_AUTH_URL;
    window.location.href = `${AUTH_URL}/auth/google`;
  };

  const handleDemoLogin = () => {
    enterDemoMode();
    navigate('/student/dashboard');
  };

  const handleTeacherDemoLogin = () => {
    enterTeacherDemoMode();
    navigate('/teacher/dashboard');
  };

  const handleRoleSelect = (role) => {
    setSelectedRole(role);

    const API_BASE_URL = process.env.REACT_APP_AUTH_URL;

    if (role === 'teacher') {
      window.location.href = `${API_BASE_URL}/auth/google/edu`;
    } else if (role === 'student') {
      window.location.href = `${API_BASE_URL}/auth/google/acin`;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-saradhi-50 via-white to-coral-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900">
      {/* Mobile View */}
      <div className="lg:hidden p-4">
        <div className="max-w-md mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
          <div className="text-center mb-6">
            <img src="/saradhi_ai_logo_final.png" alt="SARADHI-AI Logo" className="h-16 w-auto mx-auto mb-4" />
            <h1 className="text-2xl font-bold font-display text-slate-900 dark:text-white mb-2">SASTRA Educational Platform</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">Interactive Learning & Real-time Polling</p>
          </div>

          <div className="space-y-4">
            {/* Teacher Card - Mobile */}
            <div
              onClick={() => handleRoleSelect('teacher')}
              className="border-2 border-slate-300 dark:border-slate-600 rounded-xl p-4 hover:border-saradhi-500 hover:bg-saradhi-50 active:bg-saradhi-100 dark:hover:border-saradhi-400 dark:hover:bg-saradhi-900/20 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-saradhi-100 dark:bg-saradhi-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-7 h-7 text-saradhi-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Teacher</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">@*.sastra.edu email</p>
                  <button className="w-full bg-saradhi-700 hover:bg-saradhi-600 text-white font-medium py-2 px-4 rounded-lg text-sm">
                    Sign in as Teacher
                  </button>
                </div>
              </div>
            </div>

            {/* Student Card - Mobile */}
            <div
              onClick={() => handleRoleSelect('student')}
              className="border-2 border-slate-300 dark:border-slate-600 rounded-xl p-4 hover:border-coral-500 hover:bg-coral-50 active:bg-coral-100 dark:hover:border-coral-400 dark:hover:bg-coral-900/20 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-coral-100 dark:bg-coral-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-7 h-7 text-coral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Student</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">@sastra.ac.in email</p>
                  <button className="w-full bg-coral-500 hover:bg-coral-400 text-white font-medium py-2 px-4 rounded-lg text-sm">
                    Sign in as Student
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* SSO Button - Mobile */}
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-600"></div>
              <span className="text-xs text-slate-400 dark:text-slate-500">or sign in directly</span>
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-600"></div>
            </div>
            <button
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-2 bg-white dark:bg-slate-700 border-2 border-slate-300 dark:border-slate-600 hover:border-saradhi-400 hover:bg-saradhi-50 active:bg-saradhi-100 dark:hover:border-saradhi-400 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-medium py-3 px-4 rounded-xl transition-all text-sm"
            >
              <GoogleIcon />
              Sign in with Google
              <span className="text-slate-400 dark:text-slate-500 font-normal text-xs">(auto-detect role)</span>
            </button>
          </div>

          {/* Demo Buttons - Mobile */}
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center mb-2">Try a demo — no login required</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleDemoLogin}
                className="flex flex-col items-center gap-1 border-2 border-dashed border-saradhi-300 dark:border-saradhi-600 text-saradhi-700 dark:text-saradhi-400 hover:bg-saradhi-50 active:bg-saradhi-100 dark:hover:bg-saradhi-900/20 font-medium py-2.5 px-3 rounded-xl text-xs transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Student Demo
              </button>
              <button
                onClick={handleTeacherDemoLogin}
                className="flex flex-col items-center gap-1 border-2 border-dashed border-coral-300 dark:border-coral-600 text-coral-700 dark:text-coral-400 hover:bg-coral-50 active:bg-coral-100 dark:hover:bg-coral-900/20 font-medium py-2.5 px-3 rounded-xl text-xs transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                Teacher Demo
              </button>
            </div>
          </div>

          <div className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
            <p>Secured by Google OAuth2 • SASTRA Credentials Required</p>
          </div>
        </div>
      </div>

      {/* Desktop View - Split Screen */}
      <div className="hidden lg:flex min-h-screen">
        {/* Left Hero Section */}
        <div className="w-1/2 bg-gradient-to-br from-saradhi-700 to-saradhi-900 p-12 flex flex-col justify-center text-white relative overflow-hidden">
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-20 left-20 w-72 h-72 bg-white rounded-full blur-3xl"></div>
            <div className="absolute bottom-20 right-20 w-96 h-96 bg-saradhi-400 rounded-full blur-3xl"></div>
          </div>

          <div className="relative z-10 max-w-xl">

            <h1 className="text-5xl font-bold font-display mb-6">Welcome to<br />SASTRA Educational Platform</h1>
            <p className="text-xl text-saradhi-100 mb-12">Transform your classroom with interactive learning, real-time polling, and AI-powered assistance.</p>

            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-1">Real-time Engagement</h3>
                  <p className="text-saradhi-100 text-sm">Live polls, quizzes, and instant feedback for interactive learning</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-1">AI-Powered Learning</h3>
                  <p className="text-saradhi-100 text-sm">Smart resource search and personalized assistance for students</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-1">Advanced Analytics</h3>
                  <p className="text-saradhi-100 text-sm">Track performance, engagement, and learning outcomes</p>
                </div>
              </div>
            </div>

            <div className="mt-12 pt-8 border-t border-white/20">
              <p className="text-sm text-saradhi-100">Trusted by SASTRA University for innovative education</p>
            </div>
          </div>
        </div>

        {/* Right Login Section */}
        <div className="w-1/2 flex items-center justify-center p-12 bg-slate-50 dark:bg-slate-900">
          <div className="w-full max-w-lg">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold font-display text-slate-900 dark:text-white mb-3">Sign in to continue</h2>
              <p className="text-slate-600 dark:text-slate-300">Select your role to access the platform</p>
            </div>

            <div className="space-y-6">
              {/* Teacher Card - Desktop */}
              <div
                onClick={() => handleRoleSelect('teacher')}
                className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl p-8 hover:border-saradhi-500 dark:hover:border-saradhi-400 hover:shadow-xl transition-all cursor-pointer group"
              >
                <div className="flex items-start gap-6">
                  <div className="w-16 h-16 bg-saradhi-100 dark:bg-saradhi-900/30 rounded-2xl flex items-center justify-center group-hover:bg-saradhi-200 dark:group-hover:bg-saradhi-900/50 transition-colors flex-shrink-0">
                    <svg className="w-8 h-8 text-saradhi-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Teacher</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Use your @*.sastra.edu email</p>

                    <div className="space-y-2 mb-5">
                      <div className="flex items-center text-sm text-slate-700 dark:text-slate-300">
                        <svg className="w-4 h-4 text-saradhi-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Create and manage sessions
                      </div>
                      <div className="flex items-center text-sm text-slate-700 dark:text-slate-300">
                        <svg className="w-4 h-4 text-saradhi-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Create polls and track analytics
                      </div>
                      <div className="flex items-center text-sm text-slate-700 dark:text-slate-300">
                        <svg className="w-4 h-4 text-saradhi-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Upload resources and materials
                      </div>
                    </div>

                    <button className="w-full bg-saradhi-700 hover:bg-saradhi-600 text-white font-semibold py-3 px-6 rounded-xl transition-colors text-base flex items-center justify-center gap-2">
                      Sign in as Teacher
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Student Card - Desktop */}
              <div
                onClick={() => handleRoleSelect('student')}
                className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl p-8 hover:border-coral-500 dark:hover:border-coral-400 hover:shadow-xl transition-all cursor-pointer group"
              >
                <div className="flex items-start gap-6">
                  <div className="w-16 h-16 bg-coral-100 dark:bg-coral-900/30 rounded-2xl flex items-center justify-center group-hover:bg-coral-200 dark:group-hover:bg-coral-900/50 transition-colors flex-shrink-0">
                    <svg className="w-8 h-8 text-coral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Student</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Use your @sastra.ac.in email</p>

                    <div className="space-y-2 mb-5">
                      <div className="flex items-center text-sm text-slate-700 dark:text-slate-300">
                        <svg className="w-4 h-4 text-coral-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Join interactive sessions
                      </div>
                      <div className="flex items-center text-sm text-slate-700 dark:text-slate-300">
                        <svg className="w-4 h-4 text-coral-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Participate in polls and quizzes
                      </div>
                      <div className="flex items-center text-sm text-slate-700 dark:text-slate-300">
                        <svg className="w-4 h-4 text-coral-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Access AI learning assistant
                      </div>
                    </div>

                    <button className="w-full bg-coral-500 hover:bg-coral-400 text-white font-semibold py-3 px-6 rounded-xl transition-colors text-base flex items-center justify-center gap-2">
                      Sign in as Student
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* SSO Button - Desktop */}
            <div className="mt-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-600"></div>
                <span className="text-sm text-slate-400 dark:text-slate-500 whitespace-nowrap">or sign in directly</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-600"></div>
              </div>
              <button
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-3 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 hover:border-saradhi-400 dark:hover:border-saradhi-400 hover:shadow-md active:bg-saradhi-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold py-3.5 px-6 rounded-xl transition-all text-base"
              >
                <GoogleIcon />
                Sign in with Google
                <span className="text-xs font-normal text-slate-400 dark:text-slate-500">(role auto-detected from email)</span>
              </button>
            </div>

            {/* Security Notice */}
            <div className="mt-6 bg-saradhi-50 dark:bg-saradhi-900/20 rounded-xl p-4 border border-saradhi-100 dark:border-saradhi-800">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-saradhi-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Secure Authentication</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Your login is protected by Google OAuth2. We never store your password.</p>
                </div>
              </div>
            </div>

            {/* Demo Buttons - Desktop */}
            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-400 dark:text-slate-500 text-center mb-3">Try a live demo — no login required</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleDemoLogin}
                  className="flex items-center gap-3 border-2 border-dashed border-saradhi-300 dark:border-saradhi-600 text-saradhi-700 dark:text-saradhi-400 hover:bg-saradhi-50 active:bg-saradhi-100 dark:hover:bg-saradhi-900/20 font-medium py-3.5 px-4 rounded-xl transition-colors group"
                >
                  <svg className="w-5 h-5 flex-shrink-0 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <div className="text-left">
                    <div className="font-semibold text-sm">Student Demo</div>
                    <div className="text-xs text-saradhi-500 dark:text-saradhi-400 font-normal">Live polls, AI assistant</div>
                  </div>
                </button>
                <button
                  onClick={handleTeacherDemoLogin}
                  className="flex items-center gap-3 border-2 border-dashed border-coral-300 dark:border-coral-600 text-coral-700 dark:text-coral-400 hover:bg-coral-50 active:bg-coral-100 dark:hover:bg-coral-900/20 font-medium py-3.5 px-4 rounded-xl transition-colors group"
                >
                  <svg className="w-5 h-5 flex-shrink-0 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <div className="text-left">
                    <div className="font-semibold text-sm">Teacher Demo</div>
                    <div className="text-xs text-coral-500 dark:text-coral-400 font-normal">Sessions, polls, analytics</div>
                  </div>
                </button>
              </div>
            </div>

            <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-4">
              Having trouble? Make sure to use your official SASTRA email address.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoleSelection;
