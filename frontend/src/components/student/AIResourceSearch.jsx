import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { apiRequest } from '../../utils/api';

const AIResourceSearch = () => {
  const { sessionId } = useParams();
  const [query, setQuery] = useState('');
  const [responseType, setResponseType] = useState(null);
  const [responseData, setResponseData] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Cooldown countdown
  useEffect(() => {
    if (cooldownSeconds > 0) {
      const timer = setTimeout(() => setCooldownSeconds(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldownSeconds]);

  const handleSearch = async () => {
    if (!query.trim() || isSearching || cooldownSeconds > 0) return;

    setIsSearching(true);
    setHasSearched(true);

    try {
      const data = await apiRequest(`/ai-search/session/${sessionId}`, {
        method: 'POST',
        body: JSON.stringify({ query, top_k: 5 }),
      });

      setResponseType(data.type || null);
      setResponseData(data);
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Search failed. Please try again.');
      setResponseType('error');
      setResponseData({ error: error.message || 'Search failed. Please try again.' });
    } finally {
      setIsSearching(false);
      setCooldownSeconds(5);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !isSearching && cooldownSeconds === 0) {
      handleSearch();
    }
  };

  const getTypeColor = (type) => {
    const colors = {
      'pdf': 'bg-red-100 text-red-800',
      'document': 'bg-primary-100 text-primary-800',
      'presentation': 'bg-green-100 text-green-800',
      'spreadsheet': 'bg-yellow-100 text-yellow-800',
      'url': 'bg-primary-100 text-primary-700',
      'other': 'bg-slate-100 text-slate-800'
    };
    return colors[type] || 'bg-slate-100 text-slate-800';
  };

  // Resource card used by resource_list and filtered_resources
  const ResourceCard = ({ resource, index }) => (
    <div key={index} className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-sm rounded-xl border border-slate-200/60 dark:border-slate-700/60 hover:shadow-card hover:border-primary-200/60 dark:hover:border-primary-700/40 transition-all duration-200 overflow-hidden">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-2 sm:mb-3">
          <div className="flex-1 min-w-0">
            <h4 className="text-base sm:text-lg font-semibold text-primary-600 truncate">
              {resource.title || resource.resource_title || 'Untitled Resource'}
            </h4>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {resource.file_name}
            </p>
          </div>
          <span className={`self-start px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-medium flex-shrink-0 ${getTypeColor(resource.resource_type)}`}>
            {resource.resource_type}
          </span>
        </div>
        {resource.summary && (
          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 mb-3 line-clamp-2 sm:line-clamp-3">
            {resource.summary}
          </p>
        )}
        <a
          href={resource.file_url || resource.resource_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 active:bg-primary-800 transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Open Document
        </a>
      </div>
    </div>
  );

  // Chunk card used by rag_answer sources
  const ChunkCard = ({ source, index }) => (
    <div key={index} className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-sm rounded-xl border border-slate-200/60 dark:border-slate-700/60 overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2 sm:mb-3">
          <div className="flex-1 min-w-0">
            <h4 className="text-base sm:text-lg font-semibold text-primary-600 truncate">
              {source.resource_title || 'Untitled Resource'}
            </h4>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {source.pageNumber && <span>Page {source.pageNumber}</span>}
              <span className="font-semibold text-green-600">
                {(source.similarityScore * 100).toFixed(0)}% match
              </span>
            </div>
          </div>
          <span className={`self-start px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-medium flex-shrink-0 ${getTypeColor(source.resource_type)}`}>
            {source.resource_type}
          </span>
        </div>
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-md p-3 sm:p-4 mb-3 border-l-4 border-primary-500">
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-xs sm:text-sm line-clamp-3 sm:line-clamp-none">
            {source.snippet || source.text}
          </p>
        </div>
        <a
          href={source.resource_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 active:bg-primary-800 transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Open Document
        </a>
      </div>
      <div className="h-1 bg-slate-200 dark:bg-slate-700">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-green-500"
          style={{ width: `${source.similarityScore * 100}%` }}
        ></div>
      </div>
    </div>
  );

  const renderResults = () => {
    if (isSearching) {
      return (
        <div className="text-center py-8 sm:py-12">
          <div className="inline-block animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-primary-600"></div>
          <p className="mt-3 sm:mt-4 text-slate-600 dark:text-slate-400 text-sm sm:text-base">Searching materials...</p>
        </div>
      );
    }

    if (!hasSearched) return null;

    switch (responseType) {
      case 'resource_list': {
        const resources = responseData?.resources || [];
        return (
          <div>
            <div className="mb-3 sm:mb-4">
              <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
                {resources.length > 0
                  ? `All ${resources.length} resource${resources.length === 1 ? '' : 's'} in this session`
                  : 'No resources uploaded yet'}
              </h3>
            </div>
            {resources.length > 0 ? (
              <div className="space-y-3 sm:space-y-4">
                {resources.map((r, i) => <ResourceCard key={i} resource={r} index={i} />)}
              </div>
            ) : (
              <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-8 sm:p-12 text-center text-slate-500 dark:text-slate-400 text-sm sm:text-base">
                No resources have been uploaded to this session yet.
              </div>
            )}
          </div>
        );
      }

      case 'filtered_resources': {
        const resources = responseData?.resources || [];
        const topic = responseData?.topic || query;
        return (
          <div>
            <div className="mb-3 sm:mb-4">
              <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
                {resources.length > 0
                  ? `${resources.length} resource${resources.length === 1 ? '' : 's'} about "${topic}"`
                  : `No resources found about "${topic}"`}
              </h3>
            </div>
            {resources.length > 0 ? (
              <div className="space-y-3 sm:space-y-4">
                {resources.map((r, i) => <ResourceCard key={i} resource={r} index={i} />)}
              </div>
            ) : (
              <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-8 sm:p-12 text-center text-slate-500 dark:text-slate-400 text-sm sm:text-base">
                Try a different keyword.
              </div>
            )}
          </div>
        );
      }

      case 'file_summary': {
        const resource = responseData?.resource;
        const summary = responseData?.summary;
        return (
          <div className="space-y-3 sm:space-y-4">
            {resource && (
              <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base sm:text-lg font-semibold text-primary-900 dark:text-primary-300 truncate">
                      {resource.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-primary-700 dark:text-primary-400 truncate mt-0.5">{resource.file_name}</p>
                  </div>
                  <span className={`self-start px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-medium flex-shrink-0 ${getTypeColor(resource.resource_type)}`}>
                    {resource.resource_type}
                  </span>
                </div>
                <a
                  href={resource.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 active:bg-primary-800 transition-colors text-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Open Document
                </a>
              </div>
            )}
            {summary && (
              <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6">
                <h4 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white mb-2 sm:mb-3">Summary</h4>
                <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">{summary}</p>
              </div>
            )}
          </div>
        );
      }

      case 'rag_answer': {
        const answer = responseData?.answer;
        const sources = responseData?.sources || [];
        const confidence = responseData?.confidence;
        return (
          <div className="space-y-3 sm:space-y-4">
            <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h4 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">AI Answer</h4>
                {confidence !== undefined && (
                  <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                    {(confidence * 100).toFixed(0)}% confidence
                  </span>
                )}
              </div>
              <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">{answer}</p>
            </div>

            {sources.length > 0 && (
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-3 sm:mb-4">
                  Sources ({sources.length})
                </h3>
                <div className="space-y-3 sm:space-y-4">
                  {sources.map((s, i) => <ChunkCard key={i} source={s} index={i} />)}
                </div>
              </div>
            )}
          </div>
        );
      }

      case 'error': {
        return (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 sm:p-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div>
                <h3 className="text-sm sm:text-base font-semibold text-red-900 dark:text-red-300">Search Error</h3>
                <p className="text-xs sm:text-sm text-red-700 dark:text-red-400 mt-1">{responseData?.error || 'Something went wrong. Please try again.'}</p>
              </div>
            </div>
          </div>
        );
      }

      default:
        return (
          <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-8 sm:p-12 text-center">
            <svg className="mx-auto h-12 w-12 sm:h-16 sm:w-16 text-slate-400 mb-3 sm:mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-1 sm:mb-2">No results found</h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-base">Try rephrasing your question</p>
          </div>
        );
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">AI Resource Search</h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-base">Search all materials using natural language</p>
      </div>

      {/* Search Bar */}
      <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6 mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={cooldownSeconds > 0 ? `Wait ${cooldownSeconds}s before next search...` : 'Ask about course materials...'}
              className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-lg dark:bg-slate-700 dark:text-white"
              disabled={isSearching || cooldownSeconds > 0}
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={isSearching || cooldownSeconds > 0 || !query.trim()}
            className="w-full sm:w-auto px-6 sm:px-8 py-2.5 sm:py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 active:bg-primary-800 disabled:bg-slate-400 disabled:cursor-not-allowed font-semibold transition-colors text-sm sm:text-base"
          >
            {isSearching ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Searching...
              </span>
            ) : cooldownSeconds > 0 ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {cooldownSeconds}s
              </span>
            ) : (
              'Search'
            )}
          </button>
        </div>

        <div className="mt-3 sm:mt-4 flex items-start gap-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-primary-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div className="min-w-0">
            <p className="font-medium">Try asking:</p>
            <ul className="mt-1 space-y-0.5 sm:space-y-1 text-xs sm:text-sm">
              <li>"List all resources" &bull; "Resources about OOP" &bull; "Summarize lecture1.pdf"</li>
              <li className="hidden sm:block">"What is polymorphism?" &bull; "In lecture2.pdf, explain inheritance"</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Results */}
      {renderResults()}

      {/* Info Box — shown before first search */}
      {!hasSearched && (
        <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-4 sm:p-6">
          <h3 className="font-semibold text-primary-900 dark:text-primary-300 mb-2 flex items-center gap-2 text-sm sm:text-base">
            <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            How AI Search Works
          </h3>
          <ul className="text-primary-800 dark:text-primary-300 space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
            <li className="flex items-start gap-2">
              <span className="text-primary-500 font-bold">•</span>
              <span>"List all resources" — shows every uploaded file with summaries</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary-500 font-bold">•</span>
              <span>"Resources about OOP" — filters files by topic</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary-500 font-bold">•</span>
              <span>"Summarize lecture.pdf" — generates a summary of that file</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary-500 font-bold">•</span>
              <span>"What is polymorphism?" — AI answer from all materials</span>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default AIResourceSearch;
