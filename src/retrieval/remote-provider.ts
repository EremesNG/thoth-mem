import type { EmbeddingConfig } from '../config.js';
import { formatEmbeddingInput } from './embedding-input.js';
import type { EmbeddingInputRole, EmbeddingProviderAdapter } from './providers.js';

interface OllamaEmbedResponse {
  embedding?: number[];
  embeddings?: number[][];
}

interface OpenAIEmbeddingResponse {
  data?: Array<{ embedding?: number[] }>;
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

  async embed(texts: string[], role: EmbeddingInputRole = 'document'): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const baseUrl = ensureBaseUrl(this.config);

    if (this.config.provider === 'ollama') {
      const vectors: number[][] = [];

      for (const text of texts) {
        const payload = {
          model: this.config.model,
          prompt: text,
        };

        const json = await fetchJson(`${baseUrl}/api/embeddings`, payload) as OllamaEmbedResponse;
        const embedding = json.embedding ?? json.embeddings?.[0];

        if (!embedding || !Array.isArray(embedding)) {
          throw new Error('Ollama embedding response did not include an embedding array.');
        }

        vectors.push(embedding);
      }

      return vectors;
    }

    const payload = {
      model: this.config.model,
      input: texts.map((text) => formatEmbeddingInput(text, this.config.model, role)),
    };

    const json = await fetchJson(`${baseUrl}/v1/embeddings`, payload) as OpenAIEmbeddingResponse;
    const rows = json.data ?? [];

    if (!Array.isArray(rows) || rows.length !== texts.length) {
      throw new Error(`LM Studio embedding response length mismatch (expected ${texts.length}, got ${rows.length}).`);
    }

    return rows.map((row, idx) => {
      if (!row.embedding || !Array.isArray(row.embedding)) {
        throw new Error(`LM Studio embedding response missing embedding for input index ${idx}.`);
      }
      return row.embedding;
    });
  }
}
