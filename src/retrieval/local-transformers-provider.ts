import type { EmbeddingConfig, EmbeddingDevice } from '../config.js';
import { formatEmbeddingInputForProfile, resolveEmbeddingProfile } from './embedding-profile.js';
import type { EmbeddingInput, EmbeddingProviderAdapter } from './providers.js';
import { processEmbeddingVectors } from './vector-processing.js';

type TransformersModule = typeof import('@huggingface/transformers');
type PipelineOptions = NonNullable<Parameters<TransformersModule['pipeline']>[2]>;
type FeatureExtractionPipeline = (text: string, options: {
  pooling: 'mean';
  normalize: boolean;
}) => Promise<{ data: Float32Array | number[] }>;

export type LocalEmbeddingModelKind = 'pipeline' | 'embeddinggemma' | 'qwen3';

export interface TensorLike {
  dims: readonly number[];
  data: ArrayLike<number | bigint>;
}

export interface LocalEmbeddingExecutor {
  embed(texts: string[]): Promise<number[][]>;
}

export interface LocalEmbeddingRuntime {
  createExecutor(
    model: string,
    kind: LocalEmbeddingModelKind,
    options: PipelineOptions,
  ): Promise<LocalEmbeddingExecutor>;
}

let cachedTransformersModule: Promise<TransformersModule> | null = null;

async function loadTransformersModule(): Promise<TransformersModule> {
  if (!cachedTransformersModule) {
    cachedTransformersModule = import('@huggingface/transformers');
  }
  return cachedTransformersModule;
}

export function resolveLocalModelKind(model: string): LocalEmbeddingModelKind {
  const profileId = resolveEmbeddingProfile(model).id;
  return profileId === 'embeddinggemma' || profileId === 'qwen3' ? profileId : 'pipeline';
}

export function resolveLocalPipelineOptions(model: string, device: EmbeddingDevice): PipelineOptions {
  if (resolveEmbeddingProfile(model).id !== 'raw') {
    return { dtype: 'q8', device };
  }
  return { device };
}

function isTensorLike(value: unknown): value is TensorLike {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.dims) || !record.dims.every(Number.isInteger)) {
    return false;
  }
  if (typeof record.data !== 'object' || record.data === null) {
    return false;
  }
  const data = record.data as Record<string, unknown>;
  return typeof data.length === 'number';
}

function requireTensor(container: unknown, key: string): TensorLike {
  if (typeof container !== 'object' || container === null) {
    throw new Error(`Local embedding output did not include tensor "${key}".`);
  }
  const value = (container as Record<string, unknown>)[key];
  if (!isTensorLike(value)) {
    throw new Error(`Local embedding output did not include tensor "${key}".`);
  }
  return value;
}

export function extractSentenceEmbeddingRows(tensor: TensorLike): number[][] {
  const label = 'EmbeddingGemma sentence_embedding';
  if (tensor.dims.length !== 2) {
    throw new Error(`${label} must have rank 2, got [${tensor.dims.join(', ')}].`);
  }
  const [batchSize, dimensions] = tensor.dims;
  if (tensor.data.length !== batchSize * dimensions) {
    throw new Error(`${label} data length does not match its shape.`);
  }

  return Array.from({ length: batchSize }, (_, batchIndex) => {
    const offset = batchIndex * dimensions;
    return Array.from({ length: dimensions }, (_, dimension) => Number(tensor.data[offset + dimension]));
  });
}

