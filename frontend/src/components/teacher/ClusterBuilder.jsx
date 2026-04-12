import React, { useState } from 'react';
import { toast } from 'sonner';
import { clusterAPI, pollAPI } from '../../utils/api';
import LatexRenderer from '../shared/renderers/LatexRenderer';

/**
 * ClusterBuilder — Teacher UI to create a passage/case-study cluster.
 *
 * Creates the cluster (passage) first, then lets the teacher add sub-questions
 * one by one using the existing poll creation flow (each sub-poll is linked via cluster_id).
 *
 * Props:
 *   sessionId    — current session's string ID
 *   wsRef        — WebSocket ref for activating polls
 *   setActivePoll
 *   setLiveResponseCount
 *   onPollsChange
 *   onClose      — callback to close/hide this builder
 */
export default function ClusterBuilder({ sessionId, wsRef, setActivePoll, setLiveResponseCount, onPollsChange, onClose }) {
  const [step, setStep] = useState('passage'); // 'passage' | 'subquestions'
  const [cluster, setCluster] = useState(null);
  const [passage, setPassage] = useState('');
  const [passageLatex, setPassageLatex] = useState('');
  const [passageImageUrl, setPassageImageUrl] = useState('');
  const [title, setTitle] = useState('');
  const [showLatex, setShowLatex] = useState(false);
  const [showImage, setShowImage] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sub-question form (simplified — type, question, options, correct)
  const [subType, setSubType] = useState('mcq');
  const [subQuestion, setSubQuestion] = useState('');
  const [subOptions, setSubOptions] = useState(['', '', '', '']);
  const [subCorrect, setSubCorrect] = useState(0);
  const [subAccepted, setSubAccepted] = useState(['']);
  const [subMarks, setSubMarks] = useState(1);
  const [addingSubQ, setAddingSubQ] = useState(false);

  const handleCreateCluster = async () => {
    if (!passage.trim()) { toast.error('Passage text is required'); return; }
    setSaving(true);
    try {
      const data = await clusterAPI.createCluster({
        session_id: sessionId,
        title: title || null,
        passage,
        passage_image_url: showImage ? passageImageUrl : null,
        passage_latex: showLatex ? passageLatex : null,
      });
      setCluster(data);
      setStep('subquestions');
      toast.success('Cluster created — now add sub-questions');
    } catch (err) {
      toast.error('Failed to create cluster: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddSubQuestion = async () => {
    if (!subQuestion.trim()) { toast.error('Sub-question is required'); return; }
    setAddingSubQ(true);
    try {
      let options = [], correctAnswer = null, optionsMeta = {};
      if (subType === 'mcq') {
        options = subOptions.filter(o => o.trim());
        correctAnswer = subCorrect;
      } else if (['fill_blank', 'one_word'].includes(subType)) {
        optionsMeta = { accepted_answers: subAccepted.filter(a => a.trim()) };
      }

      const pollData = await pollAPI.createPoll({
        session_id: sessionId,
        question: subQuestion,
        question_type: subType,
        options,
        correct_answer: correctAnswer,
        options_metadata: Object.keys(optionsMeta).length ? optionsMeta : null,
        marks: subMarks,
        cluster_id: cluster.id,
      });

      // Activate sub-question
      const activated = await pollAPI.activatePoll(pollData.id);
      setActivePoll(activated);
      setLiveResponseCount(0);
      onPollsChange();

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'activate-poll',
          sessionId,
          poll: activated,
          cluster: {
            id: cluster.id,
            passage: cluster.passage,
            passage_image_url: cluster.passage_image_url,
            passage_latex: cluster.passage_latex,
          },
        }));
      }

      toast.success('Sub-question activated!');
      // Reset sub-question form
      setSubQuestion('');
      setSubOptions(['', '', '', '']);
      setSubCorrect(0);
      setSubAccepted(['']);
    } catch (err) {
      toast.error('Failed to add sub-question: ' + err.message);
    } finally {
      setAddingSubQ(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500';

  return (
    <div className="bg-amber-50 dark:bg-amber-900/10 border-2 border-amber-300 dark:border-amber-700 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-amber-800 dark:text-amber-300">
          📖 Passage / Case-Study Cluster
        </h3>
        <button type="button" onClick={onClose}
          className="text-slate-400 hover:text-slate-600 text-sm">✕ Close</button>
      </div>

      {step === 'passage' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Cluster title (optional)
            </label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Case Study: Cell Division"
              className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Passage / Reading text *
            </label>
            <textarea value={passage} onChange={e => setPassage(e.target.value)}
              rows={6} placeholder="Paste the passage, case study, or data table here..."
              className={`${inputCls} resize-y font-normal`}
            />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setShowLatex(!showLatex)}
              className={`px-3 py-1.5 rounded-lg border text-xs transition-colors
                ${showLatex ? 'bg-purple-100 text-purple-700 border-purple-300' : 'border-slate-200 text-slate-500'}`}>
              ∑ LaTeX equation
            </button>
            <button type="button" onClick={() => setShowImage(!showImage)}
              className={`px-3 py-1.5 rounded-lg border text-xs transition-colors
                ${showImage ? 'bg-blue-100 text-blue-700 border-blue-300' : 'border-slate-200 text-slate-500'}`}>
              🖼 Image URL
            </button>
          </div>
          {showLatex && (
            <div className="space-y-1">
              <input type="text" value={passageLatex} onChange={e => setPassageLatex(e.target.value)}
                placeholder="LaTeX equation for passage"
                className={`${inputCls} font-mono`} />
              {passageLatex && (
                <div className="p-2 text-center bg-white dark:bg-slate-900 border border-slate-200 rounded-lg">
                  <LatexRenderer text={`$$${passageLatex}$$`} />
                </div>
              )}
            </div>
          )}
          {showImage && (
            <input type="url" value={passageImageUrl} onChange={e => setPassageImageUrl(e.target.value)}
              placeholder="https://... (diagram or figure for this passage)"
              className={inputCls} />
          )}
          <button
            type="button"
            onClick={handleCreateCluster}
            disabled={saving}
            className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-semibold rounded-lg transition-colors"
          >
            {saving ? 'Creating…' : 'Create Cluster — Add Sub-Questions →'}
          </button>
        </div>
      )}

      {step === 'subquestions' && cluster && (
        <div className="space-y-4">
          {/* Passage preview */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2">
            {cluster.title && (
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{cluster.title}</p>
            )}
            {cluster.passage_image_url && (
              <img src={cluster.passage_image_url} alt="Passage" className="max-h-40 rounded" />
            )}
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
              {cluster.passage}
            </p>
            {cluster.passage_latex && (
              <div className="text-center">
                <LatexRenderer text={`$$${cluster.passage_latex}$$`} />
              </div>
            )}
          </div>

          <p className="text-xs text-slate-500">
            Cluster #{cluster.id} created. Add sub-questions below — each activates immediately for students.
          </p>

          {/* Sub-question form */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Add Sub-Question</h4>
            <div className="flex gap-2">
              {[
                { id: 'mcq', label: 'MCQ' },
                { id: 'fill_blank', label: 'Fill Blank' },
                { id: 'one_word', label: 'One Word' },
                { id: 'short_answer', label: 'Short Ans' },
              ].map(t => (
                <button key={t.id} type="button" onClick={() => setSubType(t.id)}
                  className={`px-3 py-1 text-xs rounded-lg border-2 font-medium transition-all
                    ${subType === t.id
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-slate-200 text-slate-500 hover:border-slate-400'}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Question *</label>
              <textarea value={subQuestion} onChange={e => setSubQuestion(e.target.value)}
                rows={2} placeholder="Sub-question text..."
                className={`${inputCls} resize-none`} />
            </div>
            {subType === 'mcq' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                  Options * <span className="font-normal">(radio = correct)</span>
                </label>
                {subOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2 mb-1.5">
                    <input type="radio" name="subCorrect" checked={subCorrect === i}
                      onChange={() => setSubCorrect(i)} className="w-4 h-4 text-primary-600" />
                    <input type="text" value={opt}
                      onChange={e => { const o = [...subOptions]; o[i] = e.target.value; setSubOptions(o); }}
                      placeholder={`Option ${String.fromCharCode(65 + i)}`}
                      className="flex-1 px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 dark:text-white focus:outline-none" />
                  </div>
                ))}
              </div>
            )}
            {['fill_blank', 'one_word'].includes(subType) && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Accepted Answers</label>
                {subAccepted.map((ans, i) => (
                  <div key={i} className="flex gap-2 mb-1">
                    <input type="text" value={ans}
                      onChange={e => { const a = [...subAccepted]; a[i] = e.target.value; setSubAccepted(a); }}
                      placeholder={`Answer ${i + 1}`}
                      className="flex-1 px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 dark:text-white focus:outline-none" />
                    {subAccepted.length > 1 && (
                      <button type="button" onClick={() => setSubAccepted(subAccepted.filter((_, j) => j !== i))}
                        className="text-red-400 hover:text-red-600 px-1 text-sm">✕</button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => setSubAccepted([...subAccepted, ''])}
                  className="text-xs text-primary-600 hover:underline">+ Add alternate</button>
              </div>
            )}
            {subType === 'short_answer' && (
              <p className="text-xs text-amber-600 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded">
                ✎ Short answer — teacher grades manually after the poll ends.
              </p>
            )}
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-600 dark:text-slate-400">Marks:</label>
              <input type="number" min="1" max="20" value={subMarks}
                onChange={e => setSubMarks(parseInt(e.target.value) || 1)}
                className="w-16 px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded
                  bg-white dark:bg-slate-700 dark:text-white focus:outline-none" />
            </div>
            <button type="button" onClick={handleAddSubQuestion} disabled={addingSubQ}
              className="w-full py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors">
              {addingSubQ ? 'Activating…' : '➕ Activate Sub-Question'}
            </button>
          </div>

          <button type="button" onClick={onClose}
            className="w-full py-2 border-2 border-slate-300 text-slate-600 text-sm font-medium rounded-lg hover:border-slate-400 transition-colors">
            Done with this cluster
          </button>
        </div>
      )}
    </div>
  );
}
