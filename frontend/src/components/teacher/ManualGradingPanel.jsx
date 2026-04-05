import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { apiRequest } from '../../utils/api';

/**
 * ManualGradingPanel — shown for essay / short_answer polls.
 * Fetches all responses where is_correct is null and lets the teacher
 * mark each one correct/incorrect with optional feedback.
 *
 * Props:
 *   poll         — the poll object (must have question_type)
 *   sessionId    — the string session ID (for display)
 *   onClose      — called when the panel should close
 */
export default function ManualGradingPanel({ poll, onClose }) {
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState({}); // responseId → { feedback, submitting }

  useEffect(() => {
    fetchResponses();
  }, [poll.id]);

  const fetchResponses = async () => {
    setLoading(true);
    try {
      const data = await apiRequest(`/polls/${poll.id}/responses`);
      // Show all responses; highlight ungraded ones
      setResponses(Array.isArray(data) ? data : (data.responses || []));
    } catch (err) {
      toast.error('Failed to load responses');
    } finally {
      setLoading(false);
    }
  };

  const handleGrade = async (responseId, isCorrect) => {
    const feedback = grading[responseId]?.feedback || '';
    setGrading(prev => ({ ...prev, [responseId]: { ...prev[responseId], submitting: true } }));
    try {
      await apiRequest(`/polls/${poll.id}/responses/${responseId}/grade`, {
        method: 'POST',
        body: JSON.stringify({ is_correct: isCorrect, teacher_feedback: feedback }),
      });
      setResponses(prev => prev.map(r =>
        r.id === responseId ? { ...r, is_correct: isCorrect, teacher_feedback: feedback } : r
      ));
      toast.success(isCorrect ? 'Marked correct' : 'Marked incorrect');
    } catch (err) {
      toast.error('Failed to save grade');
    } finally {
      setGrading(prev => ({ ...prev, [responseId]: { ...prev[responseId], submitting: false } }));
    }
  };

  const ungraded = responses.filter(r => r.is_correct === null || r.is_correct === undefined);
  const graded = responses.filter(r => r.is_correct !== null && r.is_correct !== undefined);

  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null); // { done, total }

  const exportCSV = () => {
    if (responses.length === 0) { toast.error('No responses to export'); return; }
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Student', 'Answer', 'Result', 'Feedback', 'Graded At'];
    const rows = responses.map(r => {
      const ad = (() => { try { return typeof r.answer_data === 'string' ? JSON.parse(r.answer_data) : (r.answer_data || {}); } catch { return {}; } })();
      const answerText = ad.text || ad.answer || '';
      const result = r.is_correct === null || r.is_correct === undefined ? 'Pending' : r.is_correct ? 'Correct' : 'Incorrect';
      return [
        escape(r.student_name || `Student #${r.student_id}`),
        escape(answerText),
        escape(result),
        escape(r.teacher_feedback || ''),
        escape(r.graded_at ? new Date(r.graded_at).toLocaleString() : ''),
      ].join(',');
    });
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grades_poll_${poll.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  const handleBulkAIGrade = async () => {
    const targets = ungraded.filter(r => {
      const ad = (() => { try { return typeof r.answer_data === 'string' ? JSON.parse(r.answer_data) : (r.answer_data || {}); } catch { return {}; } })();
      return !!(ad.text || ad.answer);
    });
    if (targets.length === 0) { toast.error('No text responses to grade'); return; }
    setBulkLoading(true);
    setBulkProgress({ done: 0, total: targets.length });
    let succeeded = 0;
    let processed = 0;
    for (const r of targets) {
      try {
        const data = await apiRequest(`/polls/${poll.id}/responses/${r.id}/suggest-grade`, { method: 'POST' });
        if (data.success) {
          const { suggested_correct, feedback } = data.suggestion;
          await apiRequest(`/polls/${poll.id}/responses/${r.id}/grade`, {
            method: 'POST',
            body: JSON.stringify({ is_correct: suggested_correct, teacher_feedback: feedback }),
          });
          setResponses(prev => prev.map(p =>
            p.id === r.id ? { ...p, is_correct: suggested_correct, teacher_feedback: feedback } : p
          ));
          succeeded++;
        }
      } catch { /* skip failed ones */ }
      processed++;
      setBulkProgress({ done: processed, total: targets.length });
    }
    setBulkLoading(false);
    setBulkProgress(null);
    toast.success(`AI graded ${succeeded} of ${targets.length} responses`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
                Manual Grading
              </span>
              <span className="text-xs text-slate-400">{poll.question_type?.replace(/_/g, ' ')}</span>
            </div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white line-clamp-2">{poll.question}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {ungraded.length} pending · {graded.length} graded · {responses.length} total
              </p>
              {ungraded.length > 0 && (
                <button
                  onClick={handleBulkAIGrade}
                  disabled={bulkLoading}
                  className="text-xs px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium transition-colors disabled:opacity-60 flex items-center gap-1.5"
                >
                  {bulkLoading ? (
                    <>
                      <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {bulkProgress ? `${bulkProgress.done}/${bulkProgress.total}` : '…'}
                    </>
                  ) : (
                    <>✨ AI Grade All</>
                  )}
                </button>
              )}
              {responses.length > 0 && (
                <button
                  onClick={exportCSV}
                  className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors font-medium flex items-center gap-1"
                >
                  ↓ CSV
                </button>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-3 shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : responses.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-500 gap-2">
              <span className="text-3xl">📭</span>
              <p className="text-sm">No responses yet.</p>
            </div>
          ) : (
            <>
              {/* Ungraded responses first */}
              {ungraded.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-2">
                    Needs grading ({ungraded.length})
                  </p>
                  <div className="space-y-3">
                    {ungraded.map(r => (
                      <ResponseCard
                        key={r.id}
                        pollId={poll.id}
                        response={r}
                        grading={grading[r.id] || {}}
                        onFeedbackChange={(v) => setGrading(prev => ({ ...prev, [r.id]: { ...prev[r.id], feedback: v } }))}
                        onGrade={(isCorrect) => handleGrade(r.id, isCorrect)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Already graded */}
              {graded.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                    Graded ({graded.length})
                  </p>
                  <div className="space-y-3">
                    {graded.map(r => (
                      <ResponseCard
                        key={r.id}
                        pollId={poll.id}
                        response={r}
                        grading={grading[r.id] || {}}
                        onFeedbackChange={(v) => setGrading(prev => ({ ...prev, [r.id]: { ...prev[r.id], feedback: v } }))}
                        onGrade={(isCorrect) => handleGrade(r.id, isCorrect)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ResponseCard({ pollId, response, grading, onFeedbackChange, onGrade }) {
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  const answerData = (() => {
    try { return typeof response.answer_data === 'string' ? JSON.parse(response.answer_data) : (response.answer_data || {}); }
    catch { return {}; }
  })();

  const answerText = answerData.text || answerData.answer || '';
  const isGraded = response.is_correct !== null && response.is_correct !== undefined;

  const fetchAiSuggestion = async () => {
    setAiLoading(true);
    setAiSuggestion(null);
    try {
      const data = await apiRequest(`/polls/${pollId}/responses/${response.id}/suggest-grade`, { method: 'POST' });
      if (data.success) {
        setAiSuggestion(data.suggestion);
        // Pre-fill feedback textarea with AI feedback
        if (data.suggestion.feedback) onFeedbackChange(data.suggestion.feedback);
      }
    } catch {
      toast.error('AI suggestion failed');
    } finally {
      setAiLoading(false);
    }
  };

  const applyAiSuggestion = () => {
    if (!aiSuggestion) return;
    onGrade(aiSuggestion.suggested_correct);
    setAiSuggestion(null);
  };

  return (
    <div className={`rounded-xl border p-4 transition-colors ${
      isGraded
        ? response.is_correct
          ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10'
          : 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10'
        : 'border-amber-200 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-900/10'
    }`}>
      {/* Student info */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {response.student_name || `Student #${response.student_id}`}
        </span>
        <div className="flex items-center gap-2">
          {isGraded && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              response.is_correct
                ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
            }`}>
              {response.is_correct ? '✓ Correct' : '✗ Incorrect'}
            </span>
          )}
          {answerText && (
            <button
              onClick={fetchAiSuggestion}
              disabled={aiLoading}
              className="text-xs px-2 py-0.5 rounded border border-violet-300 dark:border-violet-700 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              {aiLoading ? (
                <span className="inline-block w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              ) : '✨'}
              {aiLoading ? 'Thinking…' : 'AI Suggest'}
            </button>
          )}
        </div>
      </div>

      {/* AI suggestion banner */}
      {aiSuggestion && (
        <div className={`mb-3 p-3 rounded-lg border text-xs ${
          aiSuggestion.suggested_correct
            ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
            : 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              ✨ AI suggests: <span className={aiSuggestion.suggested_correct ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
                {aiSuggestion.suggested_correct ? 'Correct' : 'Incorrect'}
              </span>
              <span className="ml-2 text-slate-400 font-normal">({aiSuggestion.confidence} confidence)</span>
            </span>
            <button onClick={() => setAiSuggestion(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">✕</button>
          </div>
          <p className="text-slate-600 dark:text-slate-300 mb-2">{aiSuggestion.feedback}</p>
          <button
            onClick={applyAiSuggestion}
            disabled={grading.submitting}
            className="px-3 py-1 rounded bg-violet-600 hover:bg-violet-700 text-white font-medium transition-colors disabled:opacity-50"
          >
            Apply suggestion
          </button>
        </div>
      )}

      {/* Student's answer */}
      <div className="bg-white dark:bg-slate-700/50 rounded-lg p-3 mb-3 text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap min-h-[3rem]">
        {answerText || <span className="text-slate-400 italic">No text response</span>}
      </div>

      {/* Existing feedback (if graded) */}
      {isGraded && response.teacher_feedback && (
        <p className="text-xs text-slate-500 dark:text-slate-400 italic mb-2">
          Feedback: {response.teacher_feedback}
        </p>
      )}

      {/* Grade controls */}
      <div className="space-y-2">
        <textarea
          value={grading.feedback ?? (response.teacher_feedback || '')}
          onChange={e => onFeedbackChange(e.target.value)}
          placeholder="Optional feedback for student…"
          rows={2}
          className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
        />
        <div className="flex gap-2">
          <button
            onClick={() => onGrade(true)}
            disabled={grading.submitting}
            className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-green-500 hover:bg-green-600 text-white transition-colors disabled:opacity-50"
          >
            {grading.submitting ? '…' : '✓ Correct'}
          </button>
          <button
            onClick={() => onGrade(false)}
            disabled={grading.submitting}
            className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
          >
            {grading.submitting ? '…' : '✗ Incorrect'}
          </button>
        </div>
      </div>
    </div>
  );
}
