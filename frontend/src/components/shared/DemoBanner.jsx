import React from 'react';
import { useNavigate } from 'react-router-dom';
import { exitDemoMode, isDemoMode } from '../../utils/demoData';

const DemoBanner = () => {
  const navigate = useNavigate();

  if (!isDemoMode()) return null;

  const handleExit = () => {
    exitDemoMode();
    navigate('/auth');
  };

  return (
    <div className="bg-gradient-to-r from-primary-700 to-primary-500 text-white px-4 py-2 flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-yellow-300 text-base flex-shrink-0">⚡</span>
        <span className="font-medium truncate">
          <span className="hidden sm:inline">You're exploring in </span>
          <span className="font-bold">Demo Mode</span>
          <span className="hidden sm:inline"> — features are simulated</span>
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleExit}
          className="bg-white text-primary-700 hover:bg-primary-50 active:bg-primary-100 font-semibold px-3 py-1 rounded-md text-xs transition-colors"
        >
          <span className="hidden sm:inline">Sign in with SASTRA</span>
          <span className="sm:hidden">Sign In</span>
        </button>
        <button
          onClick={handleExit}
          className="text-white/70 hover:text-white active:text-white/50 font-medium px-2 py-1 rounded transition-colors text-xs"
          aria-label="Exit demo"
        >
          ✕ Exit
        </button>
      </div>
    </div>
  );
};

export default DemoBanner;
