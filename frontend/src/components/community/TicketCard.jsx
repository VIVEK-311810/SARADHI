import React from 'react';
import { useNavigate } from 'react-router-dom';

const statusBadge = (status) => {
  if (status === 'resolved') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
        Resolved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
      Open
    </span>
  );
};

const timeAgo = (dateStr) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const TicketCard = ({ ticket, onUpvote }) => {
  const navigate = useNavigate();

  const handleUpvote = (e) => {
    e.stopPropagation();
    if (onUpvote) onUpvote(ticket.id);
  };

  return (
    <div
      onClick={() => navigate(`/community/tickets/${ticket.id}`)}
      className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4 sm:p-5 cursor-pointer hover:border-primary-300/60 dark:hover:border-primary-600/40 hover:shadow-card transition-all duration-200 active:scale-[0.99]"
    >
      <div className="flex items-start gap-3">
        {/* Upvote column */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
          <button
            onClick={handleUpvote}
            className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg border transition-colors ${
              ticket.has_upvoted
                ? 'bg-accent-50 border-accent-300 text-accent-600 dark:bg-accent-900/20 dark:border-accent-600 dark:text-accent-400'
                : 'border-slate-200 text-slate-500 hover:border-accent-300 hover:text-accent-500 dark:border-slate-600 dark:text-slate-400 dark:hover:border-accent-600 dark:hover:text-accent-400'
            }`}
            aria-label="Upvote"
          >
            <svg className="w-4 h-4" fill={ticket.has_upvoted ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
            <span className="text-xs font-bold tabular-nums">{ticket.upvote_count || 0}</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            {statusBadge(ticket.status)}
            {ticket.subject && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
                {ticket.subject}
              </span>
            )}
          </div>
          <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white line-clamp-2 mb-1">
            {ticket.title}
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-2">
            {ticket.content}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 dark:text-slate-500">
            <span>{ticket.author_name || 'Unknown'}</span>
            <span>·</span>
            <span>{timeAgo(ticket.created_at)}</span>
            {ticket.reply_count > 0 && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  {ticket.reply_count} {ticket.reply_count === 1 ? 'reply' : 'replies'}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketCard;
