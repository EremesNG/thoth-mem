import type Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import type { RetrievalDefaults } from '../config.js';

export interface SqliteVecRuntimeStatus {
  available: boolean;
  degradedReason: string | null;
}

export const DEFAULT_RETRIEVAL_DEFAULTS: RetrievalDefaults = {
  sentenceTopK: 100,
  chunkTopK: 20,
  lexicalLimit: 20,
  minSemanticScore: 0.3,
  l2DistanceScale: 20,
};

export function loadSqliteVec(db: Database.Database): SqliteVecRuntimeStatus {
  try {
    sqliteVec.load(db);
    return { available: true, degradedReason: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      available: false,
      degradedReason: `sqlite-vec unavailable: ${message}`,
    };
  }
}

export function vectorToBuffer(vector: number[]): Buffer {
  return Buffer.from(new Float32Array(vector).buffer);
}

export function scoreFromDistance(distance: number, l2DistanceScale: number): number {
  return Math.exp(-distance / l2DistanceScale);
}

export function resolveRetrievalDefaults(
  defaults?: Partial<RetrievalDefaults> | null,
): RetrievalDefaults {
  return {
    ...DEFAULT_RETRIEVAL_DEFAULTS,
    ...(defaults ?? {}),
  };
}
