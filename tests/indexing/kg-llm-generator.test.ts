import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKgLlmExtractor } from '../../src/indexing/kg-llm-generator.js';

vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn(async () => vi.fn(async () => [
    {
      generated_text: [
        { role: 'system', content: 'system' },
        {
          role: 'assistant',
          content: JSON.stringify({
            triples: [
              {
                subject: 'Local KG',
                relation: 'IMPLEMENTS',
                object: 'Transformers Extractor',
              },
            ],
          }),
        },
      ],
    },
  ])),
}));

describe('kg llm generator', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests text responses from LM Studio and parses JSON message content', async () => {
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
      response_format: { type: 'text' },
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

  it('supports local Transformers text generation using the HyDE-compatible model', async () => {
    const { pipeline } = await import('@huggingface/transformers');
    const extractor = createKgLlmExtractor({
      enabled: true,
      provider: 'transformers_local',
      model: 'onnx-community/Qwen2.5-Coder-0.5B-Instruct',
      baseUrl: null,
      timeoutMs: 5000,
      minContentChars: 1000,
    });

    const triples = await extractor!.extract({
      content: 'Local KG implements Transformers Extractor.',
      provenance: 'observation:3',
    });

    expect(pipeline).toHaveBeenCalledWith(
      'text-generation',
      'onnx-community/Qwen2.5-Coder-0.5B-Instruct',
      { dtype: 'q4' },
    );
    expect(triples).toEqual([
      {
        subject: 'local kg',
        relation: 'IMPLEMENTS',
        object: 'transformers extractor',
        confidence: 0.86,
      },
    ]);
  });

  it('returns null when KG LLM enrichment is disabled', () => {
    expect(createKgLlmExtractor({
      enabled: false,
      provider: 'ollama',
      model: 'qwen2.5:7b-instruct',
      baseUrl: 'http://127.0.0.1:11434',
      timeoutMs: 5000,
      minContentChars: 1000,
    })).toBeNull();
  });

  it('surfaces HTTP failures from KG LLM providers', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
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

    await expect(extractor!.extract({
      content: 'Session Worker runs in Background Queue.',
      provenance: 'observation:2',
    })).rejects.toThrow('KG LLM request failed: HTTP 503');
  });

  it('rejects KG LLM responses without JSON payloads', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ response: 'no triples here' }),
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

    await expect(extractor!.extract({
      content: 'Session Worker runs in Background Queue.',
      provenance: 'observation:2',
    })).rejects.toThrow('KG LLM response did not contain JSON');
  });
});
