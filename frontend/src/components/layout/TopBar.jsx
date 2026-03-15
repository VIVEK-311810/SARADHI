import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Moon, Sun, Menu, User, BarChart2, CheckSquare, BookOpen, HelpCircle, GraduationCap, FileText, Trophy, Users, AlertCircle, Upload } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useNotifications } from '../../context/NotificationContext';
import { cn } from '../../lib/utils';

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const TYPE_ICON_MAP = {
  poll:        { Icon: BarChart2,      cls: 'text-primary-500' },
  attendance:  { Icon: CheckSquare,    cls: 'text-green-500' },
  cards:       { Icon: BookOpen,       cls: 'text-teal-500' },
  quiz:        { Icon: HelpCircle,     cls: 'text-orange-500' },
  class:       { Icon: GraduationCap,  cls: 'text-primary-500' },
  notes:       { Icon: FileText,       cls: 'text-slate-500' },
  gamification:{ Icon: Trophy,         cls: 'text-yellow-500' },
  student:     { Icon: Users,          cls: 'text-slate-500' },
  stuck:       { Icon: AlertCircle,    cls: 'text-red-500' },
  resource:    { Icon: Upload,         cls: 'text-teal-500' },
};

function NotifIcon({ type }) {
  const { Icon, cls } = TYPE_ICON_MAP[type] || { Icon: Bell, cls: 'text-slate-400' };
  return (
    <span className={cn('flex-shrink-0 mt-0.5', cls)}>
      <Icon className="w-4 h-4" />
    </span>
  );
}

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
  const { notifications, unreadCount, markAllRead } = useNotifications();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const dropdownRef = useRef(null);
  const notifRef = useRef(null);

  const pageTitle = getPageTitle(location.pathname);

  const user = (() => {
    try { return JSON.parse(localStorage.getItem('currentUser') || '{}'); } catch { return {}; }
  })();
  const role        = user?.role || 'student';
  const displayName = user?.fullName || user?.name || user?.email?.split('@')[0] || 'User';
  const email       = user?.email || '';
  const avatar      = user?.picture || null;
  const initials    = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close dropdowns on route change
  useEffect(() => {
    setDropdownOpen(false);
    setNotifOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('isDemo');
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
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => { setNotifOpen(o => !o); if (!notifOpen) markAllRead(); }}
            className={cn(
              'relative flex items-center justify-center w-9 h-9 rounded-lg transition-colors',
              'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/60 hover:text-slate-700 dark:hover:text-white',
              notifOpen && 'bg-slate-100 dark:bg-slate-700/60',
            )}
            aria-label="Notifications"
          >
            <Bell className="w-[18px] h-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-accent-500 rounded-full text-[10px] text-white font-bold flex items-center justify-center px-0.5 border-2 border-white dark:border-slate-900">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className={cn(
              'absolute right-0 top-full mt-2 w-80 z-50',
              'rounded-2xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl',
              'border border-slate-200/60 dark:border-slate-700/60',
              'shadow-card-hover overflow-hidden animate-fade-up',
            )}>
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700/60">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Notifications
                </span>
                <button
                  onClick={markAllRead}
                  className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                >
                  Mark all read
                </button>
              </div>

              {/* List */}
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/40">
                {notifications.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No notifications yet</p>
                ) : notifications.map(n => (
                  <div
                    key={n.id}
                    className={cn(
                      'flex gap-3 px-4 py-3 text-sm',
                      !n.read && 'bg-primary-50/60 dark:bg-primary-900/10',
                    )}
                  >
                    <NotifIcon type={n.type} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 dark:text-slate-200 truncate">{n.title}</p>
                      {n.body && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-[10px] text-slate-400 mt-1">{timeAgo(n.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

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
