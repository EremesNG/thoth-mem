import type { EmbeddingInputRole } from './providers.js';

const NOMIC_EMBED_PREFIX = /^(search_document|search_query|clustering|classification):/i;

export function formatEmbeddingInput(text: string, model: string, role: EmbeddingInputRole = 'document'): string {
  if (!model.toLowerCase().includes('nomic-embed-text')) {
    return text;
  }

  if (NOMIC_EMBED_PREFIX.test(text.trimStart())) {
    return text;
  }

  const prefix = role === 'query' ? 'search_query' : 'search_document';
  return `${prefix}: ${text}`;
}
