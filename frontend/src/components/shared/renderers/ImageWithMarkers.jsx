import React from 'react';

/**
 * Diagram Labeling — student input.
 * Shows an image with numbered markers; student picks a label for each.
 *
 * Props:
 *   imageUrl — URL of the diagram
 *   markers  — array of { id, x, y, correct_label, distractors[] }
 *   labels   — { "0": "Mitochondria", ... } student's current answers
 *   onChange — callback(newLabels)
 *   disabled — bool
 */
export default function ImageWithMarkers({ imageUrl, markers = [], labels = {}, onChange, disabled }) {
  const handleSelect = (markerId, value) => {
    if (disabled) return;
    onChange({ ...labels, [String(markerId)]: value });
  };

  return (
    <div className="space-y-4">
      {/* Image with overlaid markers */}
      <div className="relative inline-block w-full">
        <img
          src={imageUrl}
          alt="Diagram"
          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 select-none"
          draggable={false}
        />
        {markers.map((m) => (
          <div
            key={m.id}
            style={{ left: `${m.x}%`, top: `${m.y}%`, transform: 'translate(-50%, -50%)' }}
            className="absolute w-7 h-7 rounded-full bg-blue-600 border-2 border-white
              text-white text-xs font-bold flex items-center justify-center shadow-lg pointer-events-none"
          >
            {m.id + 1}
          </div>
        ))}
      </div>

      {/* Label dropdowns */}
      <div className="space-y-2">
        {markers.map((m) => {
          // Build options: correct label + distractors, shuffled deterministically
          const options = [m.correct_label, ...(m.distractors || [])].filter(Boolean);
          // Stable shuffle using marker id as seed
          const shuffled = [...options].sort((a, b) => {
            const ha = simpleHash(m.id + a);
            const hb = simpleHash(m.id + b);
            return ha - hb;
          });

          return (
            <div key={m.id} className="flex items-center gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white
                text-xs font-bold flex items-center justify-center">
                {m.id + 1}
              </span>
              <select
                value={labels[String(m.id)] || ''}
                onChange={e => handleSelect(m.id, e.target.value)}
                disabled={disabled}
                className="flex-1 px-3 py-2 rounded-lg border-2 text-sm transition-colors
                  bg-white dark:bg-slate-800 dark:text-white
                  focus:outline-none focus:ring-2 focus:ring-blue-400
                  border-slate-300 dark:border-slate-600
                  disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">— Select label —</option>
                {shuffled.map((opt, i) => (
                  <option key={i} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Deterministic hash for stable shuffle (not crypto — just for consistent UI ordering)
function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) {
    h = (Math.imul(31, h) + String(str).charCodeAt(i)) | 0;
  }
  return h;
}
