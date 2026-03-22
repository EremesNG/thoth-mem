import { describe, it, expect } from 'vitest';
import { truncateForPreview, validateContentLength, formatObservationMarkdown, formatSearchResultMarkdown } from '../../src/utils/content.js';

describe('truncateForPreview', () => {
  it('returns short content unchanged', () => {
    expect(truncateForPreview('short text')).toBe('short text');
  });

  it('truncates long content at word boundary', () => {
    expect(truncateForPreview('one two three four five', 12)).toBe('one two...');
  });

  it('supports custom maxLength', () => {
    expect(truncateForPreview('alpha beta gamma delta', 16)).toBe('alpha beta gamma...');
  });

  it('cuts one long word at maxLength', () => {
    expect(truncateForPreview('supercalifragilisticexpialidocious', 10)).toBe('supercalif...');
  });

  it('handles empty string', () => {
    expect(truncateForPreview('')).toBe('');
  });
});

describe('validateContentLength', () => {
  it('returns valid without warning when within limit', () => {
    expect(validateContentLength('hello', 10)).toEqual({ valid: true, length: 5 });
  });

  it('returns valid with warning when exceeding limit', () => {
    expect(validateContentLength('hello world', 5)).toEqual({
      valid: true,
      length: 11,
      warning: 'Content is 11 characters (max recommended: 5). Consider breaking into smaller observations.',
    });
  });

  it('returns valid at exact limit', () => {
    expect(validateContentLength('hello', 5)).toEqual({ valid: true, length: 5 });
  });

  it('always returns valid true', () => {
    expect(validateContentLength('this is long', 1).valid).toBe(true);
  });
});

describe('formatObservationMarkdown', () => {
  const baseObservation = {
    id: 7,
    session_id: 'session-1',
    type: 'decision' as const,
    title: 'Use content utils',
    content: 'Full observation content',
    tool_name: null,
    project: 'thoth',
    scope: 'project' as const,
    topic_key: 'content/formatting',
    normalized_hash: null,
    revision_count: 2,
    duplicate_count: 1,
    last_seen_at: null,
    created_at: '2026-03-22T10:00:00.000Z',
    updated_at: '2026-03-22T10:00:00.000Z',
    deleted_at: null,
  };

  it('formats with all fields', () => {
    expect(formatObservationMarkdown(baseObservation)).toBe(
      '### [decision] Use content utils (ID: 7)\n' +
      '**Project:** thoth | **Scope:** project | **Created:** 2026-03-22T10:00:00.000Z\n' +
      '**Topic:** content/formatting | **Revisions:** 2 | **Duplicates:** 1\n' +
      '\n' +
      'Full observation content',
    );
  });

  it('shows none for null project', () => {
    expect(formatObservationMarkdown({ ...baseObservation, project: null, topic_key: null })).toContain('**Project:** none | **Scope:** project | **Created:** 2026-03-22T10:00:00.000Z');
  });

  it('includes topic_key when present', () => {
    expect(formatObservationMarkdown(baseObservation)).toContain('**Topic:** content/formatting | **Revisions:** 2 | **Duplicates:** 1');
  });

  it('omits topic_key when null', () => {
    expect(formatObservationMarkdown({ ...baseObservation, topic_key: null })).not.toContain('**Topic:**');
  });
});

describe('formatSearchResultMarkdown', () => {
  const result = {
    id: 11,
    session_id: 'session-1',
    type: 'pattern' as const,
    title: 'Search result item',
    content: 'Content',
    tool_name: null,
    project: null,
    scope: 'personal' as const,
    topic_key: null,
    normalized_hash: null,
    revision_count: 0,
    duplicate_count: 0,
    last_seen_at: null,
    created_at: '2026-03-22T11:00:00.000Z',
    updated_at: '2026-03-22T11:00:00.000Z',
    deleted_at: null,
    rank: 0.9,
    preview: 'Preview text',
  };

  it('formats multiple results', () => {
    expect(formatSearchResultMarkdown([result, { ...result, id: 12, title: 'Second item', preview: 'Second preview' }])).toBe(
      '## Search Results (2 found)\n\n' +
      '### [pattern] Search result item (ID: 11)\n' +
      '**Project:** none | **Scope:** personal | **Created:** 2026-03-22T11:00:00.000Z\n' +
      'Preview text\n' +
      '---\n' +
      '### [pattern] Second item (ID: 12)\n' +
      '**Project:** none | **Scope:** personal | **Created:** 2026-03-22T11:00:00.000Z\n' +
      'Second preview\n' +
      '---\n\n' +
      '> Use `mem_get_observation` with an ID for full content.',
    );
  });

  it('returns no results found for empty array', () => {
    expect(formatSearchResultMarkdown([])).toBe('No results found.');
  });

  it('includes instruction to use mem_get_observation', () => {
    expect(formatSearchResultMarkdown([result])).toContain('> Use `mem_get_observation` with an ID for full content.');
  });
});