export function poolQwenLastToken(lastHiddenState: TensorLike, attentionMask: TensorLike): number[][] {
  if (lastHiddenState.dims.length !== 3) {
    throw new Error(`Qwen last_hidden_state must have rank 3, got [${lastHiddenState.dims.join(', ')}].`);
  }
  const [batchSize, sequenceLength, dimensions] = lastHiddenState.dims;
  if (
    attentionMask.dims.length !== 2
    || attentionMask.dims[0] !== batchSize
    || attentionMask.dims[1] !== sequenceLength
  ) {
    throw new Error('Qwen attention_mask shape must match the hidden-state batch and sequence dimensions.');
  }
  if (lastHiddenState.data.length !== batchSize * sequenceLength * dimensions) {
    throw new Error('Qwen last_hidden_state data length does not match its shape.');
  }
  if (attentionMask.data.length !== batchSize * sequenceLength) {
    throw new Error('Qwen attention_mask data length does not match its shape.');
  }

  return Array.from({ length: batchSize }, (_, batchIndex) => {
    let lastTokenIndex = -1;
    for (let tokenIndex = 0; tokenIndex < sequenceLength; tokenIndex += 1) {
      if (Number(attentionMask.data[(batchIndex * sequenceLength) + tokenIndex]) !== 0) {
        lastTokenIndex = tokenIndex;
      }
    }
    if (lastTokenIndex < 0) {
      throw new Error(`Qwen attention_mask contains no attended token for input ${batchIndex}.`);
    }

    const offset = ((batchIndex * sequenceLength) + lastTokenIndex) * dimensions;
    return Array.from(
      { length: dimensions },
      (_, dimension) => Number(lastHiddenState.data[offset + dimension]),
    );
  });
}

const defaultLocalRuntime: LocalEmbeddingRuntime = {
  async createExecutor(model, kind, options) {
    const transformers = await loadTransformersModule();

    if (kind === 'pipeline') {
      const pipeline = await transformers.pipeline('feature-extraction', model, options) as FeatureExtractionPipeline;
      return {
        async embed(texts) {
          const vectors: number[][] = [];
          for (const text of texts) {
            const output = await pipeline(text, { pooling: 'mean', normalize: false });
            vectors.push(Array.from(output.data, Number));
          }
          return vectors;
        },
      };
    }

    const tokenizer = await transformers.AutoTokenizer.from_pretrained(model);
    if (kind === 'qwen3') {
      tokenizer.padding_side = 'left';
    }
    const localModel = await transformers.AutoModel.from_pretrained(model, options);

    return {
      async embed(texts) {
        const modelInputs = tokenizer(texts, { padding: true, truncation: true });
        const output: unknown = await localModel(modelInputs);
        if (kind === 'embeddinggemma') {
          return extractSentenceEmbeddingRows(requireTensor(output, 'sentence_embedding'));
        }
        return poolQwenLastToken(
          requireTensor(output, 'last_hidden_state'),
          requireTensor(modelInputs, 'attention_mask'),
        );
      },
    };
  },
};

export class LocalTransformersEmbeddingProvider implements EmbeddingProviderAdapter {
  public readonly config: EmbeddingConfig;
  private executorPromise: Promise<LocalEmbeddingExecutor> | null = null;

  constructor(
    config: EmbeddingConfig,
    private readonly runtime: LocalEmbeddingRuntime = defaultLocalRuntime,
  ) {
    if (config.provider !== 'transformers_local') {
      throw new Error(`LocalTransformersEmbeddingProvider requires provider "transformers_local", got "${config.provider}".`);
    }
    this.config = config;
  }

  private getExecutor(): Promise<LocalEmbeddingExecutor> {
    if (!this.executorPromise) {
      this.executorPromise = this.runtime.createExecutor(
        this.config.model,
        resolveLocalModelKind(this.config.model),
        resolveLocalPipelineOptions(this.config.model, this.config.device),
      );
    }
    return this.executorPromise;
  }

  async embed(inputs: EmbeddingInput[]): Promise<number[][]> {
    if (inputs.length === 0) {
      return [];
    }
    const dimensions = this.config.dimensions;
    if (!dimensions || !Number.isInteger(dimensions) || dimensions <= 0) {
      throw new Error('Embedding vector validation requires positive configured dimensions.');
    }

    const formattedInputs = inputs.map((input) => formatEmbeddingInputForProfile(input, this.config.resolvedProfile));
    const executor = await this.getExecutor();
    const vectors = await executor.embed(formattedInputs);

    return processEmbeddingVectors(
      vectors.map((vector, index) => ({ index, vector })),
      { expectedCount: inputs.length, dimensions, normalize: this.config.normalize },
    );
  }
}
