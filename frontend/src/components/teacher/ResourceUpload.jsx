import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { apiRequest } from '../../utils/api';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '../ui/alert-dialog';

const ResourceUpload = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isDownloadable, setIsDownloadable] = useState(true);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [resources, setResources] = useState([]);
  const [loadingResources, setLoadingResources] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(() => {
    fetchResources();
  }, [sessionId]);

  // Auto-poll every 5s while any resource is pending/processing
  useEffect(() => {
    const hasInProgress = resources.some(
      (r) => r.vectorization_status === 'processing' || r.vectorization_status === 'pending'
    );
    if (!hasInProgress) return;
    const interval = setInterval(fetchResources, 5000);
    return () => clearInterval(interval);
  }, [resources]);

  const fetchResources = async () => {
    try {
      const data = await apiRequest(`/resources/session/${sessionId}`);
      setResources(data.resources || []);
    } catch (_) {
      // Non-critical — list stays empty
    } finally {
      setLoadingResources(false);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      if (!title) {
        setTitle(e.dataTransfer.files[0].name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      if (!title) {
        setTitle(e.target.files[0].name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleUpload = async () => {
    if (!file || !title) {
      toast.warning('Please select a file and enter a title');
      return;
    }

    // Check if PPT file has description
    const isPPT = file.name.toLowerCase().endsWith('.ppt') || file.name.toLowerCase().endsWith('.pptx');
    if (isPPT && (!description || description.trim().length < 20)) {
      toast.warning('PowerPoint files require a detailed description (minimum 20 characters) for AI search to work properly.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Step 1 — get a signed URL from our backend (no file bytes go through Node)
      const { signedUrl, resourceId, filePath } = await apiRequest('/resources/upload-url', {
        method: 'POST',
        body: JSON.stringify({
          session_id: sessionId,
          title,
          description,
          is_downloadable: isDownloadable,
          filename: file.name,
          mime_type: file.type,
        }),
      });

      // Step 2 — upload directly to Supabase Storage with progress tracking
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Storage upload failed: ${xhr.status}`));
        });
        xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
        xhr.open('PUT', signedUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

      // Step 3 — notify backend to set public URL + enqueue vectorization
      await apiRequest('/resources/upload-complete', {
        method: 'POST',
        body: JSON.stringify({ resourceId, filePath }),
      });

      toast.success('File uploaded! Vectorization in progress.');
      setFile(null);
      setTitle('');
      setDescription('');
      setUploadProgress(0);
      fetchResources();

    } catch (err) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetryVectorize = async (resourceId) => {
    try {
      await apiRequest(`/resources/${resourceId}/retry-vectorize`, { method: 'POST' });
      toast.success('Vectorization restarted');
      fetchResources();
    } catch (error) {
      toast.error('Retry failed: ' + error.message);
    }
  };

  const handleDelete = async () => {
    const resourceId = confirmDeleteId;
    setConfirmDeleteId(null);
    try {
      await apiRequest(`/resources/${resourceId}`, { method: 'DELETE' });
      toast.success('Resource deleted');
      fetchResources();
    } catch (error) {
      toast.error('Delete failed: ' + error.message);
    }
  };

  const getResourceTypeIcon = (type) => {
    const icons = {
      'pdf': '📄',
      'document': '📝',
      'presentation': '📊',
      'spreadsheet': '📈',
      'auto_notes': '✨',
      'other': '📎'
    };
    return icons[type] || '📎';
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A';
    const mb = bytes / (1024 * 1024);
    return mb.toFixed(2) + ' MB';
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-blue-300 flex items-center gap-2"
        >
          ← Back
        </button>
        <h1 className="text-3xl font-bold mt-2 dark:text-white">Upload Resources</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">Session: {sessionId}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Upload Form */}
        <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-6">
          <h2 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">Upload New Resource</h2>

          {/* Drag & Drop Zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-5 sm:p-8 text-center mb-4 transition-colors ${
              dragActive ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-slate-300 dark:border-slate-600'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {file ? (
              <div>
                <p className="text-lg font-semibold dark:text-white">{file.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{formatFileSize(file.size)}</p>
                <button
                  onClick={() => setFile(null)}
                  className="mt-2 text-red-600 hover:text-red-700 text-sm"
                >
                  Remove file
                </button>
              </div>
            ) : (
              <div>
                <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  Drag and drop your file here, or
                </p>
                <label className="mt-2 cursor-pointer text-primary-600 hover:text-primary-700">
                  browse files
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleFileChange}
                    accept=".pdf,.doc,.docx,.ppt,.pptx"
                  />
                </label>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Supported: PDF, Word, PowerPoint (max 50MB)
                </p>
              </div>
            )}
          </div>

          {/* Title Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-slate-700 dark:text-white"
              placeholder="e.g., Week 1 Lecture Notes"
            />
          </div>

          {/* Description Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Description {file && (file.name.toLowerCase().endsWith('.ppt') || file.name.toLowerCase().endsWith('.pptx')) && (
                <span className="text-red-600">*</span>
              )}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-slate-700 dark:text-white ${
                file && (file.name.toLowerCase().endsWith('.ppt') || file.name.toLowerCase().endsWith('.pptx'))
                  ? 'border-orange-300 dark:border-orange-600'
                  : 'border-slate-300 dark:border-slate-600'
              }`}
              rows="4"
              placeholder={
                file && (file.name.toLowerCase().endsWith('.ppt') || file.name.toLowerCase().endsWith('.pptx'))
                  ? "REQUIRED: Describe the PowerPoint content in detail (topics, key points, concepts covered). This description will be used for AI search since text extraction from PPT is unreliable."
                  : "Optional description..."
              }
            />
            {file && (file.name.toLowerCase().endsWith('.ppt') || file.name.toLowerCase().endsWith('.pptx')) && (
              <p className="mt-1 text-sm text-orange-600 dark:text-orange-400">
                ⚠️ <strong>Required for PowerPoint:</strong> Provide a detailed description (min 20 chars) of the presentation content. This will be used for AI-powered search.
              </p>
            )}
          </div>

          {/* Download Permission */}
          <div className="mb-6">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={isDownloadable}
                onChange={(e) => setIsDownloadable(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">Allow students to download this file</span>
            </label>
          </div>

          {/* Upload Progress Bar */}
          {isUploading && (
            <div className="mb-4">
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Uploading...</span>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-primary-500 to-accent-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Upload Button */}
          <button
            onClick={handleUpload}
            disabled={isUploading || !file || !title}
            className="w-full bg-primary-600 text-white py-2.5 px-4 rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
          >
            {isUploading ? 'Uploading...' : 'Upload Resource'}
          </button>
        </div>

        {/* Resources List */}
        <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-6">
          <h2 className="text-xl font-bold mb-4 dark:text-white">Uploaded Resources ({resources.length})</h2>

          {loadingResources ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">Loading resources...</div>
          ) : resources.length === 0 ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">No resources uploaded yet</div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {resources.map((resource) => (
                <div key={resource.id} className="bg-white/50 dark:bg-slate-700/50 border border-slate-200/60 dark:border-slate-600/60 rounded-xl p-4 hover:shadow-card hover:border-primary-200/60 dark:hover:border-primary-700/40 transition-all duration-200">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <span className="text-2xl">{getResourceTypeIcon(resource.resource_type)}</span>
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-900 dark:text-white">{resource.title}</h3>
                        {resource.description && (
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{resource.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 dark:text-slate-400">
                          <span>{formatFileSize(resource.file_size)}</span>
                          <span>Views: {resource.view_count}</span>
                          <span>Downloads: {resource.download_count}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded ${
                            resource.vectorization_status === 'completed' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                            resource.vectorization_status === 'processing' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300' :
                            resource.vectorization_status === 'failed' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' :
                            'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-300'
                          }`}>
                            {resource.vectorization_status === 'completed' ? '✓ AI Ready' :
                             resource.vectorization_status === 'processing' ? '⏳ Processing...' :
                             resource.vectorization_status === 'failed' ? '✗ Failed' :
                             'Pending'}
                          </span>
                          {resource.vectorization_status === 'failed' && (
                            <button
                              onClick={() => handleRetryVectorize(resource.id)}
                              className="text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/50 transition-colors"
                              title="Retry AI processing"
                            >
                              ↺ Retry
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setConfirmDeleteId(resource.id)}
                      className="text-red-600 hover:text-red-700 ml-2"
                      title="Delete resource"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete resource?</AlertDialogTitle>
            <AlertDialogDescription>
              This resource will be permanently deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDeleteId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ResourceUpload;
