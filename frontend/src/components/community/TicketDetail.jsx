import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest, safeParseUser } from '../../utils/api';
import LoadingSpinner from '../shared/LoadingSpinner';

const timeAgo = (dateStr) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const TicketDetail = () => {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const currentUser = safeParseUser();

  const [ticket, setTicket] = useState(null);
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchTicket = async () => {
    setLoading(true);
    try {
      const data = await apiRequest(`/community/tickets/${ticketId}`);
      setTicket(data.ticket || data);
      // Sort: solutions first, then by created_at asc
      const sorted = (data.replies || []).sort((a, b) => {
        if (a.is_solution && !b.is_solution) return -1;
        if (!a.is_solution && b.is_solution) return 1;
        return new Date(a.created_at) - new Date(b.created_at);
      });
      setReplies(sorted);
    } catch (err) {
      setError('Failed to load ticket.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTicket();
  }, [ticketId]);

  const submitReply = async (e) => {
    e.preventDefault();
    if (!replyContent.trim()) return;
    setSubmitting(true);
    try {
      await apiRequest(`/community/tickets/${ticketId}/replies`, {
        method: 'POST',
        body: JSON.stringify({ content: replyContent.trim() }),
      });
      setReplyContent('');
      fetchTicket();
    } catch (err) {
      setError('Failed to post reply.');
    } finally {
      setSubmitting(false);
    }
  };

  const markSolution = async (replyId) => {
    setActionLoading(true);
    try {
      await apiRequest(`/community/replies/${replyId}/solution`, { method: 'PATCH' });
      fetchTicket();
    } catch (err) {
      setError('Failed to mark solution.');
    } finally {
      setActionLoading(false);
    }
  };

  const resolveTicket = async () => {
    setActionLoading(true);
    try {
      await apiRequest(`/community/tickets/${ticketId}/resolve`, { method: 'PATCH' });
      fetchTicket();
    } catch (err) {
      setError('Failed to resolve ticket.');
    } finally {
      setActionLoading(false);
    }
  };

  const canModerate = currentUser && (
    currentUser.role === 'teacher' ||
    (ticket && String(ticket.author_id) === String(currentUser.id))
  );

  if (loading) return <LoadingSpinner text="Loading..." />;

  if (error && !ticket) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
          <p className="text-red-700 dark:text-red-400 mb-4">{error}</p>
          <button onClick={() => navigate(-1)} className="text-primary-600 dark:text-primary-400 underline text-sm">Go back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6 p-3 sm:p-4">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      {/* Ticket */}
      {ticket && (
        <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {ticket.status === 'resolved' ? (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Resolved</span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">Open</span>
            )}
            {ticket.subject && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">{ticket.subject}</span>
            )}
          </div>

          <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mb-3">{ticket.title}</h1>
          <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 whitespace-pre-wrap mb-4">{ticket.content}</p>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-700">
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Asked by <span className="font-medium">{ticket.author_name || 'Unknown'}</span> · {timeAgo(ticket.created_at)}
            </p>
            {canModerate && ticket.status === 'open' && (
              <button
                onClick={resolveTicket}
                disabled={actionLoading}
                className="text-xs sm:text-sm px-3 py-1.5 rounded-lg border border-green-400 text-green-700 hover:bg-green-50 dark:text-green-400 dark:border-green-600 dark:hover:bg-green-900/20 disabled:opacity-60 transition-colors"
              >
                Mark as Resolved
              </button>
            )}
          </div>
        </div>
      )}

      {/* Replies */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide px-1">
          {replies.length} {replies.length === 1 ? 'Reply' : 'Replies'}
        </h2>

        {replies.length === 0 && (
          <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-sm rounded-xl border border-slate-200/60 dark:border-slate-700/60 p-6 text-center text-slate-400 dark:text-slate-500 text-sm">
            No replies yet. Be the first to help!
          </div>
        )}

        {replies.map(reply => (
          <div
            key={reply.id}
            className={`rounded-xl border p-4 sm:p-5 backdrop-blur-sm ${
              reply.is_solution
                ? 'border-green-400/60 dark:border-green-600/60 bg-green-50/80 dark:bg-green-900/10'
                : 'bg-white/75 dark:bg-slate-800/75 border-slate-200/60 dark:border-slate-700/60'
            }`}
          >
            {reply.is_solution && (
              <div className="flex items-center gap-1.5 text-green-700 dark:text-green-400 text-xs font-semibold mb-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Accepted Solution
              </div>
            )}
            <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{reply.content}</p>
            <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2 border-t border-slate-100 dark:border-slate-700/50">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {reply.author_name || 'Unknown'} · {timeAgo(reply.created_at)}
              </p>
              {canModerate && !reply.is_solution && ticket && ticket.status !== 'resolved' && (
                <button
                  onClick={() => markSolution(reply.id)}
                  disabled={actionLoading}
                  className="text-xs px-2.5 py-1 rounded border border-green-400 text-green-700 hover:bg-green-50 dark:text-green-400 dark:border-green-600 dark:hover:bg-green-900/20 disabled:opacity-60 transition-colors"
                >
                  Mark Solution
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Reply form */}
      {ticket && ticket.status !== 'resolved' && (
        <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Your Answer</h3>
          <form onSubmit={submitReply}>
            <textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="Write a helpful reply..."
              rows={4}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none mb-3"
            />
            {error && <p className="text-xs text-red-600 dark:text-red-400 mb-2">{error}</p>}
            <button
              type="submit"
              disabled={submitting || !replyContent.trim()}
              className="w-full sm:w-auto bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white font-medium py-2.5 px-6 rounded-lg text-sm disabled:opacity-60"
            >
              {submitting ? 'Posting...' : 'Post Reply'}
            </button>
          </form>
        </div>
      )}

      {ticket && ticket.status === 'resolved' && (
        <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center text-green-700 dark:text-green-400 text-sm font-medium">
          This doubt has been resolved.
        </div>
      )}
    </div>
  );
};

export default TicketDetail;
