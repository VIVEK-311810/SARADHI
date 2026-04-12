import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest, safeParseUser } from '../../utils/api';
import TicketCard from './TicketCard';
import CreateTicketModal from './CreateTicketModal';
import LoadingSpinner from '../shared/feedback/LoadingSpinner';

const SUBJECTS = ['All', 'Data Structures', 'OS', 'DBMS', 'Networks', 'Algorithms', 'OOP', 'Other'];

const CommunityBoard = () => {
  const { sessionId } = useParams(); // undefined → global board
  const navigate = useNavigate();
  const currentUser = safeParseUser();

  const [activeTab, setActiveTab] = useState(sessionId ? 'session' : 'global');
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'open' | 'resolved'
  const [subjectFilter, setSubjectFilter] = useState('All');
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState('');

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let url;
      if (activeTab === 'session' && sessionId) {
        url = `/community/session/${sessionId}`;
      } else {
        url = subjectFilter && subjectFilter !== 'All'
          ? `/community/global?subject=${encodeURIComponent(subjectFilter)}`
          : '/community/global';
      }
      const data = await apiRequest(url);
      let list = Array.isArray(data) ? data : (data.tickets || []);
      if (statusFilter !== 'all') {
        list = list.filter(t => t.status === statusFilter);
      }
      setTickets(list);
    } catch (err) {
      setError('Failed to load tickets.');
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, sessionId, statusFilter, subjectFilter]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Sync tab when sessionId param changes
  useEffect(() => {
    setActiveTab(sessionId ? 'session' : 'global');
  }, [sessionId]);

  const handleUpvote = async (ticketId) => {
    try {
      await apiRequest(`/community/tickets/${ticketId}/upvote`, { method: 'POST' });
      setTickets(prev => prev.map(t => {
        if (t.id !== ticketId) return t;
        const nowUpvoted = !t.has_upvoted;
        return { ...t, has_upvoted: nowUpvoted, upvote_count: t.upvote_count + (nowUpvoted ? 1 : -1) };
      }));
    } catch (err) {
      console.error('Upvote failed:', err);
    }
  };

  const handleCreated = () => {
    fetchTickets();
  };

  const tabClass = (tab) =>
    `px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
      activeTab === tab
        ? 'bg-primary-600 text-white'
        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
    }`;

  return (
    <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6 p-3 sm:p-4">
      {/* Header */}
      <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Community</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Ask doubts, share answers, upvote helpful questions</p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="w-full sm:w-auto bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white font-medium py-2.5 px-5 rounded-lg text-sm"
          >
            + New Doubt
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mt-4">
          {sessionId && (
            <button className={tabClass('session')} onClick={() => setActiveTab('session')}>
              Session Doubts
            </button>
          )}
          <button className={tabClass('global')} onClick={() => setActiveTab('global')}>
            Global Board
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        {/* Status filter */}
        <div className="flex gap-1.5">
          {['all', 'open', 'resolved'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium border transition-colors capitalize ${
                statusFilter === s
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100'
                  : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-slate-500'
              }`}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Subject filter — only on global tab */}
        {activeTab === 'global' && (
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="px-3 py-1.5 text-xs sm:text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {SUBJECTS.map(s => <option key={s}>{s}</option>)}
          </select>
        )}
      </div>

      {/* Ticket list */}
      {loading ? (
        <LoadingSpinner text="Loading doubts..." />
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      ) : tickets.length === 0 ? (
        <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-8 text-center">
          <svg className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base">No doubts posted yet.</p>
          <p className="text-slate-400 dark:text-slate-500 text-xs sm:text-sm mt-1">Be the first to ask a question!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map(ticket => (
            <TicketCard key={ticket.id} ticket={ticket} onUpvote={handleUpvote} />
          ))}
        </div>
      )}

      <CreateTicketModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        sessionId={activeTab === 'session' ? sessionId : null}
        onCreated={handleCreated}
      />
    </div>
  );
};

export default CommunityBoard;
