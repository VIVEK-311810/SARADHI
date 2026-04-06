import React, { useRef, useState } from 'react';

/**
 * Teacher UI for placing numbered markers on a diagram image.
 * Click on the image preview to place/move a marker.
 *
 * Props:
 *   imageUrl — URL of the diagram image
 *   markers  — array of { id, x, y, correct_label, distractors[] }
 *   onChange — callback(newMarkers)
 */
export default function DiagramMarkerEditor({ imageUrl, markers = [], onChange }) {
  const [activeMarker, setActiveMarker] = useState(null); // index of marker being edited
  const imgRef = useRef(null);

  const handleImageClick = (e) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const newMarker = {
      id: markers.length,
      x: parseFloat(x.toFixed(1)),
      y: parseFloat(y.toFixed(1)),
      correct_label: '',
      distractors: ['', ''],
    };
    const next = [...markers, newMarker];
    onChange(next);
    setActiveMarker(next.length - 1);
  };

  const updateMarker = (i, field, value) => {
    const next = markers.map((m, idx) => idx === i ? { ...m, [field]: value } : m);
    onChange(next);
  };

  const updateDistractor = (mi, di, value) => {
    const next = markers.map((m, idx) => {
      if (idx !== mi) return m;
      const dist = [...m.distractors];
      dist[di] = value;
      return { ...m, distractors: dist };
    });
    onChange(next);
  };

  const removeMarker = (i) => {
    const next = markers.filter((_, idx) => idx !== i).map((m, idx) => ({ ...m, id: idx }));
    onChange(next);
    setActiveMarker(null);
  };

  return (
    <div className="space-y-3">
      {/* Image with markers overlay */}
      {imageUrl ? (
        <div className="relative inline-block w-full">
          <img
            ref={imgRef}
            src={imageUrl}
            alt="Diagram"
            onClick={handleImageClick}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 cursor-crosshair select-none"
            draggable={false}
          />
          {markers.map((m, i) => (
            <button
              key={i}
              type="button"
              onClick={e => { e.stopPropagation(); setActiveMarker(activeMarker === i ? null : i); }}
              style={{ left: `${m.x}%`, top: `${m.y}%`, transform: 'translate(-50%, -50%)' }}
              className={`absolute w-7 h-7 rounded-full border-2 text-white text-xs font-bold
                flex items-center justify-center shadow-lg transition-transform hover:scale-110
                ${activeMarker === i ? 'bg-yellow-500 border-yellow-300 scale-110' : 'bg-blue-600 border-white'}`}
            >
              {i + 1}
            </button>
          ))}
          <p className="text-xs text-slate-400 mt-1">Click anywhere on the image to place a marker</p>
        </div>
      ) : (
        <div className="h-32 flex items-center justify-center rounded-lg border-2 border-dashed
          border-slate-300 dark:border-slate-600 text-slate-400 text-sm">
          Enter an image URL above to start placing markers
        </div>
      )}

      {/* Marker config list */}
      {markers.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Markers ({markers.length}) — click a marker number to configure it
          </p>
          {markers.map((m, i) => (
            <div
              key={i}
              className={`border rounded-lg p-3 space-y-2 transition-colors
                ${activeMarker === i
                  ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/10'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'}`}
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setActiveMarker(activeMarker === i ? null : i)}
                  className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs
                    flex items-center justify-center font-bold flex-shrink-0">
                    {i + 1}
                  </span>
                  Marker {i + 1}
                  <span className="text-xs text-slate-400">({m.x}%, {m.y}%)</span>
                </button>
                <button
                  type="button"
                  onClick={() => removeMarker(i)}
                  className="text-red-400 hover:text-red-600 text-xs"
                >
                  Remove
                </button>
              </div>

              {activeMarker === i && (
                <div className="space-y-2 pt-1">
                  <div>
                    <label className="text-xs text-slate-500 dark:text-slate-400">Correct label *</label>
                    <input
                      type="text"
                      value={m.correct_label}
                      onChange={e => updateMarker(i, 'correct_label', e.target.value)}
                      placeholder="e.g. Mitochondria"
                      className="mt-0.5 w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded
                        bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 dark:text-slate-400">
                      Distractors (wrong options shown in dropdown)
                    </label>
                    {m.distractors.map((d, di) => (
                      <div key={di} className="flex gap-1 mt-0.5">
                        <input
                          type="text"
                          value={d}
                          onChange={e => updateDistractor(i, di, e.target.value)}
                          placeholder={`Distractor ${di + 1}`}
                          className="flex-1 px-2 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded
                            bg-white dark:bg-slate-800 dark:text-white focus:outline-none"
                        />
                        {m.distractors.length > 1 && (
                          <button
                            type="button"
                            onClick={() => updateMarker(i, 'distractors', m.distractors.filter((_, j) => j !== di))}
                            className="text-red-400 hover:text-red-600 text-xs px-1"
                          >✕</button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => updateMarker(i, 'distractors', [...m.distractors, ''])}
                      className="text-xs text-primary-600 hover:underline mt-1"
                    >
                      + Add distractor
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
