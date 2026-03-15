import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Moon, Sun, Menu, User } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { cn } from '../../lib/utils';

// ── Route → page title ────────────────────────────────────────────────────────
const ROUTE_TITLES = [
  ['/teacher/dashboard',      'Dashboard'],
  ['/teacher/create-session', 'Create Session'],
  ['/teacher/analytics',      'Analytics'],
  ['/teacher/session',        'Session'],       // prefix match
  ['/student/dashboard',      'Dashboard'],
  ['/student/join',           'Join Session'],
  ['/student/leaderboard',    'Leaderboard'],
  ['/student/ai-assistant',   'AI Assistant'],  // prefix match
  ['/student/session',        'Session'],       // prefix match
  ['/community',              'Community'],
  ['/session-history',        'Session History'],
];

function getPageTitle(pathname) {
  for (const [path, title] of ROUTE_TITLES) {
    if (pathname === path || pathname.startsWith(path + '/')) return title;
  }
  return 'SARADHI';
}

// ── TopBar ────────────────────────────────────────────────────────────────────
export default function TopBar({ collapsed, onMobileMenuClick }) {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const pageTitle = getPageTitle(location.pathname);

  const user = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
  })();
  const role        = localStorage.getItem('role') || 'student';
  const displayName = user?.name || user?.email?.split('@')[0] || 'User';
  const email       = user?.email || '';
  const avatar      = user?.picture || null;
  const initials    = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close dropdown on route change
  useEffect(() => {
    setDropdownOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('role');
    navigate('/auth');
  };

  return (
    <header
      className={cn(
        'fixed top-0 right-0 z-20 h-14 flex items-center px-4 gap-3',
        'bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl',
        'border-b border-white/30 dark:border-slate-700/50',
        'shadow-topbar',
        'transition-[left] duration-250 ease-in-out',
        'left-0',
        collapsed ? 'md:left-[72px]' : 'md:left-[256px]',
      )}
    >
      {/* ── Mobile hamburger ── */}
      <button
        onClick={onMobileMenuClick}
        className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/60 hover:text-slate-700 dark:hover:text-white transition-colors flex-shrink-0"
        aria-label="Open navigation"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* ── Page title ── */}
      <h1 className="flex-1 min-w-0 font-display font-semibold text-slate-900 dark:text-white text-lg leading-none truncate">
        {pageTitle}
      </h1>

      {/* ── Right actions ── */}
      <div className="flex items-center gap-0.5 flex-shrink-0">

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/60 hover:text-slate-700 dark:hover:text-white transition-colors"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark'
            ? <Sun  className="w-[18px] h-[18px]" />
            : <Moon className="w-[18px] h-[18px]" />
          }
        </button>

        {/* Notifications */}
        <button
          className="relative flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/60 hover:text-slate-700 dark:hover:text-white transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-[18px] h-[18px]" />
          <span className="absolute top-2 right-2 w-[7px] h-[7px] bg-accent-500 rounded-full border-2 border-white dark:border-slate-900" />
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />

        {/* User avatar + dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(o => !o)}
            className={cn(
              'flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-xl transition-colors',
              'hover:bg-slate-100 dark:hover:bg-slate-700/60',
              dropdownOpen && 'bg-slate-100 dark:bg-slate-700/60',
            )}
            aria-expanded={dropdownOpen}
            aria-haspopup="true"
          >
            {/* Avatar */}
            {avatar ? (
              <img
                src={avatar}
                alt={displayName}
                className="w-7 h-7 rounded-lg object-cover flex-shrink-0 ring-2 ring-primary-200 dark:ring-primary-800"
              />
            ) : (
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">{initials}</span>
              </div>
            )}

            {/* Name (sm+) */}
            <div className="hidden sm:block text-left min-w-0">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-none truncate max-w-[96px]">
                {displayName}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 capitalize leading-none mt-0.5">
                {role}
              </p>
            </div>

            <ChevronDown className={cn(
              'w-3.5 h-3.5 text-slate-400 transition-transform duration-200 flex-shrink-0',
              dropdownOpen && 'rotate-180',
            )} />
          </button>

          {/* Dropdown */}
          {dropdownOpen && (
            <div className={cn(
              'absolute right-0 top-full mt-2 w-52 z-50',
              'rounded-xl bg-white dark:bg-slate-800',
              'border border-slate-200 dark:border-slate-700',
              'shadow-card-hover',
              'overflow-hidden',
              'animate-fade-up',
            )}>
              {/* User info header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700/60">
                {avatar ? (
                  <img src={avatar} alt={displayName} className="w-9 h-9 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-sm font-bold">{initials}</span>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{displayName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{email}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="py-1">
                <button
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors"
                  onClick={() => setDropdownOpen(false)}
                >
                  <User className="w-4 h-4 text-slate-400" />
                  <span>Profile</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
