import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteEmbeddingProvider } from '../../src/retrieval/remote-provider.js';

function embeddingConfig() {
  return {
    provider: 'lmstudio' as const,
    model: 'nomic-ai/nomic-embed-text-v1.5',
    baseUrl: 'http://127.0.0.1:1234',
    dimensions: 768,
    hyde: { enabled: false, model: null, baseUrl: null, timeoutMs: 4000 },
    configHash: 'lmstudio-nomic',
  };
}

describe('RemoteEmbeddingProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds Nomic query prefixes for LM Studio embeddings', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new RemoteEmbeddingProvider(embeddingConfig());
    const vectors = await provider.embed(['rotate credentials'], 'query');
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);

    expect(vectors).toEqual([[0.1, 0.2, 0.3]]);
    expect(body.input).toEqual(['search_query: rotate credentials']);
  });

  it('adds Nomic document prefixes for LM Studio embeddings', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new RemoteEmbeddingProvider(embeddingConfig());
    await provider.embed(['rotation policy'], 'document');
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);

    expect(body.input).toEqual(['search_document: rotation policy']);
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

    await expect(provider.embed(['rotate credentials'], 'query'))
      .rejects.toThrow('Embedding request failed (503 Service Unavailable): model warming');
  });

  it('rejects malformed LM Studio embedding responses', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new RemoteEmbeddingProvider(embeddingConfig());

    await expect(provider.embed(['first', 'second'], 'document'))
      .rejects.toThrow('LM Studio embedding response length mismatch');
  });

  it('rejects Ollama responses without embedding arrays', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ response: 'not a vector' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new RemoteEmbeddingProvider({
      ...embeddingConfig(),
      provider: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
    });

    await expect(provider.embed(['first'], 'document'))
      .rejects.toThrow('Ollama embedding response did not include an embedding array.');
  });
});
