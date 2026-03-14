import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';

export default function QuizCard({ questions }) {
  const { theme } = useTheme();
  const darkMode = theme === 'dark';
  const [answers, setAnswers] = useState({});
  const [showResults, setShowResults] = useState({});

  if (!questions || questions.length === 0) return null;

  const bgColor = darkMode ? '#1e293b' : '#ffffff';
  const borderColor = darkMode ? '#334155' : '#e2e8f0';
  const textColor = darkMode ? '#e2e8f0' : '#1e293b';
  const mutedColor = darkMode ? '#94a3b8' : '#64748b';

  const handleSelect = (qIndex, option) => {
    if (showResults[qIndex]) return; // Already answered
    setAnswers(prev => ({ ...prev, [qIndex]: option }));
  };

  const handleCheck = (qIndex) => {
    setShowResults(prev => ({ ...prev, [qIndex]: true }));
  };

  const difficultyColors = {
    easy: '#22c55e',
    medium: '#f59e0b',
    hard: '#ef4444',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {questions.map((q, qIndex) => {
        const selectedOption = answers[qIndex];
        const isRevealed = showResults[qIndex];
        const correctLetter = q.correctAnswer;

        return (
          <div key={qIndex} style={{
            backgroundColor: bgColor,
            border: `1px solid ${borderColor}`,
            borderRadius: '10px',
            padding: '16px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontWeight: 600, color: textColor, fontSize: '14px' }}>
                Q{qIndex + 1}. {q.question}
              </span>
              {q.difficulty && (
                <span style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  color: difficultyColors[q.difficulty] || mutedColor,
                  textTransform: 'uppercase',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: `1px solid ${difficultyColors[q.difficulty] || mutedColor}`,
                }}>
                  {q.difficulty}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {(q.options || []).map((option, oIndex) => {
                const optionLetter = String.fromCharCode(65 + oIndex); // A, B, C, D
                const isSelected = selectedOption === optionLetter;
                const isCorrect = optionLetter === correctLetter;

                let optionBg = darkMode ? '#0f172a' : '#f8fafc';
                let optionBorder = borderColor;

                if (isRevealed) {
                  if (isCorrect) {
                    optionBg = darkMode ? '#052e16' : '#dcfce7';
                    optionBorder = '#22c55e';
                  } else if (isSelected && !isCorrect) {
                    optionBg = darkMode ? '#450a0a' : '#fecaca';
                    optionBorder = '#ef4444';
                  }
                } else if (isSelected) {
                  optionBg = darkMode ? '#1e3a5f' : '#dbeafe';
                  optionBorder = '#3b82f6';
                }

                return (
                  <button
                    key={oIndex}
                    onClick={() => handleSelect(qIndex, optionLetter)}
                    disabled={isRevealed}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      backgroundColor: optionBg,
                      border: `1px solid ${optionBorder}`,
                      borderRadius: '6px',
                      cursor: isRevealed ? 'default' : 'pointer',
                      textAlign: 'left',
                      color: textColor,
                      fontSize: '13px',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{
                      fontWeight: 600,
                      minWidth: '20px',
                      color: isRevealed && isCorrect ? '#22c55e' : isRevealed && isSelected ? '#ef4444' : mutedColor,
                    }}>
                      {optionLetter})
                    </span>
                    {option.replace(/^[A-D]\)\s*/, '')}
                  </button>
                );
              })}
            </div>

            {selectedOption && !isRevealed && (
              <button
                onClick={() => handleCheck(qIndex)}
                style={{
                  marginTop: '10px',
                  padding: '6px 16px',
                  backgroundColor: '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                Check Answer
              </button>
            )}

            {isRevealed && q.justification && (
              <div style={{
                marginTop: '10px',
                padding: '8px 12px',
                backgroundColor: darkMode ? '#0f172a' : '#f0f9ff',
                borderRadius: '6px',
                fontSize: '12px',
                color: mutedColor,
                borderLeft: '3px solid #3b82f6',
              }}>
                <strong>Explanation:</strong> {q.justification}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
