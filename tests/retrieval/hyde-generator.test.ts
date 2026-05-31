import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildHydePrompt,
  RemoteHydeGenerator,
  resolveLocalHydePipelineOptions,
} from '../../src/retrieval/hyde-generator.js';
import type { HydeConfig } from '../../src/config.js';

function hydeConfig(overrides: Partial<HydeConfig> = {}): HydeConfig {
  return {
    enabled: true,
    provider: 'lmstudio',
    model: 'loaded_model',
    baseUrl: 'http://127.0.0.1:1234/v1',
    timeoutMs: 4000,
    ...overrides,
  };
}

describe('HyDE generators', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds a concise hypothetical-answer prompt for vector search', () => {
    expect(buildHydePrompt('How do we rotate API credentials?')).toContain('1-sentence hypothetical answer');
    expect(buildHydePrompt('How do we rotate API credentials?')).toContain('How do we rotate API credentials?');
  });

  it('uses q4 dtype for the default local Transformers.js HyDE model', () => {
    expect(resolveLocalHydePipelineOptions('onnx-community/Qwen2.5-Coder-0.5B-Instruct')).toEqual({ dtype: 'q4' });
    expect(resolveLocalHydePipelineOptions('custom-small-model')).toEqual({});
  });

  it('calls LM Studio through the OpenAI-compatible chat completions endpoint', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Rotate service credentials every 90 days.' } }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const generator = new RemoteHydeGenerator(hydeConfig());
    const answer = await generator.generate({ query: 'How do we rotate credentials?' });
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);

    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:1234/v1/chat/completions');
    expect(body.model).toBe('loaded_model');
    expect(body.max_tokens).toBe(100);
    expect(answer).toBe('Rotate service credentials every 90 days.');
  });

  it('calls Ollama through api/generate for local HyDE generation', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ response: 'Credentials are rotated by revoking old keys and issuing new ones.' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const generator = new RemoteHydeGenerator(hydeConfig({
      provider: 'ollama',
      model: 'qwen2.5:7b-instruct',
      baseUrl: 'http://127.0.0.1:11434',
    }));
    const answer = await generator.generate({ query: 'credential rotation policy' });
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);

    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:11434/api/generate');
    expect(body.model).toBe('qwen2.5:7b-instruct');
    expect(body.options.num_predict).toBe(100);
    expect(answer).toBe('Credentials are rotated by revoking old keys and issuing new ones.');
  });
});
