import React, { useState } from 'react';
import LatexRenderer from '../shared/renderers/LatexRenderer';

/**
 * PassageView — shown to students when a poll belongs to a cluster.
 * Displays the passage/case-study text above the question.
 *
 * Props:
 *   cluster — { id, title, passage, passage_image_url, passage_latex }
 */
export default function PassageView({ cluster }) {
  const [collapsed, setCollapsed] = useState(false);

  if (!cluster) return null;

  return (
    <div className="mb-4 rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-amber-200 dark:border-amber-700/50">
        <div className="flex items-center gap-2">
          <span className="text-amber-600 dark:text-amber-400 text-sm">📖</span>
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide">
            {cluster.title || 'Passage'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
        >
          {collapsed ? 'Show passage ▾' : 'Hide ▴'}
        </button>
      </div>

      {/* Passage body */}
      {!collapsed && (
        <div className="px-4 py-3 space-y-3">
          {cluster.passage_image_url && (
            <div className="flex justify-center">
              <img
                src={cluster.passage_image_url}
                alt="Passage figure"
                className="max-h-52 rounded-lg border border-amber-200 dark:border-amber-700 object-contain"
              />
            </div>
          )}
          <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
            {cluster.passage}
          </p>
          {cluster.passage_latex && (
            <div className="text-center p-2 bg-white dark:bg-slate-800 rounded-lg border border-amber-200 dark:border-amber-700">
              <LatexRenderer text={`$$${cluster.passage_latex}$$`} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
