import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { apiRequest } from '../../utils/api';

export default function DoubtsDashboard({ sessionId }) {
  const { theme } = useTheme();
  const darkMode = theme === 'dark';
  const [doubts, setDoubts] = useState([]);
  const [loading, setLoading] = useState(true);

  const colors = {
    bg: darkMode ? '#0f172a' : '#f8fafc',
    surface: darkMode ? '#1e293b' : '#ffffff',
    border: darkMode ? '#334155' : '#e2e8f0',
    text: darkMode ? '#e2e8f0' : '#1e293b',
    textMuted: darkMode ? '#94a3b8' : '#64748b',
    primary: '#3b82f6',
  };

  const fetchDoubts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiRequest(`/ai-assistant/session/${sessionId}/doubts`);
      setDoubts(data.doubts || []);
    } catch (err) {
      console.error('Error fetching doubts:', err);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) fetchDoubts();
  }, [sessionId, fetchDoubts]);

  const handleResolve = async (doubtId) => {
    try {
      await apiRequest(`/ai-assistant/doubts/${doubtId}/resolve`, { method: 'POST' });
      setDoubts(prev => prev.filter(d => d.id !== doubtId));
    } catch (err) {
      console.error('Error resolving doubt:', err);
    }
  };

  if (loading) {
    return <div style={{ padding: '20px', color: colors.textMuted }}>Loading student doubts...</div>;
  }

  if (doubts.length === 0) {
    return (
      <div style={{
        padding: '40px 20px',
        textAlign: 'center',
        color: colors.textMuted,
      }}>
        <p style={{ fontSize: '16px', marginBottom: '4px' }}>No unresolved doubts</p>
        <p style={{ fontSize: '13px' }}>Students haven't marked any AI responses as confusing yet.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px' }}>
      <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600, color: colors.text }}>
        Student Doubts ({doubts.length} unresolved)
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {doubts.map(doubt => (
          <div key={doubt.id} style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: '10px',
            padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: '14px', color: colors.text }}>
                  {doubt.student_name}
                </span>
                <span style={{ fontSize: '12px', color: colors.textMuted, marginLeft: '8px' }}>
                  {doubt.student_email}
                </span>
              </div>
              <span style={{ fontSize: '11px', color: colors.textMuted }}>
                {new Date(doubt.created_at).toLocaleString()}
              </span>
            </div>

            <div style={{
              padding: '10px 12px',
              backgroundColor: colors.bg,
              borderRadius: '6px',
              fontSize: '13px',
              lineHeight: 1.5,
              marginBottom: '8px',
              borderLeft: '3px solid #f59e0b',
            }}>
              <div style={{ fontWeight: 500, marginBottom: '4px', color: colors.text }}>
                Student's question:
              </div>
              {doubt.doubt_text}
            </div>

            {doubt.ai_messages?.content && (
              <div style={{
                padding: '10px 12px',
                backgroundColor: colors.bg,
                borderRadius: '6px',
                fontSize: '12px',
                lineHeight: 1.5,
                color: colors.textMuted,
                marginBottom: '8px',
                borderLeft: '3px solid #3b82f6',
                maxHeight: '100px',
                overflow: 'hidden',
              }}>
                <div style={{ fontWeight: 500, marginBottom: '4px' }}>AI's response:</div>
                {doubt.ai_messages.content.substring(0, 300)}
                {doubt.ai_messages.content.length > 300 ? '...' : ''}
              </div>
            )}

            <button
              onClick={() => handleResolve(doubt.id)}
              style={{
                padding: '6px 14px',
                backgroundColor: '#22c55e',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              Mark Resolved
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
