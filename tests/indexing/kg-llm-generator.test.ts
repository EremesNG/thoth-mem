import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKgLlmExtractor } from '../../src/indexing/kg-llm-generator.js';

describe('kg llm generator', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a constrained JSON extraction prompt to LM Studio chat completions', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  subject: 'Auth Service',
                  relation: 'DEPENDS_ON',
                  object: 'Redis Cache',
                  confidence: 0.91,
                },
                {
                  subject: 'Invalid',
                  relation: 'MADE_UP',
                  object: 'Relation',
                },
              ]),
            },
          },
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const extractor = createKgLlmExtractor({
      enabled: true,
      provider: 'lmstudio',
      model: 'loaded_model',
      baseUrl: 'http://127.0.0.1:1234/v1',
      timeoutMs: 5000,
      minContentChars: 1000,
    });

    const triples = await extractor!.extract({
      content: 'A long conversation says Auth Service depends on Redis Cache.',
      provenance: 'observation:1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:1234/v1/chat/completions');
    expect(JSON.parse(String(request.body))).toMatchObject({
      model: 'loaded_model',
      temperature: 0,
      response_format: { type: 'json_object' },
    });
    expect(triples).toEqual([
      {
        subject: 'auth service',
        relation: 'DEPENDS_ON',
        object: 'redis cache',
        confidence: 0.91,
      },
    ]);
  });

  it('supports Ollama generate responses with JSON fenced content', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        response: [
          '```json',
          JSON.stringify({
            triples: [
              {
                subject: 'Session Worker',
                relation: 'RUNS_IN',
                object: 'Background Queue',
              },
            ],
          }),
          '```',
        ].join('\n'),
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const extractor = createKgLlmExtractor({
      enabled: true,
      provider: 'ollama',
      model: 'qwen2.5:7b-instruct',
      baseUrl: 'http://127.0.0.1:11434',
      timeoutMs: 5000,
      minContentChars: 1000,
    });

    const triples = await extractor!.extract({
      content: 'Session Worker runs in Background Queue.',
      provenance: 'observation:2',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:11434/api/generate');
    expect(JSON.parse(String(request.body))).toMatchObject({
      model: 'qwen2.5:7b-instruct',
      stream: false,
      options: { temperature: 0 },
    });
    expect(triples).toEqual([
      {
        subject: 'session worker',
        relation: 'RUNS_IN',
        object: 'background queue',
        confidence: 0.86,
      },
    ]);
  });
});
