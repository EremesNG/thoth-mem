import type { EmbeddingConfig } from '../config.js';
import { formatEmbeddingInputForProfile } from './embedding-profile.js';
import type { EmbeddingInput, EmbeddingProviderAdapter } from './providers.js';
import { processEmbeddingVectors } from './vector-processing.js';

interface OllamaEmbedResponse {
  embedding?: number[];
  embeddings?: number[][];
}

interface OpenAIEmbeddingResponse {
  data?: Array<{ index?: number; embedding?: number[] }>;
}

function ensureBaseUrl(config: EmbeddingConfig): string {
  if (!config.baseUrl) {
    throw new Error(`Embedding provider "${config.provider}" requires a baseUrl.`);
  }

  return config.baseUrl.replace(/\/+$/, '');
}

async function fetchJson(url: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Embedding request failed (${response.status} ${response.statusText}): ${details}`);
  }

  return response.json();
}

export class RemoteEmbeddingProvider implements EmbeddingProviderAdapter {
  public readonly config: EmbeddingConfig;

  constructor(config: EmbeddingConfig) {
    if (config.provider !== 'ollama' && config.provider !== 'lmstudio') {
      throw new Error(`RemoteEmbeddingProvider does not support provider "${config.provider}".`);
    }

    this.config = config;
  }

  async embed(inputs: EmbeddingInput[]): Promise<number[][]> {
    if (inputs.length === 0) {
      return [];
    }

    const baseUrl = ensureBaseUrl(this.config);
    const dimensions = this.config.dimensions;
    if (!dimensions || !Number.isInteger(dimensions) || dimensions <= 0) {
      throw new Error('Embedding vector validation requires positive configured dimensions.');
    }
    const formattedInputs = inputs.map((input) => formatEmbeddingInputForProfile(input, this.config.resolvedProfile));

    if (this.config.provider === 'ollama') {
      const rows: Array<{ index: number; vector: number[] }> = [];

      for (let index = 0; index < formattedInputs.length; index += 1) {
        const payload = {
          model: this.config.model,
          prompt: formattedInputs[index],
        };

        const json = await fetchJson(`${baseUrl}/api/embeddings`, payload) as OllamaEmbedResponse;
        const embedding = json.embedding ?? json.embeddings?.[0];

        if (!embedding || !Array.isArray(embedding)) {
          throw new Error('Ollama embedding response did not include an embedding array.');
        }

        rows.push({ index, vector: embedding });
      }

      return processEmbeddingVectors(rows, {
        expectedCount: inputs.length,
        dimensions,
        normalize: this.config.normalize,
      });
    }

    const payload = {
      model: this.config.model,
      input: formattedInputs,
    };

    const json = await fetchJson(`${baseUrl}/v1/embeddings`, payload) as OpenAIEmbeddingResponse;
    const rows = json.data ?? [];

    const indexedRows = rows.map((row, position) => {
      if (!row.embedding || !Array.isArray(row.embedding)) {
        throw new Error(`LM Studio embedding response missing embedding for row ${position}.`);
      }
      if (!Number.isInteger(row.index)) {
        throw new Error(`LM Studio embedding response missing index for row ${position}.`);
      }
      return { index: row.index as number, vector: row.embedding };
    });

    return processEmbeddingVectors(indexedRows, {
      expectedCount: inputs.length,
      dimensions,
      normalize: this.config.normalize,
    });
  }
}
