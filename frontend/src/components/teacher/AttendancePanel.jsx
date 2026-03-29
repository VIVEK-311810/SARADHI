import React from 'react';

const formatTimeAgo = (timestamp) => {
  if (!timestamp) return 'Unknown';
  const now = new Date();
  const time = new Date(timestamp);
  const diffInSeconds = Math.floor((now - time) / 1000);
  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
};

const AttendancePanel = ({
  sessionId,
  wsConnected,
  attendanceWindowOpen,
  attendanceDuration,
  setAttendanceDuration,
  attendanceCountdown,
  attendanceCounts,
  attendanceList,
  participants,
  session,
  onOpenAttendance,
  onCloseAttendance,
}) => {
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Attendance Controls */}
      <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-4">
        <h3 className="text-base sm:text-lg font-semibold text-primary-900 dark:text-primary-200 mb-3">Attendance</h3>
        {attendanceWindowOpen ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-2xl font-bold text-primary-700 dark:text-primary-300 tabular-nums w-12">
                {attendanceCountdown}s
              </div>
              <div className="text-sm text-primary-600 dark:text-primary-400">window open</div>
              <div className="flex flex-wrap gap-2 ml-auto">
                <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 px-3 py-1 rounded-full text-sm font-medium">
                  {attendanceCounts.present} Present
                </span>
                <span className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 px-3 py-1 rounded-full text-sm font-medium">
                  {attendanceCounts.late} Late
                </span>
                <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 px-3 py-1 rounded-full text-sm font-medium">
                  {attendanceCounts.absent} Absent
                </span>
              </div>
            </div>
            <button
              onClick={onCloseAttendance}
              className="bg-red-600 hover:bg-red-700 active:bg-red-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium w-full sm:w-auto"
            >
              Close Attendance Window
            </button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
            <div>
              <label className="block text-xs font-medium text-primary-700 dark:text-primary-300 mb-1">
                Duration (seconds)
              </label>
              <input
                type="number"
                value={attendanceDuration}
                onChange={(e) => setAttendanceDuration(Math.min(300, Math.max(10, parseInt(e.target.value) || 60)))}
                className="w-24 p-2 border border-primary-300 dark:border-primary-700 rounded-lg text-sm bg-white dark:bg-slate-700 dark:text-white"
                min="10"
                max="300"
              />
            </div>
            <button
              onClick={onOpenAttendance}
              disabled={!wsConnected}
              className="bg-primary-600 hover:bg-primary-700 active:bg-primary-800 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-medium w-full sm:w-auto"
            >
              Take Attendance
            </button>
          </div>
        )}
      </div>

      {/* Attendance Summary (shown after attendance taken) */}
      {attendanceList.length > 0 && !attendanceWindowOpen && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Present', count: attendanceCounts.present, color: 'green' },
            { label: 'Late',    count: attendanceCounts.late,    color: 'yellow' },
            { label: 'Absent',  count: attendanceCounts.absent,  color: 'red' },
          ].map(({ label, count, color }) => (
            <div key={label} className={`bg-${color}-50 dark:bg-${color}-900/20 rounded-lg p-3 text-center border border-${color}-200 dark:border-${color}-800`}>
              <div className={`text-xl font-bold text-${color}-700 dark:text-${color}-300`}>{count}</div>
              <div className={`text-xs text-${color}-600 dark:text-${color}-400`}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Participants Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold dark:text-white">Session Participants</h3>
        <div className="text-sm text-slate-500 dark:text-slate-400">
          {participants.length} participant{participants.length !== 1 ? 's' : ''}
        </div>
      </div>

      {participants.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-slate-500 dark:text-slate-400 mb-2">No participants yet.</p>
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Share session ID <strong>{session.session_id}</strong> with students to join.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-700/50">
              <tr>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Student</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden sm:table-cell">Email</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden sm:table-cell">Joined At</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {attendanceList.length > 0 ? 'Attendance' : 'Status'}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
              {(attendanceList.length > 0 ? attendanceList : participants).map((participant) => {
                const attendanceStatus = participant.attendance_status;
                const attendanceBadge = {
                  present: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400',
                  late:    'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400',
                  absent:  'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400',
                }[attendanceStatus] || 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-300';

                return (
                  <tr key={participant.id}>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-slate-900 dark:text-white">
                        {participant.full_name || participant.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 sm:hidden">{participant.email}</div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                      <div className="text-sm text-slate-500 dark:text-slate-400">{participant.email}</div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                      <div className="text-sm text-slate-500 dark:text-slate-400">{formatTimeAgo(participant.joined_at)}</div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                      {attendanceList.length > 0 && attendanceStatus ? (
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${attendanceBadge}`}>
                          {attendanceStatus.charAt(0).toUpperCase() + attendanceStatus.slice(1)}
                        </span>
                      ) : (
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          participant.is_active
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-300'
                        }`}>
                          {participant.is_active ? 'Active' : 'Inactive'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AttendancePanel;
