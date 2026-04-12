import React, { useEffect, useRef } from 'react';

const AudioRecorder = ({ audioRecorder, sessionId: propSessionId }) => {
  const transcriptEndRef = useRef(null);

  // Destructure props from audioRecorder hook
  const {
    sessionId,
    setSessionId,
    pdfFile,
    segmentInterval,
    setSegmentInterval,
    mcqTypes,
    setMcqTypes,
    mcqCount,
    setMcqCount,
    status,
    transcripts,
    fullTranscript,
    notes,
    setNotes,
    isProcessing,
    handlePdfChange,
    clearPdf,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    sendManualNotes
  } = audioRecorder;

  // Interval options (minutes)
  const intervalOptions = [1, 5, 10, 15, 20, 25, 30];

  const ALL_TYPES = [
    { value: 'mcq',              label: 'Multiple Choice' },
    { value: 'true_false',       label: 'True / False' },
    { value: 'fill_blank',       label: 'Fill in the Blank' },
    { value: 'numeric',          label: 'Numerical' },
    { value: 'assertion_reason', label: 'Assertion–Reason' },
  ];

  const toggleType = (value) => {
    setMcqTypes(prev =>
      prev.includes(value) ? prev.filter(t => t !== value) : [...prev, value]
    );
  };

  // Auto-scroll transcript display
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  return (
    <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-700 pb-3 sm:pb-4">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white">Audio Transcription</h2>
        <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm mt-1">Record and transcribe class audio in real-time</p>
      </div>

      {/* Status Badge */}
      <div className="flex items-center space-x-3 sm:space-x-4">
        <span className="text-slate-700 dark:text-slate-300 font-semibold text-sm sm:text-base">Status:</span>
        <span className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold ${
          status === 'idle' ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300' :
          status === 'recording' ? 'bg-green-500 text-white animate-pulse' :
          'bg-yellow-500 text-white'
        }`}>
          {status === 'idle' ? 'Idle' : status === 'recording' ? '🔴 Recording' : '⏸ Paused'}
        </span>
      </div>

      {/* Session Configuration */}
      <div className="space-y-3 sm:space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 sm:mb-2">
            Session ID *
          </label>
          <input
            type="text"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            disabled={status !== 'idle' || propSessionId}
            placeholder="Enter unique session ID"
            className="w-full px-3 sm:px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-slate-100 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-sm sm:text-base dark:bg-slate-700 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 sm:mb-2">
            PDF File (Optional)
          </label>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <input
              id="pdf-input"
              type="file"
              accept="application/pdf"
              onChange={handlePdfChange}
              disabled={status !== 'idle'}
              className="flex-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400 file:mr-2 sm:file:mr-4 file:py-2 file:px-3 sm:file:px-4 file:rounded-lg file:border-0 file:text-xs sm:file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {pdfFile && (
              <button
                onClick={clearPdf}
                disabled={status !== 'idle'}
                className="w-full sm:w-auto px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 active:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                Clear
              </button>
            )}
          </div>
          {pdfFile && (
            <p className="text-xs sm:text-sm text-green-600 mt-1 truncate">✓ {pdfFile.name}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 sm:mb-2">
            Segment Interval (minutes)
          </label>
          <select
            value={segmentInterval}
            onChange={(e) => setSegmentInterval(parseInt(e.target.value))}
            disabled={status !== 'idle'}
            className="w-full px-3 sm:px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-slate-100 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-sm sm:text-base dark:bg-slate-700 dark:text-white"
          >
            {intervalOptions.map(interval => (
              <option key={interval} value={interval}>
                {interval} minute{interval > 1 ? 's' : ''}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Transcripts sent every {segmentInterval} min
          </p>
        </div>
      </div>

      {/* MCQ Preferences */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Question Types to Generate</h3>
        <div className="flex flex-wrap gap-2">
          {ALL_TYPES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => toggleType(value)}
              disabled={status !== 'idle'}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                mcqTypes.includes(value)
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-primary-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {mcqTypes.length === 0 && (
          <p className="text-xs text-red-500">Select at least one question type.</p>
        )}
        <div className="flex items-center gap-3">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
            Questions per segment
          </label>
          <input
            type="number"
            min={1}
            max={10}
            value={mcqCount}
            onChange={(e) => setMcqCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
            disabled={status !== 'idle'}
            className="w-16 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-center focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-slate-100 dark:disabled:bg-slate-700 disabled:cursor-not-allowed dark:bg-slate-700 dark:text-white"
          />
        </div>
      </div>

      {/* Control Buttons */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <button
          onClick={startRecording}
          disabled={status !== 'idle' || !sessionId.trim() || isProcessing}
          className="px-4 sm:px-6 py-2.5 sm:py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 active:bg-green-800 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors text-sm sm:text-base"
        >
          Start
        </button>

        <button
          onClick={status === 'paused' ? resumeRecording : pauseRecording}
          disabled={status === 'idle' || isProcessing}
          className="px-4 sm:px-6 py-2.5 sm:py-3 bg-yellow-500 text-white rounded-lg font-bold hover:bg-yellow-600 active:bg-yellow-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors text-sm sm:text-base"
        >
          {status === 'paused' ? 'Resume' : 'Pause'}
        </button>

        <button
          onClick={stopRecording}
          disabled={status === 'idle' || isProcessing}
          className="px-4 sm:px-6 py-2.5 sm:py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 active:bg-red-800 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors text-sm sm:text-base"
        >
          Stop
        </button>
      </div>

      {/* Real-time Transcript Display */}
      <div>
        <h3 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-white mb-2">Live Transcript</h3>
        <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3 sm:p-4 h-48 sm:h-64 overflow-y-auto">
          {!fullTranscript ? (
            <p className="text-slate-400 dark:text-slate-500 text-center italic text-sm">Transcripts will appear here...</p>
          ) : (
            <>
              <p className="text-slate-800 dark:text-slate-200 text-sm sm:text-base leading-relaxed">
                {fullTranscript}
                {status === 'recording' && (
                  <span className="inline-block w-0.5 h-4 bg-green-500 ml-0.5 animate-pulse align-middle" />
                )}
              </p>
              <div ref={transcriptEndRef} />
            </>
          )}
        </div>
        {fullTranscript && (
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 text-right">
            {fullTranscript.split(/\s+/).filter(Boolean).length} words
          </p>
        )}
      </div>

      {/* Comments Section */}
      <div>
        <h3 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-white mb-2">Comments</h3>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Write your Comment"
          disabled={isProcessing}
          rows={3}
          className="w-full px-3 sm:px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-slate-100 dark:disabled:bg-slate-700 disabled:cursor-not-allowed resize-none text-sm sm:text-base dark:bg-slate-700 dark:text-white"
        />
        <button
          onClick={sendManualNotes}
          disabled={!notes.trim() || isProcessing}
          className="mt-2 w-full sm:w-auto px-6 py-2 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 active:bg-primary-800 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors text-sm sm:text-base"
        >
          Comment
        </button>
      </div>
    </div>
  );
};

export default AudioRecorder;
