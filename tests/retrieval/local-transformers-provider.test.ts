import { describe, expect, it, vi } from 'vitest';
import {
  LocalTransformersEmbeddingProvider,
  extractSentenceEmbeddingRows,
  poolQwenLastToken,
  resolveLocalModelKind,
  resolveLocalPipelineOptions,
} from '../../src/retrieval/local-transformers-provider.js';
import { resolveEmbeddingProfile } from '../../src/retrieval/embedding-profile.js';
import type { EmbeddingInput } from '../../src/retrieval/providers.js';

function embeddingConfig(model: string, dimensions = 3) {
  return {
    provider: 'transformers_local' as const,
    model,
    baseUrl: null,
    dimensions,
    profile: 'auto' as const,
    resolvedProfile: resolveEmbeddingProfile(model),
    normalize: true,
    configHash: `local-${model}`,
  };
}

function input(text: string, role: EmbeddingInput['role'], title?: string): EmbeddingInput {
  return { text, intent: 'retrieval', role, ...(title ? { title } : {}) };
}

describe('local model selection', () => {
  it('selects dedicated candidate executors and Q8 weights', () => {
    expect(resolveLocalModelKind('onnx-community/embeddinggemma-300m-ONNX')).toBe('embeddinggemma');
    expect(resolveLocalModelKind('onnx-community/Qwen3-Embedding-0.6B-ONNX')).toBe('qwen3');
    expect(resolveLocalModelKind('nomic-ai/nomic-embed-text-v1.5')).toBe('pipeline');
    expect(resolveLocalPipelineOptions('onnx-community/embeddinggemma-300m-ONNX')).toEqual({ dtype: 'q8' });
    expect(resolveLocalPipelineOptions('onnx-community/Qwen3-Embedding-0.6B-ONNX')).toEqual({ dtype: 'q8' });
  });
});

describe('poolQwenLastToken', () => {
  it('uses the last attended token for left- and right-padded sequences', () => {
    expect(poolQwenLastToken(
      {
        dims: [2, 3, 2],
        data: new Float32Array([
          1, 2, 3, 4, 5, 6,
          7, 8, 9, 10, 11, 12,
        ]),
      },
      {
        dims: [2, 3],
        data: new BigInt64Array([
          0n, 1n, 1n,
          1n, 1n, 0n,
        ]),
      },
    )).toEqual([[5, 6], [9, 10]]);
  });
});

describe('extractSentenceEmbeddingRows', () => {
  it('extracts one native sentence embedding per batch row', () => {
    expect(extractSentenceEmbeddingRows({
      dims: [2, 3],
      data: new Float32Array([1, 2, 3, 4, 5, 6]),
    })).toEqual([[1, 2, 3], [4, 5, 6]]);
  });
});

describe('LocalTransformersEmbeddingProvider', () => {
  it('formats and validates EmbeddingGemma sentence embeddings', async () => {
    const embed = vi.fn(async () => [[3, 4, 0], [0, 0, 2]]);
    const createExecutor = vi.fn(async () => ({ embed }));
    const provider = new LocalTransformersEmbeddingProvider(
      embeddingConfig('onnx-community/embeddinggemma-300m-ONNX'),
      { createExecutor },
    );

    const vectors = await provider.embed([
      input('rotate credentials', 'query'),
      input('rotation policy', 'document', 'Security runbook'),
    ]);

    expect(createExecutor).toHaveBeenCalledWith(
      'onnx-community/embeddinggemma-300m-ONNX',
      'embeddinggemma',
      { dtype: 'q8' },
    );
    expect(embed).toHaveBeenCalledWith([
      'task: search result | query: rotate credentials',
      'title: Security runbook | text: rotation policy',
    ]);
    expect(vectors).toEqual([[0.6, 0.8, 0], [0, 0, 1]]);
  });

  it('uses the Qwen executor and instructs only queries', async () => {
    const embed = vi.fn(async () => [[1, 0, 0], [0, 1, 0]]);
    const createExecutor = vi.fn(async () => ({ embed }));
    const provider = new LocalTransformersEmbeddingProvider(
      embeddingConfig('onnx-community/Qwen3-Embedding-0.6B-ONNX'),
      { createExecutor },
    );

    await provider.embed([
      input('rotate credentials', 'query'),
      input('rotation policy', 'document'),
    ]);

    expect(createExecutor).toHaveBeenCalledWith(
      'onnx-community/Qwen3-Embedding-0.6B-ONNX',
      'qwen3',
      { dtype: 'q8' },
    );
    expect(embed).toHaveBeenCalledWith([
      'Instruct: Given a user query, retrieve relevant passages that answer the query\nQuery:rotate credentials',
      'rotation policy',
    ]);
  });
});
