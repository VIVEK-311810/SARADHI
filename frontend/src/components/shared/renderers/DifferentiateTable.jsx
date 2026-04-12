import React from 'react';

/**
 * Differentiate Between — student input.
 * Two-column table where students fill in cells for each row criterion.
 *
 * Props:
 *   colA     — header for column A (e.g. "Plant Cell")
 *   colB     — header for column B (e.g. "Animal Cell")
 *   rows     — array of row labels (criteria)
 *   cells    — array of { a, b } objects (student answers)
 *   onChange — callback(newCells)
 *   disabled — bool
 */
export default function DifferentiateTable({ colA = 'A', colB = 'B', rows = [], cells = [], onChange, disabled }) {
  const update = (rowIdx, col, value) => {
    const next = rows.map((_, i) => ({
      a: cells[i]?.a || '',
      b: cells[i]?.b || '',
      ...(i === rowIdx ? { [col]: value } : {}),
    }));
    onChange(next);
  };

  const currentCells = rows.map((_, i) => ({ a: cells[i]?.a || '', b: cells[i]?.b || '' }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400
              border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 w-1/4">
              Basis
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-blue-700 dark:text-blue-300
              border border-slate-200 dark:border-slate-700 bg-blue-50 dark:bg-blue-900/20">
              {colA}
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-green-700 dark:text-green-300
              border border-slate-200 dark:border-slate-700 bg-green-50 dark:bg-green-900/20">
              {colB}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="group">
              <td className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300
                border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30">
                {row}
              </td>
              <td className="border border-slate-200 dark:border-slate-700 p-1">
                <textarea
                  value={currentCells[i].a}
                  onChange={e => update(i, 'a', e.target.value)}
                  disabled={disabled}
                  rows={2}
                  placeholder="Type here..."
                  className="w-full px-2 py-1 text-xs rounded bg-white dark:bg-slate-800 dark:text-white
                    border border-transparent focus:border-blue-400 focus:outline-none resize-none
                    disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </td>
              <td className="border border-slate-200 dark:border-slate-700 p-1">
                <textarea
                  value={currentCells[i].b}
                  onChange={e => update(i, 'b', e.target.value)}
                  disabled={disabled}
                  rows={2}
                  placeholder="Type here..."
                  className="w-full px-2 py-1 text-xs rounded bg-white dark:bg-slate-800 dark:text-white
                    border border-transparent focus:border-green-400 focus:outline-none resize-none
                    disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
