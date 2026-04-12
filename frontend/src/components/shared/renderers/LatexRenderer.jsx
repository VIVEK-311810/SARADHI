import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/**
 * Renders mixed text containing LaTeX math expressions.
 * Supports:
 *   Inline:  $...$
 *   Block:   $$...$$
 *
 * Usage:
 *   <LatexRenderer text="The formula is $E = mc^2$ and $$F = ma$$" />
 */
function renderLatex(text) {
  if (!text) return [];

  const parts = [];
  // Split on block first ($$...$$), then inline ($...$)
  const blockPattern = /\$\$([\s\S]*?)\$\$/g;
  const inlinePattern = /\$((?:[^$\\]|\\.)*)\$/g;

  let lastIndex = 0;
  let blockMatch;

  // First pass: extract block equations
  const segments = [];
  blockPattern.lastIndex = 0;
  while ((blockMatch = blockPattern.exec(text)) !== null) {
    if (blockMatch.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, blockMatch.index) });
    }
    segments.push({ type: 'block', content: blockMatch[1] });
    lastIndex = blockMatch.index + blockMatch[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  // Second pass: extract inline equations from text segments
  segments.forEach((seg, segIdx) => {
    if (seg.type !== 'text') {
      parts.push(seg);
      return;
    }
    let textLastIndex = 0;
    let inlineMatch;
    inlinePattern.lastIndex = 0;
    while ((inlineMatch = inlinePattern.exec(seg.content)) !== null) {
      if (inlineMatch.index > textLastIndex) {
        parts.push({ type: 'text', content: seg.content.slice(textLastIndex, inlineMatch.index) });
      }
      parts.push({ type: 'inline', content: inlineMatch[1] });
      textLastIndex = inlineMatch.index + inlineMatch[0].length;
    }
    if (textLastIndex < seg.content.length) {
      parts.push({ type: 'text', content: seg.content.slice(textLastIndex) });
    }
  });

  return parts;
}

export default function LatexRenderer({ text, className = '' }) {
  if (!text) return null;

  const parts = renderLatex(text);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.type === 'text') {
          return <span key={i}>{part.content}</span>;
        }
        if (part.type === 'inline') {
          try {
            const html = katex.renderToString(part.content, { throwOnError: false, displayMode: false });
            return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
          } catch {
            return <span key={i}>${part.content}$</span>;
          }
        }
        if (part.type === 'block') {
          try {
            const html = katex.renderToString(part.content, { throwOnError: false, displayMode: true });
            return (
              <span
                key={i}
                className="block my-2 overflow-x-auto"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          } catch {
            return <span key={i}>$${part.content}$$</span>;
          }
        }
        return null;
      })}
    </span>
  );
}
