import React, { useState } from 'react';

// Renders inline markdown: **bold**, *italic*
function renderInline(text) {
  const parts = [];
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={i++}>{text.slice(last, m.index)}</span>);
    if (m[2] !== undefined) parts.push(<strong key={i++}>{m[2]}</strong>);
    else if (m[3] !== undefined) parts.push(<em key={i++}>{m[3]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<span key={i++}>{text.slice(last)}</span>);
  return parts.length ? parts : text;
}

const SECTION_STYLES = {
  'Topics Covered': {
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    color: 'text-indigo-700 dark:text-indigo-300',
    iconBg: 'bg-indigo-100 dark:bg-indigo-800/50 text-indigo-600 dark:text-indigo-300',
    dotColor: 'bg-indigo-400',
  },
  'Confusion Points': {
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    ),
    color: 'text-amber-700 dark:text-amber-300',
    iconBg: 'bg-amber-100 dark:bg-amber-800/50 text-amber-600 dark:text-amber-300',
    dotColor: 'bg-amber-400',
  },
  'Recommendation': {
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m1.636-6.364l.707.707M12 21v-1M7.05 16.95l-.707.707M16.95 16.95l.707.707" />
      </svg>
    ),
    color: 'text-emerald-700 dark:text-emerald-300',
    iconBg: 'bg-emerald-100 dark:bg-emerald-800/50 text-emerald-600 dark:text-emerald-300',
    dotColor: 'bg-emerald-400',
  },
};

function parseSummary(text) {
  const lines = text.split('\n');
  const sections = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('## ')) {
      if (current) sections.push(current);
      current = { heading: line.slice(3).trim(), items: [], prose: [] };
    } else if (line.startsWith('- ')) {
      current?.items.push(line.slice(2).trim());
    } else if (current) {
      current.prose.push(line);
    }
  }
  if (current) sections.push(current);
  return sections;
}

export function SummaryContent({ summaryText }) {
  const sections = parseSummary(summaryText);

  if (!sections.length) {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        {summaryText}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {sections.map((section, si) => {
        const style = SECTION_STYLES[section.heading] || {
          icon: null,
          color: 'text-slate-700 dark:text-slate-200',
          iconBg: 'bg-slate-100 dark:bg-slate-700 text-slate-500',
          dotColor: 'bg-slate-400',
        };

        return (
          <div key={si} className="space-y-2">
            {/* Section heading */}
            <div className="flex items-center gap-2">
              <span className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center ${style.iconBg}`}>
                {style.icon}
              </span>
              <h4 className={`font-semibold text-sm ${style.color}`}>{section.heading}</h4>
            </div>

            {/* Bullet items */}
            {section.items.length > 0 && (
              <ul className="space-y-1.5 pl-8">
                {section.items.map((item, ii) => (
                  <li key={ii} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    <span className={`mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full ${style.dotColor}`} />
                    <span>{renderInline(item)}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* Prose lines (e.g. Recommendation paragraph) */}
            {section.prose.length > 0 && (
              <p className="pl-8 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {section.prose.map((line, pi) => (
                  <span key={pi}>{renderInline(line)}{pi < section.prose.length - 1 ? ' ' : ''}</span>
                ))}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

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
          <div className="mt-3 bg-white dark:bg-slate-800/60 rounded-lg border border-indigo-100 dark:border-indigo-900/60 p-4">
            <SummaryContent summaryText={summaryText} />
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
