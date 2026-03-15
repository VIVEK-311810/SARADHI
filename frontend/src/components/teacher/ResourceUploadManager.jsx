import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { resourceAPI, utils } from '../../utils/api';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '../ui/alert-dialog';

const ResourceUploadManager = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const currentUser = utils.getCurrentUser();

  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [showUrlForm, setShowUrlForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // File upload form state
  const [fileData, setFileData] = useState({
    file: null,
    title: '',
    description: '',
    is_downloadable: true
  });

  // URL form state
  const [urlData, setUrlData] = useState({
    title: '',
    description: '',
    url: '',
    is_downloadable: true
  });

  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'teacher') {
      navigate('/auth');
      return;
    }
    fetchResources();
  }, [sessionId]);

  const fetchResources = async () => {
    try {
      setLoading(true);
      const data = await resourceAPI.getSessionResources(sessionId);
      setResources(data.resources || []);
    } catch (error) {
      console.error('Error fetching resources:', error);
      setError('Failed to load resources');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file size (50MB)
      if (file.size > 50 * 1024 * 1024) {
        setError('File size must be less than 50MB');
        return;
      }

      // Block audio/video files
      const blockedTypes = [
        'audio/', 'video/', '.mp3', '.mp4', '.wav', '.avi', '.mov', '.wmv',
        '.flv', '.mkv', '.m4a', '.aac', '.ogg', '.wma', '.webm'
      ];

      const isBlocked = blockedTypes.some(type =>
        file.type.includes(type) || file.name.toLowerCase().includes(type)
      );

      if (isBlocked) {
        setError('Audio and video files are not allowed');
        e.target.value = '';
        return;
      }

      setFileData({
        ...fileData,
        file: file,
        title: fileData.title || file.name.split('.')[0]
      });
      setError('');
    }
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();

    if (!fileData.file || !fileData.title) {
      setError('Please select a file and provide a title');
      return;
    }

    const formData = new FormData();
    formData.append('file', fileData.file);
    formData.append('title', fileData.title);
    formData.append('description', fileData.description);
    formData.append('is_downloadable', fileData.is_downloadable);

    try {
      setUploading(true);
      setError('');
      setUploadProgress(0);

      const result = await resourceAPI.uploadFile(sessionId, currentUser.id, formData);

      if (result.success) {
        toast.success('File uploaded successfully!');
        setShowUploadForm(false);
        setFileData({
          file: null,
          title: '',
          description: '',
          is_downloadable: true
        });
        fetchResources();
      }
    } catch (error) {
      console.error('Upload error:', error);
      setError(error.message || 'Failed to upload file');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleUrlSubmit = async (e) => {
    e.preventDefault();

    if (!urlData.title || !urlData.url) {
      setError('Please provide title and URL');
      return;
    }

    try {
      setUploading(true);
      setError('');

      const result = await resourceAPI.addUrl(sessionId, currentUser.id, urlData);

      if (result.success) {
        toast.success('URL resource added successfully!');
        setShowUrlForm(false);
        setUrlData({
          title: '',
          description: '',
          url: '',
          is_downloadable: true
        });
        fetchResources();
      }
    } catch (error) {
      console.error('Error adding URL:', error);
      setError(error.message || 'Failed to add URL resource');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    const resourceId = confirmDeleteId;
    setConfirmDeleteId(null);
    try {
      await resourceAPI.deleteResource(resourceId, currentUser.id);
      toast.success('Resource deleted');
      fetchResources();
    } catch (error) {
      console.error('Error deleting resource:', error);
      toast.error('Failed to delete resource');
    }
  };

  const getResourceIcon = (type) => {
    const icons = {
      'pdf': '📄',
      'document': '📝',
      'presentation': '📊',
      'spreadsheet': '📈',
      'image': '🖼️',
      'archive': '📦',
      'url': '🔗',
      'other': '📎'
    };
    return icons[type] || '📎';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-slate-600 dark:text-slate-400">Loading resources...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Manage Resources</h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">Session ID: {sessionId}</p>
          </div>
          <button
            onClick={() => navigate('/teacher/dashboard')}
            className="text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-blue-300"
          >
            ← Back to Dashboard
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => {
              setShowUploadForm(!showUploadForm);
              setShowUrlForm(false);
              setError('');
            }}
            className="bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-6 rounded-lg transition-colors duration-200 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Upload File
          </button>

          <button
            onClick={() => {
              setShowUrlForm(!showUrlForm);
              setShowUploadForm(false);
              setError('');
            }}
            className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-6 rounded-lg transition-colors duration-200 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Add URL
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* File Upload Form */}
      {showUploadForm && (
        <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Upload New File</h2>
          <form onSubmit={handleFileUpload}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Select File (Max 50MB, No audio/video)
                </label>
                <input
                  type="file"
                  onChange={handleFileChange}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 dark:bg-slate-700 dark:text-white"
                  required
                />
                {fileData.file && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Selected: {fileData.file.name} ({utils.formatFileSize(fileData.file.size)})
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Title</label>
                <input
                  type="text"
                  value={fileData.title}
                  onChange={(e) => setFileData({ ...fileData, title: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 dark:bg-slate-700 dark:text-white"
                  placeholder="Resource title"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Description (Optional)</label>
                <textarea
                  value={fileData.description}
                  onChange={(e) => setFileData({ ...fileData, description: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 dark:bg-slate-700 dark:text-white"
                  rows="3"
                  placeholder="Add a description..."
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="file-downloadable"
                  checked={fileData.is_downloadable}
                  onChange={(e) => setFileData({ ...fileData, is_downloadable: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="file-downloadable" className="text-sm text-slate-700 dark:text-slate-300">
                  Allow students to download
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={uploading}
                  className="bg-primary-600 hover:bg-primary-700 disabled:bg-slate-400 text-white font-medium py-2 px-6 rounded-lg"
                >
                  {uploading ? 'Uploading...' : 'Upload File'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowUploadForm(false)}
                  className="bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-500 text-slate-800 dark:text-slate-200 font-medium py-2 px-6 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* URL Form */}
      {showUrlForm && (
        <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Add URL Resource</h2>
          <form onSubmit={handleUrlSubmit}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Title</label>
                <input
                  type="text"
                  value={urlData.title}
                  onChange={(e) => setUrlData({ ...urlData, title: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 dark:bg-slate-700 dark:text-white"
                  placeholder="Resource title"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">URL</label>
                <input
                  type="url"
                  value={urlData.url}
                  onChange={(e) => setUrlData({ ...urlData, url: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 dark:bg-slate-700 dark:text-white"
                  placeholder="https://example.com/resource"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Description (Optional)</label>
                <textarea
                  value={urlData.description}
                  onChange={(e) => setUrlData({ ...urlData, description: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 dark:bg-slate-700 dark:text-white"
                  rows="3"
                  placeholder="Add a description..."
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={uploading}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-slate-400 text-white font-medium py-2 px-6 rounded-lg"
                >
                  {uploading ? 'Adding...' : 'Add URL'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowUrlForm(false)}
                  className="bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-500 text-slate-800 dark:text-slate-200 font-medium py-2 px-6 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Resources List */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Uploaded Resources ({resources.length})
          </h2>
        </div>

        {resources.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-slate-400 text-5xl mb-4">📂</div>
            <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">No resources yet</h3>
            <p className="text-slate-500 dark:text-slate-400">Upload files or add URLs to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {resources.map((resource) => (
              <div key={resource.id} className="p-6 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{getResourceIcon(resource.resource_type)}</span>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{resource.title}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {resource.resource_type} •
                          {resource.file_size ? ` ${utils.formatFileSize(resource.file_size)} • ` : ' '}
                          {new Date(resource.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    {resource.description && (
                      <p className="text-slate-600 dark:text-slate-400 mb-2 ml-11">{resource.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400 ml-11">
                      <span>👁️ {resource.view_count} views</span>
                      <span>⬇️ {resource.download_count} downloads</span>
                      {!resource.is_downloadable && (
                        <span className="text-orange-600 dark:text-orange-400">🔒 View only</span>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <a
                      href={resource.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm"
                    >
                      View
                    </a>
                    <button
                      onClick={() => setConfirmDeleteId(resource.id)}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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

export default ResourceUploadManager;
