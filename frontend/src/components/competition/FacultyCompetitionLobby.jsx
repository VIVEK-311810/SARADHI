import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { apiRequest, safeParseUser } from '../../utils/api';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { StatCardsSkeleton } from '../shared/feedback/SkeletonLoader';

// ── Room status badge ─────────────────────────────────────────────────────────
function RoomStatusBadge({ status }) {
  if (status === 'active') return <Badge variant="live" dot>Live</Badge>;
  if (status === 'waiting') return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
      Waiting
    </span>
  );
  return <Badge variant="ended" dot>Ended</Badge>;
}

// ── Main component ────────────────────────────────────────────────────────────
const FacultyCompetitionLobby = () => {
  const navigate = useNavigate();
  const currentUser = safeParseUser();

  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchRooms = useCallback(async () => {
    try {
      const res = await apiRequest('/competition/teacher/rooms');
      if (res.success) setRooms(res.data);
    } catch (err) {
      console.error('Failed to fetch teacher competition rooms', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 10000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line

  const handleWatch = async (roomCode) => {
    try {
      await apiRequest(`/competition/rooms/${roomCode}/join`, {
        method: 'POST',
        body: JSON.stringify({ role: 'spectator' })
      });
      navigate(`/teacher/competition/room/${roomCode}`);
    } catch (err) {
      console.error('Join as spectator failed', err);
      toast.error('Failed to open competition. Please try again.');
    }
  };

  if (!currentUser) { navigate('/auth'); return null; }

  return (
    <div className="max-w-7xl mx-auto space-y-6 px-4 sm:px-6 pb-8">

      {/* Header card */}
      <div className="bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-glass">
        <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-glow-primary flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold font-display text-slate-900 dark:text-white">
              Competitions
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mt-0.5 text-sm">
              Spectate live competitions for your sessions
            </p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 border border-teal-300/60 dark:border-teal-700/60">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Spectator only
          </span>
        </div>

        {loading ? (
          <div className="p-4 sm:p-6">
            <StatCardsSkeleton count={3} />
          </div>
        ) : rooms.length === 0 ? (
          <div className="p-8 sm:p-12 text-center">
            <div className="inline-block text-4xl mb-4">⚔️</div>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              No active competitions for your sessions right now.
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Students can start competitions from the Competition tab.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {rooms.map(room => (
              <div
                key={room.room_code}
                className="p-4 sm:p-6 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors duration-200"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Title + badges */}
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-slate-900 dark:text-white">{room.session_title}</span>
                      <RoomStatusBadge status={room.status} />
                      {room.course_name && (
                        <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">
                          {room.course_name}
                        </span>
                      )}
                    </div>
                    {/* Meta */}
                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {room.player_count || 0} players
                      </span>
                      <span>{room.total_questions} questions</span>
                      <span>{room.time_per_question}s / question</span>
                      <span className="font-mono text-xs bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300">
                        {room.room_code}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleWatch(room.room_code)}
                    className="bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-medium w-full sm:w-auto flex-shrink-0"
                  >
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Watch Live
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FacultyCompetitionLobby;
