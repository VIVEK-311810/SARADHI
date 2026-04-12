import React, { useEffect, useRef } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-sql';
import 'prismjs/themes/prism-tomorrow.css';

const LANGUAGE_LABELS = {
  javascript: 'JavaScript',
  js: 'JavaScript',
  python: 'Python',
  py: 'Python',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  sql: 'SQL',
};

const PRISM_MAP = {
  js: 'javascript',
  py: 'python',
  cpp: 'cpp',
};

/**
 * Syntax-highlighted code block using Prism.js.
 *
 * Usage:
 *   <CodeBlock code="print('Hello')" language="python" />
 */
export default function CodeBlock({ code = '', language = 'javascript' }) {
  const codeRef = useRef(null);
  const lang = PRISM_MAP[language] || language;
  const label = LANGUAGE_LABELS[language] || language.toUpperCase();

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current);
    }
  }, [code, language]);

  return (
    <div className="relative rounded-lg overflow-hidden my-2 text-sm">
      {/* Language badge */}
      <div className="flex items-center justify-between px-4 py-1 bg-gray-800 border-b border-gray-700">
        <span className="text-xs text-gray-400 font-mono">{label}</span>
        <CopyButton code={code} />
      </div>
      <pre className="!m-0 !rounded-none overflow-x-auto bg-gray-900 p-4">
        <code ref={codeRef} className={`language-${lang}`}>
          {code}
        </code>
      </pre>
    </div>
  );
}

function CopyButton({ code }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-0.5 rounded"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}
