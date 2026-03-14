import React, { useState, useEffect } from 'react';

const DIFFICULTY_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const DIFFICULTY_COLOR = {
  1: 'bg-green-100 text-green-700 border-green-200',
  2: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  3: 'bg-red-100 text-red-700 border-red-200'
};

function StatusBar({ status, isMyQuestionTurn, isMyAnswerTurn }) {
  if (isMyQuestionTurn) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold animate-pulse">
        <span>&#128483;</span>
        <span>YOUR TURN — Read your question aloud!</span>
      </div>
    );
  }
  if (isMyAnswerTurn) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold animate-pulse">
        <span>&#128172;</span>
        <span>YOUR TURN — Read the answer!</span>
      </div>
    );
  }
  if (status === 'vote') {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-sm font-semibold">
        <span>&#128077;</span>
        <span>Vote on the answer — did you understand it?</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-sm">
      <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse inline-block" />
      Waiting for teacher...
    </div>
  );
}

const KnowledgeCard = ({ card, activeState, currentUserId, onVote, onClose }) => {
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [voted, setVoted] = useState(null);
  const [status, setStatus] = useState('waiting'); // waiting | question | answer | vote | done

  // card: { questions: [{pairId, questionText, difficulty, orderIndex}], answers: [{pairId, answerText, ...}] }
  // activeState: { type: 'question'|'answer'|'vote'|'complete', pairId, questionHolderId, answerHolderId }

  const activePairId = activeState?.pairId;
  const myQuestion = card?.questions?.find(q => q.pairId === activePairId);
  const myAnswer = card?.answers?.find(a => a.pairId === activePairId);

  const isMyQuestionTurn = activeState?.type === 'question' && activeState?.questionHolderId === currentUserId;
  const isMyAnswerTurn = activeState?.type === 'answer' && activeState?.answerHolderId === currentUserId;
  const showVoting = activeState?.type === 'vote';
  const isComplete = activeState?.type === 'complete';

  // Reset reveal when a new pair becomes active
  useEffect(() => {
    setAnswerRevealed(false);
    setVoted(null);
  }, [activePairId]);

  // Auto-reveal answer when it's my turn to read it
  useEffect(() => {
    if (isMyAnswerTurn) setAnswerRevealed(true);
  }, [isMyAnswerTurn]);

  const handleVote = (vote) => {
    if (voted) return;
    setVoted(vote);
    onVote && onVote(activePairId, vote);
  };

  // All questions the student holds
  const allMyQuestions = card?.questions || [];
  const allMyAnswers = card?.answers || [];

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border-2 transition-all duration-300
        ${isMyQuestionTurn ? 'border-blue-500 shadow-blue-200 dark:shadow-blue-900/40' : ''}
        ${isMyAnswerTurn ? 'border-green-500 shadow-green-200 dark:shadow-green-900/40' : ''}
        ${!isMyQuestionTurn && !isMyAnswerTurn ? 'border-gray-200 dark:border-gray-600' : ''}
        `}
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-xl">&#127183;</span>
            <span className="font-bold text-gray-900 dark:text-gray-100">Knowledge Cards</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium border border-yellow-200">
              LIVE
            </span>
          </div>
        </div>

        {/* Status Bar */}
        <div className="px-4 pt-3">
          <StatusBar
            status={showVoting ? 'vote' : status}
            isMyQuestionTurn={isMyQuestionTurn}
            isMyAnswerTurn={isMyAnswerTurn}
          />
        </div>

        <div className="p-4 space-y-4">
          {/* Active pair — Question section */}
          {activePairId && myQuestion && (
            <div className={`rounded-xl border-2 p-4 transition-all duration-300
              ${isMyQuestionTurn
                ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 shadow-md'
                : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50'
              }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Your Question
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${DIFFICULTY_COLOR[myQuestion.difficulty] || DIFFICULTY_COLOR[1]}`}>
                  {DIFFICULTY_LABEL[myQuestion.difficulty] || 'Easy'}
                </span>
              </div>
              <p className="text-base font-medium text-gray-900 dark:text-gray-100 leading-relaxed">
                {myQuestion.questionText}
              </p>
              {!isMyQuestionTurn && (
                <p className="text-xs text-gray-400 mt-2">Teacher will ask you to read this when it's your turn.</p>
              )}
            </div>
          )}

          {/* Active pair — Answer section */}
          {activePairId && myAnswer && (
            <div className={`rounded-xl border-2 p-4 transition-all duration-300
              ${isMyAnswerTurn
                ? 'border-green-400 bg-green-50 dark:bg-green-900/20 shadow-md'
                : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50'
              }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Your Answer (for another question)
                </span>
              </div>
              {answerRevealed ? (
                <p className="text-base font-medium text-gray-900 dark:text-gray-100 leading-relaxed">
                  {myAnswer.answerText}
                </p>
              ) : (
                <button
                  onClick={() => setAnswerRevealed(true)}
                  className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-500 rounded-lg text-gray-400 dark:text-gray-500 text-sm hover:border-green-400 hover:text-green-600 transition-colors"
                >
                  &#128065; Tap to reveal your answer
                </button>
              )}
            </div>
          )}

          {/* No active pair yet — show waiting + card summary */}
          {!activePairId && (
            <div className="text-center py-4">
              <p className="text-3xl mb-2">&#127183;</p>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Cards distributed! Teacher will start the activity soon.</p>
            </div>
          )}

          {/* Voting section */}
          {showVoting && activePairId && !voted && (
            <div className="rounded-xl border border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20 p-4">
              <p className="text-sm font-semibold text-purple-800 dark:text-purple-300 mb-3 text-center">
                Did you understand that answer?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleVote('up')}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-100 hover:bg-green-200 border border-green-300 text-green-700 rounded-lg font-medium text-sm transition-colors"
                >
                  <span className="text-xl">&#128077;</span> Yes, got it!
                </button>
                <button
                  onClick={() => handleVote('down')}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-100 hover:bg-red-200 border border-red-300 text-red-700 rounded-lg font-medium text-sm transition-colors"
                >
                  <span className="text-xl">&#128078;</span> Need more clarity
                </button>
              </div>
            </div>
          )}

          {voted && (
            <div className="text-center py-2 text-sm text-gray-600 dark:text-gray-400">
              {voted === 'up' ? '&#128077; Vote submitted!' : '&#128078; Feedback noted!'}
            </div>
          )}

          {/* My cards summary */}
          <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Your Cards This Round</p>
            <div className="space-y-1">
              {allMyQuestions.map((q, i) => (
                <div key={q.pairId} className={`text-xs px-2 py-1 rounded flex items-center gap-2
                  ${q.pairId === activePairId ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}
                `}>
                  <span className="w-4 h-4 bg-blue-200 dark:bg-blue-800 rounded-full flex items-center justify-center font-bold text-blue-700 dark:text-blue-300 flex-shrink-0">Q</span>
                  <span className="truncate">{q.questionText.substring(0, 50)}...</span>
                </div>
              ))}
              {allMyAnswers.map((a, i) => (
                <div key={`a-${a.pairId}`} className={`text-xs px-2 py-1 rounded flex items-center gap-2
                  ${a.pairId === activePairId ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'text-gray-500 dark:text-gray-400'}
                `}>
                  <span className="w-4 h-4 bg-green-200 dark:bg-green-800 rounded-full flex items-center justify-center font-bold text-green-700 dark:text-green-300 flex-shrink-0">A</span>
                  <span className="truncate">Answer for another question</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeCard;
