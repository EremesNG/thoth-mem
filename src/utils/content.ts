import type { Observation, SearchResult } from '../store/types.js';

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
