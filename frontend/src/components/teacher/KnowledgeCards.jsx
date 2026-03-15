import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../utils/api';

const DIFFICULTY_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const DIFFICULTY_COLOR = {
  1: 'bg-green-100 text-green-700 border-green-200',
  2: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  3: 'bg-red-100 text-red-700 border-red-200'
};
const STATUS_COLOR = {
  pending:   'bg-slate-100 text-slate-600',
  active:    'bg-primary-100 text-primary-700',
  revealed:  'bg-green-100 text-green-700',
  completed: 'bg-teal-100 text-teal-700',
  skipped:   'bg-slate-100 text-slate-400'
};

const KnowledgeCards = ({ sessionId, onlineCount = 0 }) => {
  const [rounds, setRounds] = useState([]);
  const [activeRound, setActiveRound] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(10);
  const [editingPair, setEditingPair] = useState(null); // { pairId, question_text, answer_text, difficulty }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activatingPairId, setActivatingPairId] = useState(null);

  const fetchRounds = useCallback(async () => {
    try {
      const data = await apiRequest(`/knowledge-cards/session/${sessionId}`);
      if (data.success) {
        setRounds(data.data);
        // Find the most recent non-completed round
        const current = data.data.find(r => r.status !== 'completed');
        setActiveRound(current || null);
      }
    } catch (err) {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchRounds();
  }, [fetchRounds]);

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      setError('');
      const data = await apiRequest('/knowledge-cards/generate', {
        method: 'POST',
        body: JSON.stringify({ sessionId, count, topic })
      });
      if (data.success) {
        await fetchRounds();
        setTopic('');
      } else {
        setError(data.error || 'Generation failed');
      }
    } catch (err) {
      setError(err.message || 'Failed to generate cards. Make sure session resources are uploaded.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDeletePair = async (pairId) => {
    try {
      await apiRequest(`/knowledge-cards/pairs/${pairId}`, { method: 'DELETE' });
      await fetchRounds();
    } catch (err) {
      setError('Failed to delete pair');
    }
  };

  const handleSaveEdit = async () => {
    if (!editingPair) return;
    try {
      await apiRequest(`/knowledge-cards/pairs/${editingPair.pairId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          question_text: editingPair.question_text,
          answer_text: editingPair.answer_text,
          difficulty: editingPair.difficulty
        })
      });
      setEditingPair(null);
      await fetchRounds();
    } catch (err) {
      setError('Failed to save changes');
    }
  };

  const handleDistribute = async (roundId) => {
    try {
      setDistributing(true);
      setError('');
      const data = await apiRequest(`/knowledge-cards/rounds/${roundId}/distribute`, { method: 'POST' });
      if (data.success) {
        await fetchRounds();
      } else {
        setError(data.error || 'Distribution failed');
      }
    } catch (err) {
      setError(err.message || 'Failed to distribute cards');
    } finally {
      setDistributing(false);
    }
  };

  const handleActivate = async (pairId) => {
    try {
      setActivatingPairId(pairId);
      await apiRequest(`/knowledge-cards/pairs/${pairId}/activate`, { method: 'PATCH' });
      await fetchRounds();
    } catch (err) {
      setError('Failed to activate question');
    } finally {
      setActivatingPairId(null);
    }
  };

  const handleReveal = async (pairId) => {
    try {
      await apiRequest(`/knowledge-cards/pairs/${pairId}/reveal`, { method: 'PATCH' });
      await fetchRounds();
    } catch (err) {
      setError('Failed to reveal answer');
    }
  };

  const handleComplete = async (pairId) => {
    try {
      await apiRequest(`/knowledge-cards/pairs/${pairId}/complete`, { method: 'PATCH' });
      await fetchRounds();
    } catch (err) {
      setError('Failed to complete round');
    }
  };

  const handleEndActivity = async (roundId) => {
    try {
      await apiRequest(`/knowledge-cards/rounds/${roundId}/end`, { method: 'POST' });
      await fetchRounds();
    } catch (err) {
      setError('Failed to end activity');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full mr-3" />
        Loading knowledge cards...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3 text-red-700 dark:text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-3">&times;</button>
        </div>
      )}

      {/* Generate Section */}
      <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">&#129302;</span>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Generate Knowledge Cards</h3>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          AI will generate Q&A pairs from your uploaded session resources. Each student gets one question and one answer to hold.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="Focus topic (optional — e.g. 'binary trees')"
            className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <select
            value={count}
            onChange={e => setCount(parseInt(e.target.value))}
            className="px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {[5, 8, 10, 12, 15, 20].map(n => (
              <option key={n} value={n}>{n} pairs</option>
            ))}
          </select>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            {generating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>&#10024; Generate</>
            )}
          </button>
        </div>
      </div>

      {/* Active Round */}
      {activeRound && (
        <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                &#127183; Current Round
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[activeRound.status]}`}>
                  {activeRound.status}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {activeRound.pairs?.length || 0} pairs · {onlineCount} students online
              </p>
            </div>
            <div className="flex gap-2">
              {activeRound.status === 'draft' && (
                <button
                  onClick={() => handleDistribute(activeRound.id)}
                  disabled={distributing || onlineCount < 2 || (activeRound.pairs?.length || 0) < 2}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
                  title={onlineCount < 2 ? 'Need at least 2 online students' : ''}
                >
                  {distributing ? 'Distributing...' : `&#128228; Distribute to ${onlineCount} students`}
                </button>
              )}
              {['distributed', 'active'].includes(activeRound.status) && (
                <button
                  onClick={() => handleEndActivity(activeRound.id)}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  End Activity
                </button>
              )}
            </div>
          </div>

          {/* Pairs List */}
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {(activeRound.pairs || []).map((pair, idx) => (
              <div key={pair.id} className={`p-4 transition-colors
                ${pair.status === 'active' ? 'bg-primary-50 dark:bg-primary-900/10' : ''}
                ${pair.status === 'revealed' ? 'bg-green-50 dark:bg-green-900/10' : ''}
                ${pair.status === 'completed' ? 'bg-slate-50 dark:bg-slate-700/30 opacity-70' : ''}
              `}>
                {editingPair?.pairId === pair.id ? (
                  /* Edit form */
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Question</label>
                      <textarea
                        value={editingPair.question_text}
                        onChange={e => setEditingPair(prev => ({ ...prev, question_text: e.target.value }))}
                        rows={2}
                        className="w-full mt-1 px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Answer</label>
                      <textarea
                        value={editingPair.answer_text}
                        onChange={e => setEditingPair(prev => ({ ...prev, answer_text: e.target.value }))}
                        rows={2}
                        className="w-full mt-1 px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <select
                        value={editingPair.difficulty}
                        onChange={e => setEditingPair(prev => ({ ...prev, difficulty: parseInt(e.target.value) }))}
                        className="px-2 py-1 border border-slate-200 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                      >
                        <option value={1}>Easy</option>
                        <option value={2}>Medium</option>
                        <option value={3}>Hard</option>
                      </select>
                      <button onClick={handleSaveEdit} className="px-3 py-1 bg-primary-600 hover:bg-primary-700 text-white rounded text-xs font-medium">Save</button>
                      <button onClick={() => setEditingPair(null)} className="px-3 py-1 text-slate-500 hover:text-slate-700 text-xs">Cancel</button>
                    </div>
                  </div>
                ) : (
                  /* Pair display */
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${DIFFICULTY_COLOR[pair.difficulty] || DIFFICULTY_COLOR[1]}`}>
                          {DIFFICULTY_LABEL[pair.difficulty] || 'Easy'}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLOR[pair.status]}`}>
                          {pair.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {activeRound.status === 'draft' && (
                          <>
                            <button
                              onClick={() => setEditingPair({ pairId: pair.id, question_text: pair.question_text, answer_text: pair.answer_text, difficulty: pair.difficulty })}
                              className="p-1 text-slate-400 hover:text-primary-600 transition-colors text-sm"
                              title="Edit"
                            >&#9998;</button>
                            <button
                              onClick={() => handleDeletePair(pair.id)}
                              className="p-1 text-slate-400 hover:text-red-600 transition-colors text-sm"
                              title="Delete"
                            >&#128465;</button>
                          </>
                        )}
                        {['distributed', 'active'].includes(activeRound.status) && pair.status === 'pending' && (
                          <button
                            onClick={() => handleActivate(pair.id)}
                            disabled={activatingPairId === pair.id}
                            className="px-2 py-1 bg-primary-600 hover:bg-primary-700 disabled:bg-blue-400 text-white rounded text-xs font-medium"
                          >
                            {activatingPairId === pair.id ? '...' : 'Start'}
                          </button>
                        )}
                        {pair.status === 'active' && (
                          <button
                            onClick={() => handleReveal(pair.id)}
                            className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium"
                          >
                            Reveal Answer
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-2.5">
                        <div className="flex items-center gap-1 mb-1">
                          <span className="text-xs font-semibold text-primary-600 dark:text-primary-400">Q</span>
                          {pair.question_holder_id && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              → {pair.question_holder_name || pair.question_holder_id.substring(0, 8) + '...'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed line-clamp-2">{pair.question_text}</p>
                      </div>
                      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-2.5">
                        <div className="flex items-center gap-1 mb-1">
                          <span className="text-xs font-semibold text-green-600 dark:text-green-400">A</span>
                          {pair.answer_holder_id && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              → {pair.answer_holder_name || pair.answer_holder_id.substring(0, 8) + '...'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed line-clamp-2">{pair.answer_text}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Past rounds summary */}
      {rounds.filter(r => r.status === 'completed').length > 0 && (
        <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">&#9989; Completed Rounds</h3>
          <div className="space-y-1">
            {rounds.filter(r => r.status === 'completed').map(r => (
              <div key={r.id} className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="w-2 h-2 bg-green-400 rounded-full flex-shrink-0" />
                <span>{r.total_pairs} pairs · {new Date(r.created_at).toLocaleDateString()}</span>
                {r.topic && <span className="text-slate-400">· {r.topic}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {rounds.length === 0 && !generating && (
        <div className="text-center py-8 text-slate-500 dark:text-slate-400">
          <p className="text-3xl mb-2">&#127183;</p>
          <p className="text-sm font-medium mb-1">No knowledge cards yet</p>
          <p className="text-xs">Generate cards above to start an interactive Q&A activity with your class.</p>
        </div>
      )}
    </div>
  );
};

export default KnowledgeCards;
