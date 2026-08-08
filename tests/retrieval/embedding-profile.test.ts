import { describe, expect, it } from 'vitest';
import {
  formatEmbeddingInputForProfile,
  resolveEmbeddingProfile,
} from '../../src/retrieval/embedding-profile.js';

describe('resolveEmbeddingProfile', () => {
  it('resolves known model families and falls back to raw deterministically', () => {
    expect(resolveEmbeddingProfile('text-embedding-nomic-embed-text-v1.5@Q8_0', 'auto'))
      .toMatchObject({ id: 'nomic', version: 1, inferred: true });
    expect(resolveEmbeddingProfile('ggml-org/embeddinggemma-300M-GGUF', 'auto'))
      .toMatchObject({ id: 'embeddinggemma', version: 1, inferred: true });
    expect(resolveEmbeddingProfile('Qwen/Qwen3-Embedding-0.6B', 'auto'))
      .toMatchObject({ id: 'qwen3', version: 1, inferred: true });
    expect(resolveEmbeddingProfile('custom/acme-vectorizer', 'auto'))
      .toMatchObject({ id: 'raw', version: 1, inferred: false });
  });

  it('honors an explicit built-in profile for an unknown model identifier', () => {
    expect(resolveEmbeddingProfile('custom/acme-vectorizer', 'qwen3'))
      .toMatchObject({ id: 'qwen3', version: 1, inferred: false });
  });
});

describe('formatEmbeddingInputForProfile', () => {
  it('formats Nomic queries and documents exactly once', () => {
    const profile = resolveEmbeddingProfile('nomic-ai/nomic-embed-text-v1.5');

    expect(formatEmbeddingInputForProfile({
      text: 'rotate credentials',
      intent: 'retrieval',
      role: 'query',
    }, profile)).toBe('search_query: rotate credentials');
    expect(formatEmbeddingInputForProfile({
      text: 'search_document: rotation policy',
      intent: 'retrieval',
      role: 'document',
    }, profile)).toBe('search_document: rotation policy');
  });

  it('formats EmbeddingGemma queries and titled documents exactly once', () => {
    const profile = resolveEmbeddingProfile('ggml-org/embeddinggemma-300M-GGUF');

    expect(formatEmbeddingInputForProfile({
      text: 'rotate credentials',
      intent: 'retrieval',
      role: 'query',
    }, profile)).toBe('task: search result | query: rotate credentials');
    expect(formatEmbeddingInputForProfile({
      text: 'rotation policy',
      title: 'Security runbook',
      intent: 'retrieval',
      role: 'document',
    }, profile)).toBe('title: Security runbook | text: rotation policy');
    expect(formatEmbeddingInputForProfile({
      text: 'title: none | text: existing',
      intent: 'retrieval',
      role: 'document',
    }, profile)).toBe('title: none | text: existing');
  });

  it('adds the Qwen retrieval instruction only to queries', () => {
    const profile = resolveEmbeddingProfile('Qwen/Qwen3-Embedding-0.6B');
    const instructed = 'Instruct: Given a user query, retrieve relevant passages that answer the query\nQuery:rotate credentials';

    expect(formatEmbeddingInputForProfile({
      text: 'rotate credentials',
      intent: 'retrieval',
      role: 'query',
    }, profile)).toBe(instructed);
    expect(formatEmbeddingInputForProfile({
      text: instructed,
      intent: 'retrieval',
      role: 'query',
    }, profile)).toBe(instructed);
    expect(formatEmbeddingInputForProfile({
      text: 'rotation policy',
      title: 'Security runbook',
      intent: 'retrieval',
      role: 'document',
    }, profile)).toBe('rotation policy');
  });

  it('leaves raw-profile input unchanged', () => {
    const profile = resolveEmbeddingProfile('custom/acme-vectorizer');

    expect(formatEmbeddingInputForProfile({
      text: 'plain text',
      intent: 'retrieval',
      role: 'query',
    }, profile)).toBe('plain text');
  });
});
