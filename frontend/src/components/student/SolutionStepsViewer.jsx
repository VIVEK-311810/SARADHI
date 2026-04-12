import React, { useState } from 'react';
import LatexRenderer from '../shared/renderers/LatexRenderer';
import CodeBlock from '../shared/renderers/CodeBlock';

/**
 * Accordion-style viewer for solution steps.
 * Shown to students after teacher sends reveal-answers.
 *
 * Props:
 *   steps — array of { title, explanation, latex, code, language }
 */
export default function SolutionStepsViewer({ steps = [] }) {
  const [openIndex, setOpenIndex] = useState(0);

  if (!steps || steps.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
        Solution Steps
      </h4>
      {steps.map((step, i) => (
        <div
          key={i}
          className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
        >
          {/* Step header */}
          <button
            type="button"
            onClick={() => setOpenIndex(openIndex === i ? -1 : i)}
            className="w-full flex items-center justify-between px-4 py-3
              bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 text-white text-xs
                flex items-center justify-center font-bold">
                {i + 1}
              </span>
              {step.title || `Step ${i + 1}`}
            </span>
            <span className="text-gray-400 text-sm">{openIndex === i ? '▲' : '▼'}</span>
          </button>

          {/* Step content */}
          {openIndex === i && (
            <div className="px-4 py-3 space-y-3 bg-white dark:bg-gray-900">
              {step.explanation && (
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                  <LatexRenderer text={step.explanation} />
                </p>
              )}
              {step.latex && (
                <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <LatexRenderer text={`$$${step.latex}$$`} />
                </div>
              )}
              {step.code && (
                <CodeBlock code={step.code} language={step.language || 'python'} />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
