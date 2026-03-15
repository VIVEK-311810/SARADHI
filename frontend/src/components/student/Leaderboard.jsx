import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { utils, apiRequest } from '../../utils/api';
import { isDemoMode, DEMO_LEADERBOARD, DEMO_SESSION_LEADERBOARD, DEMO_GAMIFICATION, DEMO_GAMIFICATION_XP } from '../../utils/demoData';
import { StatCardsSkeleton, LeaderboardSkeleton } from '../shared/SkeletonLoader';

// ─── Level Thresholds (mirrors backend) ──────────────────────────────────────
const LEVELS = [
  { level: 1, title: 'Newcomer',       minXP: 0    },
  { level: 2, title: 'Active Learner', minXP: 100  },
  { level: 3, title: 'Consistent',     minXP: 300  },
  { level: 4, title: 'Dedicated',      minXP: 600  },
  { level: 5, title: 'Scholar',        minXP: 1000 },
  { level: 6, title: 'Expert',         minXP: 1500 },
  { level: 7, title: 'Master',         minXP: 2500 }
];

function getLevelColor(level) {
  const colors = ['', 'gray', 'green', 'blue', 'purple', 'yellow', 'orange', 'red'];
  return colors[level] || 'gray';
}

function XPProgressBar({ currentXP, level }) {
  const current = LEVELS.find(l => l.level === level) || LEVELS[0];
  const next = LEVELS.find(l => l.minXP > currentXP) || null;
  const progress = next
    ? Math.round(((currentXP - current.minXP) / (next.minXP - current.minXP)) * 100)
    : 100;
  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span>{currentXP} XP</span>
        {next && <span>{next.minXP} XP to Level {next.level}</span>}
        {!next && <span>Max Level!</span>}
      </div>
      <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function LevelBadge({ level, title, small = false }) {
  const color = getLevelColor(level);
  const colorMap = {
    gray:   'bg-slate-100 text-slate-700 border-slate-300',
    green:  'bg-green-100 text-green-700 border-green-300',
    blue:   'bg-primary-100 text-primary-700 border-primary-300',
    purple: 'bg-primary-100 text-primary-700 border-primary-300',
    yellow: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    orange: 'bg-orange-100 text-orange-700 border-orange-300',
    red:    'bg-red-100 text-red-700 border-red-300'
  };
  return (
    <span className={`inline-flex items-center gap-1 border rounded-full font-semibold
      ${small ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs'}
      ${colorMap[color] || colorMap.gray}`}>
      Lv{level} {!small && title}
    </span>
  );
}

function TierBadge({ tier }) {
  const tiers = {
    bronze: 'bg-orange-100 text-orange-700 border-orange-300',
    silver: 'bg-slate-100 text-slate-600 border-slate-300',
    gold:   'bg-yellow-100 text-yellow-700 border-yellow-300'
  };
  return (
    <span className={`text-xs border rounded-full px-1.5 py-0.5 font-medium ${tiers[tier] || tiers.bronze}`}>
      {tier}
    </span>
  );
}

const getRankStyle = (rank) => {
  if (rank === 1) return 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400';
  if (rank === 2) return 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-700 dark:text-slate-300';
  if (rank === 3) return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400';
  return 'bg-white text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400';
};

const getRankIcon = (rank) => {
  if (rank === 1) return '1st';
  if (rank === 2) return '2nd';
  if (rank === 3) return '3rd';
  return `#${rank}`;
};

const Leaderboard = () => {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const currentUser = utils.getCurrentUser();

  const [leaderboard, setLeaderboard] = useState([]);
  const [viewType, setViewType] = useState(sessionId ? 'session' : 'allTime');
  const [loading, setLoading] = useState(true);
  const [myStats, setMyStats] = useState(null);
  const [myXP, setMyXP] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'student') {
      navigate('/auth');
      return;
    }
    fetchData();
  }, [viewType, sessionId]); // eslint-disable-line

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      if (isDemoMode()) {
        setLeaderboard(viewType === 'session' && sessionId ? DEMO_SESSION_LEADERBOARD : DEMO_LEADERBOARD);
        setMyStats(DEMO_GAMIFICATION);
        setMyXP(DEMO_GAMIFICATION_XP);
        return;
      }

      const leaderboardPath = viewType === 'session' && sessionId
        ? `/gamification/leaderboard/session/${sessionId}`
        : `/gamification/leaderboard/all-time`;

      const [leaderboardData, statsData, xpData] = await Promise.all([
        apiRequest(leaderboardPath),
        apiRequest(`/gamification/student/${currentUser.id}/stats`),
        apiRequest(`/gamification/student/${currentUser.id}/xp`)
      ]);

      if (leaderboardData.success) setLeaderboard(leaderboardData.data);
      if (statsData.success) setMyStats(statsData.data);
      if (xpData.success) setMyXP(xpData.data);
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
      setError('Failed to load leaderboard. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4">
        <StatCardsSkeleton count={4} />
        <LeaderboardSkeleton rows={8} />
      </div>
    );
  }

  const levelInfo = myXP?.level || myStats?.level;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent-500 to-primary-700 text-white p-6 sm:p-8 mb-6 shadow-glow-accent">
        <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/10 rounded-full" />
        <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-white/5 rounded-full" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="text-4xl">&#127942;</span>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Leaderboard</h1>
              <p className="text-white/80 mt-0.5 text-sm">See how you rank against others</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 sm:space-y-6">

        {/* My Stats Card */}
        {myStats && (
          <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">Your Stats</h2>
              {levelInfo && (
                <LevelBadge level={levelInfo.level} title={levelInfo.title} />
              )}
            </div>

            {/* XP Progress Bar */}
            {levelInfo && (
              <div className="mb-4 p-3 bg-gradient-to-r from-primary-50 to-accent-50 dark:from-primary-900/20 dark:to-accent-900/20 rounded-xl border border-primary-100/60 dark:border-primary-800/30">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{levelInfo.title}</span>
                  <span className="text-xs text-slate-500">{levelInfo.currentXP} XP total</span>
                </div>
                <XPProgressBar currentXP={levelInfo.currentXP} level={levelInfo.level} />
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <div className="text-center p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                <p className="text-2xl sm:text-3xl font-bold text-primary-600 dark:text-primary-400">{myXP?.totalXP || 0}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Total XP</p>
              </div>
              <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400">#{myStats.rank}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Your Rank</p>
              </div>
              <div className="text-center p-3 bg-teal-50 dark:bg-teal-900/20 rounded-lg">
                <p className="text-2xl sm:text-3xl font-bold text-teal-600 dark:text-teal-400">{myStats.totalPoints || 0}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Session Pts</p>
              </div>
              <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                <p className="text-2xl sm:text-3xl font-bold text-orange-600 dark:text-orange-400">{myStats.totalStudents || 1}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Students</p>
              </div>
            </div>

            {/* Badges */}
            {myStats.badges && myStats.badges.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-medium text-slate-700 dark:text-slate-400 mb-2">Your Badges</h3>
                <div className="flex flex-wrap gap-2">
                  {myStats.badges.map((badge, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 px-2 py-1.5 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-full"
                      title={badge.description}
                    >
                      <span className="text-sm">&#127775;</span>
                      <span className="text-xs font-medium text-yellow-800 dark:text-yellow-300">{badge.name}</span>
                      {badge.tier && <TierBadge tier={badge.tier} />}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* View Toggle */}
        <div className="flex justify-center">
          <div className="inline-flex rounded-xl border border-slate-200/60 dark:border-slate-700/60 bg-white/75 dark:bg-slate-800/75 backdrop-blur-sm p-1 shadow-sm">
            {sessionId && (
              <button
                onClick={() => setViewType('session')}
                className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                  viewType === 'session'
                    ? 'bg-primary-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                This Session
              </button>
            )}
            <button
              onClick={() => setViewType('allTime')}
              className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                viewType === 'allTime'
                  ? 'bg-primary-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              XP Rankings
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm text-center">
            {error}
          </div>
        )}

        {/* Leaderboard Table */}
        <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {viewType === 'session' ? 'Session Rankings' : 'XP Rankings (All Time)'}
            </h3>
          </div>
          {leaderboard.length > 0 ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {leaderboard.map((entry) => {
                const isMe = String(entry.studentId) === String(currentUser.id);
                const entryLevel = entry.level;
                return (
                  <div
                    key={entry.studentId}
                    className={`flex items-center p-3 sm:p-4 transition-colors duration-150 ${
                      isMe ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'
                    }`}
                  >
                    {/* Rank */}
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-bold border-2 text-xs sm:text-sm flex-shrink-0 ${getRankStyle(entry.rank)}`}>
                      {getRankIcon(entry.rank)}
                    </div>

                    {/* Name + info */}
                    <div className="ml-3 sm:ml-4 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm sm:text-base truncate">
                          {entry.studentName}
                        </p>
                        {isMe && (
                          <span className="text-xs bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-400 px-1.5 py-0.5 rounded-full">You</span>
                        )}
                        {entryLevel && (
                          <LevelBadge level={entryLevel.level} title={entryLevel.title} small />
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {viewType === 'allTime'
                          ? `${entry.sessionsParticipated || 0} sessions · ${entry.avgAccuracy || 0}% accuracy`
                          : `${entry.correctAnswers || 0}/${entry.totalAnswers || 0} correct`
                        }
                      </p>
                    </div>

                    {/* Streak */}
                    {viewType === 'session' && (entry.currentStreak > 0 || entry.maxStreak > 0) && (
                      <div className="hidden sm:flex items-center gap-1 text-orange-500 mr-3 text-sm">
                        <span>&#128293;</span>
                        <span className="font-semibold">{entry.currentStreak || entry.maxStreak}</span>
                      </div>
                    )}

                    {/* Score */}
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className="text-lg sm:text-xl font-bold text-primary-600 dark:text-primary-400">
                        {viewType === 'allTime' ? (entry.totalXP || 0) : (entry.points || 0)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {viewType === 'allTime' ? 'XP' : 'pts'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 sm:p-12 text-center text-slate-500 dark:text-slate-400">
              <p className="text-3xl mb-3">&#127942;</p>
              <p className="text-sm">No rankings yet. Start answering polls to earn points!</p>
            </div>
          )}
        </div>

        {/* How to Earn Points (updated) */}
        <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">How to Earn Points & XP</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { pts: '+3',  color: 'bg-slate-100 text-slate-700',   label: 'Participation',    desc: 'Answer any poll' },
              { pts: '+10', color: 'bg-green-100 text-green-700', label: 'Correct Answer',   desc: 'Get the right answer' },
              { pts: '+5–15', color: 'bg-yellow-100 text-yellow-700', label: 'Difficulty Bonus', desc: 'Harder questions = more points' },
              { pts: '+5',  color: 'bg-primary-100 text-primary-700',   label: 'Improvement',      desc: 'Right after being wrong' },
              { pts: '+10', color: 'bg-purple-100 text-purple-700', label: 'All Polls Done', desc: 'Answer every poll in a session' },
              { pts: '+5',  color: 'bg-teal-100 text-teal-700',   label: 'Attendance',       desc: 'Show up to class' },
              { pts: '+20 XP', color: 'bg-indigo-100 text-indigo-700', label: 'Session XP',  desc: 'Per session participated' },
              { pts: '+50 XP', color: 'bg-pink-100 text-pink-700', label: 'Weekly Streak',   desc: '3+ sessions in a week' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 sm:gap-3">
                <div className={`w-16 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${item.color}`}>
                  {item.pts}
                </div>
                <div>
                  <p className="font-medium text-slate-900 dark:text-slate-100 text-sm">{item.label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Leaderboard;
