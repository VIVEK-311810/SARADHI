import React, { useState, useEffect, useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import {
  LayoutDashboard,
  PlusSquare,
  FolderOpen,
  BarChart2,
  MessageSquare,
  Trophy,
  Swords,
  LogOut,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Zap,
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils';

// ── Nav config ────────────────────────────────────────────────────────────────
const TEACHER_NAV = [
  { label: 'Dashboard',      href: '/teacher/dashboard',      icon: LayoutDashboard },
  { label: 'Sessions',       href: '/teacher/session',        icon: FolderOpen,     matchPrefix: true },
  { label: 'Create Session', href: '/teacher/create-session', icon: PlusSquare },
  { label: 'Analytics',      href: '/teacher/analytics',      icon: BarChart2 },
  { label: 'Competitions',   href: '/teacher/competition',    icon: Swords,         matchPrefix: true },
  { label: 'Community',      href: '/community',              icon: MessageSquare },
];

const STUDENT_NAV = [
  { label: 'Dashboard',    href: '/student/dashboard',   icon: LayoutDashboard },
  { label: 'Join Session', href: '/student/join',         icon: Zap },
  { label: 'Leaderboard',  href: '/student/leaderboard', icon: Trophy },
  { label: 'Community',    href: '/community',            icon: MessageSquare },
];

// ── Accessible Tooltip wrapper (Radix) ────────────────────────────────────────
function NavTooltip({ label, children, disabled }) {
  if (disabled) return children;
  return (
    <TooltipPrimitive.Provider delayDuration={0}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side="right"
            sideOffset={12}
            className={cn(
              'z-50 px-2.5 py-1.5 rounded-lg text-xs font-medium',
              'bg-slate-900 dark:bg-slate-700 text-white',
              'shadow-lg',
              'animate-slide-in-right',
            )}
          >
            {label}
            <TooltipPrimitive.Arrow className="fill-slate-900 dark:fill-slate-700" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
export default function Sidebar({ role, mobileOpen = false, setMobileOpen }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar_collapsed') === 'true'; } catch { return false; }
  });

  const location = useLocation();
  const navigate  = useNavigate();

  const navItems  = role === 'teacher' ? TEACHER_NAV : STUDENT_NAV;

  // Get user info for profile card
  const user = (() => {
    try { return JSON.parse(localStorage.getItem('currentUser') || '{}'); } catch { return {}; }
  })();
  const displayName = user?.fullName || user?.name || user?.email?.split('@')[0] || 'User';
  const avatar      = user?.picture || null;
  const initials    = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  // Persist collapsed state
  useEffect(() => {
    try { localStorage.setItem('sidebar_collapsed', String(collapsed)); } catch {}
  }, [collapsed]);

  // Close mobile on route change
  useEffect(() => {
    if (setMobileOpen) setMobileOpen(false);
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lock body scroll when mobile sidebar open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('isDemo');
    navigate('/auth');
  }, [navigate]);

  const toggleCollapse = () => setCollapsed(c => !c);

  const isActive = (item) =>
    item.matchPrefix
      ? location.pathname.startsWith(item.href)
      : location.pathname === item.href;

  // ── Shared inner content ──────────────────────────────────────────────────
  const SidebarContent = ({ isMobile = false }) => {
    const isExpanded = isMobile || !collapsed;

    return (
      <div className="flex flex-col h-full">

        {/* ── Logo + collapse / close button ── */}
        <div className={cn(
          'flex items-center border-b border-white/10 dark:border-slate-700/50 h-14 px-4 flex-shrink-0',
          !isExpanded && 'justify-center px-2',
        )}>
          {/* Logo mark */}
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-glow-primary">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>

          {/* Wordmark */}
          {isExpanded && (
            <div className="ml-3 flex-1 min-w-0">
              <span className="font-display font-bold text-slate-900 dark:text-white text-base leading-tight block truncate">
                SARADHI
              </span>
              <span className="text-[10px] font-medium text-primary-600 dark:text-primary-400 uppercase tracking-wider">
                {role === 'teacher' ? 'Educator' : 'Student'}
              </span>
            </div>
          )}

          {/* Mobile: X close | Desktop: collapse chevron */}
          {isMobile ? (
            <button
              onClick={() => setMobileOpen(false)}
              className="ml-auto flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700/60 hover:text-slate-700 dark:hover:text-white transition-colors"
              aria-label="Close navigation"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={toggleCollapse}
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700/60 hover:text-slate-700 dark:hover:text-white transition-colors flex-shrink-0',
                isExpanded ? 'ml-auto' : 'mt-0',
              )}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed
                ? <ChevronRight className="w-4 h-4" />
                : <ChevronLeft  className="w-4 h-4" />
              }
            </button>
          )}
        </div>

        {/* ── Nav items ── */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 scrollbar-hide">
          <div className="space-y-0.5">
            {navItems.map((item) => {
              const active = isActive(item);
              const Icon   = item.icon;

              const linkEl = (
                <NavLink
                  key={item.href}
                  to={item.href}
                  className={cn(
                    'group relative flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-150',
                    'px-3 py-2.5',
                    active
                      ? 'bg-primary-600/10 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-700/60 hover:text-slate-900 dark:hover:text-white',
                    !isExpanded && 'justify-center px-0 w-10 h-10 mx-auto',
                  )}
                >
                  {/* Active left border */}
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-primary-600 dark:bg-primary-400 rounded-r-full" />
                  )}

                  <Icon className={cn(
                    'flex-shrink-0 w-[18px] h-[18px] transition-colors',
                    active
                      ? 'text-primary-600 dark:text-primary-400'
                      : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300',
                  )} />

                  {isExpanded && (
                    <span className="truncate">{item.label}</span>
                  )}
                </NavLink>
              );

              return (
                <NavTooltip key={item.href} label={item.label} disabled={isExpanded}>
                  {linkEl}
                </NavTooltip>
              );
            })}
          </div>
        </nav>

        {/* ── User profile card ── */}
        <div className="px-2 py-2 border-t border-white/10 dark:border-slate-700/50 flex-shrink-0">
          <div className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-100/60 dark:bg-slate-800/60',
            !isExpanded && 'justify-center px-0 w-10 h-10 mx-auto bg-transparent',
          )}>
            {avatar ? (
              <img src={avatar} alt={displayName} className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
            ) : (
              <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-primary-600 flex items-center justify-center">
                <span className="text-white text-xs font-bold">{initials}</span>
              </div>
            )}
            {isExpanded && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate leading-none">{displayName}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5 capitalize">{role}</p>
              </div>
            )}
          </div>

          {/* Logout */}
          <NavTooltip label="Logout" disabled={isExpanded}>
            <button
              onClick={handleLogout}
              className={cn(
                'group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium',
                'text-slate-500 dark:text-slate-400',
                'hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400',
                'transition-all duration-150',
                !isExpanded && 'justify-center px-0 w-10 h-10 mx-auto',
              )}
            >
              <LogOut className="flex-shrink-0 w-[18px] h-[18px]" />
              {isExpanded && <span>Sign out</span>}
            </button>
          </NavTooltip>
        </div>

      </div>
    );
  };

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside
        className={cn(
          'hidden md:flex flex-col fixed left-0 top-0 bottom-0 z-30',
          'transition-[width] duration-250 ease-in-out will-change-[width]',
          'bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl',
          'border-r border-white/30 dark:border-slate-700/50',
          'shadow-2xl shadow-primary-500/5',
          collapsed ? 'w-[72px]' : 'w-[256px]',
        )}
      >
        <SidebarContent />
      </aside>

      {/* ── Mobile slide-out sidebar ── */}
      <aside
        className={cn(
          'flex md:hidden flex-col fixed left-0 top-0 bottom-0 z-50 w-[min(280px,calc(100vw-48px))]',
          'bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl',
          'border-r border-white/30 dark:border-slate-700/50',
          'shadow-2xl shadow-primary-500/10',
          'transition-transform duration-250 ease-in-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <SidebarContent isMobile />
      </aside>
    </>
  );
}
