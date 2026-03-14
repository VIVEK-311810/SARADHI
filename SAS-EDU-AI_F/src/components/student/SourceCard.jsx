import React from 'react';
import { useTheme } from '../../context/ThemeContext';

const typeColors = {
  pdf: '#ef4444',
  document: '#3b82f6',
  presentation: '#22c55e',
  spreadsheet: '#f59e0b',
  url: '#8b5cf6',
};

export default function SourceCard({ source }) {
  const { theme } = useTheme();
  const darkMode = theme === 'dark';

  const bgColor = darkMode ? '#1e293b' : '#f8fafc';
  const borderColor = darkMode ? '#334155' : '#e2e8f0';
  const textColor = darkMode ? '#e2e8f0' : '#334155';
  const mutedColor = darkMode ? '#94a3b8' : '#64748b';
  const badgeColor = typeColors[source.resourceType] || '#6b7280';

  return (
    <div style={{
      backgroundColor: bgColor,
      border: `1px solid ${borderColor}`,
      borderRadius: '8px',
      padding: '10px 12px',
      marginBottom: '6px',
      fontSize: '13px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <span style={{
          backgroundColor: badgeColor,
          color: '#fff',
          padding: '1px 6px',
          borderRadius: '4px',
          fontSize: '10px',
          fontWeight: 600,
          textTransform: 'uppercase',
        }}>
          {source.resourceType || 'doc'}
        </span>
        <span style={{ fontWeight: 600, color: textColor, flex: 1 }}>
          {source.resourceTitle || source.fileName || 'Unknown Source'}
        </span>
        {source.pageNumber && (
          <span style={{ color: mutedColor, fontSize: '11px' }}>
            Page {source.pageNumber}
          </span>
        )}
        {source.similarityScore && (
          <span style={{
            color: source.similarityScore > 0.6 ? '#22c55e' : source.similarityScore > 0.3 ? '#f59e0b' : '#ef4444',
            fontSize: '11px',
            fontWeight: 600,
          }}>
            {Math.round(source.similarityScore * 100)}%
          </span>
        )}
      </div>
      {source.sectionTitle && (
        <div style={{ color: mutedColor, fontSize: '11px', marginBottom: '3px' }}>
          Section: {source.sectionTitle}
        </div>
      )}
      {source.snippet && (
        <div style={{ color: mutedColor, fontSize: '12px', lineHeight: 1.4 }}>
          {source.snippet}
        </div>
      )}
      {source.fileUrl && (
        <a
          href={source.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#3b82f6', fontSize: '11px', textDecoration: 'none', marginTop: '4px', display: 'inline-block' }}
        >
          View Document
        </a>
      )}
    </div>
  );
}
