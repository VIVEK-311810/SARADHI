import React, { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { apiRequest } from '../../utils/api';
import LoadingSpinner from '../shared/feedback/LoadingSpinner';
import DifficultyBadge, { DIFFICULTY_STYLES } from '../shared/renderers/DifficultyBadge';

// ── Elapsed timer helper (mirrors NotesPanel) ─────────────────────────────
function useElapsedTimer(running) {
  const [elapsed, setElapsed] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    if (running) {
      setElapsed(0);
      ref.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } else {
      clearInterval(ref.current);
    }
    return () => clearInterval(ref.current);
  }, [running]);
  const fmt = (s) => s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  return fmt(elapsed);
}

// ── Single project card (view + inline edit) ──────────────────────────────
function ProjectCard({ project, index, onEdit, onCreateAssignment, onRemove, isSelected, onToggleSelect }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const s = DIFFICULTY_STYLES[project.difficulty] || DIFFICULTY_STYLES.intermediate;

  return (
    <div className={`rounded-xl border-2 ${isSelected === false ? 'border-slate-200 dark:border-slate-700 opacity-60' : s.border} bg-white dark:bg-slate-800/60 shadow-sm overflow-hidden transition-opacity`}>
      {/* Header */}
      <div className={`${s.bg} px-4 py-3 flex items-start justify-between gap-2`}>
        <div className="flex items-center gap-2 min-w-0">
          {onToggleSelect && (
            <input
              type="checkbox"
              checked={!!isSelected}
              onChange={() => onToggleSelect(index)}
              className="w-4 h-4 rounded border-slate-400 text-primary-600 focus:ring-primary-400 cursor-pointer flex-shrink-0"
              title={isSelected ? 'Exclude from publish' : 'Include in publish'}
            />
          )}
          <DifficultyBadge difficulty={project.difficulty} />
          <h3 className="font-semibold text-slate-900 dark:text-white text-sm truncate">{project.title}</h3>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => onEdit(index)}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 font-medium px-2 py-1 rounded-md hover:bg-white/60 dark:hover:bg-slate-700/60 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => onCreateAssignment(project, index)}
            className="text-xs bg-primary-600 hover:bg-primary-700 text-white font-medium px-2.5 py-1 rounded-md transition-colors"
          >
            Assign
          </button>
          {onRemove && (
            confirmRemove ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onRemove(index)}
                  className="text-xs bg-red-600 hover:bg-red-700 text-white font-medium px-2 py-1 rounded-md transition-colors"
                >
                  Yes, remove
                </button>
                <button
                  onClick={() => setConfirmRemove(false)}
                  className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-1.5 py-1 rounded-md transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmRemove(true)}
                className="text-xs text-red-400 hover:text-red-600 dark:hover:text-red-400 p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title="Remove this suggestion"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )
          )}
        </div>
      </div>

      {/* Body */}
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

