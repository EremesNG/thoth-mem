import { describe, expect, it } from 'vitest';
import { processEmbeddingVectors } from '../../src/retrieval/vector-processing.js';

describe('processEmbeddingVectors', () => {
  it('restores input order and L2-normalizes every vector', () => {
    expect(processEmbeddingVectors([
      { index: 1, vector: [0, 5] },
      { index: 0, vector: [3, 4] },
    ], {
      expectedCount: 2,
      dimensions: 2,
      normalize: true,
    })).toEqual([
      [0.6, 0.8],
      [0, 1],
    ]);
  });

  it.each([
    {
      name: 'row count',
      rows: [{ index: 0, vector: [1, 0] }],
      options: { expectedCount: 2, dimensions: 2, normalize: true },
      message: 'Embedding response length mismatch (expected 2, got 1).',
    },
    {
      name: 'duplicate index',
      rows: [{ index: 0, vector: [1, 0] }, { index: 0, vector: [0, 1] }],
      options: { expectedCount: 2, dimensions: 2, normalize: true },
      message: 'Embedding response index 0 is duplicated.',
    },
    {
      name: 'dimension',
      rows: [{ index: 0, vector: [1, 0, 0] }],
      options: { expectedCount: 1, dimensions: 2, normalize: true },
      message: 'Embedding vector 0 dimension mismatch (expected 2, got 3).',
    },
    {
      name: 'zero vector',
      rows: [{ index: 0, vector: [0, 0] }],
      options: { expectedCount: 1, dimensions: 2, normalize: true },
      message: 'Embedding vector 0 must be non-zero.',
    },
    {
      name: 'non-finite value',
      rows: [{ index: 0, vector: [1, Number.NaN] }],
      options: { expectedCount: 1, dimensions: 2, normalize: true },
      message: 'Embedding vector 0 contains a non-finite value at dimension 1.',
    },
  ])('rejects an invalid $name contract', ({ rows, options, message }) => {
    expect(() => processEmbeddingVectors(rows, options)).toThrow(message);
  });

  it('preserves finite values when normalization is disabled', () => {
    expect(processEmbeddingVectors([{ index: 0, vector: [3, 4] }], {
      expectedCount: 1,
      dimensions: 2,
      normalize: false,
    })).toEqual([[3, 4]]);
  });
});
