import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { apiRequest, safeParseUser } from '../../utils/api';
import { isDemoMode } from '../../utils/demoData';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

// WebSocket URL — same pattern as EnhancedStudentSession.jsx
const WS_BASE_URL = process.env.REACT_APP_API_URL
  ? process.env.REACT_APP_API_URL.replace('http://', 'ws://').replace('https://', 'wss://').replace('/api', '')
  : 'wss://vk-edu-b2.onrender.com';

// ── Helpers ──────────────────────────────────────────────────────────────────

function MedalIcon({ rank }) {
  if (rank === 1) return <span className="text-2xl">🥇</span>;
  if (rank === 2) return <span className="text-2xl">🥈</span>;
  if (rank === 3) return <span className="text-2xl">🥉</span>;
  return <span className="text-sm font-bold text-slate-500">#{rank}</span>;
}

function ConnectionDot({ status }) {
  const map = {
    connected:    'bg-teal-400',
    connecting:   'bg-yellow-400 animate-pulse',
    disconnected: 'bg-red-400',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${map[status] || 'bg-slate-400'}`} />;
}

// ── Live Leaderboard Panel ────────────────────────────────────────────────────

function LiveLeaderboardPanel({ scores, currentUserId }) {
  const sorted = [...(scores || [])].sort((a, b) => b.score - a.score);

  const rankBg = (i) => {
    if (i === 0) return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700';
    if (i === 1) return 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-500';
    if (i === 2) return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700';
    return 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700';
  };

  const maxScore = sorted[0]?.score || 1;

  return (
    <div className="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl shadow-glass flex flex-col h-fit">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200/60 dark:border-slate-700/60">
        <span className="text-base">🏆</span>
        <h3 className="font-semibold text-slate-900 dark:text-white text-sm flex-1">Leaderboard</h3>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </span>
      </div>

      {/* Ranked list */}
      <div className="overflow-y-auto max-h-[360px]">
        {sorted.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">No scores yet</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {sorted.map((p, i) => {
              const isMe = String(p.student_id) === String(currentUserId);
              const initials = (p.display_name || 'S')[0].toUpperCase();
              const barPct = maxScore > 0 ? Math.round((p.score / maxScore) * 100) : 0;
              return (
                <li
                  key={p.student_id}
                  className={`flex items-center gap-2.5 px-3 py-2.5 transition-colors ${isMe ? 'bg-primary-50/60 dark:bg-primary-900/20' : ''}`}
                  style={{ transition: 'background-color 0.3s ease' }}
                >
                  {/* Rank badge */}
                  <span className={`flex-shrink-0 w-6 h-6 rounded-lg border text-xs font-black flex items-center justify-center ${rankBg(i)}`}>
                    {i < 3 ? ['1','2','3'][i] : i + 1}
                  </span>

                  {/* Avatar initials */}
                  <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                    ${isMe ? 'bg-primary-600 text-white' : 'bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300'}`}>
                    {initials}
                  </div>

                  {/* Name + progress */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold truncate leading-none ${isMe ? 'text-primary-700 dark:text-primary-300' : 'text-slate-800 dark:text-slate-200'}`}>
                      {p.display_name || `Player ${p.student_id}`}
                      {isMe && <span className="ml-1 font-normal text-primary-400 text-[10px]">(you)</span>}
                    </p>
                    {/* Score progress bar */}
                    <div className="mt-1 h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full"
                        style={{ width: `${barPct}%`, transition: 'width 0.5s ease' }}
                      />
                    </div>
                  </div>

                  {/* Score */}
                  <span className={`flex-shrink-0 text-sm font-black ${isMe ? 'text-primary-600 dark:text-primary-400' : 'text-slate-700 dark:text-slate-300'}`}>
                    {p.score}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function WaitingPhase({ roomInfo, participants, currentUser, onStart, starting }) {
  const players    = participants.filter(p => p.role === 'player');
  const spectators = participants.filter(p => p.role === 'spectator');
  const isCreator  = String(roomInfo?.created_by) === String(currentUser?.id);

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-8">
      {/* Header banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary-600 to-primary-800 p-6 text-white shadow-glow-primary">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="relative z-10">
          <p className="text-primary-200 text-xs font-medium uppercase tracking-wider mb-1">Competition Room</p>
          <h1 className="text-2xl font-bold font-display">{roomInfo?.session_title || 'Quiz Competition'}</h1>
          <p className="text-primary-200 text-sm mt-1">{roomInfo?.course_name || ''}</p>
        </div>
      </div>

      {/* Room code */}
      <div className="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl p-6 text-center shadow-glass">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Room Code</p>
        <p className="text-5xl font-mono font-black text-primary-600 dark:text-primary-400 tracking-widest">{roomInfo?.room_code}</p>
        <p className="text-xs text-slate-400 mt-2">Share this code with classmates</p>
      </div>

      {/* Participants */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Players */}
        <div className="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl p-4 shadow-glass">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">⚔</span>
            <h3 className="font-semibold text-slate-900 dark:text-white">Players</h3>
            <Badge variant="primary" className="ml-auto">{players.length}</Badge>
          </div>
          {players.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-3">No players yet</p>
          ) : (
            <ul className="space-y-1.5">
              {players.map(p => (
                <li key={p.student_id} className="flex items-center gap-2 text-sm">
                  <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary-700 dark:text-primary-300 text-xs font-bold">
                      {(p.display_name || 'S')[0].toUpperCase()}
                    </span>
                  </div>
                  <span className="text-slate-800 dark:text-slate-200 truncate">{p.display_name || `Student ${p.student_id}`}</span>
                  {String(p.student_id) === String(currentUser?.id) && (
                    <span className="text-xs text-primary-500 ml-auto font-medium">you</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Spectators */}
        <div className="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl p-4 shadow-glass">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">👁</span>
            <h3 className="font-semibold text-slate-900 dark:text-white">Spectators</h3>
            <Badge variant="secondary" className="ml-auto">{spectators.length}</Badge>
          </div>
          {spectators.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-3">No spectators</p>
          ) : (
            <ul className="space-y-1.5">
              {spectators.map(p => (
                <li key={p.student_id} className="flex items-center gap-2 text-sm">
                  <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                    <span className="text-slate-500 text-xs font-bold">
                      {(p.display_name || 'S')[0].toUpperCase()}
                    </span>
                  </div>
                  <span className="text-slate-600 dark:text-slate-400 truncate">{p.display_name || `Student ${p.student_id}`}</span>
                  {String(p.student_id) === String(currentUser?.id) && (
                    <span className="text-xs text-slate-400 ml-auto font-medium">you</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Start / waiting */}
      <div className="text-center">
        {isCreator ? (
          <Button
            size="lg"
            onClick={onStart}
            disabled={starting || players.length === 0}
            className="bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white px-10"
          >
            {starting ? 'Starting…' : '▶ Start Quiz'}
          </Button>
        ) : (
          <div className="flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-primary-400 animate-pulse" />
            <span className="text-sm">Waiting for {roomInfo?.creator_name || 'the host'} to start…</span>
          </div>
        )}
      </div>
    </div>
  );
}

function CircularTimer({ timeLeft, totalTime }) {
  const safeTotalTime = totalTime > 0 ? totalTime : 20;
  const pct = Math.max(0, Math.min(100, (timeLeft / safeTotalTime) * 100));
  const size = 72;
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - pct / 100);
  const isUrgent = timeLeft <= 5 && timeLeft > 0;
  const strokeColor = pct > 50 ? '#2dd4bf' : pct > 25 ? '#facc15' : '#f87171';
  const textColor = pct > 50 ? 'text-teal-300' : pct > 25 ? 'text-yellow-300' : 'text-red-300';

  return (
    <div className={`relative flex-shrink-0 ${isUrgent ? 'animate-pulse' : ''}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" style={{ display: 'block' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: 'stroke-dashoffset 0.45s linear, stroke 0.3s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-black font-mono leading-none text-2xl ${textColor}`}>{timeLeft}</span>
        <span className="text-white/50 text-xs leading-none mt-0.5">sec</span>
      </div>
    </div>
  );
}

