import React from 'react';

/**
 * Truth Table Completion — student input.
 * Shows a logic truth table; student fills in the editable cells (0 or 1).
 *
 * Props:
 *   headers   — array of column header strings, e.g. ["A","B","A AND B","A OR B"]
 *   rows      — array of row arrays; each cell: { value: "0"|"1", editable: bool }
 *   answers   — { "r-c": "0"|"1" } student's current fills (r=rowIndex, c=colIndex)
 *   onChange  — callback(newAnswers)
 *   disabled  — bool
 */
export default function TruthTableInput({ headers = [], rows = [], answers = {}, onChange, disabled }) {
  const handleChange = (r, c, val) => {
    if (disabled) return;
    onChange({ ...answers, [`${r}-${c}`]: val });
  };

  return (
    <div className="overflow-x-auto">
      <table className="text-sm border-collapse font-mono">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-4 py-2 text-center text-xs font-bold uppercase tracking-wide
                  border border-slate-300 dark:border-slate-600
                  bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className={r % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/50'}>
              {row.map((cell, c) => {
                const key = `${r}-${c}`;
                const studentVal = answers[key];
                const displayVal = cell.editable ? studentVal : cell.value;

                if (!cell.editable) {
                  return (
                    <td key={c} className="px-4 py-2 text-center border border-slate-300 dark:border-slate-600
                      text-slate-700 dark:text-slate-300 font-bold">
                      {cell.value}
                    </td>
                  );
                }

                return (
                  <td key={c} className="px-2 py-1 text-center border border-slate-300 dark:border-slate-600">
                    <div className="flex gap-1 justify-center">
                      {['0', '1'].map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => handleChange(r, c, v)}
                          disabled={disabled}
                          className={`w-8 h-8 rounded border-2 text-sm font-bold transition-colors
                            ${displayVal === v
                              ? v === '1'
                                ? 'border-green-500 bg-green-500 text-white'
                                : 'border-red-400 bg-red-400 text-white'
                              : 'border-slate-300 dark:border-slate-600 text-slate-500 hover:border-slate-400 bg-white dark:bg-slate-800'
                            }
                            ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {!disabled && (
        <p className="text-xs text-slate-400 mt-1">Click 0 or 1 to fill in each cell</p>
      )}
    </div>
  );
}
