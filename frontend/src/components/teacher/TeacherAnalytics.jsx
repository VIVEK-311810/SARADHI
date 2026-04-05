import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { utils } from '../../utils/api';
import { isDemoMode, DEMO_ANALYTICS } from '../../utils/demoData';
import { StatCardsSkeleton, ChartAreaSkeleton } from '../shared/SkeletonLoader';

const TeacherAnalytics = () => {
  const navigate = useNavigate();
  const currentUser = utils.getCurrentUser();

  const [overview, setOverview] = useState(null);
  const [pollPerformance, setPollPerformance] = useState([]);
  const [engagementTrends, setEngagementTrends] = useState([]);
  const [sessionAnalytics, setSessionAnalytics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTimeRange, setSelectedTimeRange] = useState(30);
  const [activeTab, setActiveTab] = useState('overview');

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'teacher') {
      navigate('/auth');
      return;
    }
    fetchAnalyticsData();
  }, [selectedTimeRange]);

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);

      // Demo mode — serve hardcoded data instantly
      if (isDemoMode()) {
        setOverview(DEMO_ANALYTICS.overview);
        setPollPerformance(DEMO_ANALYTICS.pollPerformance);
        setEngagementTrends(DEMO_ANALYTICS.engagementTrends);
        setSessionAnalytics(DEMO_ANALYTICS.sessionAnalytics);
        setLoading(false);
        return;
      }

      const token = localStorage.getItem('authToken');
      const headers = { 'Authorization': `Bearer ${token}` };
      const API_URL = process.env.REACT_APP_API_URL;

      const [overviewRes, pollsRes, trendsRes, sessionsRes] = await Promise.all([
        fetch(`${API_URL}/analytics/teacher/${currentUser.id}/overview`, { headers }),
        fetch(`${API_URL}/analytics/teacher/${currentUser.id}/poll-performance?limit=20`, { headers }),
        fetch(`${API_URL}/analytics/teacher/${currentUser.id}/engagement-trends?days=${selectedTimeRange}`, { headers }),
        fetch(`${API_URL}/analytics/teacher/${currentUser.id}/sessions`, { headers })
      ]);

      const [overviewData, pollsData, trendsData, sessionsData] = await Promise.all([
        overviewRes.json(),
        pollsRes.json(),
        trendsRes.json(),
        sessionsRes.json()
      ]);

      if (overviewData.success) setOverview(overviewData.data);
      if (pollsData.success) setPollPerformance(pollsData.data);
      if (trendsData.success) setEngagementTrends(trendsData.data);
      if (sessionsData.success) setSessionAnalytics(sessionsData.data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="bg-gradient-to-br from-primary-600 to-primary-800 text-white py-6 sm:py-8 px-4 sm:px-6">
          <div className="max-w-7xl mx-auto space-y-3">
            <div className="rounded-md skeleton-shimmer h-4 w-32 bg-white/20" style={{backgroundImage:'none', opacity:0.5}} />
            <div className="rounded-md skeleton-shimmer h-8 w-52 bg-white/20" style={{backgroundImage:'none', opacity:0.5}} />
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
          <StatCardsSkeleton count={5} />
          <ChartAreaSkeleton height="h-80" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ChartAreaSkeleton height="h-64" />
            <ChartAreaSkeleton height="h-64" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary-600 to-primary-800 text-white py-6 sm:py-8 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={() => navigate('/teacher/dashboard')}
            className="mb-3 sm:mb-4 flex items-center text-white/80 hover:text-white text-sm sm:text-base py-1"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold">Analytics Dashboard</h1>
          <p className="text-white/80 mt-1 sm:mt-2 text-sm sm:text-base">Track your teaching performance and student engagement</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Time Range Selector */}
        <div className="mb-4 sm:mb-6 flex justify-end">
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(parseInt(e.target.value))}
            className="px-3 sm:px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>

        {/* Overview Cards */}
        {overview && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6 sm:mb-8">
            <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6">
              <div className="flex items-center">
                <div className="p-2 sm:p-3 rounded-full bg-primary-100 flex-shrink-0">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div className="ml-3 sm:ml-4 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-slate-500 truncate">Total Sessions</p>
                  <p className="text-xl sm:text-2xl font-bold text-slate-900">{overview.totalSessions}</p>
                </div>
              </div>
            </div>

            <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6">
              <div className="flex items-center">
                <div className="p-2 sm:p-3 rounded-full bg-green-100 flex-shrink-0">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <div className="ml-3 sm:ml-4 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-slate-500 truncate">Total Polls</p>
                  <p className="text-xl sm:text-2xl font-bold text-slate-900">{overview.totalPolls}</p>
                </div>
              </div>
            </div>

            <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6">
              <div className="flex items-center">
                <div className="p-2 sm:p-3 rounded-full bg-teal-100 dark:bg-teal-900/30 flex-shrink-0">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <div className="ml-3 sm:ml-4 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-slate-500 truncate">Total Students</p>
                  <p className="text-xl sm:text-2xl font-bold text-slate-900">{overview.totalStudents}</p>
                </div>
              </div>
            </div>

            <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6">
              <div className="flex items-center">
                <div className="p-2 sm:p-3 rounded-full bg-yellow-100 flex-shrink-0">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                  </svg>
                </div>
                <div className="ml-3 sm:ml-4 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-slate-500 truncate">Response Rate</p>
                  <p className="text-xl sm:text-2xl font-bold text-slate-900">{overview.avgResponseRate}%</p>
                </div>
              </div>
            </div>

            <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6 col-span-2 sm:col-span-1">
              <div className="flex items-center">
                <div className="p-2 sm:p-3 rounded-full bg-green-100 flex-shrink-0">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-3 sm:ml-4 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-slate-500 truncate">Avg Accuracy</p>
                  <p className="text-xl sm:text-2xl font-bold text-slate-900">{overview.avgCorrectRate}%</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-slate-200 dark:border-slate-700 mb-4 sm:mb-6 overflow-x-auto">
          <nav className="flex space-x-4 sm:space-x-8 min-w-max">
            {['overview', 'polls', 'sessions', 'blooms', 'types'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm capitalize whitespace-nowrap ${
                  activeTab === tab
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {tab === 'overview' ? 'Engagement Trends' : tab === 'blooms' ? "Bloom's Taxonomy" : tab === 'types' ? 'Question Types' : tab}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Engagement Trends Chart */}
            <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-3 sm:mb-4">Engagement Over Time</h3>
              {engagementTrends.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={engagementTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    />
                    <YAxis />
                    <Tooltip
                      labelFormatter={(date) => new Date(date).toLocaleDateString()}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="responsesReceived" name="Responses" stroke="#4F46E5" strokeWidth={2} />
                    <Line type="monotone" dataKey="pollsCreated" name="Polls" stroke="#10B981" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-500">
                  No data available for the selected time range
                </div>
              )}
            </div>

            {/* Accuracy Trend */}
            <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-3 sm:mb-4">Accuracy Trend</h3>
              {engagementTrends.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={engagementTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    />
                    <YAxis domain={[0, 100]} />
                    <Tooltip
                      labelFormatter={(date) => new Date(date).toLocaleDateString()}
                      formatter={(value) => [`${value}%`, 'Accuracy']}
                    />
                    <Line type="monotone" dataKey="avgAccuracy" name="Avg Accuracy" stroke="#14b8a6" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-500">
                  No data available for the selected time range
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'polls' && (
          <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-3 sm:mb-4">Poll Performance (Last 20 Polls)</h3>
            {pollPerformance.length > 0 ? (
              <>
                <div className="hidden sm:block">
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={pollPerformance.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" domain={[0, 100]} />
                      <YAxis
                        type="category"
                        dataKey="question"
                        width={120}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip formatter={(value) => [`${value}%`, 'Accuracy']} />
                      <Bar dataKey="accuracyRate" name="Accuracy Rate" fill="#4F46E5" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Mobile: Cards view */}
                <div className="block sm:hidden mt-4 space-y-3">
                  {pollPerformance.map((poll) => (
                    <div key={poll.pollId} className="bg-slate-50 rounded-lg p-3">
                      <p className="font-medium text-slate-900 text-sm mb-2 line-clamp-2">{poll.question}</p>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="text-slate-500">{poll.sessionTitle}</span>
                        <span className="text-slate-500">{poll.correctResponses}/{poll.totalResponses}</span>
                        <span className={`px-2 py-0.5 rounded-full font-semibold ${
                          poll.accuracyRate >= 70 ? 'bg-green-100 text-green-800' :
                          poll.accuracyRate >= 40 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {poll.accuracyRate}%
                        </span>
                        <span className="text-slate-500">{poll.avgResponseTimeSec}s</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop: Table view */}
                <div className="hidden sm:block mt-6 overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50 dark:bg-slate-800/50">
                      <tr>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Question</th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Session</th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Responses</th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Accuracy</th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Avg Time</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white/50 dark:bg-transparent divide-y divide-slate-200/60 dark:divide-slate-700/60">
                      {pollPerformance.map((poll) => (
                        <tr key={poll.pollId}>
                          <td className="px-4 sm:px-6 py-4 text-sm text-slate-900 max-w-xs truncate">{poll.question}</td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-slate-500">{poll.sessionTitle}</td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                            {poll.correctResponses}/{poll.totalResponses}
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              poll.accuracyRate >= 70 ? 'bg-green-100 text-green-800' :
                              poll.accuracyRate >= 40 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {poll.accuracyRate}%
                            </span>
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-slate-500">{poll.avgResponseTimeSec}s</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-500">
                No polls created yet
              </div>
            )}
          </div>
        )}

        {activeTab === 'blooms' && (
          <BloomsChart pollPerformance={pollPerformance} />
        )}

        {activeTab === 'types' && (
          <QuestionTypesChart pollPerformance={pollPerformance} />
        )}

        {activeTab === 'sessions' && (
          <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-3 sm:mb-4">Session Performance</h3>
            {sessionAnalytics.length > 0 ? (
              <>
                {/* Mobile: Cards view */}
                <div className="block sm:hidden space-y-3">
                  {sessionAnalytics.map((session) => (
                    <div key={session.id} className="bg-slate-50 rounded-lg p-3">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 text-sm truncate">{session.title}</p>
                          <p className="text-xs text-slate-500">{session.courseName}</p>
                        </div>
                        <span className={`ml-2 px-2 py-0.5 text-xs font-semibold rounded-full flex-shrink-0 ${
                          session.isActive ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'
                        }`}>
                          {session.isActive ? 'Active' : 'Ended'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                        <span className="font-mono text-primary-600">{session.sessionId}</span>
                        <span>{session.pollCount} polls</span>
                        <span>{session.participantCount} students</span>
                        <span className={`px-2 py-0.5 rounded-full font-semibold ${
                          session.avgAccuracy >= 70 ? 'bg-green-100 text-green-800' :
                          session.avgAccuracy >= 40 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {session.avgAccuracy}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop: Table view */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50 dark:bg-slate-800/50">
                      <tr>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Session</th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Code</th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Polls</th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Participants</th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Responses</th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Accuracy</th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white/50 dark:bg-transparent divide-y divide-slate-200/60 dark:divide-slate-700/60">
                      {sessionAnalytics.map((session) => (
                        <tr key={session.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-slate-900">{session.title}</div>
                            <div className="text-sm text-slate-500">{session.courseName}</div>
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-mono text-primary-600">{session.sessionId}</td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              session.isActive ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'
                            }`}>
                              {session.isActive ? 'Active' : 'Ended'}
                            </span>
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-slate-500">{session.pollCount}</td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-slate-500">{session.participantCount}</td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-slate-500">{session.totalResponses}</td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              session.avgAccuracy >= 70 ? 'bg-green-100 text-green-800' :
                              session.avgAccuracy >= 40 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {session.avgAccuracy}%
                            </span>
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                            {new Date(session.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="h-48 sm:h-64 flex items-center justify-center text-slate-500 text-sm sm:text-base">
                No sessions created yet
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Bloom's Taxonomy Chart ──────────────────────────────────────────────────────
const BLOOMS_LEVELS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];
const BLOOMS_COLORS = ['#6366F1', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
const BLOOMS_LABELS = {
  remember: 'Remember',
  understand: 'Understand',
  apply: 'Apply',
  analyze: 'Analyze',
  evaluate: 'Evaluate',
  create: 'Create',
};

function BloomsChart({ pollPerformance }) {
  // Count how many polls belong to each Bloom's level
  const counts = {};
  BLOOMS_LEVELS.forEach(l => { counts[l] = 0; });
  let untagged = 0;
  (pollPerformance || []).forEach(p => {
    if (p.blooms_level && BLOOMS_LEVELS.includes(p.blooms_level)) {
      counts[p.blooms_level]++;
    } else {
      untagged++;
    }
  });

  const chartData = BLOOMS_LEVELS.map((level, i) => ({
    level: BLOOMS_LABELS[level],
    count: counts[level],
    fill: BLOOMS_COLORS[i],
  })).filter(d => d.count > 0);

  const total = (pollPerformance || []).length;
  const tagged = total - untagged;

  if (total === 0) {
    return (
      <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-6">
        <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-4">Bloom's Taxonomy Distribution</h3>
        <div className="h-64 flex flex-col items-center justify-center text-slate-500 gap-2">
          <span className="text-3xl">🧠</span>
          <p className="text-sm">No polls created yet.</p>
          <p className="text-xs text-slate-400">Tag your questions with Bloom's levels when creating them.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar chart */}
        <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-1">Bloom's Taxonomy Distribution</h3>
          <p className="text-xs text-slate-400 mb-4">
            {tagged} of {total} poll{total !== 1 ? 's' : ''} tagged
            {untagged > 0 && ` · ${untagged} untagged`}
          </p>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="level" width={80} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => [v, 'Questions']} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
              No tagged questions yet
            </div>
          )}
        </div>

        {/* Pie chart */}
        <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-4">Cognitive Level Mix</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={chartData} dataKey="count" nameKey="level" cx="50%" cy="50%" outerRadius={100} label={({ level, percent }) => `${level} ${(percent * 100).toFixed(0)}%`}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => [v, 'Questions']} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
              No tagged questions yet
            </div>
          )}
        </div>
      </div>

      {/* Level breakdown cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {BLOOMS_LEVELS.map((level, i) => (
          <div key={level} className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-3 text-center">
            <div className="w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: BLOOMS_COLORS[i] }}>
              {counts[level]}
            </div>
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300 capitalize">{BLOOMS_LABELS[level]}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {tagged > 0 ? `${Math.round((counts[level] / tagged) * 100)}%` : '—'}
            </p>
          </div>
        ))}
      </div>

      {/* NEP 2020 guidance note */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm text-blue-700 dark:text-blue-300">
        <p className="font-semibold mb-1">NEP 2020 Recommendation</p>
        <p className="text-xs">
          Balance lower-order thinking (Remember, Understand) with higher-order thinking (Apply, Analyze, Evaluate, Create).
          Aim for at least 40% of questions at Apply level or above to promote competency-based learning.
        </p>
      </div>
    </div>
  );
}

const TYPE_META = {
  mcq:              { label: 'MCQ',            color: '#3B82F6', desc: '4-option multiple choice' },
  true_false:       { label: 'True / False',   color: '#8B5CF6', desc: 'Binary statement' },
  fill_blank:       { label: 'Fill in Blank',  color: '#14B8A6', desc: 'Short text answer' },
  numeric:          { label: 'Numeric',         color: '#F97316', desc: 'Number with tolerance' },
  short_answer:     { label: 'Short Answer',   color: '#06B6D4', desc: 'Free text (2-3 sentences)' },
  essay:            { label: 'Essay',           color: '#84CC16', desc: 'Long-form response' },
  match_following:  { label: 'Match Following',color: '#EC4899', desc: 'Pair matching' },
  ordering:         { label: 'Ordering',        color: '#EAB308', desc: 'Sequence arrangement' },
  assertion_reason: { label: 'Assertion/Reason',color: '#F43F5E', desc: 'A+R critical thinking' },
  code:             { label: 'Code',            color: '#6366F1', desc: 'Write code' },
  code_trace:       { label: 'Code Trace',      color: '#0EA5E9', desc: 'Trace execution steps' },
  truth_table:      { label: 'Truth Table',     color: '#A855F7', desc: 'Logic grid' },
  multi_correct:    { label: 'Multi-Correct',   color: '#10B981', desc: 'Multiple right answers' },
  passage:          { label: 'Passage',         color: '#F59E0B', desc: 'Comprehension cluster' },
};

function QuestionTypesChart({ pollPerformance }) {
  const counts = {};
  (pollPerformance || []).forEach(p => {
    const qt = p.question_type || 'mcq';
    counts[qt] = (counts[qt] || 0) + 1;
  });

  const total = (pollPerformance || []).length;

  const chartData = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({
      type,
      label: TYPE_META[type]?.label || type,
      count,
      pct: total ? Math.round((count / total) * 100) : 0,
      fill: TYPE_META[type]?.color || '#94A3B8',
    }));

  if (total === 0) {
    return (
      <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-6">
        <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-4">Question Type Distribution</h3>
        <div className="h-64 flex flex-col items-center justify-center text-slate-500 gap-2">
          <span className="text-3xl">📊</span>
          <p className="text-sm">No polls created yet.</p>
          <p className="text-xs text-slate-400">Use different question types to see the distribution here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Horizontal bar chart */}
        <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-1">Question Type Distribution</h3>
          <p className="text-xs text-slate-400 mb-4">{total} poll{total !== 1 ? 's' : ''} across {chartData.length} type{chartData.length !== 1 ? 's' : ''}</p>
          <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 36)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v, name, props) => [`${v} (${props.payload.pct}%)`, 'Questions']} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart */}
        <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-4">Type Mix</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={chartData} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={95}
                label={({ label, percent }) => percent > 0.05 ? `${label} ${(percent * 100).toFixed(0)}%` : ''}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => [v, 'Questions']} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Type breakdown cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {chartData.map((d) => (
          <div key={d.type} className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.fill }} />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{d.label}</p>
            </div>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{d.count}</p>
            <p className="text-xs text-slate-400">{d.pct}% of polls</p>
            <p className="text-xs text-slate-400 mt-0.5">{TYPE_META[d.type]?.desc || ''}</p>
          </div>
        ))}
      </div>

      {/* Diversity note */}
      {chartData.length < 4 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-xl p-4 text-sm text-blue-800 dark:text-blue-300">
          <p className="font-semibold mb-1">Tip: Diversify Question Types</p>
          <p className="text-xs">
            Using only {chartData.length} question type{chartData.length !== 1 ? 's' : ''}. Try adding True/False, Fill-in-Blank, or Numeric questions to build richer assessments and address different cognitive skills.
          </p>
        </div>
      )}
    </div>
  );
}

export default TeacherAnalytics;
