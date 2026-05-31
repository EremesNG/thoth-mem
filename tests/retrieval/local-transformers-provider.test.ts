import { describe, expect, it } from 'vitest';
import { formatLocalEmbeddingInput, resolveLocalPipelineOptions } from '../../src/retrieval/local-transformers-provider.js';

describe('formatLocalEmbeddingInput', () => {
  it('adds Nomic task prefixes for query and document embeddings', () => {
    expect(formatLocalEmbeddingInput('rotate credentials', 'nomic-ai/nomic-embed-text-v1.5', 'query'))
      .toBe('search_query: rotate credentials');
    expect(formatLocalEmbeddingInput('rotation policy', 'nomic-ai/nomic-embed-text-v1.5', 'document'))
      .toBe('search_document: rotation policy');
  });

  it('keeps existing prefixes and non-Nomic models unchanged', () => {
    expect(formatLocalEmbeddingInput('search_query: existing', 'nomic-ai/nomic-embed-text-v1.5', 'document'))
      .toBe('search_query: existing');
    expect(formatLocalEmbeddingInput('plain text', 'Xenova/all-MiniLM-L6-v2', 'query'))
      .toBe('plain text');
  });

  it('uses q8 dtype for Nomic local embeddings', () => {
    expect(resolveLocalPipelineOptions('nomic-ai/nomic-embed-text-v1.5')).toEqual({ dtype: 'q8' });
    expect(resolveLocalPipelineOptions('Xenova/all-MiniLM-L6-v2')).toEqual({});
  });
});
