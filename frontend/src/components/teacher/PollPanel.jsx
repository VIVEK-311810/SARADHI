import React, { useState } from 'react';
import { toast } from 'sonner';
import { pollAPI } from '../../utils/api';
import LatexRenderer from '../shared/LatexRenderer';
import SolutionStepsBuilder from './SolutionStepsBuilder';
import RubricBuilder from './RubricBuilder';
import DiagramMarkerEditor from './DiagramMarkerEditor';
import ClusterBuilder from './ClusterBuilder';

const QUESTION_TYPES = [
  // Phase 1
  { id: 'mcq',            label: 'MCQ',          icon: '⊙',  desc: 'Multiple choice, one correct' },
  { id: 'true_false',     label: 'True/False',   icon: '⊤',  desc: 'True or False answer' },
  { id: 'fill_blank',     label: 'Fill Blank',   icon: '▭',  desc: 'Type the missing word' },
  { id: 'numeric',        label: 'Numeric',      icon: '#',  desc: 'Numerical answer with tolerance' },
  { id: 'short_answer',   label: 'Short Ans',    icon: '✎',  desc: 'Free text, teacher grades' },
  { id: 'code',           label: 'Code',         icon: '</>', desc: 'Code block + MCQ/fill answer' },
  // Phase 2
  { id: 'multi_correct',    label: 'Multi ✓',     icon: '☑',  desc: 'Multiple correct options (JEE/NEET style)' },
  { id: 'one_word',         label: 'One Word',    icon: 'W',  desc: 'Single word answer' },
  { id: 'assertion_reason', label: 'A & R',       icon: 'AR', desc: 'Assertion-Reason (4 fixed options)' },
  { id: 'match_following',  label: 'Match',       icon: '⇌',  desc: 'Match the Following' },
  { id: 'ordering',         label: 'Order',       icon: '↕',  desc: 'Arrange in correct sequence' },
  // Phase 3
  { id: 'essay',            label: 'Essay',       icon: '📝', desc: 'Long answer with optional rubric' },
  { id: 'differentiate',    label: 'Diff. Table', icon: '⇔',  desc: 'Differentiate Between (2-column table)' },
  { id: 'diagram_labeling', label: 'Diagram',     icon: '🖼',  desc: 'Label parts of a diagram' },
  // Phase 4
  { id: 'truth_table',      label: 'Truth Tbl',  icon: '⊤⊥', desc: 'Complete missing cells in a logic truth table' },
  { id: 'code_trace',       label: 'Code Trace', icon: '⟶',  desc: 'Trace through code step-by-step' },
];

const SUBJECTS = [
  { value: 'math',       label: 'Mathematics' },
  { value: 'physics',    label: 'Physics' },
  { value: 'chemistry',  label: 'Chemistry' },
  { value: 'biology',    label: 'Biology' },
  { value: 'cs',         label: 'Computer Science' },
  { value: 'ece',        label: 'ECE' },
  { value: 'mechanical', label: 'Mechanical' },
  { value: 'civil',      label: 'Civil' },
  { value: 'english',    label: 'English' },
  { value: 'history',    label: 'History' },
  { value: 'economics',  label: 'Economics' },
  { value: 'art',        label: 'Art' },
  { value: 'business',   label: 'Business' },
];

const BLOOMS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];

const emptyPoll = {
  questionType: 'mcq',
  question: '',
  questionLatex: '',
  questionImageUrl: '',
  showLatex: false,
  showImage: false,
  // MCQ / True/False
  options: ['', '', '', ''],
  correctAnswer: 0,
  // Fill blank / one_word
  acceptedAnswers: [''],
  // Numeric
  correctValue: '',
  tolerance: '0',
  unit: '',
  // Code
  codeBlock: '',
  codeLanguage: 'python',
  codeMode: 'mcq',
  // Multi-correct (Phase 2)
  correctOptions: [],
  markingScheme: 'all_or_nothing',
  // Assertion-Reason (Phase 2)
  assertion: '',
  reason: '',
  arCorrectAnswer: 0,
  // Match the Following (Phase 2)
  leftItems: ['', ''],
  rightItems: ['', ''],
  correctPairs: {},
  // Ordering (Phase 2)
  orderItems: ['', '', ''],
  correctOrder: [],
  // Essay with rubric (Phase 3)
  essayWordLimit: '',
  rubric: [],
  // Differentiate Between (Phase 3)
  diffColA: '',
  diffColB: '',
  diffRows: [''],
  // Diagram Labeling (Phase 3)
  diagramImageUrl: '',
  diagramMarkers: [],
  // Truth Table (Phase 4)
  ttHeaders: ['A', 'B', 'Output'],
  ttRows: [
    [{ value: '0', editable: false }, { value: '0', editable: false }, { value: '0', editable: true }],
    [{ value: '0', editable: false }, { value: '1', editable: false }, { value: '1', editable: true }],
    [{ value: '1', editable: false }, { value: '0', editable: false }, { value: '1', editable: true }],
    [{ value: '1', editable: false }, { value: '1', editable: false }, { value: '1', editable: true }],
  ],
  // Code Trace (Phase 4)
  traceSteps: [{ line_label: '', question: '', correct_answer: '' }],
  // Negative marking (Phase 2)
  negativeMarking: false,
  negativeValue: 0.25,
  // Meta
  justification: '',
  timeLimit: 60,
  difficulty: 1,
  subjectTag: '',
  difficultyLevel: 'medium',
  marks: 1,
  bloomsLevel: '',
  topic: '',
  solutionSteps: [],
  showAdvanced: false,
};

const formatTimeAgo = (ts) => {
  if (!ts) return '';
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};

