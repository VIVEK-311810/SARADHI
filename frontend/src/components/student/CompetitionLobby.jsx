import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { apiRequest, safeParseUser, studentAPI } from '../../utils/api';
import { isDemoMode } from '../../utils/demoData';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { StatCardsSkeleton, SessionListSkeleton } from '../shared/SkeletonLoader';

// ── Room status badge ─────────────────────────────────────────────────────────
function RoomStatusBadge({ status }) {
  if (status === 'active') return <Badge variant="live" dot>Live</Badge>;
  if (status === 'waiting') return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
      Waiting
    </span>
  );
  return <Badge variant="ended" dot>Ended</Badge>;
}

// ── Role selection modal ──────────────────────────────────────────────────────
function RoleSelectionModal({ room, onClose, onJoin, joining }) {
  const [selectedRole, setSelectedRole] = useState(room.status === 'active' ? 'spectator' : null);
  const isActive = room.status === 'active';

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const joinLabel = selectedRole === 'spectator' ? 'Join as Spectator' : selectedRole === 'player' ? 'Join as Player' : 'Choose a role first';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass max-w-md w-full p-6">
        {/* Room summary */}
        <div className="mb-4">
          <h2 className="text-lg font-bold font-display text-slate-900 dark:text-white">{room.session_title}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Created by {room.creator_name}</p>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <RoomStatusBadge status={room.status} />
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {room.total_questions} questions · {room.time_per_question}s each
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {room.player_count || 0} players
            </span>
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 my-4" />

        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">How do you want to join?</p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Play card */}
          <button
            onClick={() => !isActive && setSelectedRole('player')}
            disabled={isActive}
            className={`border-2 rounded-xl p-4 text-center transition-all duration-150 ${
              isActive
                ? 'opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-600'
                : selectedRole === 'player'
                ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/30'
                : 'border-slate-200 dark:border-slate-600 hover:border-accent-400 hover:bg-accent-50 dark:hover:bg-accent-900/20'
            }`}
          >
            <svg className="w-8 h-8 mx-auto mb-2 text-accent-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="font-bold text-slate-900 dark:text-white text-sm">⚔ Play</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Compete for points</p>
            {isActive && <p className="text-xs text-accent-500 mt-1">Match in progress — join as spectator</p>}
          </button>

          {/* Watch card */}
          <button
            onClick={() => setSelectedRole('spectator')}
            className={`border-2 rounded-xl p-4 text-center transition-all duration-150 ${
              selectedRole === 'spectator'
                ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30'
                : 'border-slate-200 dark:border-slate-600 hover:border-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20'
            }`}
          >
            <svg className="w-8 h-8 mx-auto mb-2 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <p className="font-bold text-slate-900 dark:text-white text-sm">👁 Watch</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Spectate live</p>
          </button>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={() => selectedRole && onJoin(room.room_code, selectedRole)}
            disabled={!selectedRole || joining}
            className={`flex-1 ${selectedRole === 'spectator' ? 'bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white' : 'bg-primary-700 hover:bg-primary-600 active:bg-primary-800 text-white'}`}
            title={!selectedRole ? 'Choose a role first' : ''}
          >
            {joining ? 'Joining…' : joinLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Question bank panel ───────────────────────────────────────────────────────
// File type icon helper
function FileTypeIcon({ fileName }) {
  const ext = (fileName || '').split('.').pop().toLowerCase();
  if (ext === 'pdf') return (
    <div className="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
      <span className="text-red-600 dark:text-red-400 text-xs font-bold">PDF</span>
    </div>
  );
  if (ext === 'docx' || ext === 'doc') return (
    <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
      <span className="text-blue-600 dark:text-blue-400 text-xs font-bold">DOC</span>
    </div>
  );
  if (ext === 'pptx' || ext === 'ppt') return (
    <div className="w-9 h-9 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
      <span className="text-orange-600 dark:text-orange-400 text-xs font-bold">PPT</span>
    </div>
  );
  return (
    <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
      <span className="text-slate-500 dark:text-slate-400 text-xs font-bold">FILE</span>
    </div>
  );
}

// teacherPolls + selectedTeacherPollIds are controlled by parent (for stepper ↔ checkbox sync)
function QuestionBankPanel({ sessionId, currentUserId, onQuestionsChange,
  teacherPolls = [], selectedTeacherPollIds = [], onTeacherPollToggle }) {
  const [open, setOpen] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [selectedQIds, setSelectedQIds] = useState([]); // which AI questions to include
  const [generating, setGenerating] = useState(false);
  const [genCount, setGenCount] = useState(5);
  const [genError, setGenError] = useState('');

  // File selection state
  const [sessionFiles, setSessionFiles] = useState([]);
  const [selectedFileIds, setSelectedFileIds] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);

  // Helper to sync fetched data into state
  const applyFetchedQuestions = useCallback((data) => {
    const polls = data.teacherPolls || [];
    const pollIds = polls.map(p => p.id);
    const allAiIds = (data.studentQuestions || []).map(q => q.id);
    setQuestions(data.studentQuestions || []);
    setSelectedQIds(allAiIds);
    // 5th arg passes poll objects so parent can manage stepper
    onQuestionsChange(polls.length, allAiIds.length, allAiIds, pollIds, polls);
    setLoaded(true);
  }, []); // eslint-disable-line

  // Fetch summary counts on mount so the header shows correct numbers
  useEffect(() => {
    apiRequest(`/competition/sessions/${sessionId}/questions`)
      .then(res => { if (res.success) applyFetchedQuestions(res.data); })
      .catch(() => {});
  }, [sessionId]); // eslint-disable-line

  // Fetch session files for selection
  useEffect(() => {
    setFilesLoading(true);
    apiRequest(`/resources/session/${sessionId}`)
      .then(res => {
        const files = Array.isArray(res) ? res : (res?.data || res?.resources || []);
        setSessionFiles(files);
        // Pre-select all files by default
        setSelectedFileIds(files.map(f => f.id));
      })
      .catch(() => {})
      .finally(() => setFilesLoading(false));
  }, [sessionId]); // eslint-disable-line

  const toggleFile = (fileId) => {
    setSelectedFileIds(prev =>
      prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId]
    );
  };

  const toggleAllFiles = () => {
    setSelectedFileIds(prev =>
      prev.length === sessionFiles.length ? [] : sessionFiles.map(f => f.id)
    );
  };

  const toggleQuestion = (qId) => {
    setSelectedQIds(prev => {
      const next = prev.includes(qId) ? prev.filter(id => id !== qId) : [...prev, qId];
      onQuestionsChange(selectedTeacherPollIds.length, next.length, next, selectedTeacherPollIds, teacherPolls);
      return next;
    });
  };

  const loadQuestions = async () => {
    if (loaded) { setOpen(o => !o); return; }
    setOpen(true);
    setLoading(true);
    try {
      const res = await apiRequest(`/competition/sessions/${sessionId}/questions`);
      if (res.success) applyFetchedQuestions(res.data);
    } catch (err) {
      console.error('Failed to load questions', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (qId) => {
    try {
      await apiRequest(`/competition/sessions/${sessionId}/questions/${qId}`, { method: 'DELETE' });
      const updated = questions.filter(q => q.id !== qId);
      const updatedSelectedIds = selectedQIds.filter(id => id !== qId);
      setQuestions(updated);
      setSelectedQIds(updatedSelectedIds);
      onQuestionsChange(selectedTeacherPollIds.length, updatedSelectedIds.length, updatedSelectedIds, selectedTeacherPollIds, teacherPolls);
    } catch (err) {
      console.error('Delete failed', err);
    }
  };

  const handleGenerate = async () => {
    if (isDemoMode()) return;
    if (sessionFiles.length > 0 && selectedFileIds.length === 0) {
      setGenError('Please select at least one file to generate questions from.');
      return;
    }
    setGenerating(true);
    setGenError('');
    try {
      const body = { count: genCount };
      if (selectedFileIds.length > 0 && selectedFileIds.length < sessionFiles.length) {
        body.fileIds = selectedFileIds;
      }
      const res = await apiRequest(`/competition/sessions/${sessionId}/generate-questions`, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      if (res.success) {
        toast.success('Questions generated from your session materials!');
        // Re-fetch to get updated list
        const fresh = await apiRequest(`/competition/sessions/${sessionId}/questions`);
        if (fresh.success) applyFetchedQuestions(fresh.data);
      } else {
        setGenError(res.error || 'Generation failed.');
      }
    } catch (err) {
      setGenError('Generation failed. Try again or contact your teacher to add more polls.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="mt-3 border border-slate-200 dark:border-slate-600 rounded-xl overflow-hidden">
      {/* Panel header */}
      <button
        onClick={loadQuestions}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Question Bank</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {selectedTeacherPollIds.length}/{teacherPolls.length} teacher · {selectedQIds.length}/{questions.length} AI
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="p-4 bg-white dark:bg-slate-800 space-y-4">
          {loading ? (
            <SessionListSkeleton rows={2} />
          ) : (
            <>
              {/* ── Teacher polls ─────────────────────────────────────────── */}
              {teacherPolls.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Teacher questions
                    </span>
                    {teacherPolls.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const allIds = teacherPolls.map(p => p.id);
                          const next = selectedTeacherPollIds.length === teacherPolls.length ? [] : allIds;
                          onTeacherPollToggle('set-all', next);
                        }}
                        className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
                      >
                        {selectedTeacherPollIds.length === teacherPolls.length ? 'Deselect all' : 'Select all'}
                      </button>
                    )}
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {teacherPolls.map(p => {
                      const isSelected = selectedTeacherPollIds.includes(p.id);
                      return (
                        <div
                          key={p.id}
                          className={`flex items-start gap-2.5 p-3 rounded-xl border-2 transition-all duration-150 ${
                            isSelected
                              ? 'border-teal-300 dark:border-teal-700 bg-teal-50/50 dark:bg-teal-900/10'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 opacity-50'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onTeacherPollToggle('toggle', p.id)}
                            className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                              isSelected
                                ? 'bg-teal-500 border-teal-500'
                                : 'bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-500 hover:border-teal-400'
                            }`}
                            title={isSelected ? 'Exclude from competition' : 'Include in competition'}
                          >
                            {isSelected && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                          <p className={`text-sm flex-1 leading-snug ${isSelected ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}`}>
                            {p.question}
                          </p>
                          <span className="flex-shrink-0 text-[10px] font-semibold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 px-1.5 py-0.5 rounded-full mt-0.5 whitespace-nowrap">
                            Teacher
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── AI questions ──────────────────────────────────────────── */}
              <div>
                {questions.length > 0 && (
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      AI-generated questions
                    </span>
                    {questions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const allIds = questions.map(q => q.id);
                          const next = selectedQIds.length === questions.length ? [] : allIds;
                          setSelectedQIds(next);
                          onQuestionsChange(selectedTeacherPollIds.length, next.length, next, selectedTeacherPollIds);
                        }}
                        className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
                      >
                        {selectedQIds.length === questions.length ? 'Deselect all' : 'Select all'}
                      </button>
                    )}
                  </div>
                )}
              {questions.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-2">
                  No AI questions yet. Use the button below to generate some from your session materials.
                </p>
              ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {questions.map(q => {
                const isOwn = String(q.created_by) === String(currentUserId);
                const isSelected = selectedQIds.includes(q.id);
                return (
                  <div
                    key={q.id}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border-2 transition-all duration-150 ${
                      isSelected
                        ? 'border-primary-300 dark:border-primary-700 bg-primary-50/50 dark:bg-primary-900/10'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 opacity-50'
                    }`}
                  >
                    {/* Checkbox toggle */}
                    <button
                      type="button"
                      onClick={() => toggleQuestion(q.id)}
                      className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-primary-500 border-primary-500'
                          : 'bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-500 hover:border-primary-400'
                      }`}
                      title={isSelected ? 'Exclude from competition' : 'Include in competition'}
                    >
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <p className={`text-sm flex-1 leading-snug ${isSelected ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}`}>
                      {q.question}
                    </p>
                    <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                      {isOwn && (
                        <>
                          <span className="text-[10px] font-semibold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-1.5 py-0.5 rounded-full whitespace-nowrap">You</span>
                          <button
                            onClick={() => handleDelete(q.id)}
                            className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title="Permanently delete this question"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            )}
            </div>
            </>
          )}

          {/* File selection for AI generation */}
          {!isDemoMode() && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  Sources for generation
                </span>
                {sessionFiles.length > 1 && (
                  <button
                    type="button"
                    onClick={toggleAllFiles}
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
                  >
                    {selectedFileIds.length === sessionFiles.length ? 'Deselect all' : 'Select all'}
                  </button>
                )}
              </div>
              {filesLoading ? (
                <p className="text-xs text-slate-400 py-2 text-center">Loading files…</p>
              ) : sessionFiles.length === 0 ? (
                <p className="text-xs text-slate-400 py-2 text-center">No files uploaded for this session.</p>
              ) : (
                <div className="space-y-2">
                  {sessionFiles.map(file => {
                    const isChecked = selectedFileIds.includes(file.id);
                    return (
                      <label key={file.id} className={`flex items-center gap-3 p-2.5 rounded-xl border-2 cursor-pointer transition-all duration-150 select-none ${
                        isChecked
                          ? 'border-primary-400 dark:border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                          : 'border-slate-200 dark:border-slate-600 bg-slate-50/60 dark:bg-slate-800/40 opacity-55 hover:opacity-90 hover:border-slate-300 dark:hover:border-slate-500'
                      }`}>
                        <input type="checkbox" checked={isChecked} onChange={() => toggleFile(file.id)} className="sr-only" />
                        <FileTypeIcon fileName={file.file_name || file.title || ''} />
                        <span className={`text-sm font-medium truncate flex-1 ${isChecked ? 'text-slate-800 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
                          {file.title || file.file_name || `File ${file.id}`}
                        </span>
                        <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          isChecked
                            ? 'bg-primary-500 border-primary-500'
                            : 'bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-500'
                        }`}>
                          {isChecked && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Generate with AI */}
          {isDemoMode() ? (
            <p className="text-xs text-slate-400 italic">AI generation requires a real account.</p>
          ) : (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-slate-600 dark:text-slate-400">Generate</span>
                <div className="flex items-center border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden bg-white dark:bg-slate-700">
                  <button
                    type="button"
                    onClick={() => setGenCount(c => Math.max(1, c - 1))}
                    disabled={generating || genCount <= 1}
                    className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                  >−</button>
                  <span className="px-3 py-1.5 text-sm font-semibold text-slate-900 dark:text-white min-w-[2rem] text-center select-none">{genCount}</span>
                  <button
                    type="button"
                    onClick={() => setGenCount(c => Math.min(10, c + 1))}
                    disabled={generating || genCount >= 10}
                    className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                  >+</button>
                </div>
                <span className="text-sm text-slate-600 dark:text-slate-400">questions</span>
                <Button
                  size="sm"
                  onClick={handleGenerate}
                  disabled={generating}
                  className={`bg-primary-700 hover:bg-primary-600 active:bg-primary-800 text-white font-medium transition-colors ${generating ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {generating ? (
                    <span className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Generating…
                    </span>
                  ) : '✨ Generate with AI'}
                </Button>
              </div>
              {genError && (
                <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {genError}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
const CompetitionLobby = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionParam = searchParams.get('session');

  const currentUser = safeParseUser();

  const [activeRooms, setActiveRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionTitle, setSessionTitle] = useState('');

  // Role selection modal state
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [joining, setJoining] = useState(false);

  // Per-session form state
  const [expandedSession, setExpandedSession] = useState(sessionParam || null);
  const [timePerQuestion, setTimePerQuestion] = useState({});
  const [teacherQCount, setTeacherQCount] = useState({}); // { sessionId: number } — how many teacher questions to use
  const [creating, setCreating] = useState({});
  const [questionCounts, setQuestionCounts] = useState({}); // { sessionId: { teacherPollCount, aiCount } }
  const [selectedAIQIds, setSelectedAIQIds] = useState({}); // { sessionId: number[] }
  const [selectedTeacherPollIdsMap, setSelectedTeacherPollIdsMap] = useState({}); // { sessionId: number[] }
  const [teacherPollsMap, setTeacherPollsMap] = useState({}); // { sessionId: poll[] }

  const demo = isDemoMode();

  const fetchActiveRooms = useCallback(async () => {
    try {
      const res = await apiRequest('/competition/rooms/active');
      if (res.success) setActiveRooms(res.data);
    } catch (err) {
      console.error('Failed to fetch active rooms', err);
    } finally {
      setRoomsLoading(false);
    }
  }, []);

  const fetchSessions = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const data = await studentAPI.getDashboardSummary(currentUser.id);
      const mapped = (data.sessions ?? []).map(s => ({
        id: s.join_code,
        session_id: s.join_code,
        title: s.title,
        course_name: s.course_name,
        teacher_name: s.teacher_name,
      }));
      setSessions(mapped);
      if (sessionParam) {
        const match = mapped.find(s => s.session_id === sessionParam);
        if (match) setSessionTitle(match.title);
      }
    } catch (err) {
      console.error('Failed to fetch sessions', err);
    } finally {
      setSessionsLoading(false);
    }
  }, [currentUser?.id, sessionParam]);

  useEffect(() => {
    fetchActiveRooms();
    fetchSessions();
    const interval = setInterval(fetchActiveRooms, 10000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line

  const handleJoinRoom = async (roomCode, role) => {
    setJoining(true);
    try {
      await apiRequest(`/competition/rooms/${roomCode}/join`, {
        method: 'POST',
        body: JSON.stringify({ role })
      });
      navigate(`/student/competition/room/${roomCode}`);
    } catch (err) {
      console.error('Join failed', err);
      toast.error('Failed to join room. Please try again.');
    } finally {
      setJoining(false);
    }
  };

  const handleCreateRoom = async (sessionId) => {
    setCreating(prev => ({ ...prev, [sessionId]: true }));
    try {
      const tpq = parseInt(timePerQuestion[sessionId]) || 20;
      const maxTeacher = (questionCounts[sessionId] || {}).teacherPollCount || 0;
      const tqc = teacherQCount[sessionId] !== undefined
        ? parseInt(teacherQCount[sessionId])
        : maxTeacher;
      // Pass selected AI question IDs so backend uses only those
      const sqIds = selectedAIQIds[sessionId] || null;
      const tpollIds = selectedTeacherPollIdsMap[sessionId] || null;
      const res = await apiRequest('/competition/rooms', {
        method: 'POST',
        body: JSON.stringify({ sessionId, timePerQuestion: tpq, teacherQuestionCount: tqc, studentQuestionIds: sqIds, teacherPollIds: tpollIds })
      });
      if (res.success) {
        navigate(`/student/competition/room/${res.data.roomCode}`);
      } else {
        toast.error(res.error || 'Failed to create room.');
      }
    } catch (err) {
      console.error('Create room failed', err);
      toast.error('Failed to create room. Please try again.');
    } finally {
      setCreating(prev => ({ ...prev, [sessionId]: false }));
    }
  };

  const getQCounts = (sessionId) => questionCounts[sessionId] || { teacherPollCount: 0, aiCount: 0 };
  const getEffectiveTeacherCount = (sessionId) => {
    // Once polls are loaded and individually selected, use that count as source of truth
    const selIds = selectedTeacherPollIdsMap[sessionId];
    if (selIds !== undefined) return selIds.length;
    // Before panel loads, fall back to stepper value
    const max = getQCounts(sessionId).teacherPollCount;
    const selected = teacherQCount[sessionId];
    return selected !== undefined ? Math.min(parseInt(selected) || 0, max) : max;
  };
  // aiCount reflects selected count (updated by onQuestionsChange)
  const totalQs = (sessionId) => getEffectiveTeacherCount(sessionId) + getQCounts(sessionId).aiCount;

  if (demo) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 px-4 sm:px-6 pb-8">
        <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-6 text-center">
          <p className="text-slate-700 dark:text-slate-300 mb-4">Competition mode requires a real account.</p>
          <Button onClick={() => navigate('/auth')}>Sign in</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 px-4 sm:px-6 pb-8">

      {/* ── Section 1: Active Competitions ─────────────────────────────────── */}
      <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass">
        <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg sm:text-xl font-bold font-display text-slate-900 dark:text-white">
            Active Competitions
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">Join a room in progress or waiting to start</p>

          {/* Soft cue when ?session= param present */}
          {sessionParam && sessionTitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-2">
              Or scroll down to start a new room for{' '}
              <span className="font-medium text-primary-600 dark:text-primary-400">{sessionTitle}</span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </p>
          )}
        </div>

        {roomsLoading ? (
          <div className="p-4 sm:p-6">
            <StatCardsSkeleton count={3} />
          </div>
        ) : activeRooms.length === 0 ? (
          <div className="p-8 sm:p-12 text-center">
            <div className="animate-float inline-block text-4xl mb-4">⚔️</div>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              No active competitions right now — be the first to start one!
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {activeRooms.map(room => (
              <div
                key={room.room_code}
                className="p-4 sm:p-6 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors duration-200"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-slate-900 dark:text-white">{room.session_title}</span>
                      <RoomStatusBadge status={room.status} />
                      {room.course_name && (
                        <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">{room.course_name}</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      by {room.creator_name} · {room.player_count || 0} players · {room.time_per_question}s/question
                    </p>
                  </div>
                  <Button
                    onClick={() => setSelectedRoom(room)}
                    size="sm"
                    className="bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white font-medium w-full sm:w-auto flex-shrink-0"
                  >
                    View Room →
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 2: Start a Competition ─────────────────────────────────── */}
      <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass">
        <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg sm:text-xl font-bold font-display text-slate-900 dark:text-white">
            Start a Competition
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">Pick a session and create your own room</p>
        </div>

        {sessionsLoading ? (
          <div className="p-4 sm:p-6">
            <SessionListSkeleton rows={3} />
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
            No sessions found. Join a session first.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {sessions.map(session => {
              const isExpanded = expandedSession === session.session_id;
              const tpq = timePerQuestion[session.session_id] || 20;
              const qTotal = totalQs(session.session_id);
              const qCounts = getQCounts(session.session_id);
              const isCreating = creating[session.session_id];

              return (
                <div key={session.session_id} className="p-4 sm:p-6 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 dark:text-white">{session.title}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {session.course_name} · {session.teacher_name}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setExpandedSession(isExpanded ? null : session.session_id)}
                      className="bg-primary-700 hover:bg-primary-600 active:bg-primary-800 text-white font-medium w-full sm:w-auto"
                    >
                      {isExpanded ? 'Close' : '+ Create Room'}
                    </Button>
                  </div>

                  {/* Inline form */}
                  {isExpanded && (
                    <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-700/40 rounded-xl border border-slate-200 dark:border-slate-600/60 space-y-4">

                      {/* Seconds per question — preset chips */}
                      <div>
                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">
                          Seconds per question
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {[10, 15, 20, 30, 45, 60].map(t => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setTimePerQuestion(prev => ({ ...prev, [session.session_id]: t }))}
                              className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all duration-150 ${
                                tpq === t
                                  ? 'bg-primary-600 border-primary-600 text-white shadow-sm'
                                  : 'bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-500 text-slate-600 dark:text-slate-300 hover:border-primary-400 hover:text-primary-600 dark:hover:border-primary-400'
                              }`}
                            >
                              {t}s
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Teacher question count — stepper linked to checkboxes below */}
                      {qCounts.teacherPollCount > 0 && (() => {
                        const polls = teacherPollsMap[session.session_id] || [];
                        const selIds = selectedTeacherPollIdsMap[session.session_id];
                        const maxTq = polls.length || qCounts.teacherPollCount;
                        // Display value: use selected count once panel has loaded, else stepper fallback
                        const curTq = selIds !== undefined
                          ? selIds.length
                          : (teacherQCount[session.session_id] !== undefined ? teacherQCount[session.session_id] : maxTq);

                        const handleStepperDown = () => {
                          if (selIds === undefined || polls.length === 0) {
                            // Panel not loaded yet — just update stepper
                            setTeacherQCount(prev => ({ ...prev, [session.session_id]: Math.max(0, curTq - 1) }));
                            return;
                          }
                          // Find the last poll (by array order) that is currently selected and uncheck it
                          const lastSelected = [...polls].reverse().find(p => selIds.includes(p.id));
                          if (!lastSelected) return;
                          const next = selIds.filter(id => id !== lastSelected.id);
                          setSelectedTeacherPollIdsMap(prev => ({ ...prev, [session.session_id]: next }));
                          setQuestionCounts(prev => ({ ...prev, [session.session_id]: { ...getQCounts(session.session_id), teacherPollCount: next.length } }));
                        };

                        const handleStepperUp = () => {
                          if (selIds === undefined || polls.length === 0) {
                            setTeacherQCount(prev => ({ ...prev, [session.session_id]: Math.min(maxTq, curTq + 1) }));
                            return;
                          }
                          // Find the first poll (by array order) that is NOT currently selected and check it
                          const firstUnselected = polls.find(p => !selIds.includes(p.id));
                          if (!firstUnselected) return;
                          const next = [...selIds, firstUnselected.id];
                          setSelectedTeacherPollIdsMap(prev => ({ ...prev, [session.session_id]: next }));
                          setQuestionCounts(prev => ({ ...prev, [session.session_id]: { ...getQCounts(session.session_id), teacherPollCount: next.length } }));
                        };

                        return (
                          <div>
                            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">
                              Questions from teacher's bank
                            </p>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={handleStepperDown}
                                disabled={curTq <= 0}
                                className="w-8 h-8 rounded-lg border-2 border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-lg flex items-center justify-center hover:border-primary-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >−</button>
                              <div className="text-center min-w-[3rem]">
                                <span className="text-xl font-black text-primary-700 dark:text-primary-300">{curTq}</span>
                                <p className="text-xs text-slate-400 leading-none">of {maxTq}</p>
                              </div>
                              <button
                                type="button"
                                onClick={handleStepperUp}
                                disabled={curTq >= maxTq}
                                className="w-8 h-8 rounded-lg border-2 border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-lg flex items-center justify-center hover:border-primary-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >+</button>
                              <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">teacher questions</span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Question bank panel — teacher polls are controlled by parent for stepper sync */}
                      <QuestionBankPanel
                        sessionId={session.session_id}
                        currentUserId={currentUser?.id}
                        teacherPolls={teacherPollsMap[session.session_id] || []}
                        selectedTeacherPollIds={selectedTeacherPollIdsMap[session.session_id] || []}
                        onTeacherPollToggle={(action, payload) => {
                          const sid = session.session_id;
                          const polls = teacherPollsMap[sid] || [];
                          let next;
                          if (action === 'set-all') {
                            next = payload; // array of all or empty
                          } else {
                            // toggle single
                            const prev = selectedTeacherPollIdsMap[sid] || [];
                            next = prev.includes(payload)
                              ? prev.filter(id => id !== payload)
                              : [...prev, payload];
                          }
                          setSelectedTeacherPollIdsMap(prev => ({ ...prev, [sid]: next }));
                          setQuestionCounts(prev => ({ ...prev, [sid]: { ...(prev[sid] || {}), teacherPollCount: next.length } }));
                        }}
                        onQuestionsChange={(teacherCount, aiCount, qIds, tpIds, tpolls) => {
                          const sid = session.session_id;
                          setQuestionCounts(prev => ({
                            ...prev,
                            [sid]: { teacherPollCount: teacherCount, aiCount }
                          }));
                          if (qIds !== undefined) {
                            setSelectedAIQIds(prev => ({ ...prev, [sid]: qIds }));
                          }
                          if (tpIds !== undefined) {
                            setSelectedTeacherPollIdsMap(prev => ({ ...prev, [sid]: tpIds }));
                          }
                          if (tpolls !== undefined) {
                            setTeacherPollsMap(prev => ({ ...prev, [sid]: tpolls }));
                          }
                        }}
                      />

                      {/* Total count indicator */}
                      <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-2">
                        {qTotal} questions in this competition
                        <span className="ml-1 text-slate-400 dark:text-slate-500">
                          ({getEffectiveTeacherCount(session.session_id)} from teacher · {qCounts.aiCount} AI-generated)
                        </span>
                      </p>
                      {qTotal === 0 && (
                        <p className="text-xs text-red-500 text-center">
                          No questions available. Generate some with AI first.
                        </p>
                      )}

                      <Button
                        onClick={() => handleCreateRoom(session.session_id)}
                        disabled={isCreating || qTotal === 0}
                        className="w-full bg-primary-700 hover:bg-primary-600 active:bg-primary-800 text-white font-medium py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isCreating ? 'Creating…' : '▶ Start Competition'}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Role selection modal */}
      {selectedRoom && (
        <RoleSelectionModal
          room={selectedRoom}
          onClose={() => setSelectedRoom(null)}
          onJoin={handleJoinRoom}
          joining={joining}
        />
      )}
    </div>
  );
};

export default CompetitionLobby;
