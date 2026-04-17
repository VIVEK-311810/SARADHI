import React, { useEffect, useState } from 'react';

export default function ResourceViewerModal({ resource, onClose }) {
  const [loaded, setLoaded] = useState(false);
  const [blobUrl, setBlobUrl] = useState(null);
  const [fetchError, setFetchError] = useState(false);
  const { resourceTitle, fileName, fileUrl, resourceType } = resource;
  const label = resourceTitle || fileName || 'Document';

  const isPdf = resourceType === 'pdf';
  const isOffice = resourceType === 'document' || resourceType === 'presentation';
  const officeViewerUrl = isOffice && fileUrl
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`
    : null;

  // For PDFs: fetch as blob to bypass X-Frame-Options on Supabase storage URLs
  useEffect(() => {
    if (!isPdf || !fileUrl) return;
    setBlobUrl(null);
    setFetchError(false);
    setLoaded(false);

    let objectUrl = null;
    const controller = new AbortController();

    fetch(fileUrl, { signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.blob();
      })
      .then(blob => {
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(err => {
        if (err.name !== 'AbortError') setFetchError(true);
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileUrl, isPdf]);

  // Reset state when switching to a non-PDF resource
  useEffect(() => {
    if (!isPdf) { setLoaded(false); setFetchError(false); }
  }, [officeViewerUrl, isPdf]);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleDownload = () => {
    if (!fileUrl) return;
    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = fileName || 'document';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const canPreview = isPdf ? (blobUrl && !fetchError) : (isOffice && officeViewerUrl);
  const isLoading = isPdf ? (!blobUrl && !fetchError) : !loaded;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-[92vw] h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white truncate">{label}</h2>
            {fileName && fileName !== label && (
              <p className="text-xs text-slate-400 truncate">{fileName}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {fileUrl && (
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 relative overflow-hidden bg-slate-100 dark:bg-slate-950">
          {isLoading && !fetchError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-100 dark:bg-slate-950 z-10">
              <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-400">
                {isPdf ? 'Fetching document...' : 'Loading document...'}
              </p>
            </div>
          )}

          {/* Fallback: no preview possible */}
          {!canPreview && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400 px-8 text-center">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Preview not available</p>
                <p className="text-xs text-slate-400">This file cannot be previewed in the browser.</p>
              </div>
              {fileUrl && (
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-xl transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download to view
                </button>
              )}
            </div>
          )}

          {/* PDF: rendered from blob URL (bypasses X-Frame-Options) */}
          {isPdf && blobUrl && (
            <embed
              src={blobUrl}
              type="application/pdf"
              className="w-full h-full"
            />
          )}

          {/* DOCX / PPTX: Office Live viewer */}
          {isOffice && officeViewerUrl && (
            <iframe
              src={officeViewerUrl}
              title={label}
              className="w-full h-full border-0"
              onLoad={() => setLoaded(true)}
              onError={() => { setLoaded(true); setFetchError(true); }}
              allow="fullscreen"
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
          <p className="text-xs text-slate-400 text-center">Document served from course materials</p>
        </div>
      </div>
    </div>
  );
}
