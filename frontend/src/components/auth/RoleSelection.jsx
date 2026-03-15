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

const CheckIcon = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
  </svg>
);

const ArrowIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
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
    <div className="min-h-screen relative overflow-hidden bg-slate-950 flex items-center justify-center p-4">
      {/* Gradient mesh background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-primary-600/30 rounded-full blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] bg-accent-500/20 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-primary-800/20 rounded-full blur-[80px]" />
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />
      </div>

      {/* Main glass card */}
      <div className="relative z-10 w-full max-w-xl">
        {/* Logo + heading */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-glow-primary mb-5 animate-float">
            <img src="/saradhi_ai_logo_final.png" alt="SARADHI-AI" className="w-12 h-12 object-contain" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-white mb-2 tracking-tight">
            Welcome to SARADHI-AI
          </h1>
          <p className="text-slate-400 text-base">
            SASTRA's AI-powered interactive classroom platform
          </p>
        </div>

        {/* Glass container */}
        <div className="bg-white/[0.07] backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 shadow-glass-lg">
          {/* Role cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {/* Teacher */}
            <button
              onClick={() => handleRoleSelect('teacher')}
              disabled={!!selectedRole}
              className="group relative text-left rounded-2xl border border-white/10 bg-white/5 hover:bg-primary-600/20 hover:border-primary-400/50 p-5 transition-all duration-200 cursor-pointer disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            >
              <div className="w-12 h-12 rounded-xl bg-primary-500/20 border border-primary-400/30 flex items-center justify-center mb-4 group-hover:bg-primary-500/30 transition-colors">
                <svg className="w-6 h-6 text-primary-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h3 className="font-semibold text-white text-base mb-1">Teacher</h3>
              <p className="text-xs text-slate-400 mb-3">@*.sastra.edu</p>
              <ul className="space-y-1.5">
                {['Manage sessions & polls', 'View analytics', 'Upload resources'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-xs text-slate-300">
                    <CheckIcon />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center gap-1.5 text-primary-300 text-sm font-medium">
                Sign in <ArrowIcon />
              </div>
              {selectedRole === 'teacher' && (
                <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-primary-900/60 backdrop-blur-sm">
                  <div className="w-5 h-5 border-2 border-primary-300 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </button>

            {/* Student */}
            <button
              onClick={() => handleRoleSelect('student')}
              disabled={!!selectedRole}
              className="group relative text-left rounded-2xl border border-white/10 bg-white/5 hover:bg-accent-500/15 hover:border-accent-400/50 p-5 transition-all duration-200 cursor-pointer disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
            >
              <div className="w-12 h-12 rounded-xl bg-accent-500/20 border border-accent-400/30 flex items-center justify-center mb-4 group-hover:bg-accent-500/30 transition-colors">
                <svg className="w-6 h-6 text-accent-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                </svg>
              </div>
              <h3 className="font-semibold text-white text-base mb-1">Student</h3>
              <p className="text-xs text-slate-400 mb-3">@sastra.ac.in</p>
              <ul className="space-y-1.5">
                {['Join live sessions', 'Answer polls & quizzes', 'AI learning assistant'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-xs text-slate-300">
                    <CheckIcon />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center gap-1.5 text-accent-300 text-sm font-medium">
                Sign in <ArrowIcon />
              </div>
              {selectedRole === 'student' && (
                <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-900/60 backdrop-blur-sm">
                  <div className="w-5 h-5 border-2 border-accent-300 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-slate-500">or sign in directly</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Google SSO */}
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 font-semibold py-3 px-6 rounded-xl transition-all duration-150 text-sm shadow-sm cursor-pointer mb-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          >
            <GoogleIcon />
            Sign in with Google
            <span className="text-slate-400 font-normal text-xs">(role auto-detected)</span>
          </button>

          {/* Security notice */}
          <div className="flex items-start gap-3 bg-primary-500/10 border border-primary-500/20 rounded-xl p-3.5 mb-5">
            <svg className="w-4 h-4 text-primary-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <p className="text-xs text-slate-400">
              Protected by Google OAuth2 — we never store your password. Official SASTRA credentials required.
            </p>
          </div>

          {/* Demo buttons */}
          <div className="border-t border-white/10 pt-5">
            <p className="text-xs text-slate-500 text-center mb-3">Try a demo — no login required</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleDemoLogin}
                className="flex items-center gap-2.5 border border-dashed border-primary-500/40 text-primary-300 hover:bg-primary-500/10 font-medium py-2.5 px-3 rounded-xl text-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <div>
                  <div className="font-semibold">Student Demo</div>
                  <div className="text-primary-500 font-normal">Polls, AI assistant</div>
                </div>
              </button>
              <button
                onClick={handleTeacherDemoLogin}
                className="flex items-center gap-2.5 border border-dashed border-accent-500/40 text-accent-300 hover:bg-accent-500/10 font-medium py-2.5 px-3 rounded-xl text-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                <div>
                  <div className="font-semibold">Teacher Demo</div>
                  <div className="text-accent-500 font-normal">Sessions, analytics</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoleSelection;
