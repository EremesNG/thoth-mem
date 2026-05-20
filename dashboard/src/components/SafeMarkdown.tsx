import React from 'react';

interface SafeMarkdownProps {
  content: string;
}

export default function SafeMarkdown({ content }: SafeMarkdownProps) {
  if (!content) return null;

  const lines = content.split(/\r?\n/);
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const flushList = (key: string) => {
    if (listItems.length > 0) {
      if (listType === 'ul') {
        elements.push(
          <ul key={`ul-${key}`} style={{ marginBottom: '16px', paddingLeft: '24px' }}>
            {listItems.map((item, idx) => (
              <li key={idx} style={{ marginBottom: '6px', color: 'var(--text-muted)' }}>
                {renderInlineStyles(item)}
              </li>
            ))}
          </ul>
        );
      } else if (listType === 'ol') {
        elements.push(
          <ol key={`ol-${key}`} style={{ marginBottom: '16px', paddingLeft: '24px' }}>
            {listItems.map((item, idx) => (
              <li key={idx} style={{ marginBottom: '6px', color: 'var(--text-muted)' }}>
                {renderInlineStyles(item)}
              </li>
            ))}
          </ol>
        );
      }
      listItems = [];
      listType = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Handle code blocks
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        // End of code block
        elements.push(
          <pre
            key={`code-${i}`}
            style={{
              backgroundColor: 'var(--bg-main)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '16px',
              overflowX: 'auto',
              marginBottom: '16px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.85rem',
            }}
          >
            <code>{codeBlockLines.join('\n')}</code>
          </pre>
        );
        codeBlockLines = [];
        inCodeBlock = false;
      } else {
        // Start of code block
        flushList(`before-code-${i}`);
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Handle headers
    if (trimmed.startsWith('#')) {
      flushList(`before-h-${i}`);
      const level = (trimmed.match(/^#+/) || [''])[0].length;
      const text = trimmed.replace(/^#+\s*/, '');
      
      if (level === 1) {
        elements.push(<h1 key={i} style={{ marginTop: '24px', marginBottom: '12px', fontSize: '1.75rem' }}>{renderInlineStyles(text)}</h1>);
      } else if (level === 2) {
        elements.push(<h2 key={i} style={{ marginTop: '24px', marginBottom: '12px', fontSize: '1.4rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>{renderInlineStyles(text)}</h2>);
      } else if (level === 3) {
        elements.push(<h3 key={i} style={{ marginTop: '20px', marginBottom: '8px', fontSize: '1.15rem' }}>{renderInlineStyles(text)}</h3>);
      } else {
        elements.push(<h4 key={i} style={{ marginTop: '16px', marginBottom: '8px', fontSize: '1rem' }}>{renderInlineStyles(text)}</h4>);
      }
      continue;
    }

    // Handle horizontal rules
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      flushList(`before-hr-${i}`);
      elements.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '24px 0' }} />);
      continue;
    }

    // Handle bullet lists
    const bulletMatch = line.match(/^(\s*)(?:-|\*)\s+(.+)$/);
    if (bulletMatch) {
      if (listType !== 'ul') {
        flushList(`before-ul-${i}`);
        listType = 'ul';
      }
      listItems.push(bulletMatch[2]);
      continue;
    }

    // Handle numbered lists
    const numberMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (numberMatch) {
      if (listType !== 'ol') {
        flushList(`before-ol-${i}`);
        listType = 'ol';
      }
      listItems.push(numberMatch[2]);
      continue;
    }

    // Handle empty lines
    if (trimmed === '') {
      flushList(`empty-${i}`);
      continue;
    }

    // Regular paragraph
    flushList(`before-p-${i}`);
    elements.push(
      <p key={i} style={{ marginBottom: '16px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
        {renderInlineStyles(line)}
      </p>
    );
  }

  // Flush any remaining lists
  flushList('end');

  return <div className="markdown-content">{elements}</div>;
}

/**
 * Helper to render inline markdown styles like bold, italic, and inline code safely
 */
function renderInlineStyles(text: string): React.ReactNode[] {
  // Simple regex-based inline parser
  // Matches `code`, **bold**, *italic*
  const parts: React.ReactNode[] = [];
  let currentText = text;
  let keyIdx = 0;

  while (currentText.length > 0) {
    // Find first occurrence of code, bold, or italic
    const codeIdx = currentText.indexOf('`');
    const boldIdx = currentText.indexOf('**');
    const italicIdx = currentText.indexOf('*');

    const indices = [
      { type: 'code', index: codeIdx, length: 1 },
      { type: 'bold', index: boldIdx, length: 2 },
      { type: 'italic', index: italicIdx, length: 1 }
    ].filter(item => item.index !== -1);

    if (indices.length === 0) {
      parts.push(currentText);
      break;
    }

    // Sort by first occurrence
    indices.sort((a, b) => a.index - b.index);
    const first = indices[0];

    // Push preceding text
    if (first.index > 0) {
      parts.push(currentText.slice(0, first.index));
    }

    // Find closing tag
    const remaining = currentText.slice(first.index + first.length);
    const closeTag = first.type === 'bold' ? '**' : first.type === 'italic' ? '*' : '`';
    const closeIdx = remaining.indexOf(closeTag);

    if (closeIdx === -1) {
      // Unclosed tag, treat as plain text
      parts.push(currentText.slice(first.index, first.index + first.length));
      currentText = remaining;
      continue;
    }

    const innerText = remaining.slice(0, closeIdx);

    if (first.type === 'code') {
      parts.push(
        <code
          key={`inline-code-${keyIdx++}`}
          style={{
            fontFamily: 'var(--font-mono)',
            backgroundColor: 'var(--bg-hover)',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '0.85rem',
            color: '#f43f5e',
          }}
        >
          {innerText}
        </code>
      );
    } else if (first.type === 'bold') {
      parts.push(<strong key={`inline-bold-${keyIdx++}`} style={{ color: 'var(--text-main)', fontWeight: 600 }}>{innerText}</strong>);
    } else if (first.type === 'italic') {
      parts.push(<em key={`inline-italic-${keyIdx++}`}>{innerText}</em>);
    }

    currentText = remaining.slice(closeIdx + first.length);
  }

  return parts;
}
