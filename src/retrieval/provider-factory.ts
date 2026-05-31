import type { EmbeddingConfig } from '../config.js';
import type { EmbeddingProviderAdapter } from './providers.js';
import { LocalTransformersEmbeddingProvider } from './local-transformers-provider.js';
import { RemoteEmbeddingProvider } from './remote-provider.js';

export function createEmbeddingProvider(config: EmbeddingConfig): EmbeddingProviderAdapter {
  if (config.provider === 'transformers_local') {
    return new LocalTransformersEmbeddingProvider(config);
  }

  if (config.provider === 'ollama' || config.provider === 'lmstudio') {
    return new RemoteEmbeddingProvider(config);
  }

  throw new Error(`Unsupported embedding provider: ${String(config.provider)}`);
}
