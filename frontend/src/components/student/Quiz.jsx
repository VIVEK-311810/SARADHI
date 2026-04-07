import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest } from '../../utils/api';
import Leaderboard from './Leaderboard';

const Quiz = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [polls, setPolls] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [answers, setAnswers] = useState([]);
  const [quizDone, setQuizDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [shuffle, setShuffle] = useState(false);
  const [sessionTitle, setSessionTitle] = useState('');

  useEffect(() => {
    fetchPolls();
  }, [sessionId]);

  const shuffleArray = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const fetchPolls = async () => {
    try {
      setLoading(true);

      // Fetch session info for title
      try {
        const sessionData = await apiRequest(`/sessions/${sessionId}`);
        setSessionTitle(sessionData?.data?.title || sessionData?.session?.title || sessionData?.title || '');
      } catch (_) {}

      const data = await apiRequest(`/sessions/${sessionId}/polls`);
      const raw = data.polls || data;

      const normalized = Array.isArray(raw)
        ? raw
            .map((p) => ({
              ...p,
              correctAnswer: p.correctAnswer !== undefined ? p.correctAnswer : p.correct_answer,
              options: Array.isArray(p.options)
                ? p.options
                : typeof p.options === 'string'
                ? JSON.parse(p.options)
                : [],
            }))
            .filter((p) => p.correctAnswer !== null && p.correctAnswer !== undefined)
        : [];

      setPolls(normalized);
    } catch (err) {
      console.error('Error loading quiz:', err);
      setPolls([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleShuffle = () => {
    const next = !shuffle;
    setShuffle(next);
    if (next) setPolls((prev) => shuffleArray(prev));
    else fetchPolls(); // restore original order
  };

  const handleSubmit = () => {
    if (selectedOption === null) return;
    const poll = polls[currentIndex];
    setAnswers((prev) => [
      ...prev,
      {
        pollId: poll.id,
        question: poll.question,
        options: poll.options,
        correctAnswer: poll.correctAnswer,
        justification: poll.justification,
        selected: selectedOption,
        isCorrect: selectedOption === poll.correctAnswer,
      },
    ]);
    setSubmitted(true);
  };

  const handleNext = () => {
    if (currentIndex + 1 >= polls.length) {
      setQuizDone(true);
    } else {
      setCurrentIndex((i) => i + 1);
      setSelectedOption(null);
      setSubmitted(false);
    }
  };

  const handleRetry = () => {
    setCurrentIndex(0);
    setSelectedOption(null);
    setSubmitted(false);
    setAnswers([]);
    setQuizDone(false);
    if (shuffle) setPolls((prev) => shuffleArray(prev));
  };

  const getOptionStyle = (index) => {
    const poll = polls[currentIndex];
    const base = 'w-full text-left px-3 sm:px-4 py-3 sm:py-4 rounded-lg border-2 transition-colors flex items-start gap-2 sm:gap-3';
    if (!submitted) {
      return `${base} ${
        selectedOption === index
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-900 dark:text-primary-300'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/50'
      }`;
    }
    if (index === poll.correctAnswer) return `${base} border-green-500 bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-300`;
    if (index === selectedOption) return `${base} border-red-400 bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-300`;
    return `${base} border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500`;
  };

  const getScoreColor = (pct) => {
    if (pct >= 70) return 'text-green-600';
    if (pct >= 50) return 'text-yellow-500';
    return 'text-red-500';
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center p-4 min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-400 text-sm sm:text-base">Loading quiz...</p>
        </div>
      </div>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  if (polls.length === 0) {
    return (
      <div className="flex items-center justify-center p-4 min-h-[60vh]">
        <div className="max-w-md w-full bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-6 sm:p-8 text-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 sm:w-8 sm:h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mb-2">No Quiz Available Yet</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base mb-6">
            Questions will appear here after your teacher activates polls in a live session.
          </p>
          <button
            onClick={() => navigate('/student/dashboard')}
            className="px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 active:bg-primary-800 text-sm sm:text-base"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── Results screen ───────────────────────────────────────────────────────
  if (quizDone) {
    const correct = answers.filter((a) => a.isCorrect).length;
    const total = answers.length;
    const pct = Math.round((correct / total) * 100);

    return (
      <div className="py-6 sm:py-10 px-4">
        <div className="max-w-2xl mx-auto">
          {/* Score card */}
          <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-6 sm:p-8 text-center mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-4">Quiz Complete!</h1>
            <div className={`text-5xl sm:text-6xl font-bold mb-2 ${getScoreColor(pct)}`}>
              {pct}%
            </div>
            <p className="text-slate-600 dark:text-slate-400 text-base sm:text-lg mb-6">
              {correct} out of {total} correct
            </p>
            {/* Score bar */}
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 mb-6">
              <div
                className={`h-3 rounded-full transition-all ${pct >= 70 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                style={{ width: `${pct}%` }}
              ></div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={handleRetry}
                className="px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 active:bg-primary-800 font-medium text-sm sm:text-base"
              >
                Retry Quiz
              </button>
              <button
                onClick={() => navigate(`/student/session/${sessionId}/history`)}
                className="px-6 py-2.5 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 active:bg-slate-100 dark:active:bg-slate-600 font-medium text-sm sm:text-base"
              >
                Back to Session
              </button>
            </div>
          </div>

          {/* Q&A review */}
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-3">Review Answers</h2>
          <div className="space-y-3 sm:space-y-4">
            {answers.map((a, qi) => (
              <div key={qi} className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-sm rounded-xl border border-slate-200/60 dark:border-slate-700/60 p-4 sm:p-5">
                <div className="flex items-start gap-3 mb-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${a.isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {a.isCorrect ? '✓' : '✗'}
                  </span>
                  <p className="font-medium text-slate-900 dark:text-white text-sm sm:text-base">{a.question}</p>
                </div>
                <div className="space-y-1.5 ml-9">
                  {a.options.map((opt, i) => (
                    <div key={i} className={`flex items-start gap-2 text-xs sm:text-sm rounded px-2 py-1 ${
                      i === a.correctAnswer ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 font-medium' :
                      i === a.selected && !a.isCorrect ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'
                    }`}>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                        i === a.correctAnswer ? 'bg-green-200 text-green-800' :
                        i === a.selected && !a.isCorrect ? 'bg-red-200 text-red-700' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                      }`}>
                        {String.fromCharCode(65 + i)}
                      </span>
                      {opt}
                      {i === a.selected && i !== a.correctAnswer && (
                        <span className="ml-auto text-red-500 text-xs flex-shrink-0">Your answer</span>
                      )}
                      {i === a.correctAnswer && (
                        <span className="ml-auto text-green-600 text-xs flex-shrink-0">Correct</span>
                      )}
                    </div>
                  ))}
                </div>
                {a.justification && (
                  <div className="mt-3 ml-9 p-2 sm:p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-100 dark:border-primary-800">
                    <p className="text-xs sm:text-sm text-primary-900 dark:text-primary-300">
                      <span className="font-medium">Explanation: </span>{a.justification}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Session Leaderboard */}
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-3 mt-8">
            How You Stack Up — Session Leaderboard
          </h2>
          <Leaderboard sessionId={sessionId} embedded={true} />

          {/* Post-quiz navigation */}
          <div className="flex flex-col sm:flex-row gap-3 mt-6">
            <button
              onClick={handleRetry}
              className="flex-1 py-2.5 px-6 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 active:bg-primary-800 transition-colors text-sm sm:text-base"
            >
              Retake Quiz
            </button>
            <button
              onClick={() => navigate('/student/dashboard')}
              className="flex-1 py-2.5 px-6 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm sm:text-base"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Quiz screen ──────────────────────────────────────────────────────────
  const poll = polls[currentIndex];
  const progress = ((currentIndex) / polls.length) * 100;
  const isLast = currentIndex + 1 === polls.length;

  return (
    <div className="py-4 sm:py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 sm:mb-6 gap-3">
          <button
            onClick={() => navigate(`/student/session/${sessionId}/history`)}
            className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm sm:text-base py-1"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline">Back</span>
          </button>

          <div className="text-center flex-1">
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium truncate">
              {sessionTitle || 'Practice Quiz'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Question {currentIndex + 1} of {polls.length}
            </p>
          </div>

          <button
            onClick={handleToggleShuffle}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border text-xs sm:text-sm font-medium transition-colors ${
              shuffle
                ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="hidden sm:inline">Shuffle</span>
            <span className="sm:hidden">{shuffle ? 'On' : 'Off'}</span>
          </button>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 mb-5 sm:mb-6">
          <div
            className="h-2 bg-primary-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          ></div>
        </div>

        {/* Question card */}
        <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6 mb-4">
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-4 sm:mb-5 leading-snug">
            {poll.question}
          </h2>

          {/* Options */}
          <div className="space-y-2 sm:space-y-3">
            {poll.options.map((option, index) => (
              <button
                key={index}
                onClick={() => !submitted && setSelectedOption(index)}
                disabled={submitted}
                className={getOptionStyle(index)}
              >
                <span className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold flex-shrink-0 ${
                  submitted && index === poll.correctAnswer ? 'bg-green-200 text-green-800' :
                  submitted && index === selectedOption && index !== poll.correctAnswer ? 'bg-red-200 text-red-700' :
                  selectedOption === index && !submitted ? 'bg-primary-200 text-primary-800' :
                  'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                }`}>
                  {String.fromCharCode(65 + index)}
                </span>
                <span className="text-sm sm:text-base leading-snug">{option}</span>
                {submitted && index === poll.correctAnswer && (
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 ml-auto flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
          </div>

          {/* Justification — shown after submit */}
          {submitted && poll.justification && (
            <div className="mt-4 p-3 sm:p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 rounded-lg">
              <p className="text-xs sm:text-sm text-primary-900 dark:text-primary-300">
                <span className="font-semibold">Explanation: </span>{poll.justification}
              </p>
            </div>
          )}
        </div>

        {/* Result label */}
        {submitted && (
          <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg mb-4 text-sm sm:text-base font-medium ${
            selectedOption === poll.correctAnswer
              ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800'
          }`}>
            {selectedOption === poll.correctAnswer ? (
              <>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Correct! Well done.
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                Incorrect — the correct answer is {String.fromCharCode(65 + poll.correctAnswer)}.
              </>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          {!submitted ? (
            <button
              onClick={handleSubmit}
              disabled={selectedOption === null}
              className="w-full py-3 sm:py-3.5 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 active:bg-primary-800 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors text-sm sm:text-base"
            >
              Submit Answer
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="w-full py-3 sm:py-3.5 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 active:bg-primary-800 transition-colors text-sm sm:text-base"
            >
              {isLast ? 'Finish Quiz' : 'Next Question →'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Quiz;
