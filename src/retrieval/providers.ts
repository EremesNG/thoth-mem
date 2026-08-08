import type { EmbeddingConfig } from '../config.js';

export type EmbeddingInputRole = 'query' | 'document';

export interface EmbeddingInput {
  text: string;
  intent: 'retrieval';
  role: EmbeddingInputRole;
  title?: string;
}

export interface EmbeddingProviderAdapter {
  readonly config: EmbeddingConfig;
  embed(inputs: EmbeddingInput[]): Promise<number[][]>;
}

export interface EmbeddingProviderFactory {
  create(config: EmbeddingConfig): EmbeddingProviderAdapter;
}
