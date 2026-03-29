import React from 'react';

const NotesPanel = ({ notesStatus, notesUrl }) => {
  if (notesStatus === 'none') return null;

  const containerClass = notesStatus === 'ready'
    ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700'
    : notesStatus === 'failed'
      ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
      : 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800';

  return (
    <div className={`rounded-lg p-3 sm:p-4 border ${containerClass}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white text-sm sm:text-base">Auto Notes Generation</h3>
          {notesStatus === 'generating' && (
            <p className="text-xs text-primary-600 dark:text-primary-300 mt-1 flex items-center gap-2">
              <span className="inline-block w-3 h-3 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              Generating class notes from transcript + resources… (1–2 min)
            </p>
          )}
          {notesStatus === 'ready' && (
            <p className="text-xs text-indigo-600 dark:text-indigo-300 mt-1">
              Notes generated and visible to students in Resources.
            </p>
          )}
          {notesStatus === 'failed' && (
            <p className="text-xs text-red-600 dark:text-red-300 mt-1">
              Notes generation failed. Please share notes manually.
            </p>
          )}
        </div>
        {notesStatus === 'ready' && notesUrl && (
          <a
            href={notesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap w-full sm:w-auto text-center"
          >
            Preview Notes PDF
          </a>
        )}
      </div>
    </div>
  );
};

export default NotesPanel;