const PollPanel = ({
  sessionId, polls, activePoll, liveResponseCount, onlineCount,
  presentCount, stuckCount, wsRef, setActivePoll, setLiveResponseCount, onPollsChange,
}) => {
  const [poll, setPoll] = useState({ ...emptyPoll });
  const [showCluster, setShowCluster] = useState(false);

  const set = (field, value) => setPoll(p => ({ ...p, [field]: value }));

  // ── activate / deactivate ──────────────────────────────────────────────────
  const activatePoll = async (p) => {
    try {
      const activated = await pollAPI.activatePoll(p.id);
      setActivePoll(activated);
      setLiveResponseCount(0);
      onPollsChange();
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'activate-poll', sessionId, poll: activated }));
        toast.success('Poll activated!');
      } else {
        toast.warning('Poll activated, but WebSocket not connected.');
      }
    } catch (err) {
      toast.error('Failed to activate poll: ' + err.message);
    }
  };

  const handleDeactivate = async (pollId) => {
    try {
      await pollAPI.closePoll(pollId);
      setActivePoll(null);
      onPollsChange();
      wsRef.current?.send(JSON.stringify({ type: 'poll-deactivated', sessionId, pollId }));
      toast.success('Poll ended');
    } catch (err) {
      toast.error('Failed to end poll');
    }
  };

  // ── build payload ──────────────────────────────────────────────────────────
  const negMeta = (extra = {}) =>
    poll.negativeMarking
      ? { ...extra, negative_marking: true, negative_value: poll.negativeValue }
      : extra;

  const buildPayload = () => {
    const base = {
      session_id: sessionId,
      question: poll.question,
      question_type: poll.questionType,
      question_latex: poll.showLatex ? poll.questionLatex : null,
      question_image_url: poll.showImage ? poll.questionImageUrl : null,
      justification: poll.justification,
      time_limit: poll.timeLimit,
      difficulty: poll.difficulty,
      subject_tag: poll.subjectTag || null,
      difficulty_level: poll.difficultyLevel,
      marks: poll.marks,
      blooms_level: poll.bloomsLevel || null,
      topic: poll.topic || null,
      solution_steps: poll.solutionSteps.length > 0 ? poll.solutionSteps : null,
    };

    if (['mcq', 'true_false'].includes(poll.questionType)) {
      const filtered = poll.questionType === 'true_false'
        ? ['True', 'False']
        : poll.options.filter(o => o.trim());
      return { ...base, options: filtered, correct_answer: poll.correctAnswer,
        options_metadata: negMeta() };
    }

    if (poll.questionType === 'fill_blank') {
      const accepted = poll.acceptedAnswers.filter(a => a.trim());
      return {
        ...base, options: [], correct_answer: null,
        options_metadata: negMeta({ accepted_answers: accepted }),
      };
    }

    if (poll.questionType === 'numeric') {
      return {
        ...base, options: [], correct_answer: null,
        options_metadata: negMeta({
          correct_value: parseFloat(poll.correctValue),
          tolerance: parseFloat(poll.tolerance) || 0,
          unit: poll.unit || null,
        }),
      };
    }

    if (poll.questionType === 'short_answer') {
      return { ...base, options: [], correct_answer: null };
    }

    if (poll.questionType === 'code') {
      const filtered = poll.codeMode === 'mcq' ? poll.options.filter(o => o.trim()) : [];
      return {
        ...base, options: filtered,
        correct_answer: poll.codeMode === 'mcq' ? poll.correctAnswer : null,
        options_metadata: negMeta({
          code: poll.codeBlock,
          language: poll.codeLanguage,
          code_mode: poll.codeMode,
          accepted_answers: poll.codeMode === 'fill_blank'
            ? poll.acceptedAnswers.filter(a => a.trim())
            : undefined,
        }),
      };
    }

    // ── Phase 2 ───────────────────────────────────────────────────────────────

    if (poll.questionType === 'multi_correct') {
      const filtered = poll.options.filter(o => o.trim());
      return {
        ...base, options: filtered, correct_answer: null,
        options_metadata: negMeta({
          correct_options: poll.correctOptions,
          marking_scheme: poll.markingScheme,
        }),
      };
    }

    if (poll.questionType === 'one_word') {
      const accepted = poll.acceptedAnswers.filter(a => a.trim());
      return {
        ...base, options: [], correct_answer: null,
        options_metadata: negMeta({ accepted_answers: accepted }),
      };
    }

    if (poll.questionType === 'assertion_reason') {
      return {
        ...base, options: [], correct_answer: poll.arCorrectAnswer,
        options_metadata: negMeta({
          assertion: poll.assertion,
          reason: poll.reason,
        }),
      };
    }

    if (poll.questionType === 'match_following') {
      const left = poll.leftItems.filter(i => i.trim());
      const right = poll.rightItems.filter(i => i.trim());
      return {
        ...base, options: [], correct_answer: null,
        options_metadata: negMeta({
          left_items: left,
          right_items: right,
          correct_pairs: poll.correctPairs,
        }),
      };
    }

    if (poll.questionType === 'ordering') {
      const items = poll.orderItems.filter(i => i.trim());
      return {
        ...base, options: items, correct_answer: null,
        options_metadata: {
          items,
          correct_order: poll.correctOrder.length ? poll.correctOrder : items.map((_, i) => i),
        },
      };
    }

    // ── Phase 3 ───────────────────────────────────────────────────────────────

    if (poll.questionType === 'essay') {
      return {
        ...base, options: [], correct_answer: null,
        options_metadata: {
          word_limit: poll.essayWordLimit ? parseInt(poll.essayWordLimit) : null,
          rubric: poll.rubric.filter(r => r.criterion.trim()),
        },
      };
    }

    if (poll.questionType === 'differentiate') {
      return {
        ...base, options: [], correct_answer: null,
        options_metadata: {
          col_a: poll.diffColA,
          col_b: poll.diffColB,
          rows: poll.diffRows.filter(r => r.trim()),
        },
      };
    }

    if (poll.questionType === 'diagram_labeling') {
      return {
        ...base, options: [], correct_answer: null,
        options_metadata: {
          image_url: poll.diagramImageUrl,
          markers: poll.diagramMarkers,
        },
      };
    }

    // ── Phase 4 ───────────────────────────────────────────────────────────────

    if (poll.questionType === 'truth_table') {
      return {
        ...base, options: [], correct_answer: null,
        options_metadata: {
          headers: poll.ttHeaders,
          rows: poll.ttRows,
        },
      };
    }

    if (poll.questionType === 'code_trace') {
      const steps = poll.traceSteps.filter(s => s.question.trim());
      return {
        ...base, options: [], correct_answer: null,
        options_metadata: {
          code: poll.codeBlock,
          language: poll.codeLanguage,
          steps,
        },
      };
    }

    return base;
  };

  // ── submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!poll.question.trim()) { toast.error('Question is required'); return; }

    try {
      const data = await pollAPI.createPoll(buildPayload());
      setPoll({ ...emptyPoll });
      toast.success('Poll created!');
      await activatePoll(data);
      onPollsChange();
    } catch (err) {
      toast.error('Failed to create poll: ' + err.message);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── Live stats banner ── */}
      <div className="flex flex-wrap items-center gap-4 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            <span className="font-bold text-green-600 dark:text-green-400">{onlineCount}</span>{' '}
            student{onlineCount !== 1 ? 's' : ''} online
          </span>
        </div>
        {presentCount > 0 && (
          <>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span className="text-sm text-slate-600 dark:text-slate-400">
              <span className="font-bold text-primary-600 dark:text-primary-400">{presentCount}</span> present
            </span>
          </>
        )}
        {stuckCount > 0 && (
          <>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span className="flex items-center gap-1.5 text-sm">
              <span className="font-bold text-orange-600 dark:text-orange-400">✋ {stuckCount}</span>
              <span className="text-slate-600 dark:text-slate-400">stuck</span>
              <button
                onClick={() => wsRef.current?.send(JSON.stringify({ type: 'stuck-reset', sessionId }))}
                className="text-xs text-orange-600 border border-orange-300 rounded px-1.5 py-0.5 hover:bg-orange-50 dark:hover:bg-orange-900/20"
              >Clear</button>
            </span>
          </>
        )}
      </div>

      {/* ── Cluster builder ── */}
      {showCluster && (
        <ClusterBuilder
          sessionId={sessionId}
          wsRef={wsRef}
          setActivePoll={setActivePoll}
          setLiveResponseCount={setLiveResponseCount}
          onPollsChange={onPollsChange}
          onClose={() => setShowCluster(false)}
        />
      )}

      {/* ── Create Poll form ── */}
      <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 sm:p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base sm:text-lg font-semibold dark:text-white">Create Question</h3>
          {!showCluster && (
            <button
              type="button"
              onClick={() => setShowCluster(true)}
              className="text-xs px-3 py-1.5 rounded-lg border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 font-medium hover:bg-amber-100 transition-colors"
            >
              📖 Passage / Cluster
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Question type selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Question Type</label>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
              {QUESTION_TYPES.map(qt => (
                <button
                  key={qt.id}
                  type="button"
                  onClick={() => set('questionType', qt.id)}
                  title={qt.desc}
                  className={`py-2 px-1 rounded-lg border-2 text-xs font-medium transition-all flex flex-col items-center gap-1
                    ${poll.questionType === qt.id
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'border-slate-200 dark:border-slate-600 text-slate-500 hover:border-slate-400'}`}
                >
                  <span className="text-base">{qt.icon}</span>
                  <span className="leading-tight text-center">{qt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Subject / Difficulty / Marks row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Subject</label>
              <select
                value={poll.subjectTag}
                onChange={e => set('subjectTag', e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded
                  bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">— subject —</option>
                {SUBJECTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Difficulty</label>
              <div className="flex gap-1">
                {[{v:1,l:'Easy',c:'green'},{v:2,l:'Med',c:'yellow'},{v:3,l:'Hard',c:'red'}].map(d => (
                  <button key={d.v} type="button" onClick={() => set('difficulty', d.v)}
                    className={`flex-1 py-1.5 text-xs rounded border-2 font-medium transition-all
                      ${poll.difficulty === d.v
                        ? `bg-${d.c}-100 dark:bg-${d.c}-900/30 text-${d.c}-700 border-${d.c}-400`
                        : 'border-slate-200 dark:border-slate-600 text-slate-400'}`}>
                    {d.l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Marks</label>
              <input type="number" min="1" max="100" value={poll.marks}
                onChange={e => set('marks', parseInt(e.target.value) || 1)}
                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded
                  bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Time (sec)</label>
              <input type="number" min="10" max="600" value={poll.timeLimit}
                onChange={e => set('timeLimit', parseInt(e.target.value))}
                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded
                  bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500" />
            </div>
          </div>

          {/* Negative marking */}
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={poll.negativeMarking}
                onChange={e => set('negativeMarking', e.target.checked)}
                className="w-4 h-4 rounded text-primary-600"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">Negative marking</span>
            </label>
            {poll.negativeMarking && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Penalty:</span>
                {[{v:0.25,l:'−¼ (GATE)'},{v:0.33,l:'−⅓'},{v:1,l:'−1 (JEE/NEET)'}].map(p => (
                  <button key={p.v} type="button"
                    onClick={() => set('negativeValue', p.v)}
                    className={`px-2 py-1 text-xs rounded border transition-colors
                      ${poll.negativeValue === p.v
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 border-red-400'
                        : 'border-slate-200 dark:border-slate-600 text-slate-500 hover:border-slate-400'}`}>
                    {p.l}
                  </button>
                ))}
                <input type="number" step="0.01" min="0" max="10" value={poll.negativeValue}
                  onChange={e => set('negativeValue', parseFloat(e.target.value) || 0)}
                  className="w-16 px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded
                    bg-white dark:bg-slate-700 dark:text-white focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Question text */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Question *</label>
            <textarea
              value={poll.question}
              onChange={e => set('question', e.target.value)}
              rows={3}
              placeholder="Enter your question here..."
              required
              className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm
                bg-white dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* LaTeX + Image toggles */}
          <div className="flex gap-3 text-xs">
            <button type="button" onClick={() => set('showLatex', !poll.showLatex)}
              className={`px-3 py-1.5 rounded-lg border transition-colors
                ${poll.showLatex ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 border-purple-300' : 'border-slate-200 text-slate-500 hover:border-slate-400'}`}>
              ∑ LaTeX equation
            </button>
            <button type="button" onClick={() => set('showImage', !poll.showImage)}
              className={`px-3 py-1.5 rounded-lg border transition-colors
                ${poll.showImage ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 border-blue-300' : 'border-slate-200 text-slate-500 hover:border-slate-400'}`}>
              🖼 Image URL
            </button>
          </div>

          {poll.showLatex && (
            <div className="space-y-1">
              <input
                type="text"
                value={poll.questionLatex}
                onChange={e => set('questionLatex', e.target.value)}
                placeholder="LaTeX equation, e.g. F = \frac{mv^2}{r}"
                className="w-full px-3 py-2 font-mono text-sm border border-purple-300 dark:border-purple-700 rounded-lg
                  bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
              {poll.questionLatex && (
                <div className="p-2 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
                  <LatexRenderer text={`$$${poll.questionLatex}$$`} />
                </div>
              )}
            </div>
          )}

          {poll.showImage && (
            <input
              type="url"
              value={poll.questionImageUrl}
              onChange={e => set('questionImageUrl', e.target.value)}
              placeholder="https://... (image URL for diagram, graph, etc.)"
              className="w-full px-3 py-2 text-sm border border-blue-300 dark:border-blue-700 rounded-lg
                bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          )}

          {/* ── Answer config (per type) ── */}
          <AnswerConfig poll={poll} set={set} />

          {/* Justification */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Justification / Explanation
            </label>
            <textarea
              value={poll.justification}
              onChange={e => set('justification', e.target.value)}
              rows={2}
              placeholder="Explain why this is the correct answer (shown to students after reveal)..."
              className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm
                bg-white dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Solution steps (collapsible) */}
          <div>
            <button
              type="button"
              onClick={() => set('showAdvanced', !poll.showAdvanced)}
              className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
            >
              {poll.showAdvanced ? '▲ Hide' : '▼ Add'} solution steps & advanced options
            </button>

            {poll.showAdvanced && (
              <div className="mt-3 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Solution Steps
                  </label>
                  <SolutionStepsBuilder
                    steps={poll.solutionSteps}
                    onChange={steps => set('solutionSteps', steps)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Bloom's Level (NEP 2020)
                    </label>
                    <select
                      value={poll.bloomsLevel}
                      onChange={e => set('bloomsLevel', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded
                        bg-white dark:bg-slate-700 dark:text-white focus:outline-none"
                    >
                      <option value="">— optional —</option>
                      {BLOOMS.map(b => <option key={b} value={b}>{b.charAt(0).toUpperCase() + b.slice(1)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Topic</label>
                    <input
                      type="text"
                      value={poll.topic}
                      onChange={e => set('topic', e.target.value)}
                      placeholder="e.g. Kinematics"
                      className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded
                        bg-white dark:bg-slate-700 dark:text-white focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <button type="submit"
            className="w-full sm:w-auto bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-lg font-medium text-sm">
            Create &amp; Activate Poll
          </button>
        </form>
      </div>

      {/* ── Active polls list ── */}
      {polls.length > 0 && (
        <div className="space-y-3">
          {polls.filter(p => p.isActive || p.is_active).map(p => (
            <div key={p.id} className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg p-4">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium uppercase">
                      {p.question_type || 'mcq'}
                    </span>
                    {p.subject_tag && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300">
                        {p.subject_tag}
                      </span>
                    )}
                  </div>
                  <p className="font-medium text-slate-900 dark:text-white text-sm">{p.question}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {liveResponseCount} response{liveResponseCount !== 1 ? 's' : ''} · {formatTimeAgo(p.activated_at || p.created_at)}
                  </p>
                </div>
                <button
                  onClick={() => handleDeactivate(p.id)}
                  className="flex-shrink-0 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 text-red-800 dark:text-red-300 text-sm font-medium py-1.5 px-3 rounded-lg transition-colors"
                >
                  End Poll
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Answer config sub-component ────────────────────────────────────────────────
function AnswerConfig({ poll, set }) {
  const { questionType: qt } = poll;

  if (qt === 'mcq') {
    return (
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Options * <span className="text-xs font-normal text-slate-400">(click radio to mark correct)</span>
        </label>
        {poll.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2 mb-2">
            <input type="radio" name="correct" checked={poll.correctAnswer === i}
              onChange={() => set('correctAnswer', i)} className="w-4 h-4 text-primary-600" />
            <input type="text" value={opt} onChange={e => {
              const o = [...poll.options]; o[i] = e.target.value; set('options', o);
            }}
              placeholder={`Option ${String.fromCharCode(65 + i)}`}
              className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded
                bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
        ))}
        <p className="text-xs text-slate-500 mt-1">Radio = correct answer</p>
      </div>
    );
  }

  if (qt === 'true_false') {
    return (
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Correct Answer</label>
        <div className="flex gap-3">
          {['True', 'False'].map((label, i) => (
            <button key={i} type="button" onClick={() => set('correctAnswer', i)}
              className={`flex-1 py-2.5 rounded-lg border-2 font-medium text-sm transition-all
                ${poll.correctAnswer === i
                  ? i === 0
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/30 text-green-700'
                    : 'border-red-500 bg-red-50 dark:bg-red-900/30 text-red-700'
                  : 'border-slate-200 dark:border-slate-600 text-slate-500'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (qt === 'fill_blank') {
    return (
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Accepted Answers <span className="text-xs font-normal text-slate-400">(case-insensitive)</span>
        </label>
        {poll.acceptedAnswers.map((ans, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input type="text" value={ans}
              onChange={e => {
                const a = [...poll.acceptedAnswers]; a[i] = e.target.value; set('acceptedAnswers', a);
              }}
              placeholder={`Accepted answer ${i + 1}`}
              className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded
                bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            {poll.acceptedAnswers.length > 1 && (
              <button type="button" onClick={() => set('acceptedAnswers', poll.acceptedAnswers.filter((_, j) => j !== i))}
                className="text-red-400 hover:text-red-600 text-sm px-2">✕</button>
            )}
          </div>
        ))}
        <button type="button"
          onClick={() => set('acceptedAnswers', [...poll.acceptedAnswers, ''])}
          className="text-xs text-primary-600 hover:underline">+ Add alternate answer</button>
      </div>
    );
  }

  if (qt === 'numeric') {
    return (
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Correct Value *</label>
          <input type="number" step="any" value={poll.correctValue}
            onChange={e => set('correctValue', e.target.value)}
            placeholder="e.g. 9.81"
            className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded
              bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tolerance ±</label>
          <input type="number" step="any" min="0" value={poll.tolerance}
            onChange={e => set('tolerance', e.target.value)}
            placeholder="0.05"
            className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded
              bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Unit (optional)</label>
          <input type="text" value={poll.unit}
            onChange={e => set('unit', e.target.value)}
            placeholder="m/s²"
            className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded
              bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <p className="col-span-3 text-xs text-slate-500">
          Answer accepted if |student − {poll.correctValue || '?'}| ≤ {poll.tolerance || '0'}
        </p>
      </div>
    );
  }

  if (qt === 'short_answer') {
    return (
      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-sm text-amber-700 dark:text-amber-300">
        ✎ Short Answer — students write free text. You will grade responses manually after the poll ends.
      </div>
    );
  }

  if (qt === 'code') {
    return (
      <div className="space-y-3">
        <div className="flex gap-2 items-center">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Language</label>
          <select value={poll.codeLanguage} onChange={e => set('codeLanguage', e.target.value)}
            className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded
              bg-white dark:bg-slate-700 dark:text-white focus:outline-none">
            {['python','javascript','java','c','cpp','sql'].map(l => <option key={l}>{l}</option>)}
          </select>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-3">Answer mode</label>
          <select value={poll.codeMode} onChange={e => set('codeMode', e.target.value)}
            className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded
              bg-white dark:bg-slate-700 dark:text-white focus:outline-none">
            <option value="mcq">MCQ (choose output)</option>
            <option value="fill_blank">Fill blank (type output)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Code block *</label>
          <textarea value={poll.codeBlock} onChange={e => set('codeBlock', e.target.value)}
            rows={5} placeholder="Paste the code here..."
            className="w-full p-2.5 font-mono text-sm border border-slate-300 dark:border-slate-600 rounded-lg
              bg-white dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-primary-500 resize-y"
          />
        </div>
        {poll.codeMode === 'mcq' && (
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
              MCQ Options * <span className="font-normal">(radio = correct)</span>
            </label>
            {poll.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <input type="radio" name="codeCorrect" checked={poll.correctAnswer === i}
                  onChange={() => set('correctAnswer', i)} className="w-4 h-4 text-primary-600" />
                <input type="text" value={opt}
                  onChange={e => { const o = [...poll.options]; o[i] = e.target.value; set('options', o); }}
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded
                    bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            ))}
          </div>
        )}
        {poll.codeMode === 'fill_blank' && (
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Accepted outputs</label>
            {poll.acceptedAnswers.map((ans, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input type="text" value={ans}
                  onChange={e => { const a = [...poll.acceptedAnswers]; a[i] = e.target.value; set('acceptedAnswers', a); }}
                  placeholder={`Accepted output ${i + 1}`}
                  className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded
                    bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                {poll.acceptedAnswers.length > 1 && (
                  <button type="button"
                    onClick={() => set('acceptedAnswers', poll.acceptedAnswers.filter((_, j) => j !== i))}
                    className="text-red-400 hover:text-red-600 px-2">✕</button>
                )}
              </div>
            ))}
            <button type="button"
              onClick={() => set('acceptedAnswers', [...poll.acceptedAnswers, ''])}
              className="text-xs text-primary-600 hover:underline">+ Add alternate output</button>
          </div>
        )}
      </div>
    );
  }

  if (qt === 'multi_correct') {
    return (
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Options * <span className="text-xs font-normal text-slate-400">(check all correct)</span>
        </label>
        {poll.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2 mb-2">
            <input type="checkbox"
              checked={poll.correctOptions.includes(i)}
              onChange={() => {
                const next = poll.correctOptions.includes(i)
                  ? poll.correctOptions.filter(x => x !== i)
                  : [...poll.correctOptions, i];
                set('correctOptions', next);
              }}
              className="w-4 h-4 rounded text-primary-600"
            />
            <input type="text" value={opt}
              onChange={e => { const o = [...poll.options]; o[i] = e.target.value; set('options', o); }}
              placeholder={`Option ${String.fromCharCode(65 + i)}`}
              className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded
                bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
        ))}
        <div className="mt-2">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Marking Scheme</label>
          <div className="flex gap-2 flex-wrap">
            {[
              {v:'all_or_nothing', l:'All-or-Nothing'},
              {v:'jee_advanced',   l:'JEE Advanced (+4/−2/0)'},
              {v:'per_correct',    l:'Per Correct'},
            ].map(s => (
              <button key={s.v} type="button" onClick={() => set('markingScheme', s.v)}
                className={`px-3 py-1 text-xs rounded-lg border-2 transition-colors font-medium
                  ${poll.markingScheme === s.v
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700'
                    : 'border-slate-200 dark:border-slate-600 text-slate-500 hover:border-slate-400'}`}>
                {s.l}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (qt === 'one_word') {
    return (
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Accepted Answers <span className="text-xs font-normal text-slate-400">(case-insensitive)</span>
        </label>
        {poll.acceptedAnswers.map((ans, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input type="text" value={ans}
              onChange={e => { const a = [...poll.acceptedAnswers]; a[i] = e.target.value; set('acceptedAnswers', a); }}
              placeholder={`Accepted answer ${i + 1}`}
              maxLength={50}
              className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded
                bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            {poll.acceptedAnswers.length > 1 && (
              <button type="button" onClick={() => set('acceptedAnswers', poll.acceptedAnswers.filter((_, j) => j !== i))}
                className="text-red-400 hover:text-red-600 px-2">✕</button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => set('acceptedAnswers', [...poll.acceptedAnswers, ''])}
          className="text-xs text-primary-600 hover:underline">+ Add alternate</button>
      </div>
    );
  }

  if (qt === 'assertion_reason') {
    const fixedOpts = [
      'Both A and R true, R explains A',
      'Both A and R true, R does NOT explain A',
      'A is true, R is false',
      'A is false, R is true',
    ];
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Assertion (A)</label>
          <textarea value={poll.assertion} onChange={e => set('assertion', e.target.value)}
            rows={2} placeholder="State the assertion..."
            className="w-full p-2.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg
              bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Reason (R)</label>
          <textarea value={poll.reason} onChange={e => set('reason', e.target.value)}
            rows={2} placeholder="State the reason..."
            className="w-full p-2.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg
              bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Correct Option</label>
          {fixedOpts.map((label, i) => (
            <button key={i} type="button" onClick={() => set('arCorrectAnswer', i)}
              className={`w-full text-left px-3 py-2 text-xs rounded-lg border mb-1 transition-colors
                ${poll.arCorrectAnswer === i
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700'
                  : 'border-slate-200 dark:border-slate-600 text-slate-500 hover:border-slate-400'}`}>
              {String.fromCharCode(65 + i)}. {label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (qt === 'match_following') {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Left Column</label>
            {poll.leftItems.map((item, i) => (
              <div key={i} className="flex gap-1 mb-1">
                <span className="w-5 flex-shrink-0 text-xs font-bold text-slate-500 pt-2">
                  {String.fromCharCode(65 + i)}.
                </span>
                <input type="text" value={item}
                  onChange={e => { const a = [...poll.leftItems]; a[i] = e.target.value; set('leftItems', a); }}
                  placeholder={`Item ${i + 1}`}
                  className="flex-1 px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded
                    bg-white dark:bg-slate-700 dark:text-white focus:outline-none"
                />
                {poll.leftItems.length > 2 && (
                  <button type="button" onClick={() => set('leftItems', poll.leftItems.filter((_, j) => j !== i))}
                    className="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => set('leftItems', [...poll.leftItems, ''])}
              className="text-xs text-primary-600 hover:underline mt-1">+ Add</button>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Right Column</label>
            {poll.rightItems.map((item, i) => (
              <div key={i} className="flex gap-1 mb-1">
                <span className="w-5 flex-shrink-0 text-xs font-bold text-slate-500 pt-2">
                  {String.fromCharCode(112 + i)}.
                </span>
                <input type="text" value={item}
                  onChange={e => { const a = [...poll.rightItems]; a[i] = e.target.value; set('rightItems', a); }}
                  placeholder={`Item ${i + 1}`}
                  className="flex-1 px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded
                    bg-white dark:bg-slate-700 dark:text-white focus:outline-none"
                />
                {poll.rightItems.length > 2 && (
                  <button type="button" onClick={() => set('rightItems', poll.rightItems.filter((_, j) => j !== i))}
                    className="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => set('rightItems', [...poll.rightItems, ''])}
              className="text-xs text-primary-600 hover:underline mt-1">+ Add</button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Correct Pairs <span className="font-normal">(Left → Right)</span>
          </label>
          {poll.leftItems.map((left, li) => (
            left.trim() ? (
              <div key={li} className="flex items-center gap-2 mb-1 text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300 w-24 truncate">
                  {String.fromCharCode(65 + li)}. {left}
                </span>
                <span className="text-slate-400">→</span>
                <select
                  value={poll.correctPairs[String(li)] ?? ''}
                  onChange={e => set('correctPairs', { ...poll.correctPairs, [String(li)]: e.target.value })}
                  className="flex-1 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded
                    bg-white dark:bg-slate-700 dark:text-white text-xs focus:outline-none"
                >
                  <option value="">— choose —</option>
                  {poll.rightItems.map((right, ri) => right.trim() ? (
                    <option key={ri} value={String(ri)}>
                      {String.fromCharCode(112 + ri)}. {right}
                    </option>
                  ) : null)}
                </select>
              </div>
            ) : null
          ))}
        </div>
      </div>
    );
  }

  if (qt === 'ordering') {
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Items to order <span className="font-normal">(enter in ANY order — students will reorder them)</span>
          </label>
          {poll.orderItems.map((item, i) => (
            <div key={i} className="flex gap-2 mb-1">
              <input type="text" value={item}
                onChange={e => {
                  const a = [...poll.orderItems]; a[i] = e.target.value; set('orderItems', a);
                  set('correctOrder', []);
                }}
                placeholder={`Item ${i + 1}`}
                className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded
                  bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              {poll.orderItems.length > 2 && (
                <button type="button"
                  onClick={() => { set('orderItems', poll.orderItems.filter((_, j) => j !== i)); set('correctOrder', []); }}
                  className="text-red-400 hover:text-red-600 px-2">✕</button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => set('orderItems', [...poll.orderItems, ''])}
            className="text-xs text-primary-600 hover:underline">+ Add item</button>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Correct sequence <span className="font-normal">(enter indices 0,1,2,... in correct order)</span>
          </label>
          <div className="flex gap-1 flex-wrap">
            {poll.orderItems.map((item, i) => item.trim() ? (
              <span key={i} className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 rounded border border-slate-200 dark:border-slate-600">
                [{i}] {item}
              </span>
            ) : null)}
          </div>
          <input type="text"
            value={poll.correctOrder.join(',')}
            onChange={e => {
              const parsed = e.target.value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
              set('correctOrder', parsed);
            }}
            placeholder="e.g. 2,0,3,1"
            className="mt-1 w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded
              bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <p className="text-xs text-slate-400 mt-1">
            Enter indices in the correct order (e.g. if item 2 is first, start with 2)
          </p>
        </div>
      </div>
    );
  }

  // ── Phase 3 ──────────────────────────────────────────────────────────────────

  if (qt === 'essay') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Word limit</label>
          <input type="number" min="50" max="5000" value={poll.essayWordLimit}
            onChange={e => set('essayWordLimit', e.target.value)}
            placeholder="e.g. 500 (optional)"
            className="w-36 px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded
              bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Rubric <span className="text-xs font-normal text-slate-400">(optional — shown to students)</span>
          </label>
          <RubricBuilder rubric={poll.rubric} onChange={r => set('rubric', r)} />
        </div>
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-sm text-amber-700 dark:text-amber-300">
          📝 Essay — teacher grades manually after the poll ends.
        </div>
      </div>
    );
  }

  if (qt === 'differentiate') {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Column A header *</label>
            <input type="text" value={poll.diffColA} onChange={e => set('diffColA', e.target.value)}
              placeholder="e.g. Plant Cell"
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded
                bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Column B header *</label>
            <input type="text" value={poll.diffColB} onChange={e => set('diffColB', e.target.value)}
              placeholder="e.g. Animal Cell"
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded
                bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Row criteria <span className="font-normal">(basis for comparison)</span>
          </label>
          {poll.diffRows.map((row, i) => (
            <div key={i} className="flex gap-2 mb-1">
              <input type="text" value={row}
                onChange={e => { const a = [...poll.diffRows]; a[i] = e.target.value; set('diffRows', a); }}
                placeholder={`Criterion ${i + 1} (e.g. Cell wall)`}
                className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded
                  bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              {poll.diffRows.length > 1 && (
                <button type="button" onClick={() => set('diffRows', poll.diffRows.filter((_, j) => j !== i))}
                  className="text-red-400 hover:text-red-600 px-2">✕</button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => set('diffRows', [...poll.diffRows, ''])}
            className="text-xs text-primary-600 hover:underline">+ Add row</button>
        </div>
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-xs text-amber-700 dark:text-amber-300">
          ⇔ Differentiate — teacher grades manually after the poll ends.
        </div>
      </div>
    );
  }

  if (qt === 'diagram_labeling') {
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Diagram image URL *
          </label>
          <input type="url" value={poll.diagramImageUrl}
            onChange={e => { set('diagramImageUrl', e.target.value); set('diagramMarkers', []); }}
            placeholder="https://... (image URL for the diagram)"
            className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded
              bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <DiagramMarkerEditor
          imageUrl={poll.diagramImageUrl}
          markers={poll.diagramMarkers}
          onChange={m => set('diagramMarkers', m)}
        />
      </div>
    );
  }

  // ── Phase 4 ──────────────────────────────────────────────────────────────────

  if (qt === 'truth_table') {
    const updateHeader = (i, val) => {
      const h = [...poll.ttHeaders]; h[i] = val; set('ttHeaders', h);
    };
    const updateCell = (r, c, field, val) => {
      const rows = poll.ttRows.map((row, ri) =>
        ri !== r ? row : row.map((cell, ci) => ci !== c ? cell : { ...cell, [field]: val })
      );
      set('ttRows', rows);
    };
    const addRow = () => {
      const newRow = poll.ttHeaders.map(() => ({ value: '0', editable: false }));
      set('ttRows', [...poll.ttRows, newRow]);
    };
    const removeRow = (r) => set('ttRows', poll.ttRows.filter((_, i) => i !== r));
    const addCol = () => {
      set('ttHeaders', [...poll.ttHeaders, `Col ${poll.ttHeaders.length + 1}`]);
      set('ttRows', poll.ttRows.map(row => [...row, { value: '0', editable: true }]));
    };
    const removeCol = (c) => {
      if (poll.ttHeaders.length <= 2) return;
      set('ttHeaders', poll.ttHeaders.filter((_, i) => i !== c));
      set('ttRows', poll.ttRows.map(row => row.filter((_, i) => i !== c)));
    };

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Columns:</span>
          {poll.ttHeaders.map((h, i) => (
            <div key={i} className="flex items-center gap-1">
              <input type="text" value={h} onChange={e => updateHeader(i, e.target.value)}
                className="w-20 px-2 py-1 text-xs font-mono border border-slate-300 dark:border-slate-600 rounded
                  bg-white dark:bg-slate-700 dark:text-white focus:outline-none" />
              {poll.ttHeaders.length > 2 && (
                <button type="button" onClick={() => removeCol(i)}
                  className="text-red-400 hover:text-red-600 text-xs">✕</button>
              )}
            </div>
          ))}
          <button type="button" onClick={addCol}
            className="text-xs text-primary-600 hover:underline">+ Col</button>
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
          <table className="text-xs font-mono border-collapse w-full">
            <thead>
              <tr>
                <th className="px-2 py-1 border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500">#</th>
                {poll.ttHeaders.map((h, i) => (
                  <th key={i} className="px-3 py-1 border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                    {h}
                  </th>
                ))}
                <th className="px-2 py-1 border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500"></th>
              </tr>
            </thead>
            <tbody>
              {poll.ttRows.map((row, r) => (
                <tr key={r} className={r % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/40'}>
                  <td className="px-2 py-1 text-center border border-slate-200 dark:border-slate-700 text-slate-400">{r + 1}</td>
                  {row.map((cell, c) => (
                    <td key={c} className="border border-slate-200 dark:border-slate-700 p-1">
                      <div className="flex flex-col items-center gap-0.5">
                        <div className="flex gap-1">
                          {['0','1'].map(v => (
                            <button key={v} type="button"
                              onClick={() => updateCell(r, c, 'value', v)}
                              className={`w-6 h-6 rounded border text-xs font-bold transition-colors
                                ${cell.value === v
                                  ? 'bg-blue-500 border-blue-600 text-white'
                                  : 'border-slate-300 dark:border-slate-600 text-slate-400 bg-white dark:bg-slate-800'}`}>
                              {v}
                            </button>
                          ))}
                        </div>
                        <button type="button"
                          onClick={() => updateCell(r, c, 'editable', !cell.editable)}
                          title={cell.editable ? 'Student fills (click to pre-fill)' : 'Pre-filled (click to make editable)'}
                          className={`px-1 py-0.5 rounded text-xs transition-colors ${
                            cell.editable
                              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 border border-amber-300'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-400 border border-slate-200 dark:border-slate-600'
                          }`}>
                          {cell.editable ? '✎ fill' : '● fixed'}
                        </button>
                      </div>
                    </td>
                  ))}
                  <td className="px-2 border border-slate-200 dark:border-slate-700">
                    <button type="button" onClick={() => removeRow(r)}
                      className="text-red-400 hover:text-red-600 text-xs">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={addRow}
          className="text-xs text-primary-600 hover:underline">+ Add row</button>
        <p className="text-xs text-slate-500">
          <span className="text-amber-600">✎ fill</span> = student fills in · <span className="text-slate-400">● fixed</span> = pre-filled (given to student)
        </p>
      </div>
    );
  }

  if (qt === 'code_trace') {
    const updateStep = (i, field, val) => {
      const steps = poll.traceSteps.map((s, si) => si !== i ? s : { ...s, [field]: val });
      set('traceSteps', steps);
    };
    const addStep = () => set('traceSteps', [...poll.traceSteps, { line_label: '', question: '', correct_answer: '' }]);
    const removeStep = (i) => set('traceSteps', poll.traceSteps.filter((_, si) => si !== i));

    return (
      <div className="space-y-3">
        <div className="flex gap-2 items-center">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Language</label>
          <select value={poll.codeLanguage} onChange={e => set('codeLanguage', e.target.value)}
            className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded
              bg-white dark:bg-slate-700 dark:text-white focus:outline-none">
            {['python','javascript','java','c','cpp','sql'].map(l => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Code block *</label>
          <textarea value={poll.codeBlock} onChange={e => set('codeBlock', e.target.value)}
            rows={5} placeholder="Paste the code to trace..."
            className="w-full p-2.5 font-mono text-sm border border-slate-300 dark:border-slate-600 rounded-lg
              bg-white dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-primary-500 resize-y"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
            Trace steps * <span className="font-normal">(each step = a question students answer while reading the code)</span>
          </label>
          {poll.traceSteps.map((step, i) => (
            <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2 mb-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Step {i + 1}</span>
                {poll.traceSteps.length > 1 && (
                  <button type="button" onClick={() => removeStep(i)}
                    className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input type="text" value={step.line_label}
                  onChange={e => updateStep(i, 'line_label', e.target.value)}
                  placeholder="Line (e.g. 3)"
                  className="px-2 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded
                    bg-white dark:bg-slate-700 dark:text-white focus:outline-none"
                />
                <input type="text" value={step.question}
                  onChange={e => updateStep(i, 'question', e.target.value)}
                  placeholder="Question (e.g. What is x?)"
                  className="sm:col-span-1 px-2 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded
                    bg-white dark:bg-slate-700 dark:text-white focus:outline-none"
                />
                <input type="text" value={step.correct_answer}
                  onChange={e => updateStep(i, 'correct_answer', e.target.value)}
                  placeholder="Correct answer"
                  className="px-2 py-1.5 text-xs border border-green-300 dark:border-green-700 rounded
                    bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-green-400"
                />
              </div>
            </div>
          ))}
          <button type="button" onClick={addStep}
            className="text-xs text-primary-600 hover:underline">+ Add step</button>
        </div>
      </div>
    );
  }

  return null;
}

export default PollPanel;
