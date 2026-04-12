import React from 'react';
import LatexRenderer from './LatexRenderer';
import CodeBlock from './CodeBlock';
import MatchingInput from '../inputs/MatchingInput';
import OrderingInput from '../inputs/OrderingInput';
import DifferentiateTable from './DifferentiateTable';
import ImageWithMarkers from './ImageWithMarkers';
import TruthTableInput from '../inputs/TruthTableInput';

/**
 * Universal question renderer for all question types (Phase 1–3).
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
    options: rawOptions,
    options_metadata: rawMeta,
  } = poll;

  // options is stored as a JSON string in TEXT columns — parse defensively
  const options = Array.isArray(rawOptions)
    ? rawOptions
    : (typeof rawOptions === 'string'
        ? (() => { try { return JSON.parse(rawOptions); } catch { return []; } })()
        : []);

  // options_metadata is JSONB so usually already an object, but guard for string form too
  const meta = rawMeta && typeof rawMeta === 'object'
    ? rawMeta
    : (typeof rawMeta === 'string'
        ? (() => { try { return JSON.parse(rawMeta); } catch { return {}; } })()
        : {});

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
          rubric={Array.isArray(meta.rubric) ? meta.rubric : []}
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

      {question_type === 'multi_correct' && (
        <MultiCorrectInput
          options={options}
          selected={answerData.selected_options || []}
          onSelect={sel => onAnswer({ selected_options: sel })}
          disabled={disabled}
        />
      )}

      {question_type === 'assertion_reason' && (
        <AssertionReasonInput
          meta={meta}
          selected={answerData.selected_option}
          onSelect={i => onAnswer({ selected_option: i })}
          disabled={disabled}
        />
      )}

      {question_type === 'match_following' && (
        <MatchingInput
          leftItems={meta.left_items || []}
          rightItems={meta.right_items || []}
          pairs={answerData.pairs || {}}
          onChange={pairs => onAnswer({ pairs })}
          disabled={disabled}
        />
      )}

      {question_type === 'ordering' && (
        <OrderingInput
          items={meta.items || options}
          order={answerData.order || []}
          onChange={order => onAnswer({ order })}
          disabled={disabled}
        />
      )}

      {question_type === 'differentiate' && (
        <DifferentiateTable
          colA={meta.col_a || 'A'}
          colB={meta.col_b || 'B'}
          rows={meta.rows || []}
          cells={answerData.cells || []}
          onChange={cells => onAnswer({ cells })}
          disabled={disabled}
        />
      )}

      {question_type === 'diagram_labeling' && meta.image_url && (
        <ImageWithMarkers
          imageUrl={meta.image_url}
          markers={meta.markers || []}
          labels={answerData.labels || {}}
          onChange={labels => onAnswer({ labels })}
          disabled={disabled}
        />
      )}

      {question_type === 'truth_table' && (
        <TruthTableInput
          headers={meta.headers || []}
          rows={meta.rows || []}
          answers={answerData.cells || {}}
          onChange={cells => onAnswer({ cells })}
          disabled={disabled}
        />
      )}

      {question_type === 'code_trace' && (
        <CodeTraceInput
          meta={meta}
          trace={answerData.trace || {}}
          onChange={trace => onAnswer({ trace })}
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

function EssayInput({ value, onChange, disabled, wordLimit, rubric = [] }) {
  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
  const overLimit = wordLimit && wordCount > wordLimit;

  return (
    <div className="space-y-2">
      {rubric.length > 0 && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">Marking Rubric</p>
          <ul className="space-y-0.5">
            {rubric.map((r, i) => (
              <li key={i} className="flex justify-between text-xs text-blue-600 dark:text-blue-400">
                <span>{r.criterion}</span>
                <span className="font-medium">{r.marks} pts</span>
              </li>
            ))}
          </ul>
        </div>
      )}
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
      {meta.code && (
        <CodeBlock code={meta.code} language={meta.language || 'javascript'} />
      )}
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

function MultiCorrectInput({ options, selected, onSelect, disabled }) {
  const toggle = (i) => {
    if (disabled) return;
    const next = selected.includes(i) ? selected.filter(x => x !== i) : [...selected, i];
    onSelect(next);
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Select all correct options</p>
      {options.map((opt, i) => {
        const checked = selected.includes(i);
        return (
          <button
            key={i}
            onClick={() => toggle(i)}
            disabled={disabled}
            className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all duration-150 flex items-center gap-3
              ${checked
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
              }
              ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center text-xs
              ${checked ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-400'}`}>
              {checked ? '✓' : ''}
            </span>
            <span className="flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-semibold
              border-gray-300 text-gray-500">
              {String.fromCharCode(65 + i)}
            </span>
            <LatexRenderer text={opt} />
          </button>
        );
      })}
    </div>
  );
}

function CodeTraceInput({ meta, trace, onChange, disabled }) {
  const steps = meta.steps || [];
  const update = (i, val) => onChange({ ...trace, [String(i)]: val });
  return (
    <div className="space-y-3">
      {meta.code && (
        <CodeBlock code={meta.code} language={meta.language || 'python'} />
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Trace through the code and fill in each step:
      </p>
      <div className="space-y-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="flex-shrink-0 mt-2 w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700
              text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center justify-center">
              {i + 1}
            </span>
            <div className="flex-1 space-y-1">
              {step.line_label && (
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  Line {step.line_label}
                </p>
              )}
              <p className="text-sm text-slate-700 dark:text-slate-300">
                <LatexRenderer text={step.question} />
              </p>
              <input
                type="text"
                value={trace[String(i)] || ''}
                onChange={e => update(i, e.target.value)}
                disabled={disabled}
                placeholder="Your answer..."
                className="w-full px-3 py-1.5 text-sm rounded-lg border-2 border-gray-200
                  dark:border-gray-700 bg-white dark:bg-gray-800 focus:border-blue-500
                  focus:outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssertionReasonInput({ meta, selected, onSelect, disabled }) {
  const assertion = meta.assertion || '';
  const reason = meta.reason || '';
  const fixedOptions = [
    'Both A and R are true, and R is the correct explanation of A',
    'Both A and R are true, but R is NOT the correct explanation of A',
    'A is true, but R is false',
    'A is false, but R is true',
  ];
  return (
    <div className="space-y-4">
      <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <p className="text-sm">
          <span className="font-bold">Assertion (A):</span>{' '}
          <LatexRenderer text={assertion} />
        </p>
        <p className="text-sm">
          <span className="font-bold">Reason (R):</span>{' '}
          <LatexRenderer text={reason} />
        </p>
      </div>
      <MCQInput options={fixedOptions} selected={selected} onSelect={onSelect} disabled={disabled} />
    </div>
  );
}
