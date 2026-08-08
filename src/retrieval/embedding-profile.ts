import type { EmbeddingInput } from './providers.js';

export type EmbeddingProfileId = 'nomic' | 'embeddinggemma' | 'qwen3' | 'raw';
export type EmbeddingProfileSelection = 'auto' | EmbeddingProfileId;

export interface ResolvedEmbeddingProfile {
  id: EmbeddingProfileId;
  version: 1;
  inferred: boolean;
}

const NOMIC_PREFIX = /^(search_document|search_query|clustering|classification):/i;
const EMBEDDINGGEMMA_QUERY_PREFIX = /^task:\s*search result\s*\|\s*query:/i;
const EMBEDDINGGEMMA_DOCUMENT_PREFIX = /^title:.*\|\s*text:/i;
const QWEN_RETRIEVAL_INSTRUCTION = 'Given a user query, retrieve relevant passages that answer the query';
const QWEN_QUERY_PREFIX = `Instruct: ${QWEN_RETRIEVAL_INSTRUCTION}\nQuery:`;

function inferProfileId(model: string): EmbeddingProfileId {
  const normalized = model.toLowerCase();

  if (normalized.includes('nomic-embed-text')) {
    return 'nomic';
  }
  if (normalized.includes('embeddinggemma')) {
    return 'embeddinggemma';
  }
  if (normalized.includes('qwen3-embedding')) {
    return 'qwen3';
  }
  return 'raw';
}

export function resolveEmbeddingProfile(
  model: string,
  selection: EmbeddingProfileSelection = 'auto',
): ResolvedEmbeddingProfile {
  if (selection !== 'auto') {
    return { id: selection, version: 1, inferred: false };
  }

  const id = inferProfileId(model);
  return { id, version: 1, inferred: id !== 'raw' };
}

export function formatEmbeddingInputForProfile(
  input: EmbeddingInput,
  profile: ResolvedEmbeddingProfile,
): string {
  const leftTrimmed = input.text.trimStart();

  if (profile.id === 'nomic') {
    if (NOMIC_PREFIX.test(leftTrimmed)) {
      return input.text;
    }
    const prefix = input.role === 'query' ? 'search_query' : 'search_document';
    return `${prefix}: ${input.text}`;
  }

  if (profile.id === 'embeddinggemma') {
    if (input.role === 'query') {
      return EMBEDDINGGEMMA_QUERY_PREFIX.test(leftTrimmed)
        ? input.text
        : `task: search result | query: ${input.text}`;
    }
    if (EMBEDDINGGEMMA_DOCUMENT_PREFIX.test(leftTrimmed)) {
      return input.text;
    }
    const title = input.title?.trim() || 'none';
    return `title: ${title} | text: ${input.text}`;
  }

  if (profile.id === 'qwen3' && input.role === 'query') {
    return leftTrimmed.startsWith(QWEN_QUERY_PREFIX)
      ? input.text
      : `${QWEN_QUERY_PREFIX}${input.text}`;
  }

  return input.text;
}
