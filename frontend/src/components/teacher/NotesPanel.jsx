import React, { useState } from 'react';

const RESOURCE_TYPE_LABELS = {
  pdf: 'PDF',
  document: 'DOC',
  presentation: 'PPT',
  url: 'URL',
  auto_notes: 'Notes',
};

const STAGE_INFO = [
  { until: 20,  label: 'Fetching transcript and resources…',  pct: 18 },
  { until: 60,  label: 'Generating notes with AI…',           pct: 45 },
  { until: 120, label: 'Building and formatting PDF…',        pct: 72 },
  { until: Infinity, label: 'Uploading and finalising…',      pct: 90 },
];

function getStage(elapsedSeconds) {
  return STAGE_INFO.find(s => elapsedSeconds < s.until) || STAGE_INFO[STAGE_INFO.length - 1];
}

function formatElapsed(s) {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function ResourceSelector({ sessionResources, selectedResourceIds, onResourceToggle, onSelectAll, onSelectNone }) {
  if (!sessionResources || sessionResources.length === 0) {
    return (
      <p className="text-xs text-indigo-500 dark:text-indigo-400 italic mt-2">
        No resources uploaded for this session — notes will be generated from transcript only.
      </p>
    );
  }

  const allSelected = sessionResources.every(r => selectedResourceIds.has(r.id));
  const noneSelected = sessionResources.every(r => !selectedResourceIds.has(r.id));

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Include resources in notes:</p>
        <div className="flex gap-2">
          <button
            onClick={onSelectAll}
            disabled={allSelected}
            className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-40"
          >
            All
          </button>
          <span className="text-indigo-300 dark:text-indigo-600 text-[11px]">·</span>
          <button
            onClick={onSelectNone}
            disabled={noneSelected}
            className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-40"
          >
            None
          </button>
        </div>
      </div>
      <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
        {sessionResources.map(resource => {
          const checked = selectedResourceIds.has(resource.id);
          const typeLabel = RESOURCE_TYPE_LABELS[resource.resource_type] || resource.resource_type?.toUpperCase() || 'FILE';
          const hasText = resource.is_vectorized;
          return (
            <label
              key={resource.id}
              className="flex items-center gap-2 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onResourceToggle(resource.id)}
                className="rounded border-indigo-300 dark:border-indigo-600 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 w-3.5 h-3.5 flex-shrink-0"
              />
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${
                hasText
                  ? 'bg-indigo-100 dark:bg-indigo-800/60 text-indigo-700 dark:text-indigo-300'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
              }`}>
                {typeLabel}
              </span>
              <span className={`text-xs truncate ${checked ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`}>
                {resource.title || resource.file_name}
              </span>
              {!hasText && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0">(not indexed)</span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

const NotesPanel = ({
  notesStatus,
  notesUrl,
  elapsedSeconds = 0,
  isLive,
  onGenerate,
  onStop,
  sessionResources = [],
  selectedResourceIds = new Set(),
  onResourceToggle,
  onSelectAll,
  onSelectNone,
}) => {
  const [showRegenerate, setShowRegenerate] = useState(false);

  // Don't show anything while class is still live
  if (isLive) return null;

  if (notesStatus === 'none') {
    const canGenerate = selectedResourceIds.size > 0 || sessionResources.length === 0;
    return (
      <div className="rounded-xl border border-indigo-200 dark:border-indigo-700/60 bg-indigo-50 dark:bg-indigo-900/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-800/50 flex items-center justify-center">
              <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-sm text-indigo-900 dark:text-indigo-100">Class Notes</p>
              <p className="text-xs text-indigo-600 dark:text-indigo-300 mt-0.5">
                Generate a PDF from transcript + selected resources
              </p>
            </div>
          </div>
          <button
            onClick={onGenerate}
            disabled={!canGenerate}
            className="flex-shrink-0 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Generate Notes
          </button>
        </div>

        <ResourceSelector
          sessionResources={sessionResources}
          selectedResourceIds={selectedResourceIds}
          onResourceToggle={onResourceToggle}
          onSelectAll={onSelectAll}
          onSelectNone={onSelectNone}
        />
      </div>
    );
  }

  if (notesStatus === 'generating') {
    const stage = getStage(elapsedSeconds);
    return (
      <div className="rounded-xl border border-indigo-200 dark:border-indigo-700/60 bg-indigo-50 dark:bg-indigo-900/20 p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-800/50 flex items-center justify-center">
            <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-300 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <p className="font-semibold text-sm text-indigo-900 dark:text-indigo-100">Generating Class Notes</p>
              <button
                onClick={onStop}
                className="flex-shrink-0 flex items-center gap-1 text-xs text-indigo-500 dark:text-indigo-400 hover:text-red-600 dark:hover:text-red-400 font-medium transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Stop
              </button>
            </div>
            <p className="text-xs text-indigo-600 dark:text-indigo-300 mt-0.5">{stage.label}</p>
            <div className="mt-2.5">
              <div className="flex justify-between text-[11px] text-indigo-500 dark:text-indigo-400 mb-1">
                <span>Step {STAGE_INFO.findIndex(s => s === stage) + 1} of {STAGE_INFO.length}</span>
                <span>{elapsedSeconds > 0 ? formatElapsed(elapsedSeconds) : '—'}</span>
              </div>
              <div className="h-1.5 rounded-full bg-indigo-200 dark:bg-indigo-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-1000"
                  style={{ width: `${stage.pct}%` }}
                />
              </div>
            </div>
            <p className="text-[11px] text-indigo-400 dark:text-indigo-500 mt-1.5">Usually completes in 1–3 minutes</p>
          </div>
        </div>
      </div>
    );
  }

  if (notesStatus === 'ready') {
    const canRegenerate = selectedResourceIds.size > 0 || sessionResources.length === 0;
    return (
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-700/60 bg-emerald-50 dark:bg-emerald-900/20 p-4">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-800/50 flex items-center justify-center">
            <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-emerald-900 dark:text-emerald-100">Class Notes Ready</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-300 mt-0.5">
              Visible to students in the Resources tab
            </p>
          </div>
          <div className="flex-shrink-0 flex items-center gap-2">
            <button
              onClick={() => setShowRegenerate(prev => !prev)}
              className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-200 font-medium transition-colors"
              title="Generate new notes"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Regenerate
            </button>
            {notesUrl && (
              <a
                href={notesUrl}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download PDF
              </a>
            )}
          </div>
        </div>

        {showRegenerate && (
          <div className="mt-3 pt-3 border-t border-emerald-200 dark:border-emerald-700/60">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-emerald-800 dark:text-emerald-200">Generate new notes with updated resource selection:</p>
            </div>
            <ResourceSelector
              sessionResources={sessionResources}
              selectedResourceIds={selectedResourceIds}
              onResourceToggle={onResourceToggle}
              onSelectAll={onSelectAll}
              onSelectNone={onSelectNone}
            />
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => { setShowRegenerate(false); onGenerate(); }}
                disabled={!canRegenerate}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Generate New Notes
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (notesStatus === 'failed') {
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-700/60 bg-red-50 dark:bg-red-900/20 p-4">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 dark:bg-red-800/50 flex items-center justify-center">
            <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-red-900 dark:text-red-100">Notes Generation Failed</p>
            <p className="text-xs text-red-600 dark:text-red-300 mt-0.5">
              Please try again or share notes with students manually.
            </p>
          </div>
          <button
            onClick={onGenerate}
            className="flex-shrink-0 flex items-center gap-1.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (notesStatus === 'timeout') {
    return (
      <div className="rounded-xl border border-amber-200 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-800/50 flex items-center justify-center">
            <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-amber-900 dark:text-amber-100">Notes Still Processing</p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
              Generation is taking longer than usual. Check back shortly or retry.
            </p>
          </div>
          <button
            onClick={onGenerate}
            className="flex-shrink-0 flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default NotesPanel;