// ── Inline editor for a single project ───────────────────────────────────
function ProjectEditor({ project, index, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: project.title || '',
    description: project.description || '',
    difficulty: project.difficulty || 'intermediate',
    real_world_use_cases: (project.real_world_use_cases || []).join('\n'),
    tech_stack_hints: (project.tech_stack_hints || []).join('\n'),
    learning_outcomes: (project.learning_outcomes || []).join('\n'),
    estimated_duration: project.estimated_duration || '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    const updated = {
      title: form.title.trim(),
      description: form.description.trim(),
      difficulty: form.difficulty,
      real_world_use_cases: form.real_world_use_cases.split('\n').map(s => s.trim()).filter(Boolean),
      tech_stack_hints: form.tech_stack_hints.split('\n').map(s => s.trim()).filter(Boolean),
      learning_outcomes: form.learning_outcomes.split('\n').map(s => s.trim()).filter(Boolean),
      estimated_duration: form.estimated_duration.trim(),
    };
    if (!updated.title) { toast.error('Title is required'); return; }
    onSave(index, updated);
  };

  return (
    <div className="rounded-xl border-2 border-primary-400 dark:border-primary-600 bg-white dark:bg-slate-800 shadow-md p-4 space-y-3">
      <p className="text-xs font-semibold text-primary-700 dark:text-primary-300 uppercase tracking-wide">Editing Project {index + 1}</p>

      <div>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Title</label>
        <input
          className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
          value={form.title} onChange={e => set('title', e.target.value)}
        />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Description</label>
        <textarea
          rows={3}
          className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
          value={form.description} onChange={e => set('description', e.target.value)}
        />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Difficulty</label>
        <select
          className="text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
          value={form.difficulty} onChange={e => set('difficulty', e.target.value)}
        >
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Estimated Duration</label>
        <input
          className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
          value={form.estimated_duration} onChange={e => set('estimated_duration', e.target.value)}
          placeholder="e.g. 2–3 days"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Real-world Use Cases (one per line)</label>
        <textarea
          rows={2}
          className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
          value={form.real_world_use_cases} onChange={e => set('real_world_use_cases', e.target.value)}
        />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Tech Stack Hints (one per line)</label>
        <textarea
          rows={2}
          className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
          value={form.tech_stack_hints} onChange={e => set('tech_stack_hints', e.target.value)}
        />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Learning Outcomes (one per line)</label>
        <textarea
          rows={2}
          className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
          value={form.learning_outcomes} onChange={e => set('learning_outcomes', e.target.value)}
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          className="text-sm bg-primary-600 hover:bg-primary-700 text-white font-medium px-4 py-1.5 rounded-lg transition-colors"
        >
          Save Changes
        </button>
        <button
          onClick={onCancel}
          className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium px-4 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Assignment creator modal (inline) ─────────────────────────────────────
function AssignmentCreator({ project, sessionId, onSuccess, onCancel }) {
  const [form, setForm] = useState({
    title: project ? project.title : '',
    description: project ? project.description : '',
    difficulty: project ? project.difficulty : 'intermediate',
    dueDate: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      toast.error('Title and description are required');
      return;
    }
    setSaving(true);
    try {
      await apiRequest(`/sessions/${sessionId}/assignments`, {
        method: 'POST',
        body: JSON.stringify({
          projectId: null,
          title: form.title.trim(),
          description: form.description.trim(),
          difficulty: form.difficulty,
          dueDate: form.dueDate || null,
        }),
      });
      toast.success('Assignment created and students notified');
      onSuccess();
    } catch (err) {
      toast.error('Failed to create assignment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border-2 border-indigo-400 dark:border-indigo-600 bg-white dark:bg-slate-800 shadow-md p-4 space-y-3 mt-3">
      <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide">Create Assignment</p>

      <div>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Title</label>
        <input
          className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          value={form.title} onChange={e => set('title', e.target.value)}
        />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Description / Instructions</label>
        <textarea
          rows={4}
          className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          value={form.description} onChange={e => set('description', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Difficulty</label>
          <select
            className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.difficulty} onChange={e => set('difficulty', e.target.value)}
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Due Date (optional)</label>
          <input
            type="datetime-local"
            className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.dueDate} onChange={e => set('dueDate', e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium px-4 py-1.5 rounded-lg transition-colors flex items-center gap-2"
        >
          {saving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {saving ? 'Creating…' : 'Create & Notify Students'}
        </button>
        <button
          onClick={onCancel}
          className="text-sm text-slate-600 dark:text-slate-400 font-medium px-4 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Submissions drawer for a single assignment ────────────────────────────
function SubmissionsDrawer({ assignment, sessionId, onClose }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest(`/sessions/${sessionId}/assignments/${assignment.id}/submissions`)
      .then(data => setSubmissions(data.submissions || []))
      .catch(() => toast.error('Failed to load submissions'))
      .finally(() => setLoading(false));
  }, [assignment.id, sessionId]);

  return (
    <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold text-slate-900 dark:text-white text-sm">
          Submissions — {assignment.title}
        </p>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none">✕</button>
      </div>
      {loading ? (
        <LoadingSpinner text="Loading submissions…" />
      ) : submissions.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 italic">No submissions yet.</p>
      ) : (
        <div className="space-y-2">
          {submissions.map(sub => (
            <div key={sub.id} className="flex items-start justify-between gap-3 bg-white dark:bg-slate-700 rounded-lg p-3 border border-slate-100 dark:border-slate-600">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 dark:text-white">{sub.student_name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{sub.student_email}</p>
                {sub.submission_type === 'text' && sub.content && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">{sub.content}</p>
                )}
                {sub.submission_type === 'file' && (
                  <a
                    href={sub.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline mt-1 inline-block"
                  >
                    📎 {sub.file_name}
                  </a>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                  Submitted
                </span>
                <p className="text-xs text-slate-400 mt-1">{new Date(sub.submitted_at).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Assignment row with remove confirm ───────────────────────────────────
function AssignmentRow({ assignment: a, sessionId, onRemove, onViewSubmissions, isViewingSubmissions, onCloseSubmissions }) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="font-semibold text-slate-900 dark:text-white text-sm">{a.title}</p>
            {a.difficulty && <DifficultyBadge difficulty={a.difficulty} />}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{a.description}</p>
          {a.due_date && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Due: {new Date(a.due_date).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex-shrink-0 text-right space-y-1">
          <p className="text-sm font-bold text-primary-600 dark:text-primary-400">{a.submission_count ?? 0}</p>
          <p className="text-xs text-slate-400">submissions</p>
          <button
            onClick={() => onViewSubmissions(a)}
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline block"
          >
            {isViewingSubmissions ? 'Hide' : 'View all'}
          </button>
          {confirmRemove ? (
            <div className="flex items-center gap-1 justify-end mt-1">
              <button
                onClick={() => { onRemove(a.id); setConfirmRemove(false); }}
                className="text-xs bg-red-600 hover:bg-red-700 text-white font-medium px-2 py-0.5 rounded transition-colors"
              >
                Remove
              </button>
              <button
                onClick={() => setConfirmRemove(false)}
                className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 px-1.5 py-0.5 rounded transition-colors"
              >
                Keep
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmRemove(true)}
              className="text-xs text-red-400 hover:text-red-600 dark:hover:text-red-400 hover:underline block mt-1"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {isViewingSubmissions && (
        <SubmissionsDrawer
          assignment={a}
          sessionId={sessionId}
          onClose={onCloseSubmissions}
        />
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────
export default function ProjectSuggestionsPanel({ sessionId }) {
  const [status, setStatus] = useState('none'); // 'none'|'generating'|'completed'|'failed'
  const [suggestions, setSuggestions] = useState([]);
  const [isPublished, setIsPublished] = useState(false);
  const [projectRecordId, setProjectRecordId] = useState(null);
  const [assignments, setAssignments] = useState([]);

  const [editingIndex, setEditingIndex] = useState(null);
  const [creatingAssignmentFor, setCreatingAssignmentFor] = useState(null); // project obj or 'new'
  const [viewSubmissionsFor, setViewSubmissionsFor] = useState(null);

  const [hint, setHint] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Per-project selection for selective publish
  const [selectedForPublish, setSelectedForPublish] = useState(new Set());
  const prevSuggestionsLenRef = useRef(-1);

  const pollingRef = useRef(null);
  const elapsedDisplay = useElapsedTimer(status === 'generating');

  const fetchProjects = useCallback(async () => {
    try {
      const data = await apiRequest(`/sessions/${sessionId}/projects`);
      setStatus(data.status || 'none');
      setSuggestions(data.suggestions || []);
      setIsPublished(data.isPublished || false);
      setProjectRecordId(data.id || null);
      return data.status;
    } catch {
      return 'none';
    }
  }, [sessionId]);

  const fetchAssignments = useCallback(async () => {
    try {
      const data = await apiRequest(`/sessions/${sessionId}/assignments`);
      setAssignments(data.assignments || []);
    } catch {}
  }, [sessionId]);

  useEffect(() => {
    fetchProjects();
    fetchAssignments();
  }, [fetchProjects, fetchAssignments]);

  // Poll every 4s while generating (mirrors notesGeneratorService pattern)
  useEffect(() => {
    if (status === 'generating') {
      pollingRef.current = setInterval(async () => {
        const s = await fetchProjects();
        if (s !== 'generating') clearInterval(pollingRef.current);
      }, 4000);
    }
    return () => clearInterval(pollingRef.current);
  }, [status, fetchProjects]);

  // Listen for WS 'project-suggestions-ready' event dispatched by EnhancedSessionManagement
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.type === 'project-suggestions-ready') {
        fetchProjects();
        toast.success('AI project suggestions are ready!');
      }
    };
    window.addEventListener('saradhi:project-event', handler);
    return () => window.removeEventListener('saradhi:project-event', handler);
  }, [fetchProjects]);

  // Refresh assignment submission counts every 15s so new student submissions appear without manual reload
  useEffect(() => {
    const interval = setInterval(fetchAssignments, 15000);
    return () => clearInterval(interval);
  }, [fetchAssignments]);

  // Auto-select all suggestions when a new generation finishes (count changes)
  useEffect(() => {
    if (status === 'completed' && suggestions.length !== prevSuggestionsLenRef.current) {
      prevSuggestionsLenRef.current = suggestions.length;
      setSelectedForPublish(new Set(suggestions.map((_, i) => i)));
    }
  }, [status, suggestions]);

  const toggleSelectForPublish = (index) => {
    setSelectedForPublish(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectAll = () => setSelectedForPublish(new Set(suggestions.map((_, i) => i)));
  const selectNone = () => setSelectedForPublish(new Set());

  const handleRemoveSuggestion = async (index) => {
    const updated = suggestions.filter((_, i) => i !== index);
    try {
      await apiRequest(`/sessions/${sessionId}/projects/${projectRecordId}`, {
        method: 'PATCH',
        body: JSON.stringify({ suggestions: updated }),
      });
      setSuggestions(updated);
      // Rebuild selection set with new indices
      setSelectedForPublish(prev => {
        const next = new Set();
        prev.forEach(i => { if (i < index) next.add(i); else if (i > index) next.add(i - 1); });
        return next;
      });
      prevSuggestionsLenRef.current = updated.length;
      toast.success('Suggestion removed');
    } catch {
      toast.error('Failed to remove suggestion');
    }
  };

  const handleRemoveAssignment = async (assignmentId) => {
    try {
      await apiRequest(`/sessions/${sessionId}/assignments/${assignmentId}`, { method: 'DELETE' });
      setAssignments(prev => prev.filter(a => a.id !== assignmentId));
      toast.success('Assignment removed');
    } catch {
      toast.error('Failed to remove assignment');
    }
  };

  const handleGenerate = async () => {
    setStatus('generating');
    try {
      const data = await apiRequest(`/sessions/${sessionId}/projects/generate`, {
        method: 'POST',
        body: JSON.stringify({ hint: hint.trim() || undefined }),
      });
      if (data.status === 'completed' && data.suggestions) {
        setSuggestions(data.suggestions);
        setStatus('completed');
      }
    } catch (err) {
      toast.error('Failed to start generation');
      setStatus('failed');
    }
  };

  const handleSaveEdit = async (index, updatedProject) => {
    const updated = suggestions.map((s, i) => i === index ? updatedProject : s);
    try {
      await apiRequest(`/sessions/${sessionId}/projects/${projectRecordId}`, {
        method: 'PATCH',
        body: JSON.stringify({ suggestions: updated }),
      });
      setSuggestions(updated);
      setEditingIndex(null);
      toast.success('Project updated');
    } catch {
      toast.error('Failed to save changes');
    }
  };

  const handlePublish = async () => {
    if (!projectRecordId) return;
    const selectedSuggestions = suggestions.filter((_, i) => selectedForPublish.has(i));
    if (selectedSuggestions.length === 0) {
      toast.error('Select at least one project to publish');
      return;
    }
    setPublishing(true);
    try {
      // If only a subset is selected, save that subset first
      if (selectedSuggestions.length < suggestions.length) {
        await apiRequest(`/sessions/${sessionId}/projects/${projectRecordId}`, {
          method: 'PATCH',
          body: JSON.stringify({ suggestions: selectedSuggestions }),
        });
        setSuggestions(selectedSuggestions);
        setSelectedForPublish(new Set(selectedSuggestions.map((_, i) => i)));
        prevSuggestionsLenRef.current = selectedSuggestions.length;
      }
      await apiRequest(`/sessions/${sessionId}/projects/${projectRecordId}/publish`, {
        method: 'POST',
      });
      setIsPublished(true);
      toast.success(`${selectedSuggestions.length} project suggestion(s) published to students`);
    } catch {
      toast.error('Failed to publish');
    } finally {
      setPublishing(false);
    }
  };

  const groupedSuggestions = {
    beginner:     suggestions.filter(s => s.difficulty === 'beginner'),
    intermediate: suggestions.filter(s => s.difficulty === 'intermediate'),
    advanced:     suggestions.filter(s => s.difficulty === 'advanced'),
  };

  // ── Empty / generating / failed states ──────────────────────────────────
  if (status === 'none') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-200 dark:border-indigo-700 p-6 text-center">
          <div className="text-4xl mb-3">💡</div>
          <h3 className="font-bold text-slate-900 dark:text-white text-lg mb-1">AI Project Lab</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 max-w-md mx-auto">
            Generate industry-relevant project ideas based on today's session content — polls, topics, and AI summary — tiered by difficulty.
          </p>

          {showHint ? (
            <div className="mb-4 max-w-md mx-auto text-left">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Focus area or hint (optional)</label>
              <input
                className="w-full text-sm rounded-lg border border-indigo-200 dark:border-indigo-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={hint}
                onChange={e => setHint(e.target.value)}
                placeholder="e.g. focus on IoT applications, web development projects…"
              />
            </div>
          ) : (
            <button
              onClick={() => setShowHint(true)}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline mb-4 block mx-auto"
            >
              + Add a focus hint for the AI
            </button>
          )}

          <button
            onClick={handleGenerate}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Generate AI Projects
          </button>
        </div>
      </div>
    );
  }

  if (status === 'generating') {
    return (
      <div className="rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-200 dark:border-indigo-700 p-8 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">Generating project ideas…</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Analysing session content · {elapsedDisplay}</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 p-6 text-center">
        <p className="text-red-700 dark:text-red-300 font-semibold mb-3">Generation failed</p>
        <button
          onClick={handleGenerate}
          className="text-sm bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Completed: show cards ────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-bold text-slate-900 dark:text-white">AI Project Suggestions</h3>
          <span className="text-xs text-slate-400 dark:text-slate-500">({suggestions.length} projects)</span>
          {isPublished && (
            <span className="text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full font-medium">
              Published ✓
            </span>
          )}
          {!isPublished && suggestions.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-700 dark:text-slate-300">{selectedForPublish.size}/{suggestions.length} selected</span>
              <span>·</span>
              <button onClick={selectAll} className="hover:text-primary-600 dark:hover:text-primary-400 underline underline-offset-2">all</button>
              <span>/</span>
              <button onClick={selectNone} className="hover:text-primary-600 dark:hover:text-primary-400 underline underline-offset-2">none</button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerate}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Regenerate
          </button>
          {!isPublished && (
            <button
              onClick={handlePublish}
              disabled={publishing || selectedForPublish.size === 0}
              className="inline-flex items-center gap-1.5 text-sm bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold px-4 py-1.5 rounded-lg transition-colors"
            >
              {publishing
                ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Publishing…</>
                : `📢 Publish Selected (${selectedForPublish.size})`
              }
            </button>
          )}
          <button
            onClick={() => setCreatingAssignmentFor('new')}
            className="inline-flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-1.5 rounded-lg transition-colors"
          >
            📌 Create Assignment
          </button>
        </div>
      </div>

      {/* New assignment form (generic, not tied to a specific project) */}
      {creatingAssignmentFor === 'new' && (
        <AssignmentCreator
          project={null}
          sessionId={sessionId}
          onSuccess={() => { setCreatingAssignmentFor(null); fetchAssignments(); }}
          onCancel={() => setCreatingAssignmentFor(null)}
        />
      )}

      {/* Posted Assignments — shown above project cards */}
      {assignments.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50/60 dark:bg-slate-800/40 p-4">
          <h3 className="font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            📌 Posted Assignments
            <span className="text-xs font-normal text-slate-400">({assignments.length})</span>
          </h3>
          <div className="space-y-3">
            {assignments.map(a => (
              <AssignmentRow
                key={a.id}
                assignment={a}
                sessionId={sessionId}
                onRemove={handleRemoveAssignment}
                onViewSubmissions={(x) => setViewSubmissionsFor(viewSubmissionsFor?.id === x.id ? null : x)}
                isViewingSubmissions={viewSubmissionsFor?.id === a.id}
                onCloseSubmissions={() => setViewSubmissionsFor(null)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Project cards grouped by difficulty */}
      {['beginner', 'intermediate', 'advanced'].map(diff => {
        const group = groupedSuggestions[diff];
        if (group.length === 0) return null;
        return (
          <div key={diff}>
            <h4 className={`text-xs font-bold uppercase tracking-widest mb-2 ${DIFFICULTY_STYLES[diff].text}`}>
              {DIFFICULTY_STYLES[diff].label}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {group.map((project) => {
                const globalIndex = suggestions.indexOf(project);
                if (editingIndex === globalIndex) {
                  return (
                    <ProjectEditor
                      key={globalIndex}
                      project={project}
                      index={globalIndex}
                      onSave={handleSaveEdit}
                      onCancel={() => setEditingIndex(null)}
                    />
                  );
                }
                return (
                  <div key={globalIndex}>
                    <ProjectCard
                      project={project}
                      index={globalIndex}
                      onEdit={(i) => { setEditingIndex(i); setCreatingAssignmentFor(null); }}
                      onCreateAssignment={(p) => setCreatingAssignmentFor(p)}
                      onRemove={!isPublished ? handleRemoveSuggestion : null}
                      isSelected={selectedForPublish.has(globalIndex)}
                      onToggleSelect={!isPublished ? toggleSelectForPublish : null}
                    />
                    {creatingAssignmentFor === project && (
                      <AssignmentCreator
                        project={project}
                        sessionId={sessionId}
                        onSuccess={() => { setCreatingAssignmentFor(null); fetchAssignments(); }}
                        onCancel={() => setCreatingAssignmentFor(null)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

    </div>
  );
}