function ActivePhase({ question, timeLeft, totalTime, myRole, selectedOption, hasAnswered, onAnswer, scores, answeredCount, currentUserId }) {
  const OPTIONS = ['A', 'B', 'C', 'D'];
  const isSpectator = myRole === 'spectator';
  const safeTotalTime = totalTime > 0 ? totalTime : 20;
  const pct = Math.max(0, Math.min(100, (timeLeft / safeTotalTime) * 100));
  const barColor = pct > 50 ? 'bg-teal-500' : pct > 25 ? 'bg-yellow-400' : 'bg-red-500';

  return (
    <div className="max-w-6xl mx-auto pb-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main question area */}
        <div className="lg:col-span-2 space-y-4">
          {/* Question header — timer + progress bar + question text */}
          <div className="rounded-2xl bg-gradient-to-r from-primary-600 to-primary-800 p-5 text-white shadow-glow-primary">
            {/* Top row: label + circular timer */}
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex-1">
                <p className="text-primary-200 text-xs font-semibold uppercase tracking-wider mb-1">
                  Question {question.questionIndex + 1} / {question.totalQuestions}
                </p>
                <p className="text-lg sm:text-xl font-semibold leading-snug">{question.question_text}</p>
              </div>
              <CircularTimer timeLeft={timeLeft} totalTime={safeTotalTime} />
            </div>
            {/* Progress bar */}
            <div className="h-2.5 bg-black/20 rounded-full overflow-hidden mt-3">
              <div
                className={`h-full rounded-full ${barColor}`}
                style={{ width: `${pct}%`, transition: 'width 0.45s linear, background-color 0.3s ease' }}
              />
            </div>
          </div>

          {/* Answer options */}
          <div className={`space-y-3 ${isSpectator ? 'pointer-events-none opacity-75' : ''}`}>
            {(question.options || []).map((opt, idx) => {
              const letter = OPTIONS[idx];
              const isSelected = selectedOption === letter;
              let optClass = 'border-slate-200/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-800/80 hover:border-primary-400 hover:bg-primary-50/60 dark:hover:bg-primary-900/20';
              if (hasAnswered && isSelected) {
                optClass = 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 ring-2 ring-primary-400';
              } else if (hasAnswered) {
                optClass = 'border-slate-200/60 dark:border-slate-700/60 bg-white/60 dark:bg-slate-800/60 opacity-60';
              }
              return (
                <button
                  key={letter}
                  onClick={() => !hasAnswered && !isSpectator && onAnswer(letter)}
                  disabled={hasAnswered || isSpectator}
                  className={`w-full text-left rounded-xl border-2 p-4 transition-all duration-200 cursor-pointer ${optClass}`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold
                      ${hasAnswered && isSelected
                        ? 'bg-primary-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                      {letter}
                    </span>
                    <span className="text-sm sm:text-base text-slate-800 dark:text-slate-200 leading-snug pt-0.5">{opt}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {hasAnswered && (
            <p className="text-center text-sm text-teal-600 dark:text-teal-400 font-medium animate-fade-up">
              ✓ Answer locked in — waiting for result…
            </p>
          )}
          {isSpectator && (
            <p className="text-center text-xs text-slate-400 italic">You are watching as a spectator</p>
          )}
        </div>

        {/* Right panel: leaderboard for spectators, answered counter for players */}
        {isSpectator ? (
          <LiveLeaderboardPanel scores={scores} currentUserId={currentUserId} />
        ) : (
          <div className="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl p-5 shadow-glass h-fit space-y-4">
            <div className="text-center">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Answered</p>
              <p className="text-4xl font-black text-primary-600 dark:text-primary-400">
                {answeredCount.answered}
                <span className="text-xl text-slate-400 font-medium">/{answeredCount.total || '?'}</span>
              </p>
              {answeredCount.total > 0 && (
                <div className="mt-2 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (answeredCount.answered / answeredCount.total) * 100)}%` }}
                  />
                </div>
              )}
            </div>
            <div className="border-t border-slate-100 dark:border-slate-700 pt-3 text-center">
              <span className="text-2xl">🔒</span>
              <p className="text-xs text-slate-400 mt-1">Scores revealed<br />after time's up</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RevealPhase({ reveal, myRole, selectedOption }) {
  const OPTIONS = ['A', 'B', 'C', 'D'];
  const correctIdx = typeof reveal.correct_index === 'number' ? reveal.correct_index : -1;
  const correctLetter = correctIdx >= 0 ? OPTIONS[correctIdx] : null;

  return (
    <div className="max-w-6xl mx-auto pb-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl bg-gradient-to-r from-primary-600 to-primary-800 p-5 text-white">
            <p className="text-primary-200 text-xs font-semibold uppercase tracking-wider mb-2">Answer Revealed</p>
            <p className="text-lg sm:text-xl font-semibold">{reveal.question_text}</p>
          </div>
          <div className={`space-y-3 pointer-events-none ${myRole === 'spectator' ? 'opacity-75' : ''}`}>
            {(reveal.options || []).map((opt, idx) => {
              const letter = OPTIONS[idx];
              const isCorrect = letter === correctLetter;
              const isMyAnswer = letter === selectedOption;
              let cls = 'border-slate-200/60 dark:border-slate-700/60 bg-white/60 dark:bg-slate-800/60 opacity-60';
              if (isCorrect) cls = 'border-teal-500 bg-teal-50 dark:bg-teal-900/30 ring-2 ring-teal-400';
              else if (isMyAnswer && !isCorrect) cls = 'border-red-400 bg-red-50 dark:bg-red-900/30 opacity-80';
              return (
                <div key={letter} className={`w-full rounded-xl border-2 p-4 ${cls}`}>
                  <div className="flex items-start gap-3">
                    <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold
                      ${isCorrect ? 'bg-teal-500 text-white' : isMyAnswer ? 'bg-red-400 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                      {letter}
                    </span>
                    <span className="text-sm sm:text-base text-slate-800 dark:text-slate-200 leading-snug pt-0.5">{opt}</span>
                    {isCorrect && <span className="ml-auto text-teal-600 font-bold text-sm">✓ Correct</span>}
                    {isMyAnswer && !isCorrect && <span className="ml-auto text-red-500 font-bold text-sm">✗ Wrong</span>}
                  </div>
                </div>
              );
            })}
          </div>
          {reveal.explanation && (
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 p-4">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Explanation</p>
              <p className="text-sm text-slate-700 dark:text-slate-300">{reveal.explanation}</p>
            </div>
          )}
          <p className="text-center text-xs text-slate-400 animate-pulse">Next question loading…</p>
        </div>

        {/* Scores remain visible — reuse LiveLeaderboardPanel styling */}
        <LiveLeaderboardPanel
          scores={reveal.scores || []}
          currentUserId={null}
        />
      </div>
    </div>
  );
}

function FinishedPhase({ leaderboard, currentUser, roomInfo, onPlayAgain, myRole, isTeacherSpectator }) {
  const navigate = useNavigate();
  const isSpectator = myRole === 'spectator' || isTeacherSpectator;
  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);
  const myEntry = leaderboard.find(p => String(p.student_id) === String(currentUser?.id));

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-8">
      {/* Finish banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-accent-500 to-primary-700 p-7 text-white text-center shadow-glow-primary">
        <div className="absolute top-0 left-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 -translate-x-1/2 pointer-events-none" />
        <div className="relative z-10">
          <p className="text-5xl mb-3">🏆</p>
          <h1 className="text-2xl sm:text-3xl font-black font-display">Competition Over!</h1>
          <p className="text-orange-200 mt-1 text-sm">{roomInfo?.session_title || 'Quiz'} results</p>
          {myEntry && (
            <div className="mt-3 inline-flex items-center gap-2 bg-white/15 rounded-xl px-4 py-2 text-sm font-semibold">
              Your score: <span className="text-xl font-black">{myEntry.score}</span> pts · #{myEntry.rank}
            </div>
          )}
        </div>
      </div>

      {/* Podium (top 3) */}
      {top3.length > 0 && (
        <div className="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl p-5 shadow-glass">
          <h2 className="font-bold text-slate-900 dark:text-white mb-4 text-center text-lg">Podium</h2>
          <div className="flex items-end justify-center gap-4">
            {/* Silver (2nd) */}
            {top3[1] && (
              <div className="flex flex-col items-center gap-1 w-24">
                <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center text-xl font-black text-slate-600 dark:text-slate-200">
                  {(top3[1].display_name || 'S')[0].toUpperCase()}
                </div>
                <span className="text-2xl">🥈</span>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 text-center truncate w-full">{top3[1].display_name || `#${top3[1].student_id}`}</p>
                <p className="text-sm font-black text-slate-500">{top3[1].score}</p>
                <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-t-lg h-16" />
              </div>
            )}
            {/* Gold (1st) */}
            {top3[0] && (
              <div className="flex flex-col items-center gap-1 w-24">
                <div className="w-14 h-14 rounded-full bg-yellow-100 dark:bg-yellow-900/40 flex items-center justify-center text-2xl font-black text-yellow-700 dark:text-yellow-300 ring-2 ring-yellow-400">
                  {(top3[0].display_name || 'S')[0].toUpperCase()}
                </div>
                <span className="text-3xl">🥇</span>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 text-center truncate w-full">{top3[0].display_name || `#${top3[0].student_id}`}</p>
                <p className="text-sm font-black text-yellow-500">{top3[0].score}</p>
                <div className="w-full bg-yellow-200 dark:bg-yellow-700/40 rounded-t-lg h-24" />
              </div>
            )}
            {/* Bronze (3rd) */}
            {top3[2] && (
              <div className="flex flex-col items-center gap-1 w-24">
                <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center text-xl font-black text-orange-600 dark:text-orange-300">
                  {(top3[2].display_name || 'S')[0].toUpperCase()}
                </div>
                <span className="text-2xl">🥉</span>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 text-center truncate w-full">{top3[2].display_name || `#${top3[2].student_id}`}</p>
                <p className="text-sm font-black text-orange-500">{top3[2].score}</p>
                <div className="w-full bg-orange-200 dark:bg-orange-700/40 rounded-t-lg h-10" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Full leaderboard table */}
      <div className="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl overflow-hidden shadow-glass">
        <div className="px-5 py-3 border-b border-slate-200/60 dark:border-slate-700/60">
          <h3 className="font-semibold text-slate-900 dark:text-white">Final Standings</h3>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
          {leaderboard.map((p, i) => {
            const isMe = String(p.student_id) === String(currentUser?.id);
            return (
              <div key={p.student_id}
                className={`flex items-center gap-3 px-5 py-3 text-sm transition-colors
                  ${isMe ? 'bg-primary-50/60 dark:bg-primary-900/20' : ''}`}>
                <div className="w-8 flex items-center justify-center flex-shrink-0">
                  <MedalIcon rank={i + 1} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold truncate ${isMe ? 'text-primary-700 dark:text-primary-300' : 'text-slate-800 dark:text-slate-200'}`}>
                    {p.display_name || `Student ${p.student_id}`}
                    {isMe && <span className="ml-1.5 text-xs font-normal text-primary-400">(you)</span>}
                  </p>
                  <p className="text-xs text-slate-400">{p.answers_correct ?? 0} correct</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-black text-primary-600 dark:text-primary-400 text-base">{p.score}</p>
                  <p className="text-xs text-slate-400">pts</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        {!isSpectator && (
          <Button
            size="lg"
            onClick={onPlayAgain}
            className="bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white"
          >
            ⚔ Play Again
          </Button>
        )}
        <Button
          size="lg"
          variant="outline"
          onClick={() => navigate(isTeacherSpectator ? '/teacher/dashboard' : '/student/dashboard')}
        >
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const CompetitionRoom = ({ isTeacherSpectator = false }) => {
  const { roomCode } = useParams();
  const navigate = useNavigate();

  const currentUser = safeParseUser();

  const [phase, setPhase] = useState('WAITING'); // WAITING | ACTIVE | REVEAL | FINISHED
  const [roomInfo, setRoomInfo] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [scores, setScores] = useState([]);
  // Teachers are always spectators
  const [myRole, setMyRole] = useState(isTeacherSpectator ? 'spectator' : 'player');
  const [starting, setStarting] = useState(false);

  // Active-phase state
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalTime, setTotalTime] = useState(20);
  const [selectedOption, setSelectedOption] = useState(null);
  const [hasAnswered, setHasAnswered] = useState(false);

  // Reveal-phase state
  const [revealData, setRevealData] = useState(null);

  // Finished state
  const [leaderboard, setLeaderboard] = useState([]);

  // Connection
  const [connStatus, setConnStatus] = useState('connecting');
  const [answeredCount, setAnsweredCount] = useState({ answered: 0, total: 0 });
  const wsRef = useRef(null);
  const timerRef = useRef(null);
  const questionEndTimeRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const destroyedRef = useRef(false);

  // Auth + demo guard
  useEffect(() => {
    if (!currentUser) {
      navigate('/auth');
      return;
    }
    // Teachers may enter only as forced spectators via isTeacherSpectator prop
    if (currentUser.role !== 'student' && !isTeacherSpectator) {
      navigate('/auth');
      return;
    }
    if (isDemoMode()) {
      toast.error('Competition is not available in demo mode');
      navigate(currentUser.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch initial room info
  useEffect(() => {
    if (!roomCode || !currentUser) return;
    apiRequest(`/competition/rooms/${roomCode}`)
      .then(res => {
        if (res.success) {
          setRoomInfo(res.data);
          if (res.data.status === 'active') setPhase('ACTIVE');
          else if (res.data.status === 'finished') setPhase('FINISHED');
        } else {
          toast.error(res.error || 'Room not found');
          navigate('/student/competition');
        }
      })
      .catch(() => {
        toast.error('Failed to load room');
        navigate('/student/competition');
      });
  }, [roomCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch participants
  const fetchParticipants = useCallback(async () => {
    if (!roomCode) return;
    try {
      const res = await apiRequest(`/competition/rooms/${roomCode}/participants`);
      if (res.success) {
        setParticipants(res.data);
        const me = res.data.find(p => String(p.student_id) === String(currentUser?.id));
        // Teachers are always spectators regardless of participant record
        if (me && !isTeacherSpectator) setMyRole(me.role);
        setScores(res.data.map(p => ({ student_id: p.student_id, display_name: p.display_name, score: p.score || 0 })));
      }
    } catch (_) {}
  }, [roomCode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchParticipants();
  }, [fetchParticipants]);

  // Client-side countdown timer
  const startClientTimer = useCallback((endTimeMs, duration) => {
    if (timerRef.current) clearInterval(timerRef.current);
    questionEndTimeRef.current = endTimeMs;
    setTotalTime(duration);
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((questionEndTimeRef.current - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) clearInterval(timerRef.current);
    };
    tick();
    timerRef.current = setInterval(tick, 500);
  }, []);

  // WebSocket setup with exponential-backoff reconnect
  useEffect(() => {
    if (!currentUser || isDemoMode()) return;

    destroyedRef.current = false;
    reconnectAttemptRef.current = 0;

    function connect() {
      if (destroyedRef.current) return;

      const token = localStorage.getItem('authToken');
      setConnStatus('connecting');
      const ws = new WebSocket(`${WS_BASE_URL}?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        setConnStatus('connected');
        ws.send(JSON.stringify({ type: 'join-competition', roomCode }));
      };

      ws.onmessage = (event) => {
        let data;
        try { data = JSON.parse(event.data); } catch (_) { return; }

        switch (data.type) {
          case 'competition-player-joined':
          case 'competition-player-left':
            fetchParticipants();
            break;

          case 'competition-started':
            setPhase('ACTIVE');
            setStarting(false);
            toast.success('Competition started!');
            break;

          case 'competition-question': {
            setCurrentQuestion(data);
            setSelectedOption(null);
            setHasAnswered(false);
            setRevealData(null);
            setAnsweredCount({ answered: 0, total: 0 });
            setPhase('ACTIVE');
            startClientTimer(data.endTime, data.timePerQuestion || 20);
            break;
          }

          case 'competition-answer-received':
            setAnsweredCount({ answered: data.answeredCount || 0, total: data.totalPlayers || 0 });
            break;

          case 'competition-answer-reveal': {
            setRevealData(data);
            setPhase('REVEAL');
            if (timerRef.current) clearInterval(timerRef.current);
            if (data.scores) setScores(data.scores);
            break;
          }

          case 'competition-finished': {
            setPhase('FINISHED');
            if (timerRef.current) clearInterval(timerRef.current);
            if (data.leaderboard) setLeaderboard(data.leaderboard);
            destroyedRef.current = true; // game over — no reconnect needed
            break;
          }

          case 'error':
            toast.error(data.message || 'Something went wrong');
            break;

          default:
            break;
        }
      };

      ws.onerror = () => { setConnStatus('disconnected'); };

      ws.onclose = () => {
        setConnStatus('disconnected');
        if (destroyedRef.current) return;
        // Exponential backoff: 1s, 2s, 4s, 8s, cap at 16s
        const delay = Math.min(16000, 1000 * 2 ** reconnectAttemptRef.current);
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      destroyedRef.current = true;
      clearTimeout(reconnectTimerRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (wsRef.current) {
        try { wsRef.current.send(JSON.stringify({ type: 'leave-competition', roomCode })); } catch (_) {}
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [roomCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStart = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      toast.error('Not connected');
      return;
    }
    setStarting(true);
    wsRef.current.send(JSON.stringify({ type: 'start-competition', roomCode }));
  };

  const handleAnswer = (letter) => {
    if (hasAnswered || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setSelectedOption(letter);
    setHasAnswered(true);
    const answerIndex = ['A', 'B', 'C', 'D'].indexOf(letter);
    wsRef.current.send(JSON.stringify({
      type: 'competition-answer',
      roomCode,
      questionIndex: currentQuestion?.questionIndex,
      answerIndex,
    }));
  };

  const handlePlayAgain = () => {
    navigate(isTeacherSpectator
      ? '/teacher/competition'
      : `/student/competition?session=${roomInfo?.session_id || ''}`
    );
  };

  if (!currentUser) return null;

  return (
    <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 pb-8">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={() => navigate(isTeacherSpectator ? '/teacher/competition' : '/student/competition')}
          className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1 transition-colors"
        >
          ← {isTeacherSpectator ? 'Competitions' : 'Lobby'}
        </button>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <ConnectionDot status={connStatus} />
          {connStatus === 'connected' ? 'Connected' : connStatus === 'connecting' ? 'Connecting…' : 'Disconnected'}
        </div>
      </div>

      {phase === 'WAITING' && (
        <WaitingPhase
          roomInfo={roomInfo}
          participants={participants}
          currentUser={currentUser}
          onStart={handleStart}
          starting={starting}
        />
      )}

      {phase === 'ACTIVE' && currentQuestion && (
        <ActivePhase
          question={currentQuestion}
          timeLeft={timeLeft}
          totalTime={totalTime}
          myRole={myRole}
          selectedOption={selectedOption}
          hasAnswered={hasAnswered}
          onAnswer={handleAnswer}
          scores={scores}
          answeredCount={answeredCount}
          currentUserId={currentUser?.id}
        />
      )}

      {phase === 'REVEAL' && revealData && (
        <RevealPhase
          reveal={revealData}
          myRole={myRole}
          selectedOption={selectedOption}
        />
      )}

      {phase === 'FINISHED' && (
        <FinishedPhase
          leaderboard={leaderboard}
          currentUser={currentUser}
          roomInfo={roomInfo}
          onPlayAgain={handlePlayAgain}
          myRole={myRole}
          isTeacherSpectator={isTeacherSpectator}
        />
      )}
    </div>
  );
};

export default CompetitionRoom;
