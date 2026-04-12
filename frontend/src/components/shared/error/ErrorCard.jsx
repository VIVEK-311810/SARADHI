import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../../ui/button';

/**
 * Compact inline error banner for use inside data-fetch sections.
 * Use ErrorScreen for full-page errors; ErrorCard for panel-level errors.
 */
const ErrorCard = ({ message, onRetry, className = '' }) => (
  <div className={`flex items-center gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 ${className}`}>
    <AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0" />
    <p className="text-sm text-red-700 dark:text-red-300 flex-1">
      {message || 'Failed to load data.'}
    </p>
    {onRetry && (
      <Button size="sm" variant="outline" onClick={onRetry} className="shrink-0 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40">
        Retry
      </Button>
    )}
  </div>
);

export default ErrorCard;
