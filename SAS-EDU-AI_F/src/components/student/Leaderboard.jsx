import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { utils, apiRequest } from '../../utils/api';
import { isDemoMode, DEMO_LEADERBOARD, DEMO_GAMIFICATION } from '../../utils/demoData';
import { StatCardsSkeleton, LeaderboardSkeleton } from '../shared/SkeletonLoader';

const Leaderboard = () => {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const currentUser = utils.getCurrentUser();

  const [leaderboard, setLeaderboard] = useState([]);
  const [viewType, setViewType] = useState(sessionId ? 'session' : 'allTime');
  const [loading, setLoading] = useState(true);
  const [myStats, setMyStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'student') {
      navigate('/auth');
      return;
    }
    fetchData();
  }, [viewType, sessionId]);

  const fetchData = async () => {
    try {
      setLoading(true);

      if (isDemoMode()) {
        setLeaderboard(DEMO_LEADERBOARD);
        setMyStats({ ...DEMO_GAMIFICATION, maxStreak: 5 });
        return;
      }

      setError(null);
      const leaderboardPath = viewType === 'session' && sessionId
        ? `/gamification/leaderboard/session/${sessionId}`
        : `/gamification/leaderboard/all-time`;

      const [leaderboardData, statsData] = await Promise.all([
        apiRequest(leaderboardPath),
        apiRequest(`/gamification/student/${currentUser.id}/stats`)
      ]);

      if (leaderboardData.success) setLeaderboard(leaderboardData.data);
      if (statsData.success) setMyStats(statsData.data);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      setError('Failed to load leaderboard. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getBadgeIcon = (type) => {
    const icons = {
      first_responder: '1',
      perfect_score: '100',
      streak_3: 'fire',
      streak_5: 'fire2',
      streak_10: 'lightning',
      participation_star: 'star',
      accuracy_master: 'target'
    };
    return icons[type] || 'medal';
  };

  const getRankStyle = (rank) => {
    if (rank === 1) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    if (rank === 2) return 'bg-gray-100 text-gray-700 border-gray-300';
    if (rank === 3) return 'bg-orange-100 text-orange-800 border-orange-300';
    return 'bg-white text-gray-600 border-gray-200';
  };

  const getRankIcon = (rank) => {
    if (rank === 1) return '1st';
    if (rank === 2) return '2nd';
    if (rank === 3) return '3rd';
    return `#${rank}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white py-6 sm:py-8 px-4 sm:px-6">
          <div className="max-w-4xl mx-auto space-y-3">
            <div className="rounded-md h-4 w-36 bg-white/30" />
            <div className="rounded-md h-8 w-28 bg-white/30" />
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4">
          <StatCardsSkeleton count={4} />
          <LeaderboardSkeleton rows={8} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white py-6 sm:py-8 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => navigate('/student/dashboard')}
            className="mb-3 sm:mb-4 flex items-center text-white/80 hover:text-white text-sm sm:text-base py-1"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </button>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-3xl sm:text-4xl">Trophy</span>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Leaderboard</h1>
              <p className="text-white/80 mt-1 text-sm sm:text-base">See how you rank against others</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* My Stats Card */}
        {myStats && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6 mb-4 sm:mb-6">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Your Stats</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
              <div className="text-center p-3 sm:p-4 bg-blue-50 rounded-lg">
                <p className="text-2xl sm:text-3xl font-bold text-blue-600">{myStats.totalPoints}</p>
                <p className="text-xs sm:text-sm text-gray-600">Total Points</p>
              </div>
              <div className="text-center p-3 sm:p-4 bg-green-50 rounded-lg">
                <p className="text-2xl sm:text-3xl font-bold text-green-600">#{myStats.rank}</p>
                <p className="text-xs sm:text-sm text-gray-600">Your Rank</p>
              </div>
              <div className="text-center p-3 sm:p-4 bg-orange-50 rounded-lg">
                <p className="text-2xl sm:text-3xl font-bold text-orange-600">{myStats.currentStreak}</p>
                <p className="text-xs sm:text-sm text-gray-600">Current Streak</p>
              </div>
              <div className="text-center p-3 sm:p-4 bg-purple-50 rounded-lg">
                <p className="text-2xl sm:text-3xl font-bold text-purple-600">{myStats.maxStreak}</p>
                <p className="text-xs sm:text-sm text-gray-600">Best Streak</p>
              </div>
            </div>

            {/* Badges */}
            {myStats.badges && myStats.badges.length > 0 && (
              <div className="mt-4 sm:mt-6">
                <h3 className="text-xs sm:text-sm font-medium text-gray-700 mb-2 sm:mb-3">Your Badges</h3>
                <div className="flex flex-wrap gap-2">
                  {myStats.badges.map((badge, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 bg-yellow-50 border border-yellow-200 rounded-full"
                      title={badge.description}
                    >
                      <span className="text-base sm:text-lg">{getBadgeIcon(badge.type)}</span>
                      <span className="text-xs sm:text-sm font-medium text-yellow-800">{badge.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* View Toggle */}
        <div className="flex justify-center mb-4 sm:mb-6">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
            <button
              onClick={() => setViewType('allTime')}
              className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                viewType === 'allTime'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All Time
            </button>
            {sessionId && (
              <button
                onClick={() => setViewType('session')}
                className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                  viewType === 'session'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                This Session
              </button>
            )}
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm text-center">
            {error}
          </div>
        )}

        {/* Leaderboard Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          {leaderboard.length > 0 ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {leaderboard.map((entry) => (
                <div
                  key={entry.studentId}
                  className={`flex items-center p-3 sm:p-4 ${
                    String(entry.studentId) === String(currentUser.id) ? 'bg-blue-50 dark:bg-blue-900/20' : 'dark:hover:bg-gray-700/50'
                  } transition-colors duration-150`}
                >
                  {/* Rank */}
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-bold border-2 text-xs sm:text-sm flex-shrink-0 ${getRankStyle(entry.rank)}`}>
                    {getRankIcon(entry.rank)}
                  </div>

                  {/* Name */}
                  <div className="ml-3 sm:ml-4 flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm sm:text-base truncate">
                      {entry.studentName}
                      {String(entry.studentId) === String(currentUser.id) && (
                        <span className="ml-1 sm:ml-2 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 sm:px-2 py-0.5 rounded-full">You</span>
                      )}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">
                      {viewType === 'allTime'
                        ? `${entry.sessionsParticipated || 0} sessions | ${entry.avgAccuracy || 0}%`
                        : `${entry.correctAnswers}/${entry.totalAnswers} correct`
                      }
                    </p>
                  </div>

                  {/* Streak - Hidden on mobile */}
                  {(entry.currentStreak > 0 || entry.maxStreak > 0) && (
                    <div className="hidden sm:flex items-center gap-1 text-orange-500 dark:text-orange-400 mr-4">
                      <span>Fire</span>
                      <span className="font-semibold">{entry.currentStreak || entry.maxStreak}</span>
                    </div>
                  )}

                  {/* Points */}
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className="text-lg sm:text-xl font-bold text-blue-600 dark:text-blue-400">
                      {viewType === 'allTime' ? entry.totalPoints : entry.points}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">pts</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 sm:p-12 text-center text-gray-500">
              <span className="text-3xl sm:text-4xl mb-4 block">Trophy</span>
              <p className="text-sm sm:text-base">No rankings yet. Start answering polls to earn points!</p>
            </div>
          )}
        </div>

        {/* Points Guide */}
        <div className="mt-6 sm:mt-8 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">How to Earn Points</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold text-xs sm:text-sm flex-shrink-0">+10</div>
              <div>
                <p className="font-medium text-gray-900 text-sm sm:text-base">Correct Answer</p>
                <p className="text-xs sm:text-sm text-gray-500">Answer a poll correctly</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs sm:text-sm flex-shrink-0">+5</div>
              <div>
                <p className="font-medium text-gray-900 text-sm sm:text-base">Fast Response</p>
                <p className="text-xs sm:text-sm text-gray-500">Answer within 10 seconds</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-600 font-bold text-xs sm:text-sm flex-shrink-0">+10</div>
              <div>
                <p className="font-medium text-gray-900 text-sm sm:text-base">First Responder</p>
                <p className="text-xs sm:text-sm text-gray-500">First correct answer</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-xs flex-shrink-0">+15-50</div>
              <div>
                <p className="font-medium text-gray-900 text-sm sm:text-base">Streak Bonus</p>
                <p className="text-xs sm:text-sm text-gray-500">3/5/10 correct in a row</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Leaderboard;
