import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { cn } from '../../lib/utils';

const LandingNavbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled
          ? 'glass-sm border-b border-white/10 shadow-sm'
          : 'bg-transparent border-b border-transparent'
      )}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex items-center gap-2.5 focus:outline-none min-h-0"
          aria-label="Back to top"
        >
          <img
            src="/saradhi_ai_logo_final.png"
            alt="SARADHI-AI"
            className="w-7 h-7 object-contain"
          />
          <span className="font-display font-bold text-white text-sm tracking-tight hidden sm:block">
            SARADHI<span className="text-primary-400">-AI</span>
          </span>
        </button>

        {/* Right actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all duration-150 min-h-0"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={() => {
              const ctaEl = document.getElementById('get-started');
              if (ctaEl) {
                ctaEl.scrollIntoView({ behavior: 'smooth' });
              } else {
                window.location.href = '/auth';
              }
            }}
            className="px-4 py-2 text-sm font-medium text-white border border-white/20 rounded-xl hover:bg-white/10 hover:border-white/30 transition-all duration-150 min-h-0 backdrop-blur-sm"
          >
            Sign In
          </button>
        </div>
      </div>
    </nav>
  );
};

export default LandingNavbar;
