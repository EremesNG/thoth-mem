export interface IndexedEmbeddingVector {
  index: number;
  vector: readonly number[];
}

export interface EmbeddingVectorOptions {
  expectedCount: number;
  dimensions: number;
  normalize: boolean;
}

export function processEmbeddingVectors(
  rows: readonly IndexedEmbeddingVector[],
  options: EmbeddingVectorOptions,
): number[][] {
  if (rows.length !== options.expectedCount) {
    throw new Error(`Embedding response length mismatch (expected ${options.expectedCount}, got ${rows.length}).`);
  }

  const ordered: Array<readonly number[] | undefined> = Array.from({ length: options.expectedCount });

  for (const row of rows) {
    if (!Number.isInteger(row.index) || row.index < 0 || row.index >= options.expectedCount) {
      throw new Error(`Embedding response index ${row.index} is out of range.`);
    }
    if (ordered[row.index] !== undefined) {
      throw new Error(`Embedding response index ${row.index} is duplicated.`);
    }
    ordered[row.index] = row.vector;
  }

  return ordered.map((vector, index) => {
    if (!vector) {
      throw new Error(`Embedding response is missing input index ${index}.`);
    }
    if (vector.length !== options.dimensions) {
      throw new Error(
        `Embedding vector ${index} dimension mismatch (expected ${options.dimensions}, got ${vector.length}).`,
      );
    }

    let squaredNorm = 0;
    for (let dimension = 0; dimension < vector.length; dimension += 1) {
      const value = vector[dimension];
      if (!Number.isFinite(value)) {
        throw new Error(`Embedding vector ${index} contains a non-finite value at dimension ${dimension}.`);
      }
      squaredNorm += value * value;
    }

    if (squaredNorm === 0) {
      throw new Error(`Embedding vector ${index} must be non-zero.`);
    }

    if (!options.normalize) {
      return Array.from(vector);
    }

    const norm = Math.sqrt(squaredNorm);
    return Array.from(vector, (value) => value / norm);
  });
}
