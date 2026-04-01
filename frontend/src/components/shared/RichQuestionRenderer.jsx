import React from 'react';
import LatexRenderer from './LatexRenderer';
import CodeBlock from './CodeBlock';

/**
 * Universal question renderer for all Phase 1 question types.
 *
 * Props:
 *   poll            — full poll object from backend
 *   answerData      — current answer state { selected_option, text, value }
 *   onAnswer        — callback(newAnswerData) when student selects/types
 *   disabled        — true after submission or when poll is closed
 */
export default function RichQuestionRenderer({ poll, answerData = {}, onAnswer, disabled = false }) {
  if (!poll) return null;

  const {
    question,
    question_type = 'mcq',
    question_latex,
    question_image_url,
    options = [],
    options_metadata = {},
  } = poll;

  const meta = options_metadata || {};

  return (
    <div className="space-y-4">
      {/* Question text */}
      <div className="text-base font-medium leading-relaxed">
        <LatexRenderer text={question} />
      </div>

      {/* LaTeX equation (separate block below question) */}
      {question_latex && (
        <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
          <LatexRenderer text={`$$${question_latex}$$`} />
        </div>
      )}

      {/* Question image */}
      {question_image_url && (
        <div className="flex justify-center">
          <img
            src={question_image_url}
            alt="Question diagram"
            className="max-h-64 rounded-lg border border-gray-200 dark:border-gray-700 object-contain"
          />
        </div>
      )}

      {/* Answer input — changes based on question type */}
      {question_type === 'mcq' && (
        <MCQInput
          options={options}
          selected={answerData.selected_option}
          onSelect={i => onAnswer({ selected_option: i })}
          disabled={disabled}
        />
      )}

      {question_type === 'true_false' && (
        <TrueFalseInput
          selected={answerData.selected_option}
          onSelect={i => onAnswer({ selected_option: i })}
          disabled={disabled}
        />
      )}

      {question_type === 'fill_blank' && (
        <FillBlankInput
          value={answerData.text || ''}
          onChange={text => onAnswer({ text })}
          disabled={disabled}
        />
      )}

      {question_type === 'one_word' && (
        <FillBlankInput
          value={answerData.text || ''}
          onChange={text => onAnswer({ text })}
          disabled={disabled}
          placeholder="One-word answer..."
          maxLength={50}
        />
      )}

      {question_type === 'numeric' && (
        <NumericInput
          value={answerData.value ?? ''}
          onChange={value => onAnswer({ value })}
          disabled={disabled}
          unit={meta.unit}
          placeholder={meta.unit ? `Answer in ${meta.unit}` : 'Numerical answer...'}
        />
      )}

      {question_type === 'short_answer' && (
        <ShortAnswerInput
          value={answerData.text || ''}
          onChange={text => onAnswer({ text })}
          disabled={disabled}
        />
      )}

      {question_type === 'essay' && (
        <EssayInput
          value={answerData.text || ''}
          onChange={text => onAnswer({ text })}
          disabled={disabled}
          wordLimit={meta.word_limit}
        />
      )}

      {question_type === 'code' && (
        <CodeQuestionInput
          meta={meta}
          options={options}
          answerData={answerData}
          onAnswer={onAnswer}
          disabled={disabled}
        />
      )}

      {/* Negative marking warning */}
      {meta.negative_marking && !disabled && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
          ⚠ Negative marking: −{meta.negative_value || 0.25} marks for wrong answer
        </p>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MCQInput({ options, selected, onSelect, disabled }) {
  return (
    <div className="space-y-2">
      {options.map((opt, i) => (
        <button
          key={i}
          onClick={() => !disabled && onSelect(i)}
          disabled={disabled}
          className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all duration-150 flex items-center gap-3
            ${selected === i
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
            }
            ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <span className={`flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm font-semibold
            ${selected === i ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-400 text-gray-500'}`}>
            {String.fromCharCode(65 + i)}
          </span>
          <LatexRenderer text={opt} />
        </button>
      ))}
    </div>
  );
}

function TrueFalseInput({ selected, onSelect, disabled }) {
  return (
    <div className="flex gap-4">
      {['True', 'False'].map((label, i) => (
        <button
          key={i}
          onClick={() => !disabled && onSelect(i)}
          disabled={disabled}
          className={`flex-1 py-4 rounded-xl border-2 text-lg font-semibold transition-all duration-150
            ${selected === i
              ? i === 0
                ? 'border-green-500 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'border-red-500 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'
            }
            ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function FillBlankInput({ value, onChange, disabled, placeholder = 'Type your answer...', maxLength }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      maxLength={maxLength}
      className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 dark:border-gray-700
        bg-white dark:bg-gray-800 focus:border-blue-500 focus:outline-none transition-colors
        disabled:opacity-60 disabled:cursor-not-allowed"
    />
  );
}

function NumericInput({ value, onChange, disabled, unit, placeholder }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        step="any"
        className="flex-1 px-4 py-3 rounded-lg border-2 border-gray-200 dark:border-gray-700
          bg-white dark:bg-gray-800 focus:border-blue-500 focus:outline-none transition-colors
          disabled:opacity-60 disabled:cursor-not-allowed"
      />
      {unit && (
        <span className="px-3 py-3 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-mono text-sm whitespace-nowrap">
          <LatexRenderer text={unit} />
        </span>
      )}
    </div>
  );
}

function ShortAnswerInput({ value, onChange, disabled }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      placeholder="Write your answer here..."
      rows={4}
      className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 dark:border-gray-700
        bg-white dark:bg-gray-800 focus:border-blue-500 focus:outline-none transition-colors resize-none
        disabled:opacity-60 disabled:cursor-not-allowed"
    />
  );
}

function EssayInput({ value, onChange, disabled, wordLimit }) {
  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
  const overLimit = wordLimit && wordCount > wordLimit;

  return (
    <div className="space-y-1">
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Write your essay here..."
        rows={8}
        className={`w-full px-4 py-3 rounded-lg border-2 transition-colors resize-y
          bg-white dark:bg-gray-800 focus:outline-none
          ${overLimit ? 'border-red-400' : 'border-gray-200 dark:border-gray-700 focus:border-blue-500'}
          disabled:opacity-60 disabled:cursor-not-allowed`}
      />
      {wordLimit && (
        <p className={`text-xs text-right ${overLimit ? 'text-red-500' : 'text-gray-500'}`}>
          {wordCount} / {wordLimit} words
        </p>
      )}
    </div>
  );
}

function CodeQuestionInput({ meta, options, answerData, onAnswer, disabled }) {
  const mode = meta.code_mode || 'mcq';
  return (
    <div className="space-y-3">
      {/* Code block */}
      {meta.code && (
        <CodeBlock code={meta.code} language={meta.language || 'javascript'} />
      )}
      {/* Answer input */}
      {mode === 'mcq' ? (
        <MCQInput
          options={options}
          selected={answerData.selected_option}
          onSelect={i => onAnswer({ selected_option: i })}
          disabled={disabled}
        />
      ) : (
        <FillBlankInput
          value={answerData.text || ''}
          onChange={text => onAnswer({ text })}
          disabled={disabled}
          placeholder="Type the output or missing value..."
        />
      )}
    </div>
  );
}
