import React, { useState, useEffect, useRef, useCallback } from 'react';
import DifficultyBadge, { DIFFICULTY_STYLES } from '../shared/renderers/DifficultyBadge';
import { toast } from 'sonner';
import { apiRequest } from '../../utils/api';

// ── Student-read-only project card ────────────────────────────────────────
function ProjectCard({ project }) {
  const [expanded, setExpanded] = useState(false);
  const s = DIFFICULTY_STYLES[project.difficulty] || DIFFICULTY_STYLES.intermediate;

  return (
    <div className={`rounded-xl border ${s.border} bg-white dark:bg-slate-800/60 shadow-sm overflow-hidden`}>
      <div className={`${s.bg} px-4 py-3 flex items-center gap-2`}>
        <DifficultyBadge difficulty={project.difficulty} />
        <h3 className="font-semibold text-slate-900 dark:text-white text-sm truncate">{project.title}</h3>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-sm text-slate-700 dark:text-slate-300">{project.description}</p>
        {project.estimated_duration && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium">Duration:</span> {project.estimated_duration}
          </p>
        )}
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
        >
          {expanded ? 'Hide details ▲' : 'Show details ▼'}
        </button>
        {expanded && (
          <div className="space-y-3 pt-1 border-t border-slate-100 dark:border-slate-700">
            {project.real_world_use_cases?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Real-world use cases</p>
                <ul className="space-y-0.5">
                  {project.real_world_use_cases.map((uc, i) => (
                    <li key={i} className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-1.5">
                      <span className="text-primary-500 mt-0.5">•</span>{uc}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {project.tech_stack_hints?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Tech stack hints</p>
                <div className="flex flex-wrap gap-1.5">
                  {project.tech_stack_hints.map((t, i) => (
                    <span key={i} className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">{t}</span>
                  ))}
                </div>
              </div>
            )}
            {project.learning_outcomes?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Learning outcomes</p>
                <ul className="space-y-0.5">
                  {project.learning_outcomes.map((lo, i) => (
                    <li key={i} className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-1.5">
                      <span className="text-emerald-500 mt-0.5">✓</span>{lo}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Assignment submission card ─────────────────────────────────────────────
function AssignmentCard({ assignment, sessionId, onSubmitted }) {
  const [tab, setTab] = useState('text'); // 'text' | 'file'
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);

  const isSubmitted = !!assignment.submission_status;

  const dueDatePassed = assignment.due_date && new Date(assignment.due_date) < new Date();

  const handleSubmit = async () => {
    if (tab === 'text' && !text.trim()) {
      toast.error('Please enter your response');
      return;
    }
    if (tab === 'file' && !file) {
      toast.error('Please select a file');
      return;
    }

    setSubmitting(true);
    try {
      if (tab === 'file') {
        const formData = new FormData();
        formData.append('file', file);
        const token = localStorage.getItem('authToken');
        const API_BASE = process.env.REACT_APP_API_URL || 'https://vk-edu-b2.onrender.com/api';
        const res = await fetch(
          `${API_BASE}/sessions/${sessionId}/assignments/${assignment.id}/submit`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          }
        );
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Upload failed');
        }
      } else {
        await apiRequest(`/sessions/${sessionId}/assignments/${assignment.id}/submit`, {
          method: 'POST',
          body: JSON.stringify({ text }),
        });
      }
      toast.success('Assignment submitted! +50 XP');
      onSubmitted(assignment.id);
    } catch (err) {
      toast.error(err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const s = DIFFICULTY_STYLES[assignment.difficulty] || DIFFICULTY_STYLES.intermediate;

  return (
    <div className={`rounded-xl border ${s.border} bg-white dark:bg-slate-800/60 shadow-sm overflow-hidden`}>
      {/* Header */}
      <div className={`${s.bg} px-4 py-3`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {assignment.difficulty && <DifficultyBadge difficulty={assignment.difficulty} />}
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{assignment.title}</h3>
          </div>
          {isSubmitted ? (
            <span className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
              ✓ Submitted
            </span>
          ) : dueDatePassed ? (
            <span className="flex-shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
              Past Due
            </span>
          ) : (
            <span className="flex-shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
              Pending
            </span>
          )}
        </div>
        {assignment.due_date && (
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Due: {new Date(assignment.due_date).toLocaleString()}
          </p>
        )}
      </div>

      {/* Description */}
      <div className="px-4 pt-3 pb-2">
        <p className="text-sm text-slate-700 dark:text-slate-300">{assignment.description}</p>
      </div>

      {/* Submission area */}
      {!isSubmitted ? (
        <div className="px-4 pb-4 space-y-3">
          {/* Tab switcher */}
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-700/50 rounded-lg p-1 w-fit">
            {['text', 'file'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
                  tab === t
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {t === 'text' ? '✏️ Text' : '📎 File'}
              </button>
            ))}
          </div>

          {tab === 'text' ? (
            <textarea
              rows={4}
              placeholder="Type your response here…"
              value={text}
              onChange={e => setText(e.target.value)}
              className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
            />
          ) : (
            <div>
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-lg p-4 text-center cursor-pointer hover:border-primary-400 dark:hover:border-primary-500 transition-colors"
              >
                {file ? (
                  <div className="text-sm text-slate-700 dark:text-slate-300">
                    📎 {file.name}
                    <span className="text-xs text-slate-400 ml-2">({(file.size / 1024).toFixed(0)} KB)</span>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Click to select a file</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">PDF, DOC, DOCX — max 50 MB</p>
                  </>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={e => setFile(e.target.files[0] || null)}
              />
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold text-sm px-5 py-2 rounded-lg transition-colors"
          >
            {submitting && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {submitting ? 'Submitting…' : 'Submit Assignment'}
          </button>
        </div>
      ) : (
        <div className="px-4 pb-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 italic">
            Submitted on {new Date(assignment.submitted_at).toLocaleString()}
          </p>
          {/* Allow resubmission */}
          <button
            onClick={() => onSubmitted(null)}
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline mt-1"
          >
            Resubmit
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main student view ─────────────────────────────────────────────────────
export default function ProjectSuggestionsView({ sessionId }) {
  const [projectStatus, setProjectStatus] = useState('none');
  const [suggestions, setSuggestions] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [projData, assignData] = await Promise.all([
        apiRequest(`/sessions/${sessionId}/projects`).catch(() => ({ status: 'none', suggestions: [] })),
        apiRequest(`/sessions/${sessionId}/assignments`).catch(() => ({ assignments: [] })),
      ]);
      setProjectStatus(projData.status || 'none');
      setSuggestions(projData.suggestions || []);
      setAssignments(assignData.assignments || []);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Listen for WS 'project-notification' events dispatched by the session WS handler
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.type === 'project-notification' || e.detail?.type === 'project-suggestions-ready') {
        fetchAll();
      }
    };
    window.addEventListener('saradhi:project-event', handler);
    return () => window.removeEventListener('saradhi:project-event', handler);
  }, [fetchAll]);

  // Poll every 15s — VisitSession has no WebSocket, so new assignments and published
  // project suggestions would otherwise only appear after a manual page refresh.
  useEffect(() => {
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handleSubmitted = (assignmentId) => {
    if (!assignmentId) {
      // Resubmit: refresh to get fresh state
      fetchAll();
      return;
    }
    // Merge optimistic status into assignments list
    setAssignments(prev => prev.map(a =>
      a.id === assignmentId
        ? { ...a, submission_status: 'submitted', submitted_at: new Date().toISOString() }
        : a
    ));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  const hasProjects = projectStatus === 'completed' && suggestions.length > 0;
  const hasAssignments = assignments.length > 0;

  if (!hasProjects && !hasAssignments) {
    return (
      <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 p-8 text-center">
        <div className="text-3xl mb-3">💡</div>
        <p className="font-semibold text-slate-700 dark:text-slate-300">No project suggestions yet</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Your teacher will share project ideas and assignments here after the session.</p>
      </div>
    );
  }

  const grouped = {
    beginner:     suggestions.filter(s => s.difficulty === 'beginner'),
    intermediate: suggestions.filter(s => s.difficulty === 'intermediate'),
    advanced:     suggestions.filter(s => s.difficulty === 'advanced'),
  };

  return (
    <div className="space-y-6">
      {/* Assignments — shown first */}
      {hasAssignments && (
        <div>
          <h3 className="font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            📌 Assignments
            <span className="text-xs font-normal text-slate-400">({assignments.length})</span>
          </h3>
          <div className="space-y-4">
            {assignments.map(a => (
              <AssignmentCard
                key={a.id}
                assignment={a}
                sessionId={sessionId}
                onSubmitted={handleSubmitted}
              />
            ))}
          </div>
        </div>
      )}

      {/* Project suggestions — shown below assignments */}
      {hasProjects && (
        <div>
          <h3 className="font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            💡 Project Ideas
            <span className="text-xs font-normal text-slate-400">({suggestions.length} suggestions from your teacher)</span>
          </h3>
          {['beginner', 'intermediate', 'advanced'].map(diff => {
            const group = grouped[diff];
            if (group.length === 0) return null;
            return (
              <div key={diff} className="mb-4">
                <h4 className={`text-xs font-bold uppercase tracking-widest mb-2 ${DIFFICULTY_STYLES[diff].text}`}>
                  {DIFFICULTY_STYLES[diff].label}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {group.map((p, i) => <ProjectCard key={i} project={p} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
