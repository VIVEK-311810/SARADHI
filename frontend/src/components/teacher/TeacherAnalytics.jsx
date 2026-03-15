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
            {['overview', 'polls', 'sessions'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm capitalize whitespace-nowrap ${
                  activeTab === tab
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {tab === 'overview' ? 'Engagement Trends' : tab}
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
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={pollPerformance.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 100]} />
                    <YAxis
                      type="category"
                      dataKey="question"
                      width={200}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip formatter={(value) => [`${value}%`, 'Accuracy']} />
                    <Bar dataKey="accuracyRate" name="Accuracy Rate" fill="#4F46E5" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>

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

export default TeacherAnalytics;
