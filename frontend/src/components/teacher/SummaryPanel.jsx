import React, { useState } from 'react';

const SummaryPanel = ({ status, summaryText, onGenerate }) => {
  const [expanded, setExpanded] = useState(false);

  if (status === 'none') {
    return (
      <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 p-3 sm:p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-indigo-900 dark:text-indigo-200 text-sm sm:text-base">AI Session Summary</h3>
          <button
            onClick={onGenerate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
          >
            Generate Summary
          </button>
        </div>
        <p className="text-indigo-700 dark:text-indigo-300 text-sm mt-1">
          AI summary of topics covered, confusion points, and recommendations for next class.
        </p>
      </div>
    );
  }

  if (status === 'generating') {
    return (
      <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 p-3 sm:p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-indigo-900 dark:text-indigo-200 text-sm sm:text-base">AI Session Summary</h3>
          <span className="text-indigo-600 dark:text-indigo-400 text-sm animate-pulse">Generating…</span>
        </div>
        <p className="text-indigo-600 dark:text-indigo-400 text-sm mt-1 flex items-center gap-2 animate-pulse">
          <span className="inline-block w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          Analysing poll data and generating insights…
        </p>
      </div>
    );
  }

  if (status === 'completed' && summaryText) {
    return (
      <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-indigo-900 dark:text-indigo-200 text-sm sm:text-base">AI Session Summary</h3>
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-indigo-600 dark:text-indigo-400 text-sm font-medium"
          >
            {expanded ? 'Collapse ▲' : 'Expand ▼'}
          </button>
        </div>
        {expanded && (
          <div className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed bg-white dark:bg-slate-800 rounded-lg p-3 border border-indigo-100 dark:border-indigo-900">
            {summaryText}
          </div>
        )}
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 sm:p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-red-900 dark:text-red-200 text-sm sm:text-base">AI Session Summary</h3>
          <button
            onClick={onGenerate}
            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
          >
            Retry
          </button>
        </div>
        <p className="text-red-600 dark:text-red-400 text-sm mt-1">Summary generation failed. Try again.</p>
      </div>
    );
  }

  return null;
};

export default SummaryPanel;
