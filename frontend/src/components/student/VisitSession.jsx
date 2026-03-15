// src/components/student/VisitSession.jsx

import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { sessionAPI,apiRequest } from "../../utils/api";

export default function VisitSession() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // fetch session details
  const fetchSession = async () => {
    try {
      const sessionRes = await sessionAPI.getSession(sessionId);
      setSession(sessionRes.data);
    } catch (err) {
      setError("Unable to load session details.");
    }
  };

  // fetch polls for this session
  const fetchPolls = async () => {
    try {
      const data = await apiRequest(`/sessions/${sessionId}/polls`);
      const polls = data.polls || data;

      const normalized = Array.isArray(polls)
        ? polls.map((p) => ({
            ...p,
            correctAnswer:
              p.correctAnswer !== undefined ? p.correctAnswer : p.correct_answer,
            createdAt: p.createdAt || p.created_at,
            isActive: p.isActive !== undefined ? p.isActive : p.is_active,
            options: Array.isArray(p.options)
              ? p.options
              : typeof p.options === "string"
              ? JSON.parse(p.options)
              : [],
          }))
        : [];

      setPolls(normalized);
    } catch (error) {
      console.error("Error fetching polls:", error);
      setPolls([]);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchSession();
      await fetchPolls();
      setLoading(false);
    };
    loadData();
  }, [sessionId]);

    const formatTimeAgo = (dateString) => {
        if (!dateString) return "N/A";
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);

        if (seconds < 60) return "Just now";
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    };


  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto p-4 bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg">
        {error}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-6 pb-8">
      {/* Back Button + Take Quiz */}
      <div className="mb-4 sm:mb-6 flex items-center justify-between gap-3">
        <button
          onClick={() => navigate('/student/dashboard')}
          className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span className="font-medium text-sm sm:text-base">Back to Dashboard</span>
        </button>
        <button
          onClick={() => navigate(`/student/session/${sessionId}/quiz`)}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 active:bg-primary-800 text-sm sm:text-base font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          Take Quiz
        </button>
      </div>

      {/* Session Header */}
      {session && (
        <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6 mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{session.title}</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2 text-sm sm:text-base">{session.description}</p>
          <div className="mt-3 sm:mt-4 space-y-1">
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              <span className="font-medium">Course:</span> {session.course_name}
            </p>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              <span className="font-medium">Session ID:</span> {session.session_id}
            </p>
          </div>
        </div>
      )}

      {/* Polls Section */}
      <div>
        <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-slate-900 dark:text-white">Session Polls</h3>
        {polls.length === 0 ? (
            <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-6 sm:p-8 text-center">
              <svg className="w-12 h-12 sm:w-16 sm:h-16 text-slate-300 dark:text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base">No polls available yet.</p>
            </div>
        ) : (
            <div className="space-y-3 sm:space-y-4">
            {polls.map((poll) => (
                <div
                key={poll.id}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow"
                >
                <div className="flex flex-col gap-3 sm:gap-0 sm:flex-row sm:justify-between sm:items-start">
                    <div className="flex-1 min-w-0">
                    {/* Question */}
                    <h4 className="font-medium text-slate-900 dark:text-white mb-2 sm:mb-3 text-sm sm:text-base">
                        {poll.question}
                    </h4>

                    {/* Options */}
                    <div className="space-y-1.5 sm:space-y-2">
                        {poll.options.map((option, index) => (
                        <div
                            key={index}
                            className="flex items-start gap-2"
                        >
                            <span
                            className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-xs sm:text-sm flex-shrink-0 ${
                                index === poll.correctAnswer
                                ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 font-medium"
                                : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
                            }`}
                            >
                            {String.fromCharCode(65 + index)}
                            </span>
                            <span
                            className={`text-xs sm:text-sm ${
                                index === poll.correctAnswer
                                ? "font-medium text-green-800 dark:text-green-300"
                                : "text-slate-700 dark:text-slate-300"
                            }`}
                            >
                            {option}
                            </span>
                        </div>
                        ))}
                    </div>

                    {/* Justification (if any) */}
                    {poll.justification && (
                        <div className="mt-2 sm:mt-3 p-2 sm:p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-100 dark:border-primary-800">
                          <p className="text-xs sm:text-sm text-primary-900 dark:text-primary-300">
                            <span className="font-medium">Justification:</span> {poll.justification}
                          </p>
                        </div>
                    )}

                    {/* Metadata */}
                    <div className="mt-2 sm:mt-3 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          {poll.responses || 0} responses
                        </span>
                        <span className="text-slate-400">•</span>
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {formatTimeAgo(poll.createdAt)}
                        </span>
                    </div>
                    </div>

                    {/* Student Action - Hidden for now since it navigates to same page */}
                    {/* <div className="flex items-center sm:ml-4">
                    <button
                        onClick={() =>
                        navigate(`/student/session/${sessionId}/history`)
                        }
                        className="w-full sm:w-auto bg-primary-100 hover:bg-primary-200 active:bg-blue-300 text-primary-800 font-medium py-2 px-4 rounded-lg transition-colors duration-200 text-sm"
                    >
                        View / Answer
                    </button>
                    </div> */}
                </div>
                </div>
            ))}
            </div>
        )}
        </div>

    </div>
  );
}
