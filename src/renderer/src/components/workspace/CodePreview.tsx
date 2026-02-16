/**
 * CodePreview - Syntax-highlighted code viewer using highlight.js
 */

import { useEffect, useRef } from 'react';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';

interface CodePreviewProps {
  content: string;
  language?: string;
  fileName?: string;
}

// Map file extension to highlight.js language
const EXT_TO_LANG: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.cs': 'csharp',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.xml': 'xml',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.sql': 'sql',
  '.md': 'markdown',
  '.toml': 'ini',
  '.ini': 'ini',
  '.dockerfile': 'dockerfile',
  '.makefile': 'makefile'
};

function getLanguage(fileName?: string): string | undefined {
  if (!fileName) return undefined;
  const ext = '.' + fileName.split('.').pop()?.toLowerCase();
  return EXT_TO_LANG[ext];
}

export function CodePreview({ content, language, fileName }: CodePreviewProps): React.ReactElement {
  const codeRef = useRef<HTMLElement>(null);
  const lang = language || getLanguage(fileName);

  useEffect(() => {
    if (codeRef.current) {
      // Reset previous highlighting
      codeRef.current.removeAttribute('data-highlighted');
      if (lang) {
        codeRef.current.className = `language-${lang}`;
      }
      hljs.highlightElement(codeRef.current);
    }
  }, [content, lang]);

  return (
    <div className="h-full overflow-auto bg-white">
      <pre className="p-4 text-sm leading-relaxed">
        <code ref={codeRef} className={lang ? `language-${lang}` : ''}>
          {content}
        </code>
      </pre>
    </div>
  );
}
