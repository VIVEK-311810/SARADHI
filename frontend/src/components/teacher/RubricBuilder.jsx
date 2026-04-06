import React from 'react';

/**
 * Teacher UI for building an essay rubric.
 * Each criterion has a name and marks allocation.
 *
 * Props:
 *   rubric   — array of { criterion, marks }
 *   onChange — callback(newRubric)
 */
export default function RubricBuilder({ rubric = [], onChange }) {
  const add = () => onChange([...rubric, { criterion: '', marks: 1 }]);

  const update = (i, field, value) => {
    const next = rubric.map((r, idx) => idx === i ? { ...r, [field]: value } : r);
    onChange(next);
  };

  const remove = (i) => onChange(rubric.filter((_, idx) => idx !== i));

  const total = rubric.reduce((sum, r) => sum + (parseInt(r.marks) || 0), 0);

  return (
    <div className="space-y-2">
      {rubric.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={r.criterion}
            onChange={e => update(i, 'criterion', e.target.value)}
            placeholder={`Criterion ${i + 1} (e.g. Content accuracy)`}
            className="flex-1 px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded
              bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:text-white"
          />
          <input
            type="number"
            min="1"
            max="100"
            value={r.marks}
            onChange={e => update(i, 'marks', parseInt(e.target.value) || 1)}
            className="w-16 px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded
              bg-white dark:bg-slate-800 focus:outline-none dark:text-white text-center"
          />
          <span className="text-xs text-slate-400 w-6">pts</span>
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-red-400 hover:text-red-600 text-sm px-1"
          >✕</button>
        </div>
      ))}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={add}
          className="text-xs text-primary-600 hover:underline"
        >
          + Add criterion
        </button>
        {rubric.length > 0 && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Total: <span className="font-semibold">{total}</span> pts
          </span>
        )}
      </div>
    </div>
  );
}
