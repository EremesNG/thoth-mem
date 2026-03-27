import type { Observation, SearchResult, SearchMode } from '../store/types.js';

export function truncateForPreview(content: string, maxLength: number = 300): string {
  if (content.length <= maxLength) {
    return content;
  }

  const cutIndex = content.lastIndexOf(' ', maxLength);
  const endIndex = cutIndex > 0 ? cutIndex : maxLength;

  return `${content.slice(0, endIndex)}...`;
}

export function validateContentLength(content: string, maxLength: number): { valid: boolean; length: number; warning?: string } {
  const length = content.length;

  if (length <= maxLength) {
    return { valid: true, length };
  }

  return {
    valid: true,
    length,
    warning: `Content is ${length} characters (max recommended: ${maxLength}). Consider breaking into smaller observations.`,
  };
}

export function formatObservationMarkdown(obs: Observation): string {
  const topicLine = obs.topic_key ? `**Topic:** ${obs.topic_key} | ` : '';

  return [
    `### [${obs.type}] ${obs.title} (ID: ${obs.id})`,
    `**Project:** ${obs.project || 'none'} | **Scope:** ${obs.scope} | **Created:** ${obs.created_at}`,
    `${topicLine}**Revisions:** ${obs.revision_count} | **Duplicates:** ${obs.duplicate_count}`,
    '',
    obs.content,
  ].join('\n');
}

export function formatSearchResultMarkdown(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No results found.';
  }

  const blocks = results.map((result) => [
    `### [${result.type}] ${result.title} (ID: ${result.id})`,
    `**Project:** ${result.project || 'none'} | **Scope:** ${result.scope} | **Created:** ${result.created_at}`,
    result.preview,
    '---',
  ].join('\n'));

  return [
    `## Search Results (${results.length} found)`,
    '',
    ...blocks,
    '',
    '> Use `mem_get_observation` with an ID for full content.',
  ].join('\n');
}

/**
 * Format a single observation as a compact one-liner for compact search mode.
 * Format: [ID] (type) title — created_at
 * Example: [42] (bugfix) Fixed N+1 query in user list — 2024-01-15
 */
export function formatCompactResult(obs: Observation): string {
  return `[${obs.id}] (${obs.type}) ${obs.title} — ${obs.created_at}`;
}

/**
 * Format a single observation with full preview for preview search mode.
 * Includes: id, type, title, project, scope, topic_key, created_at, revision_count, duplicate_count, and 300ch content preview.
 */
export function formatPreviewResult(obs: Observation, previewLength: number = 300): string {
  const preview = truncateForPreview(obs.content, previewLength);
  const topicLine = obs.topic_key ? `**Topic:** ${obs.topic_key} | ` : '';

  return [
    `### [${obs.type}] ${obs.title} (ID: ${obs.id})`,
    `**Project:** ${obs.project || 'none'} | **Scope:** ${obs.scope} | **Created:** ${obs.created_at}`,
    `${topicLine}**Revisions:** ${obs.revision_count} | **Duplicates:** ${obs.duplicate_count}`,
    '',
    preview,
  ].join('\n');
}

/**
 * Main dispatcher for formatting search results based on mode.
 * - compact: minimal one-liner format per result
 * - preview: full preview format per result
 * Includes header with result count.
 */
export function formatSearchResults(observations: Observation[], mode: SearchMode = 'compact', previewLength: number = 300): string {
  if (observations.length === 0) {
    return 'No memories found.';
  }

  const header = `Found ${observations.length} ${observations.length === 1 ? 'memory' : 'memories'}:`;

  if (mode === 'compact') {
    const lines = observations.map((obs) => formatCompactResult(obs));
    return [header, '', ...lines].join('\n');
  }

  // mode === 'preview'
  const blocks = observations.map((obs) => formatPreviewResult(obs, previewLength));
  return [header, '', ...blocks.join('\n\n---\n\n').split('\n')].join('\n');
}
