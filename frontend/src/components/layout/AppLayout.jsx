import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

// ── AppLayout ─────────────────────────────────────────────────────────────────
// Wraps Sidebar + TopBar + main content for all authenticated routes.
// Pass `role` prop ("teacher" | "student") to control nav items.
export default function AppLayout({ children, role }) {
  const location = useLocation();

  // Keep a local mirror of collapsed so main content can shift accordingly
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar_collapsed') === 'true'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  // Sync collapsed state when sidebar toggles (via storage event)
  useEffect(() => {
    const handler = () => {
      try { setCollapsed(localStorage.getItem('sidebar_collapsed') === 'true'); } catch {}
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // Poll localStorage for sidebar state (same-tab updates)
  useEffect(() => {
    const id = setInterval(() => {
      try {
        const val = localStorage.getItem('sidebar_collapsed') === 'true';
        setCollapsed(prev => (prev !== val ? val : prev));
      } catch {}
    }, 150);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-mesh-primary">
      {/* Sidebar */}
      <Sidebar
        role={role}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* TopBar */}
      <TopBar
        collapsed={collapsed}
        onMobileMenuClick={() => setMobileOpen(o => !o)}
      />

      {/* Main content — shifts right with sidebar */}
      <main
        key={location.pathname}
        className={cn(
          'min-h-screen pt-14 transition-[margin-left] duration-250 ease-in-out animate-page-in',
          // Desktop: offset by sidebar width
          collapsed ? 'md:ml-[72px]' : 'md:ml-[256px]',
          // Mobile: no offset (sidebar is overlay)
          'ml-0',
        )}
      >
        <div className="p-4 md:p-6 lg:p-8 max-w-screen-2xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
