import type { EmbeddingConfig } from '../config.js';
import type { EmbeddingInputRole, EmbeddingProviderAdapter } from './providers.js';
import { formatEmbeddingInput } from './embedding-input.js';

type PipelineModule = typeof import('@huggingface/transformers');
type PipelineOptions = NonNullable<Parameters<PipelineModule['pipeline']>[2]>;

type FeatureExtractionPipeline = (text: string, options: {
  pooling: 'mean';
  normalize: boolean;
}) => Promise<{ data: Float32Array | number[] }>;

let cachedPipelineModule: Promise<PipelineModule> | null = null;

async function loadTransformersModule(): Promise<PipelineModule> {
  if (!cachedPipelineModule) {
    cachedPipelineModule = import('@huggingface/transformers');
  }

  return cachedPipelineModule;
}

export function formatLocalEmbeddingInput(text: string, model: string, role: EmbeddingInputRole = 'document'): string {
  return formatEmbeddingInput(text, model, role);
}

export function resolveLocalPipelineOptions(model: string): PipelineOptions {
  if (model.toLowerCase().includes('nomic-embed-text')) {
    return { dtype: 'q8' };
  }

  return {};
}

export class LocalTransformersEmbeddingProvider implements EmbeddingProviderAdapter {
  public readonly config: EmbeddingConfig;
  private pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

  constructor(config: EmbeddingConfig) {
    if (config.provider !== 'transformers_local') {
      throw new Error(`LocalTransformersEmbeddingProvider requires provider "transformers_local", got "${config.provider}".`);
    }

    this.config = config;
  }

  private async getPipeline(): Promise<FeatureExtractionPipeline> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = (async () => {
        const transformers = await loadTransformersModule();
        const pipe = await transformers.pipeline('feature-extraction', this.config.model, resolveLocalPipelineOptions(this.config.model));
        return pipe as FeatureExtractionPipeline;
      })();
    }

    return this.pipelinePromise;
  }

  async embed(texts: string[], role: EmbeddingInputRole = 'document'): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const extractor = await this.getPipeline();
    const vectors: number[][] = [];

    for (const text of texts) {
      const output = await extractor(formatLocalEmbeddingInput(text, this.config.model, role), {
        pooling: 'mean',
        normalize: true,
      });

      const values = Array.from(output.data as ArrayLike<number>);
      vectors.push(values);
    }

    return vectors;
  }
}
