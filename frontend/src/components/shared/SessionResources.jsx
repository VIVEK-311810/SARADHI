import React from 'react';
import { utils } from '../../utils/api';
import ResourceUploadManager from '../teacher/ResourceUploadManager';
import ResourceViewer from '../student/ResourceViewer';

const SessionResources = () => {
  const currentUser = utils.getCurrentUser();

  // Route to appropriate component based on user role
  if (currentUser?.role === 'teacher') {
    return <ResourceUploadManager />;
  } else if (currentUser?.role === 'student') {
    return <ResourceViewer />;
  }

  // Fallback if no user or invalid role
  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-8 text-center">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3">Access Denied</h2>
        <p className="text-slate-600 dark:text-slate-400">Please log in to view session resources.</p>
      </div>
    </div>
  );
};

export default SessionResources;

