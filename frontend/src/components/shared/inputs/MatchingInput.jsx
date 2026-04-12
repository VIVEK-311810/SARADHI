import React from 'react';
import LatexRenderer from '../renderers/LatexRenderer';

/**
 * Match the Following input — student side.
 *
 * Props:
 *   leftItems   — array of strings (the items to match FROM)
 *   rightItems  — array of strings (the items to match TO)
 *   pairs       — { "0": "1", "1": "3", ... }  left-index → right-index
 *   onChange    — callback(newPairs)
 *   disabled    — bool
 */
export default function MatchingInput({ leftItems = [], rightItems = [], pairs = {}, onChange, disabled }) {
  const handleSelect = (leftIdx, rightIdx) => {
    if (disabled) return;
    onChange({ ...pairs, [String(leftIdx)]: String(rightIdx) });
  };

  return (
    <div className="space-y-2">
      {leftItems.map((left, li) => (
        <div key={li} className="flex items-center gap-3">
          {/* Left item */}
          <div className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700
            bg-slate-50 dark:bg-slate-800 text-sm">
            <span className="font-semibold text-slate-500 dark:text-slate-400 mr-2">
              {String.fromCharCode(65 + li)}.
            </span>
            <LatexRenderer text={left} />
          </div>

          <span className="text-slate-400">→</span>

          {/* Dropdown of right items */}
          <select
            value={pairs[String(li)] ?? ''}
            onChange={e => handleSelect(li, e.target.value)}
            disabled={disabled}
            className="flex-1 px-3 py-2 rounded-lg border-2 text-sm transition-colors
              bg-white dark:bg-slate-800 dark:text-white
              focus:outline-none focus:ring-2 focus:ring-blue-400
              disabled:opacity-60 disabled:cursor-not-allowed
              border-slate-300 dark:border-slate-600"
          >
            <option value="">— Select —</option>
            {rightItems.map((right, ri) => (
              <option key={ri} value={String(ri)}>
                {String.fromCharCode(112 + ri)}. {right}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
