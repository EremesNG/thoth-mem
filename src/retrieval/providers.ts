import type { EmbeddingConfig } from '../config.js';

export type EmbeddingInputRole = 'query' | 'document';

export interface EmbeddingProviderAdapter {
  readonly config: EmbeddingConfig;
  embed(texts: string[], role?: EmbeddingInputRole): Promise<number[][]>;
}

export interface EmbeddingProviderFactory {
  create(config: EmbeddingConfig): EmbeddingProviderAdapter;
}
