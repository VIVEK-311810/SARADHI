import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { pollAPI } from '../../utils/api';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '../ui/alert-dialog';

const API_BASE_URL = process.env.REACT_APP_API_URL ;

const GeneratedMCQs = ({ sessionId, generatedMCQs, onMCQsSent }) => {
  const [mcqs, setMcqs] = useState([]);
  const [selectedMCQs, setSelectedMCQs] = useState(new Set());
  const [sendingIds, setSendingIds] = useState(new Set());
  const [editingMCQ, setEditingMCQ] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [sentIds, setSentIds] = useState(new Set());
  const [pollStats, setPollStats] = useState({});
  const [expiredIds, setExpiredIds] = useState(new Set());

  const [pollIds, setPollIds] = useState({});
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // Bulk sending queue system
  const [isBulkSending, setIsBulkSending] = useState(false);
  const [bulkQueue, setBulkQueue] = useState([]);
  const [currentBulkIndex, setCurrentBulkIndex] = useState(0);
  const [bulkSentIds, setBulkSentIds] = useState(new Set());

  const wsRef = useRef(null);
  const mountedRef = useRef(true);
  const activeIntervalsRef = useRef([]);
  const bulkRevealResolveRef = useRef(null); // Resolved when server sends reveal-answers during bulk send

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Clear all stat polling intervals on unmount
      activeIntervalsRef.current.forEach(({ intervalId, timeoutId }) => {
        clearInterval(intervalId);
        clearTimeout(timeoutId);
      });
      activeIntervalsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (window.socket) {
      wsRef.current = window.socket;
      setWsConnected(window.socket.readyState === WebSocket.OPEN);
    }

    if (generatedMCQs && Array.isArray(generatedMCQs)) {
      const mcqsWithIds = generatedMCQs.map((mcq, index) => ({
        ...mcq,
        tempId: mcq.id || `temp_${index}`,
        isEdited: false
      }));

      // filter out removed ones
      setMcqs(mcqsWithIds);
    }
  }, [generatedMCQs]);

  // Listen for reveal-answers to unblock bulk send waiting on server confirmation
  useEffect(() => {
    const handleWsMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'reveal-answers' && bulkRevealResolveRef.current) {
          bulkRevealResolveRef.current();
          bulkRevealResolveRef.current = null;
        }
      } catch {}
    };
    const ws = wsRef.current;
    if (ws) ws.addEventListener('message', handleWsMessage);
    return () => { if (ws) ws.removeEventListener('message', handleWsMessage); };
  }, [wsConnected]);


  const handleMCQSelection = (tempId) => {
    const newSelected = new Set(selectedMCQs);
    if (newSelected.has(tempId)) {
      newSelected.delete(tempId);
    } else {
      newSelected.add(tempId);
    }
    setSelectedMCQs(newSelected);
  };

  const handleSelectAll = () => {
    const unsentMCQs = mcqs.filter(m => !sentIds.has(m.tempId) && !bulkSentIds.has(m.tempId));
    if (selectedMCQs.size === unsentMCQs.length && selectedMCQs.size > 0) {
      setSelectedMCQs(new Set());
    } else {
      setSelectedMCQs(new Set(unsentMCQs.map(mcq => mcq.tempId)));
    }
  };

  const handleEditMCQ = (tempId) => {
    const mcq = mcqs.find(m => m.tempId === tempId);
    setEditingMCQ({ ...mcq });
  };

  const handleSaveEdit = async () => {
    // Persist edit to backend so it survives page refresh
    try {
      const token = localStorage.getItem('authToken');
      const options = Array.isArray(editingMCQ.options) ? editingMCQ.options : JSON.parse(editingMCQ.options);
      await fetch(`${API_BASE_URL}/generated-mcqs/${editingMCQ.tempId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          question: editingMCQ.question,
          options,
          correct_answer: editingMCQ.correct_answer,
          justification: editingMCQ.justification || '',
          time_limit: editingMCQ.time_limit || 60,
        }),
      });
    } catch (error) {
      console.error('Error persisting MCQ edit:', error);
      toast.warning('Edit saved locally but failed to sync with server');
    }

    setMcqs(mcqs.map(mcq =>
      mcq.tempId === editingMCQ.tempId
        ? { ...editingMCQ, isEdited: true }
        : mcq
    ));
    setEditingMCQ(null);
  };

  const handleCancelEdit = () => {
    setEditingMCQ(null);
  };

  const deleteMCQ = async (mcqId) => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE_URL}/generated-mcqs/${mcqId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete MCQ");
      }
    } catch (error) {
      console.error("Error deleting MCQ:", error);
    }
  };


  const handleDeleteMCQ = (tempId) => {
    setConfirmDeleteId(tempId);
  };

  const confirmDelete = () => {
    const tempId = confirmDeleteId;
    setMcqs(mcqs.filter(mcq => mcq.tempId !== tempId));
    const newSelected = new Set(selectedMCQs);
    newSelected.delete(tempId);
    setSelectedMCQs(newSelected);
    deleteMCQ(tempId);
    setConfirmDeleteId(null);
  };

  const handleClosePoll = async (tempId) => {
    try {
      const pollId = pollIds[tempId];
      if (pollId) {
        await pollAPI.closePoll(pollId);
      }
      setMcqs(mcqs.filter(mcq => mcq.tempId !== tempId));
      const newSelected = new Set(selectedMCQs);
      newSelected.delete(tempId);
      setSelectedMCQs(newSelected);
      deleteMCQ(tempId);
    } catch (error) {
      console.error("Error closing poll:", error);
      toast.error("Failed to close poll");
    }
  };


  const handleSendMCQ = async (mcq) => {
    setSendingIds(prev => new Set(prev).add(mcq.tempId));
    try {
      const pollData = {
        session_id: sessionId,
        question: mcq.question,
        options: Array.isArray(mcq.options) ? mcq.options : JSON.parse(mcq.options),
        correct_answer: mcq.correct_answer,
        justification: mcq.justification || '',
        time_limit: mcq.time_limit || 60
      };

      const createdPoll = await pollAPI.createPoll(pollData);
      const activatedPoll = await pollAPI.activatePoll(createdPoll.id);

      setPollIds(prev => ({ ...prev, [mcq.tempId]: createdPoll.id }));

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'activate-poll', sessionId, poll: activatedPoll }));
        toast.success('MCQ sent to students!');
      } else {
        toast.warning('MCQ activated but WebSocket not connected');
      }

      // ✅ mark this mcq as sent
      setSentIds(prev => new Set(prev).add(mcq.tempId));

      // ✅ fetch poll stats right after sending
      const intervalId = setInterval(async () => {
        if (!mountedRef.current) return;
        const stats = await pollAPI.getPollStats(createdPoll.id);
        if (mountedRef.current) {
          setPollStats(prev => ({ ...prev, [mcq.tempId]: stats.data }));
        }
      }, 3000);

      const timeoutId = setTimeout(() => {
        clearInterval(intervalId);
        activeIntervalsRef.current = activeIntervalsRef.current.filter(
          entry => entry.intervalId !== intervalId
        );
        if (mountedRef.current) {
          setExpiredIds(prev => new Set(prev).add(mcq.tempId));
        }
      }, createdPoll.time_limit * 1000);

      activeIntervalsRef.current.push({ intervalId, timeoutId });

      if (onMCQsSent) onMCQsSent();
    } catch (error) {
      toast.error('Error sending MCQ: ' + error.message);
    } finally {
      setSendingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(mcq.tempId);
        return newSet;
      });

    }
  };

  const handleSendSelectedMCQs = async () => {
    const selectedMCQsArray = mcqs.filter(mcq => selectedMCQs.has(mcq.tempId));

    if (selectedMCQsArray.length === 0) {
      toast.warning('Please select MCQs to send');
      return;
    }

    setIsBulkSending(true);
    setBulkQueue(selectedMCQsArray);
    setCurrentBulkIndex(0);
    setBulkSentIds(new Set());
    setSelectedMCQs(new Set()); // Clear selection immediately

    // Process queue sequentially
    for (let i = 0; i < selectedMCQsArray.length; i++) {
      if (!mountedRef.current) break; // Stop if component unmounted

      const mcq = selectedMCQsArray[i];
      if (mountedRef.current) setCurrentBulkIndex(i);

      await handleSendMCQ(mcq);
      if (!mountedRef.current) break;

      if (mountedRef.current) setBulkSentIds(prev => new Set(prev).add(mcq.tempId));

      // Wait for server reveal-answers WS message, with timeout fallback
      const maxWait = (mcq.time_limit || 60) * 1000 + 5000;
      await new Promise(resolve => {
        const fallback = setTimeout(() => {
          bulkRevealResolveRef.current = null;
          resolve();
        }, maxWait);
        bulkRevealResolveRef.current = () => {
          clearTimeout(fallback);
          // Small buffer after reveal before activating next poll
          setTimeout(resolve, 2000);
        };
      });
      if (!mountedRef.current) break;

      if (mountedRef.current) setMcqs(prev => prev.filter(m => m.tempId !== mcq.tempId));
    }

    if (mountedRef.current) {
      setIsBulkSending(false);
      setBulkQueue([]);
      setBulkSentIds(new Set());
      toast.success('All selected MCQs have been sent and completed!');
    }
  };


  if (!mcqs || mcqs.length === 0) {
    return (
      <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 dark:text-white">Generated MCQs</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base">No generated MCQs available. MCQs will appear here when generated from class transcripts.</p>
      </div>
    );
  }

  return (
    <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
        <h3 className="text-base sm:text-lg font-semibold dark:text-white">Generated MCQs ({mcqs.length})</h3>
        <div className="flex gap-2">
          <button
            onClick={handleSelectAll}
            disabled={isBulkSending || mcqs.filter(m => !sentIds.has(m.tempId) && !bulkSentIds.has(m.tempId)).length === 0}
            className="flex-1 sm:flex-none bg-slate-500 hover:bg-slate-600 active:bg-slate-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white px-3 py-2 sm:py-1 rounded text-xs sm:text-sm transition-colors"
          >
            {selectedMCQs.size === mcqs.filter(m => !sentIds.has(m.tempId) && !bulkSentIds.has(m.tempId)).length && selectedMCQs.size > 0 ? 'Deselect' : 'Select All'}
          </button>
          <button
            onClick={handleSendSelectedMCQs}
            disabled={isBulkSending || selectedMCQs.size === 0 || !wsConnected}
            className="flex-1 sm:flex-none bg-primary-600 hover:bg-primary-700 active:bg-primary-800 disabled:bg-slate-400 text-white px-3 sm:px-4 py-2 rounded font-medium text-xs sm:text-sm transition-colors"
            title={!wsConnected ? 'WebSocket disconnected' : (selectedMCQs.size === 0 ? 'Please select MCQs to send' : `Send ${selectedMCQs.size} MCQ${selectedMCQs.size > 1 ? 's' : ''} in queue`)}
          >
            {isBulkSending ? 'Sending...' : `Send (${selectedMCQs.size})`}
          </button>
        </div>
      </div>

      {/* WebSocket Status Indicator */}
      {!wsConnected && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mb-4">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-yellow-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="text-yellow-800 dark:text-yellow-300 text-sm">WebSocket disconnected - MCQs may not reach students in real-time</span>
          </div>
        </div>
      )}

      {/* Bulk Sending Progress Indicator */}
      {isBulkSending && bulkQueue.length > 0 && (
        <div className="bg-gradient-to-r from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-900/30 border-2 border-primary-400 dark:border-primary-700 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6 shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <div className="animate-spin rounded-full h-5 w-5 sm:h-6 sm:w-6 border-b-2 border-primary-600 flex-shrink-0"></div>
              <div className="min-w-0">
                <span className="text-primary-900 dark:text-primary-300 font-bold text-sm sm:text-lg">
                  📤 Sending: {currentBulkIndex + 1}/{bulkQueue.length}
                </span>
                <p className="text-xs sm:text-sm text-primary-700 dark:text-primary-400 mt-1 truncate">
                  {bulkQueue[currentBulkIndex]?.question.substring(0, 50)}...
                </p>
              </div>
            </div>
            <div className="text-left sm:text-right flex sm:block items-center gap-2">
              <div className="text-xl sm:text-2xl font-bold text-primary-600 dark:text-primary-400">
                {bulkQueue.length - currentBulkIndex - 1}
              </div>
              <div className="text-xs text-primary-600 dark:text-primary-400">remaining</div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="bg-primary-200 dark:bg-primary-800 rounded-full h-2 sm:h-3 overflow-hidden">
            <div
              className="bg-primary-600 h-full transition-all duration-500 ease-out"
              style={{ width: `${((currentBulkIndex + 1) / bulkQueue.length) * 100}%` }}
            ></div>
          </div>

          <p className="text-xs text-primary-600 dark:text-primary-400 mt-2 text-center">
            Please wait... MCQs are being sent automatically
          </p>
        </div>
      )}

      <div className="space-y-3 sm:space-y-4 max-h-80 sm:max-h-96 overflow-y-auto">
        {mcqs.filter(mcq => !bulkSentIds.has(mcq.tempId)).map((mcq, index) => (
          <div
            key={mcq.tempId}
            className={`border rounded-lg p-3 sm:p-4 transition-all ${
              bulkQueue[currentBulkIndex]?.tempId === mcq.tempId && isBulkSending
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 ring-2 ring-blue-300 dark:ring-blue-700 shadow-lg'
                : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
              <div className="flex items-center space-x-2 sm:space-x-3">
                {!sentIds.has(mcq.tempId) && !bulkSentIds.has(mcq.tempId) && (
                  <input
                    type="checkbox"
                    checked={selectedMCQs.has(mcq.tempId)}
                    onChange={() => handleMCQSelection(mcq.tempId)}
                    disabled={isBulkSending}
                    className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500 disabled:opacity-50"
                  />
                )}
                <div className="flex items-center space-x-2">
                  <span className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">MCQ {index + 1}</span>
                  {mcq.difficulty && (
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      mcq.difficulty === 1 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                      mcq.difficulty === 2 ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                                             'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    }`}>
                      {mcq.difficulty === 1 ? 'Easy' : mcq.difficulty === 2 ? 'Medium' : 'Hard'}
                    </span>
                  )}
                  {mcq.isEdited && (
                    <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded">Edited</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 ml-7 sm:ml-0">
                {!sentIds.has(mcq.tempId) && !bulkSentIds.has(mcq.tempId) ? (
                  <>
                    <button
                      onClick={() => handleEditMCQ(mcq.tempId)}
                      disabled={isBulkSending}
                      className="text-primary-600 hover:text-primary-800 active:text-primary-900 text-xs sm:text-sm disabled:opacity-50 py-1"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteMCQ(mcq.tempId)}
                      disabled={isBulkSending}
                      className="text-red-600 hover:text-red-800 active:text-red-900 text-xs sm:text-sm disabled:opacity-50 py-1"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => handleSendMCQ(mcq)}
                      disabled={isBulkSending || sendingIds.has(mcq.tempId) || !wsConnected}
                      className="bg-primary-600 hover:bg-primary-700 active:bg-primary-800 disabled:bg-slate-400 text-white px-2.5 sm:px-3 py-1 rounded text-xs sm:text-sm"
                    >
                      {sendingIds.has(mcq.tempId) ? "..." : "Send"}
                    </button>
                  </>
                ) : expiredIds.has(mcq.tempId) ? (
                  <button
                    onClick={() => handleClosePoll(mcq.tempId)}
                    className="bg-slate-600 hover:bg-slate-700 active:bg-slate-800 text-white px-2.5 sm:px-3 py-1 rounded text-xs sm:text-sm"
                  >
                    OK
                  </button>
                ) : (
                  <button
                    disabled
                    className="bg-red-500 text-white px-2.5 sm:px-3 py-1 rounded text-xs sm:text-sm cursor-not-allowed"
                  >
                    Sent
                  </button>
                )}
              </div>
            </div>

            <div className="mb-3">
              <h4 className="font-medium text-slate-800 dark:text-slate-200 mb-2 text-sm sm:text-base">{mcq.question}</h4>
              <div className="space-y-1">
                {(Array.isArray(mcq.options) ? mcq.options : JSON.parse(mcq.options)).map((option, optionIndex) => (
                  <div key={optionIndex} className={`text-xs sm:text-sm p-1.5 sm:p-2 rounded ${optionIndex === mcq.correct_answer
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 font-medium'
                    : 'bg-slate-50 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300'
                    }`}>
                    {String.fromCharCode(65 + optionIndex)}. {option}
                    {optionIndex === mcq.correct_answer && ' ✓'}
                  </div>
                ))}
              </div>
            </div>

            {mcq.justification && (
              <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 bg-primary-50 dark:bg-primary-900/20 p-2 rounded">
                <strong>Justification:</strong> {mcq.justification}
              </div>
            )}

            <div className="flex items-center gap-2 mt-2">
              <span className="inline-flex items-center gap-1 bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 text-xs font-medium px-2 py-1 rounded-full">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {mcq.time_limit || 60}s
              </span>
              {!sentIds.has(mcq.tempId) && !bulkSentIds.has(mcq.tempId) && (
                <span className="text-xs text-slate-400 dark:text-slate-500">(edit to change timer)</span>
              )}
            </div>
            {sentIds.has(mcq.tempId) && pollStats[mcq.tempId] && (
              <div className="mt-2 p-2 bg-slate-50 dark:bg-slate-700/50 rounded text-xs sm:text-sm text-slate-700 dark:text-slate-300 grid grid-cols-2 gap-1">
                <div>Answered: {pollStats[mcq.tempId].answered}</div>
                <div>Not Answered: {pollStats[mcq.tempId].not_answered}</div>
                <div className="col-span-2">Correct: {pollStats[mcq.tempId].correct_percentage}%</div>
              </div>
            )}

          </div>
        ))}
      </div>

      {/* Edit Modal */}
      {editingMCQ && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 dark:text-white">Edit MCQ</h3>

            <div className="space-y-3 sm:space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Question</label>
                <textarea
                  value={editingMCQ.question}
                  onChange={(e) => setEditingMCQ({ ...editingMCQ, question: e.target.value })}
                  className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm sm:text-base dark:bg-slate-700 dark:text-white"
                  rows="3"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Options</label>
                {(Array.isArray(editingMCQ.options) ? editingMCQ.options : JSON.parse(editingMCQ.options)).map((option, index) => (
                  <div key={index} className="flex items-center space-x-2 mb-2">
                    <input
                      type="radio"
                      name="correct_answer"
                      checked={editingMCQ.correct_answer === index}
                      onChange={() => setEditingMCQ({ ...editingMCQ, correct_answer: index })}
                      className="w-4 h-4 text-primary-600"
                    />
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => {
                        const currentOptions = Array.isArray(editingMCQ.options) ? editingMCQ.options : JSON.parse(editingMCQ.options);
                        const newOptions = [...currentOptions];
                        newOptions[index] = e.target.value;
                        setEditingMCQ({ ...editingMCQ, options: newOptions });
                      }}
                      className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm sm:text-base dark:bg-slate-700 dark:text-white"
                      placeholder={`Option ${String.fromCharCode(65 + index)}`}
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Justification</label>
                <textarea
                  value={editingMCQ.justification || ''}
                  onChange={(e) => setEditingMCQ({ ...editingMCQ, justification: e.target.value })}
                  className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm sm:text-base dark:bg-slate-700 dark:text-white"
                  rows="2"
                  placeholder="Explain why this question is important..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Timer Duration
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {[30, 60, 90, 120, 180].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setEditingMCQ({ ...editingMCQ, time_limit: preset })}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        (editingMCQ.time_limit || 60) === preset
                          ? 'bg-orange-500 text-white border-orange-500'
                          : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-orange-400 hover:text-orange-600'
                      }`}
                    >
                      {preset < 60 ? `${preset}s` : `${preset / 60}min${preset > 60 ? ` (${preset}s)` : ''}`}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={editingMCQ.time_limit || 60}
                    onChange={(e) => setEditingMCQ({ ...editingMCQ, time_limit: Math.max(10, Math.min(600, parseInt(e.target.value) || 60)) })}
                    className="w-32 p-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm sm:text-base dark:bg-slate-700 dark:text-white"
                    min="10"
                    max="600"
                  />
                  <span className="text-sm text-slate-500 dark:text-slate-400">seconds (10–600)</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4 sm:mt-6">
              <button
                onClick={handleCancelEdit}
                className="bg-slate-500 hover:bg-slate-600 active:bg-slate-700 text-white px-3 sm:px-4 py-2 rounded text-sm sm:text-base"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white px-3 sm:px-4 py-2 rounded text-sm sm:text-base"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete MCQ Confirmation Dialog */}
      <AlertDialog open={!!confirmDeleteId} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete MCQ?</AlertDialogTitle>
            <AlertDialogDescription>
              This MCQ will be permanently removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDeleteId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default GeneratedMCQs;
