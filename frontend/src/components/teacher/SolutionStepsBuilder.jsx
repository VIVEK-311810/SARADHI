import React, { useState } from 'react';
import LatexRenderer from '../shared/LatexRenderer';
import CodeBlock from '../shared/CodeBlock';

/**
 * Teacher UI for building step-by-step solution steps.
 * Each step has: title, explanation, optional LaTeX, optional code snippet.
 *
 * Props:
 *   steps    — array of step objects
 *   onChange — callback(newSteps)
 */
export default function SolutionStepsBuilder({ steps = [], onChange }) {
  const addStep = () => {
    onChange([...steps, { title: '', explanation: '', latex: '', code: '', language: 'python' }]);
  };

  const removeStep = (index) => {
    onChange(steps.filter((_, i) => i !== index));
  };

  const updateStep = (index, field, value) => {
    const updated = steps.map((s, i) => i === index ? { ...s, [field]: value } : s);
    onChange(updated);
  };

  const moveStep = (index, direction) => {
    const newSteps = [...steps];
    const swapIdx = index + direction;
    if (swapIdx < 0 || swapIdx >= newSteps.length) return;
    [newSteps[index], newSteps[swapIdx]] = [newSteps[swapIdx], newSteps[index]];
    onChange(newSteps);
  };

  return (
    <div className="space-y-3">
      {steps.map((step, i) => (
        <StepEditor
          key={i}
          step={step}
          index={i}
          total={steps.length}
          onUpdate={(field, value) => updateStep(i, field, value)}
          onRemove={() => removeStep(i)}
          onMove={(dir) => moveStep(i, dir)}
        />
      ))}

      <button
        type="button"
        onClick={addStep}
        className="w-full py-2 border-2 border-dashed border-gray-300 dark:border-gray-600
          rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors"
      >
        + Add Solution Step
      </button>
    </div>
  );
}

function StepEditor({ step, index, total, onUpdate, onRemove, onMove }) {
  const [showLatex, setShowLatex] = useState(!!step.latex);
  const [showCode, setShowCode] = useState(!!step.code);
  const [latexPreview, setLatexPreview] = useState(false);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2 bg-gray-50 dark:bg-gray-800/50">
      {/* Step header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
          Step {index + 1}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 text-sm"
            title="Move up"
          >↑</button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 text-sm"
            title="Move down"
          >↓</button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1 text-red-400 hover:text-red-600 text-sm"
            title="Remove step"
          >✕</button>
        </div>
      </div>

      {/* Title */}
      <input
        type="text"
        value={step.title}
        onChange={e => onUpdate('title', e.target.value)}
        placeholder={`Step ${index + 1} title (e.g. "Apply Newton's 2nd Law")`}
        className="w-full px-3 py-2 text-sm rounded border border-gray-200 dark:border-gray-700
          bg-white dark:bg-gray-800 focus:border-blue-500 focus:outline-none"
      />

      {/* Explanation */}
      <textarea
        value={step.explanation}
        onChange={e => onUpdate('explanation', e.target.value)}
        placeholder="Explain this step..."
        rows={2}
        className="w-full px-3 py-2 text-sm rounded border border-gray-200 dark:border-gray-700
          bg-white dark:bg-gray-800 focus:border-blue-500 focus:outline-none resize-none"
      />

      {/* Toggles */}
      <div className="flex gap-3 text-xs">
        <button
          type="button"
          onClick={() => setShowLatex(v => !v)}
          className={`px-2 py-1 rounded ${showLatex ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-600' : 'text-gray-400 hover:text-gray-600'}`}
        >
          ∑ LaTeX
        </button>
        <button
          type="button"
          onClick={() => setShowCode(v => !v)}
          className={`px-2 py-1 rounded ${showCode ? 'bg-green-100 dark:bg-green-900/40 text-green-600' : 'text-gray-400 hover:text-gray-600'}`}
        >
          {'</>'}  Code
        </button>
      </div>

      {/* LaTeX input */}
      {showLatex && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-500">LaTeX equation</label>
            <button
              type="button"
              onClick={() => setLatexPreview(v => !v)}
              className="text-xs text-blue-500 hover:underline"
            >
              {latexPreview ? 'Hide preview' : 'Preview'}
            </button>
          </div>
          <input
            type="text"
            value={step.latex}
            onChange={e => onUpdate('latex', e.target.value)}
            placeholder="e.g. F = ma or \frac{d^2x}{dt^2}"
            className="w-full px-3 py-1.5 text-sm font-mono rounded border border-gray-200 dark:border-gray-700
              bg-white dark:bg-gray-800 focus:border-purple-400 focus:outline-none"
          />
          {latexPreview && step.latex && (
            <div className="p-2 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 text-center">
              <LatexRenderer text={`$$${step.latex}$$`} />
            </div>
          )}
        </div>
      )}

      {/* Code input */}
      {showCode && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Code snippet</label>
            <select
              value={step.language || 'python'}
              onChange={e => onUpdate('language', e.target.value)}
              className="text-xs border border-gray-200 dark:border-gray-700 rounded px-1 py-0.5
                bg-white dark:bg-gray-800 focus:outline-none"
            >
              {['python','javascript','java','c','cpp','sql'].map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <textarea
            value={step.code}
            onChange={e => onUpdate('code', e.target.value)}
            placeholder="Code snippet..."
            rows={3}
            className="w-full px-3 py-2 text-xs font-mono rounded border border-gray-200 dark:border-gray-700
              bg-white dark:bg-gray-800 focus:border-green-400 focus:outline-none resize-none"
          />
          {step.code && (
            <CodeBlock code={step.code} language={step.language || 'python'} />
          )}
        </div>
      )}
    </div>
  );
}
