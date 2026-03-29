import React, { useState } from 'react';
import { toast } from 'sonner';
import { pollAPI } from '../../utils/api';

const formatTimeAgo = (timestamp) => {
  if (!timestamp) return 'Unknown';
  const now = new Date();
  const time = new Date(timestamp);
  const diffInSeconds = Math.floor((now - time) / 1000);
  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
};

const PollPanel = ({
  sessionId,
  polls,
  activePoll,
  liveResponseCount,
  onlineCount,
  presentCount,
  stuckCount,
  wsRef,
  setActivePoll,
  setLiveResponseCount,
  onPollsChange,
}) => {
  const [newPoll, setNewPoll] = useState({
    question: '',
    options: ['', '', '', ''],
    correctAnswer: 0,
    justification: '',
    timeLimit: 60,
    difficulty: 1,
  });

  const updatePollOption = (index, value) => {
    const updatedOptions = [...newPoll.options];
    updatedOptions[index] = value;
    setNewPoll({ ...newPoll, options: updatedOptions });
  };

  const activatePoll = async (poll) => {
    try {
      const activatedPoll = await pollAPI.activatePoll(poll.id);
      setActivePoll(activatedPoll);
      setLiveResponseCount(0);
      onPollsChange();
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'activate-poll', sessionId, poll: activatedPoll }));
        toast.success('Poll activated and sent to students!');
      } else {
        toast.warning('Poll activated, but WebSocket is not connected.');
      }
    } catch (error) {
      console.error('Error activating poll:', error);
      toast.error('Failed to activate poll: ' + error.message);
    }
  };

  const handleCreatePoll = async (e) => {
    e.preventDefault();
    try {
      const pollData = {
        session_id: sessionId,
        question: newPoll.question,
        options: newPoll.options.filter(opt => opt.trim() !== ''),
        correct_answer: newPoll.correctAnswer,
        justification: newPoll.justification,
        time_limit: newPoll.timeLimit,
        difficulty: newPoll.difficulty || 1,
      };
      const data = await pollAPI.createPoll(pollData);
      setNewPoll({ question: '', options: ['', '', '', ''], correctAnswer: 0, justification: '', timeLimit: 60, difficulty: 1 });
      toast.success('Poll created!');
      await activatePoll(data);
      onPollsChange();
    } catch (error) {
      console.error('Error creating poll:', error);
      toast.error('Failed to create poll');
    }
  };

  const handleDeactivatePoll = async (pollId) => {
    try {
      await pollAPI.closePoll(pollId);
      setActivePoll(null);
      onPollsChange();
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'poll-deactivated', sessionId, pollId }));
      }
      toast.success('Poll ended');
    } catch (error) {
      console.error('Error deactivating poll:', error);
      toast.error('Failed to end poll');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Live participant count banner */}
      <div className="flex flex-wrap items-center gap-4 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm sm:text-base font-medium text-slate-700 dark:text-slate-300">
            <span className="font-bold text-green-600 dark:text-green-400">{onlineCount}</span> student{onlineCount !== 1 ? 's' : ''} online
          </span>
        </div>
        {presentCount > 0 && (
          <>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
              <span className="font-bold text-primary-600 dark:text-primary-400">{presentCount}</span> marked present
            </span>
          </>
        )}
        {stuckCount > 0 && (
          <>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span className="flex items-center gap-1.5 text-sm sm:text-base">
              <span className="font-bold text-orange-600 dark:text-orange-400">✋ {stuckCount}</span>
              <span className="text-slate-600 dark:text-slate-400">student{stuckCount !== 1 ? 's' : ''} stuck</span>
              <button
                onClick={() => wsRef.current?.send(JSON.stringify({ type: 'stuck-reset', sessionId }))}
                className="text-xs text-orange-600 dark:text-orange-400 border border-orange-300 dark:border-orange-600 rounded px-1.5 py-0.5 hover:bg-orange-50 dark:hover:bg-orange-900/20"
              >
                Clear
              </button>
            </span>
          </>
        )}
      </div>

      {/* Create New Poll Form */}
      <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 dark:text-white">Create New Poll</h3>
        <form onSubmit={handleCreatePoll} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Question *</label>
            <textarea
              value={newPoll.question}
              onChange={(e) => setNewPoll({ ...newPoll, question: e.target.value })}
              className="w-full p-2.5 sm:p-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm sm:text-base bg-white dark:bg-slate-700 dark:text-white"
              rows="3"
              placeholder="Enter your poll question..."
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Options *</label>
            {newPoll.options.map((option, index) => (
              <div key={index} className="flex items-center space-x-2 mb-2">
                <input
                  type="radio"
                  name="correctAnswer"
                  checked={newPoll.correctAnswer === index}
                  onChange={() => setNewPoll({ ...newPoll, correctAnswer: index })}
                  className="text-primary-600 w-4 h-4"
                />
                <input
                  type="text"
                  value={option}
                  onChange={(e) => updatePollOption(index, e.target.value)}
                  className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm sm:text-base bg-white dark:bg-slate-700 dark:text-white"
                  placeholder={`Option ${index + 1}`}
                  required={index < 2}
                />
              </div>
            ))}
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Select the correct answer by clicking the radio button
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Justification</label>
              <textarea
                value={newPoll.justification}
                onChange={(e) => setNewPoll({ ...newPoll, justification: e.target.value })}
                className="w-full p-2.5 sm:p-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm sm:text-base bg-white dark:bg-slate-700 dark:text-white"
                rows="2"
                placeholder="Explain why this is the correct answer..."
              />
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Time Limit (seconds)</label>
                <input
                  type="number"
                  value={newPoll.timeLimit}
                  onChange={(e) => setNewPoll({ ...newPoll, timeLimit: parseInt(e.target.value) })}
                  className="w-full p-2.5 sm:p-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm sm:text-base bg-white dark:bg-slate-700 dark:text-white"
                  min="10"
                  max="300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Difficulty</label>
                <div className="flex gap-2">
                  {[
                    { v: 1, label: 'Easy',   color: 'bg-green-100 text-green-700 border-green-300' },
                    { v: 2, label: 'Medium', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
                    { v: 3, label: 'Hard',   color: 'bg-red-100 text-red-700 border-red-300' },
                  ].map(d => (
                    <button
                      key={d.v}
                      type="button"
                      onClick={() => setNewPoll({ ...newPoll, difficulty: d.v })}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg border-2 transition-all ${
                        newPoll.difficulty === d.v ? `${d.color} border-current` : 'border-slate-200 text-slate-400 dark:border-slate-600'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full sm:w-auto bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white px-6 py-2.5 sm:py-3 rounded-lg font-medium text-sm sm:text-base"
          >
            Create Poll
          </button>
        </form>
      </div>

      {/* Active Polls */}
      <div>
        {polls.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400">No polls created yet.</p>
        ) : (
          <div className="space-y-4">
            {polls.filter(poll => poll.isActive).map((poll) => (
              <div key={poll.id} className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h4 className="font-medium text-slate-900 dark:text-white mb-2">{poll.question}</h4>
                    <div className="space-y-1">
                      {poll.options.map((option, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm ${
                            index === poll.correctAnswer
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                              : 'bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-400'
                          }`}>
                            {String.fromCharCode(65 + index)}
                          </span>
                          <span className={index === poll.correctAnswer ? 'font-medium text-green-800 dark:text-green-300' : 'text-slate-700 dark:text-slate-300'}>
                            {option}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      Responses: {poll.responses} • Created: {formatTimeAgo(poll.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleDeactivatePoll(poll.id)}
                      className="bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-800 dark:text-red-300 font-medium py-2 px-4 rounded-lg transition-colors duration-200"
                    >
                      End Poll
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PollPanel;
