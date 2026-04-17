import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { resourceAPI, utils } from '../../utils/api';
import ResourceViewerModal from './ResourceViewerModal';

const ResourceViewer = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const currentUser = utils.getCurrentUser();

  const [resources, setResources] = useState([]);
  const [filteredResources, setFilteredResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [viewerResource, setViewerResource] = useState(null);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'student') {
      navigate('/auth');
      return;
    }
    fetchResources();
  }, [sessionId]);

  useEffect(() => {
    // Apply filters
    let filtered = resources;

    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter(r => r.resource_type === filterType);
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(r =>
        r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredResources(filtered);
  }, [searchTerm, filterType, resources]);

  const fetchResources = async () => {
    try {
      setLoading(true);
      const data = await resourceAPI.getSessionResources(sessionId);
      setResources(data.resources || []);
      setFilteredResources(data.resources || []);
    } catch (error) {
      console.error('Error fetching resources:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleView = async (resource) => {
    try {
      await resourceAPI.trackAccess(resource.id, 'view');
      setResources(prev => prev.map(r =>
        r.id === resource.id ? { ...r, view_count: r.view_count + 1 } : r
      ));
    } catch (error) {
      console.error('Error tracking view:', error);
    }

    // URLs open externally; all other types open in the inline viewer
    if (resource.resource_type === 'url') {
      window.open(resource.file_url, '_blank');
    } else {
      setViewerResource({
        resourceTitle: resource.title,
        fileName: resource.file_name,
        fileUrl: resource.file_url,
        resourceType: resource.resource_type,
      });
    }
  };

  const handleDownload = async (resource) => {
    if (!resource.is_downloadable) {
      toast.warning('This resource is not available for download');
      return;
    }

    try {
      // Track download
      await resourceAPI.trackAccess(resource.id, 'download');

      // Trigger download
      const link = document.createElement('a');
      link.href = resource.file_url;
      link.download = resource.file_name || 'download';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Update local count
      setResources(prevResources =>
        prevResources.map(r =>
          r.id === resource.id ? { ...r, download_count: r.download_count + 1 } : r
        )
      );
    } catch (error) {
      console.error('Error tracking download:', error);
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
      'auto_notes': '✨',
      'other': '📎'
    };
    return icons[type] || '📎';
  };

  const getResourceTypeColor = (type) => {
    const colors = {
      'pdf': 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
      'document': 'bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300',
      'presentation': 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300',
      'spreadsheet': 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
      'image': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
      'archive': 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-300',
      'url': 'bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300',
      'auto_notes': 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300',
      'other': 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
    };
    return colors[type] || 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-300';
  };

  // Group resources by type — auto_notes appear in their own "Notes" section
  const TYPE_ORDER = ['auto_notes', 'pdf', 'document', 'presentation', 'spreadsheet', 'image', 'url', 'archive', 'other'];
  const TYPE_LABELS = {
    'auto_notes': '✨ Notes',
    'pdf': '📄 PDFs',
    'document': '📝 Documents',
    'presentation': '📊 Presentations',
    'spreadsheet': '📈 Spreadsheets',
    'image': '🖼️ Images',
    'url': '🔗 Links',
    'archive': '📦 Archives',
    'other': '📎 Other',
  };

  const groupedResources = TYPE_ORDER.reduce((acc, type) => {
    const items = filteredResources.filter(r => r.resource_type === type);
    if (items.length > 0) acc[type] = items;
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-slate-600 dark:text-slate-400">Loading resources...</div>
      </div>
    );
  }

  return (
    <>
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Session Resources</h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">Session ID: {sessionId}</p>
          </div>
          <button
            onClick={() => navigate('/student/dashboard')}
            className="text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-blue-300"
          >
            ← Back to Dashboard
          </button>
        </div>

        {/* Search and Filter Bar */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search resources..."
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-4 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            {/* Filter by Type */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="border border-slate-300 dark:border-slate-600 rounded-lg px-4 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
            >
              <option value="all">All Types</option>
              <option value="auto_notes">✨ Notes (AI Generated)</option>
              <option value="pdf">📄 PDFs</option>
              <option value="document">📝 Documents</option>
              <option value="presentation">📊 Presentations</option>
              <option value="spreadsheet">📈 Spreadsheets</option>
              <option value="image">🖼️ Images</option>
              <option value="url">🔗 URLs</option>
              <option value="archive">📦 Archives</option>
              <option value="other">Other</option>
            </select>

            {/* View Mode Toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-4 py-2 rounded-lg ${viewMode === 'grid' ? 'bg-primary-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 rounded-lg ${viewMode === 'list' ? 'bg-primary-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>

          {/* Results Count */}
          <div className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            Showing {filteredResources.length} of {resources.length} resources
          </div>
        </div>
      </div>

      {/* Resources Display */}
      {filteredResources.length === 0 ? (
        <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-12 text-center">
          <div className="text-slate-400 text-5xl mb-4">📂</div>
          <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">
            {resources.length === 0 ? 'No resources available' : 'No matching resources'}
          </h3>
          <p className="text-slate-500 dark:text-slate-400">
            {resources.length === 0
              ? 'Your teacher hasn\'t uploaded any resources yet'
              : 'Try adjusting your search or filters'}
          </p>
        </div>
      ) : filterType !== 'all' ? (
        // Single-type view (flat list when a specific type is selected)
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4'}>
          {filteredResources.map((resource) => (
            <div
              key={resource.id}
              className={`bg-white/75 dark:bg-slate-800/75 backdrop-blur-sm rounded-xl border border-slate-200/60 dark:border-slate-700/60 hover:shadow-card hover:border-primary-200/60 dark:hover:border-primary-700/40 transition-all duration-200 ${viewMode === 'list' ? 'flex items-center' : ''}`}
            >
              {viewMode === 'grid' ? (
                // Grid View
                <div className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-4xl">{getResourceIcon(resource.resource_type)}</span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getResourceTypeColor(resource.resource_type)}`}>
                      {resource.resource_type}
                    </span>
                  </div>

                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2 line-clamp-2">
                    {resource.title}
                  </h3>

                  {resource.description && (
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-3 line-clamp-2">
                      {resource.description}
                    </p>
                  )}

                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-4 space-y-1">
                    {resource.file_size && (
                      <div>📦 {utils.formatFileSize(resource.file_size)}</div>
                    )}
                    <div>📅 {new Date(resource.created_at).toLocaleDateString()}</div>
                    <div>👁️ {resource.view_count} views • ⬇️ {resource.download_count} downloads</div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleView(resource)}
                      className="flex-1 bg-primary-600 hover:bg-primary-700 text-white py-2 px-4 rounded-lg text-sm font-medium"
                    >
                      View
                    </button>
                    {resource.is_downloadable && resource.resource_type !== 'url' && (
                      <button
                        onClick={() => handleDownload(resource)}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg text-sm font-medium"
                      >
                        Download
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                // List View
                <div className="flex items-center justify-between p-6 w-full">
                  <div className="flex items-center gap-4 flex-1">
                    <span className="text-3xl">{getResourceIcon(resource.resource_type)}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{resource.title}</h3>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getResourceTypeColor(resource.resource_type)}`}>
                          {resource.resource_type}
                        </span>
                      </div>
                      {resource.description && (
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{resource.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                        {resource.file_size && <span>📦 {utils.formatFileSize(resource.file_size)}</span>}
                        <span>📅 {new Date(resource.created_at).toLocaleDateString()}</span>
                        <span>👁️ {resource.view_count} • ⬇️ {resource.download_count}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleView(resource)}
                      className="bg-primary-600 hover:bg-primary-700 text-white py-2 px-4 rounded-lg text-sm font-medium"
                    >
                      View
                    </button>
                    {resource.is_downloadable && resource.resource_type !== 'url' && (
                      <button
                        onClick={() => handleDownload(resource)}
                        className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg text-sm font-medium"
                      >
                        Download
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        // Grouped view when showing "All Types"
        <div className="space-y-8">
          {Object.entries(groupedResources).map(([type, items]) => (
            <div key={type}>
              <div className={`flex items-center gap-2 mb-3 px-4 py-2 rounded-lg font-semibold text-sm ${
                type === 'auto_notes'
                  ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}>
                <span>{TYPE_LABELS[type] || type}</span>
                <span className="ml-auto text-xs font-normal opacity-70">{items.length} file{items.length !== 1 ? 's' : ''}</span>
                {type === 'auto_notes' && (
                  <span className="text-xs bg-indigo-200 dark:bg-indigo-700 text-indigo-700 dark:text-indigo-200 px-2 py-0.5 rounded-full font-medium">AI Generated</span>
                )}
              </div>
              <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4'}>
                {items.map((resource) => (
                  <div
                    key={resource.id}
                    className={`bg-white/75 dark:bg-slate-800/75 backdrop-blur-sm rounded-xl border hover:shadow-card transition-all duration-200 ${
                      type === 'auto_notes'
                        ? 'border-indigo-200 dark:border-indigo-700'
                        : 'border-slate-200 dark:border-slate-700'
                    } ${viewMode === 'list' ? 'flex items-center' : ''}`}
                  >
                    {viewMode === 'grid' ? (
                      <div className="p-6">
                        <div className="flex items-start justify-between mb-3">
                          <span className="text-4xl">{getResourceIcon(resource.resource_type)}</span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getResourceTypeColor(resource.resource_type)}`}>
                            {resource.resource_type === 'auto_notes' ? 'AI Notes' : resource.resource_type}
                          </span>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2 line-clamp-2">{resource.title}</h3>
                        {resource.description && (
                          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3 line-clamp-2">{resource.description}</p>
                        )}
                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-4 space-y-1">
                          {resource.file_size && <div>📦 {utils.formatFileSize(resource.file_size)}</div>}
                          <div>📅 {new Date(resource.created_at).toLocaleDateString()}</div>
                          {resource.resource_type !== 'auto_notes' && (
                            <div>👁️ {resource.view_count} views • ⬇️ {resource.download_count} downloads</div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleView(resource)}
                            className={`flex-1 text-white py-2 px-4 rounded-lg text-sm font-medium ${
                              resource.resource_type === 'auto_notes'
                                ? 'bg-indigo-600 hover:bg-indigo-700'
                                : 'bg-primary-600 hover:bg-primary-700'
                            }`}
                          >
                            {resource.resource_type === 'auto_notes' ? 'Open Notes' : 'View'}
                          </button>
                          {resource.resource_type !== 'url' && (
                            <button
                              onClick={() => handleDownload(resource)}
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg text-sm font-medium"
                            >
                              Download
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between p-4 w-full">
                        <div className="flex items-center gap-3 flex-1">
                          <span className="text-2xl">{getResourceIcon(resource.resource_type)}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <h3 className="text-base font-semibold text-slate-900 dark:text-white">{resource.title}</h3>
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${getResourceTypeColor(resource.resource_type)}`}>
                                {resource.resource_type === 'auto_notes' ? 'AI Notes' : resource.resource_type}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              📅 {new Date(resource.created_at).toLocaleDateString()}
                              {resource.file_size && ` • 📦 ${utils.formatFileSize(resource.file_size)}`}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => handleView(resource)}
                            className={`text-white py-1.5 px-3 rounded-lg text-sm font-medium ${
                              resource.resource_type === 'auto_notes'
                                ? 'bg-indigo-600 hover:bg-indigo-700'
                                : 'bg-primary-600 hover:bg-primary-700'
                            }`}
                          >
                            {resource.resource_type === 'auto_notes' ? 'Open' : 'View'}
                          </button>
                          {resource.resource_type !== 'url' && (
                            <button
                              onClick={() => handleDownload(resource)}
                              className="bg-green-600 hover:bg-green-700 text-white py-1.5 px-3 rounded-lg text-sm font-medium"
                            >
                              ↓
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>

    {viewerResource && (
      <ResourceViewerModal resource={viewerResource} onClose={() => setViewerResource(null)} />
    )}
    </>
  );
};

export default ResourceViewer;
