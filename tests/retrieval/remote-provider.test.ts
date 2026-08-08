import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteEmbeddingProvider } from '../../src/retrieval/remote-provider.js';
import { resolveEmbeddingProfile } from '../../src/retrieval/embedding-profile.js';
import type { EmbeddingInput } from '../../src/retrieval/providers.js';

function embeddingConfig(model = 'nomic-ai/nomic-embed-text-v1.5') {
  return {
    provider: 'lmstudio' as const,
    model,
    baseUrl: 'http://127.0.0.1:1234',
    dimensions: 3,
    profile: 'auto' as const,
    resolvedProfile: resolveEmbeddingProfile(model),
    normalize: true,
    configHash: `lmstudio-${model}`,
  };
}

function input(text: string, role: EmbeddingInput['role'], title?: string): EmbeddingInput {
  return { text, intent: 'retrieval', role, ...(title ? { title } : {}) };
}

describe('RemoteEmbeddingProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('formats Nomic input and preserves the exact LM Studio model ID', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ index: 0, embedding: [1, 0, 0] }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new RemoteEmbeddingProvider(embeddingConfig('text-embedding-nomic-embed-text-v1.5@q8_0'));
    const vectors = await provider.embed([input('rotate credentials', 'query')]);
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);

    expect(vectors).toEqual([[1, 0, 0]]);
    expect(body).toEqual({
      model: 'text-embedding-nomic-embed-text-v1.5@q8_0',
      input: ['search_query: rotate credentials'],
    });
  });

  it('formats mixed EmbeddingGemma roles and restores response-index order', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { index: 1, embedding: [0, 0, 2] },
          { index: 0, embedding: [3, 4, 0] },
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new RemoteEmbeddingProvider(embeddingConfig('text-embedding-embeddinggemma-300m'));
    const vectors = await provider.embed([
      input('rotate credentials', 'query'),
      input('rotation policy', 'document', 'Security runbook'),
    ]);
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);

    expect(body.input).toEqual([
      'task: search result | query: rotate credentials',
      'title: Security runbook | text: rotation policy',
    ]);
    expect(vectors).toEqual([[0.6, 0.8, 0], [0, 0, 1]]);
  });

  it('adds the Qwen instruction only to remote queries', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { index: 0, embedding: [1, 0, 0] },
          { index: 1, embedding: [0, 1, 0] },
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new RemoteEmbeddingProvider(embeddingConfig('Qwen/Qwen3-Embedding-0.6B'));
    await provider.embed([
      input('rotate credentials', 'query'),
      input('rotation policy', 'document'),
    ]);
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);

    expect(body.input).toEqual([
      'Instruct: Given a user query, retrieve relevant passages that answer the query\nQuery:rotate credentials',
      'rotation policy',
    ]);
  });

  it('surfaces HTTP failures from embedding providers', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: async () => 'model warming',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new RemoteEmbeddingProvider(embeddingConfig());

    await expect(provider.embed([input('rotate credentials', 'query')]))
      .rejects.toThrow('Embedding request failed (503 Service Unavailable): model warming');
  });

  it('rejects malformed LM Studio embedding responses', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new RemoteEmbeddingProvider(embeddingConfig());

    await expect(provider.embed([input('first', 'document'), input('second', 'document')]))
      .rejects.toThrow('Embedding response length mismatch (expected 2, got 0).');
  });

  it('formats and validates Ollama embeddings through the same contract', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ embedding: [0, 4, 3] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new RemoteEmbeddingProvider({
      ...embeddingConfig(),
      provider: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
    });
    const vectors = await provider.embed([input('first', 'document')]);
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);

    expect(body.prompt).toBe('search_document: first');
    expect(vectors).toEqual([[0, 0.8, 0.6]]);
  });

  it('preserves validated vector magnitudes when normalization is disabled', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ index: 0, embedding: [0, 4, 3] }] }),
    })));
    const provider = new RemoteEmbeddingProvider({
      ...embeddingConfig(),
      normalize: false,
    });

    await expect(provider.embed([input('first', 'document')])).resolves.toEqual([[0, 4, 3]]);
  });
});
