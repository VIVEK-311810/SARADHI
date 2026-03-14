import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '../ui/button';
import ThemeToggle from './ThemeToggle';
import { safeParseUser } from '../../utils/api';

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentUser = safeParseUser();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('authToken');
    setMobileMenuOpen(false);
    navigate('/auth');
  };

  const handleNavigation = (path) => {
    setMobileMenuOpen(false);
    navigate(path);
  };

  const isAuthPage = location.pathname.startsWith('/auth');

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  const navLinkClass = (path) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive(path)
        ? 'bg-saradhi-50 text-saradhi-700 dark:bg-saradhi-900/30 dark:text-saradhi-400'
        : 'text-slate-600 hover:text-saradhi-700 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-saradhi-400 dark:hover:bg-slate-800'
    }`;

  return (
    <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-sm border-b border-slate-200/50 dark:border-slate-700/50 sticky top-0 z-50 transition-colors duration-200">
      <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
        <div className="flex justify-between items-center">
          {/* Logo */}
          <div className="flex items-center gap-2 sm:gap-3 cursor-pointer" onClick={() => navigate(currentUser ? `/${currentUser.role}/dashboard` : '/auth')}>
            <img
              src="/saradhi_ai_logo_final.png"
              alt="SARADHI-AI Logo"
              className="h-8 sm:h-10 w-auto object-contain dark:hidden"
            />
            <img
              src="/saradhi_ai_logo_dark.png"
              alt="SARADHI-AI Logo"
              className="h-8 sm:h-10 w-auto object-contain hidden dark:block"
              style={{ filter: 'saturate(0.45) brightness(0.85)' }}
            />
            <h1 className="text-lg sm:text-xl font-bold font-display text-saradhi-700 dark:text-saradhi-400">SARADHI-AI</h1>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {!isAuthPage && currentUser && (
              <>
                {currentUser.role === 'teacher' && (
                  <>
                    <button onClick={() => navigate('/teacher/dashboard')} className={navLinkClass('/teacher/dashboard')}>
                      Dashboard
                    </button>
                    <button onClick={() => navigate('/teacher/create-session')} className={navLinkClass('/teacher/create-session')}>
                      Create Session
                    </button>
                    <button onClick={() => navigate('/teacher/analytics')} className={navLinkClass('/teacher/analytics')}>
                      Analytics
                    </button>
                    <button onClick={() => navigate('/community')} className={navLinkClass('/community')}>
                      Community
                    </button>
                  </>
                )}

                {currentUser.role === 'student' && (
                  <>
                    <button onClick={() => navigate('/student/dashboard')} className={navLinkClass('/student/dashboard')}>
                      Dashboard
                    </button>
                    <button onClick={() => navigate('/student/join')} className={navLinkClass('/student/join')}>
                      Join Session
                    </button>
                    <button onClick={() => navigate('/student/leaderboard')} className={navLinkClass('/student/leaderboard')}>
                      Leaderboard
                    </button>
                    <button onClick={() => navigate('/community')} className={navLinkClass('/community')}>
                      Community
                    </button>
                  </>
                )}

                <ThemeToggle className="mx-1" />

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  className="ml-1 text-slate-500 border border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:border-slate-700 dark:hover:bg-red-900/20 dark:hover:text-red-400 dark:hover:border-red-800"
                >
                  Logout
                </Button>
              </>
            )}

            {/* Show theme toggle on auth page too */}
            {isAuthPage && <ThemeToggle />}
          </nav>

          {/* Mobile right side: theme toggle + hamburger */}
          <div className="flex items-center gap-1 md:hidden">
            <ThemeToggle />
            {!isAuthPage && currentUser && (
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {mobileMenuOpen && !isAuthPage && currentUser && (
          <nav className="md:hidden mt-4 pb-2 border-t border-slate-200 dark:border-slate-700 pt-4">
            <div className="flex flex-col gap-1">
              {currentUser.role === 'teacher' && (
                <>
                  <button onClick={() => handleNavigation('/teacher/dashboard')} className={`text-left px-4 py-3 rounded-lg text-base font-medium ${isActive('/teacher/dashboard') ? 'bg-saradhi-50 text-saradhi-700 dark:bg-saradhi-900/30 dark:text-saradhi-400' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                    Dashboard
                  </button>
                  <button onClick={() => handleNavigation('/teacher/create-session')} className={`text-left px-4 py-3 rounded-lg text-base font-medium ${isActive('/teacher/create-session') ? 'bg-saradhi-50 text-saradhi-700 dark:bg-saradhi-900/30 dark:text-saradhi-400' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                    Create Session
                  </button>
                  <button onClick={() => handleNavigation('/teacher/analytics')} className={`text-left px-4 py-3 rounded-lg text-base font-medium ${isActive('/teacher/analytics') ? 'bg-saradhi-50 text-saradhi-700 dark:bg-saradhi-900/30 dark:text-saradhi-400' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                    Analytics
                  </button>
                  <button onClick={() => handleNavigation('/community')} className={`text-left px-4 py-3 rounded-lg text-base font-medium ${isActive('/community') ? 'bg-saradhi-50 text-saradhi-700 dark:bg-saradhi-900/30 dark:text-saradhi-400' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                    Community
                  </button>
                </>
              )}

              {currentUser.role === 'student' && (
                <>
                  <button onClick={() => handleNavigation('/student/dashboard')} className={`text-left px-4 py-3 rounded-lg text-base font-medium ${isActive('/student/dashboard') ? 'bg-saradhi-50 text-saradhi-700 dark:bg-saradhi-900/30 dark:text-saradhi-400' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                    Dashboard
                  </button>
                  <button onClick={() => handleNavigation('/student/join')} className={`text-left px-4 py-3 rounded-lg text-base font-medium ${isActive('/student/join') ? 'bg-saradhi-50 text-saradhi-700 dark:bg-saradhi-900/30 dark:text-saradhi-400' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                    Join Session
                  </button>
                  <button onClick={() => handleNavigation('/student/leaderboard')} className={`text-left px-4 py-3 rounded-lg text-base font-medium ${isActive('/student/leaderboard') ? 'bg-saradhi-50 text-saradhi-700 dark:bg-saradhi-900/30 dark:text-saradhi-400' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                    Leaderboard
                  </button>
                  <button onClick={() => handleNavigation('/community')} className={`text-left px-4 py-3 rounded-lg text-base font-medium ${isActive('/community') ? 'bg-saradhi-50 text-saradhi-700 dark:bg-saradhi-900/30 dark:text-saradhi-400' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                    Community
                  </button>
                </>
              )}

              <div className="border-t border-slate-200 dark:border-slate-700 mt-2 pt-2">
                <div className="px-4 py-2 text-sm text-slate-500 dark:text-slate-400">
                  Signed in as {currentUser.fullName || currentUser.full_name}
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full text-left text-red-600 hover:bg-red-50 px-4 py-3 rounded-lg text-base font-medium dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  Logout
                </button>
              </div>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
};

export default Header;
