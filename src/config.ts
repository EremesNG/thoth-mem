import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface RetrievalDefaults {
  sentenceTopK: number;
  chunkTopK: number;
  lexicalLimit: number;
  minSemanticScore: number;
  l2DistanceScale: number;
}

export type LocalModelProvider = 'ollama' | 'lmstudio' | 'transformers_local';
export type EmbeddingProvider = LocalModelProvider;
export type HydeProvider = LocalModelProvider;
export type KgLlmProvider = LocalModelProvider;

export interface HydeConfig {
  enabled: boolean;
  provider: HydeProvider;
  model: string | null;
  baseUrl: string | null;
  timeoutMs: number;
}

export interface KgLlmConfig {
  enabled: boolean;
  provider: KgLlmProvider;
  model: string;
  baseUrl: string | null;
  timeoutMs: number;
  minContentChars: number;
}

export interface EmbeddingConfig {
  provider: EmbeddingProvider;
  model: string;
  baseUrl: string | null;
  dimensions: number | null;
  configHash: string;
}

export interface ThothConfig {
  dataDir: string;
  dbPath: string; // resolved: {dataDir}/thoth.db
  maxContentLength: number;
  maxContextResults: number;
  maxSearchResults: number;
  dedupeWindowMinutes: number;
  previewLength: number;
  httpPort: number;
  httpDisabled: boolean;
  retrievalDefaults?: RetrievalDefaults;
  embedding?: EmbeddingConfig;
  hyde?: HydeConfig;
  kgLlm?: KgLlmConfig;
}

interface PersistedEmbeddingConfig extends Partial<EmbeddingConfig> {
  hyde?: Partial<HydeConfig>;
}

interface PersistedConfig {
  version?: number;
  maxContentLength?: number;
  maxContextResults?: number;
  maxSearchResults?: number;
  dedupeWindowMinutes?: number;
  previewLength?: number;
  http?: {
    port?: number;
    disabled?: boolean;
  };
  embedding?: PersistedEmbeddingConfig;
  hyde?: Partial<HydeConfig>;
  kgLlm?: Partial<KgLlmConfig>;
  retrievalDefaults?: Partial<RetrievalDefaults>;
}

interface PersistedConfigReadResult {
  config: PersistedConfig;
  shouldBackfill: boolean;
}

const DEFAULT_RETRIEVAL_DEFAULTS: RetrievalDefaults = {
  sentenceTopK: 100,
  chunkTopK: 20,
  lexicalLimit: 20,
  minSemanticScore: 0.3,
  l2DistanceScale: 20,
};

const DEFAULT_LOCAL_HYDE_MODEL = 'onnx-community/Qwen2.5-Coder-0.5B-Instruct';

const DEFAULT_HYDE_CONFIG: HydeConfig = {
  enabled: true,
  provider: 'transformers_local',
  model: DEFAULT_LOCAL_HYDE_MODEL,
  baseUrl: null,
  timeoutMs: 4000,
};

const DEFAULT_KG_LLM_CONFIG: KgLlmConfig = {
  enabled: false,
  provider: 'transformers_local',
  model: DEFAULT_LOCAL_HYDE_MODEL,
  baseUrl: null,
  timeoutMs: 8000,
  minContentChars: 12_000,
};

const DEFAULT_LOCAL_EMBEDDING_MODEL = 'nomic-ai/nomic-embed-text-v1.5';
const KNOWN_EMBEDDING_DIMENSIONS: Record<string, number> = {
  'nomic-ai/nomic-embed-text-v1.5': 768,
  'nomic-embed-text': 768,
  'xenova/all-minilm-l6-v2': 384,
  'sentence-transformers/all-minilm-l6-v2': 384,
  'qwen/qwen3-embedding-0.6b': 1024,
  'qwen3-embedding:0.6b': 1024,
};

/**
 * Resolve home directory with Windows MCP subprocess fallbacks.
 * MCP subprocesses on Windows often lack proper HOME. This matches
 * engram's resolveHomeFallback() pattern.
 * Tries: os.homedir() -> USERPROFILE -> HOME -> LOCALAPPDATA
 */
function resolveHome(): string {
  try {
    const home = homedir();
    if (home && home !== '') return home;
  } catch {
    // homedir() can throw in broken environments
  }

  const fallbacks = ['USERPROFILE', 'HOME', 'LOCALAPPDATA'];
  for (const envVar of fallbacks) {
    const val = process.env[envVar];
    if (val && val !== '') return val;
  }

  throw new Error('Cannot resolve home directory. Set THOTH_DATA_DIR environment variable.');
}

function normalizeBaseUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.replace(/\/+$/, '');
}

function inferEmbeddingDimensions(model: string): number | null {
  return KNOWN_EMBEDDING_DIMENSIONS[model] ?? KNOWN_EMBEDDING_DIMENSIONS[model.toLowerCase()] ?? null;
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseBoolean(value: string | undefined): boolean | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return null;
}

function parseProvider(value: string | null | undefined, fallback: LocalModelProvider): LocalModelProvider {
  const normalized = value?.trim();
  if (normalized === 'ollama' || normalized === 'lmstudio' || normalized === 'transformers_local') {
    return normalized;
  }

  return fallback;
}

function parseKgLlmProvider(value: string | null | undefined, fallback: KgLlmProvider): KgLlmProvider {
  const normalized = value?.trim();
  if (normalized === 'ollama' || normalized === 'lmstudio' || normalized === 'transformers_local') {
    return normalized;
  }

  return fallback;
}

function defaultPersistedConfig(): PersistedConfig {
  return {
    version: 1,
    maxContentLength: 100_000,
    maxContextResults: 20,
    maxSearchResults: 20,
    dedupeWindowMinutes: 15,
    previewLength: 300,
    http: {
      port: 7438,
      disabled: false,
    },
    retrievalDefaults: { ...DEFAULT_RETRIEVAL_DEFAULTS },
    embedding: {
      provider: 'transformers_local',
      model: DEFAULT_LOCAL_EMBEDDING_MODEL,
      baseUrl: null,
      dimensions: 768,
    },
    hyde: { ...DEFAULT_HYDE_CONFIG },
    kgLlm: { ...DEFAULT_KG_LLM_CONFIG },
  };
}

function normalizePersistedEmbedding(embedding: PersistedEmbeddingConfig | undefined): PersistedEmbeddingConfig | undefined {
  if (!embedding) {
    return undefined;
  }

  const { configHash: _configHash, hyde: _hyde, ...editable } = embedding;
  return editable;
}

function mergePersistedConfig(existing: PersistedConfig): PersistedConfig {
  const defaults = defaultPersistedConfig();
  const legacyHyde = existing.embedding?.hyde;
  const editableEmbedding = normalizePersistedEmbedding(existing.embedding);
  const embeddingModel = editableEmbedding?.model ?? defaults.embedding?.model ?? DEFAULT_LOCAL_EMBEDDING_MODEL;
  const embeddingDimensions = editableEmbedding
    ? editableEmbedding.dimensions ?? inferEmbeddingDimensions(embeddingModel)
    : defaults.embedding?.dimensions;

  return {
    ...defaults,
    ...existing,
    http: {
      ...defaults.http,
      ...(existing.http ?? {}),
    },
    retrievalDefaults: {
      ...defaults.retrievalDefaults,
      ...(existing.retrievalDefaults ?? {}),
    },
    embedding: {
      ...defaults.embedding,
      ...(editableEmbedding ?? {}),
      dimensions: embeddingDimensions,
    },
    hyde: {
      ...defaults.hyde,
      ...(legacyHyde ?? {}),
      ...(existing.hyde ?? {}),
    },
    kgLlm: {
      ...defaults.kgLlm,
      ...(existing.kgLlm ?? {}),
    },
  };
}

function readPersistedConfig(dataDir: string): PersistedConfigReadResult {
  const configPath = join(dataDir, 'config.json');
  if (!existsSync(configPath)) {
    return { config: {}, shouldBackfill: true };
  }

  try {
    const raw = readFileSync(configPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { config: {}, shouldBackfill: false };
    }

    return { config: parsed as PersistedConfig, shouldBackfill: true };
  } catch {
    return { config: {}, shouldBackfill: false };
  }
}

function loadPersistedConfig(dataDir: string): PersistedConfig {
  const readResult = readPersistedConfig(dataDir);
  const merged = mergePersistedConfig(readResult.config);

  if (readResult.shouldBackfill) {
    try {
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(join(dataDir, 'config.json'), `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
    } catch {
      // Default config materialization is a convenience; runtime config can still resolve.
    }
  }

  return merged;
}

function resolveHydeConfig(persisted: PersistedConfig): HydeConfig {
  const persistedHyde = persisted.hyde ?? persisted.embedding?.hyde;

  const enabledFromEnv = parseBoolean(process.env.THOTH_HYDE_ENABLED);
  const timeoutFromEnv = parseNumber(process.env.THOTH_HYDE_TIMEOUT_MS);
  const provider = parseProvider(
    process.env.THOTH_HYDE_PROVIDER ?? persistedHyde?.provider,
    DEFAULT_HYDE_CONFIG.provider,
  );

  return {
    enabled: enabledFromEnv ?? persistedHyde?.enabled ?? DEFAULT_HYDE_CONFIG.enabled,
    provider,
    model: process.env.THOTH_HYDE_MODEL
      ?? persistedHyde?.model
      ?? (provider === 'transformers_local'
        ? DEFAULT_HYDE_CONFIG.model
        : provider === 'ollama'
          ? 'qwen2.5:7b-instruct'
          : 'loaded_model'),
    baseUrl: normalizeBaseUrl(
      process.env.THOTH_HYDE_BASE_URL
        ?? persistedHyde?.baseUrl
        ?? (provider === 'ollama'
          ? 'http://127.0.0.1:11434'
          : provider === 'lmstudio'
            ? 'http://127.0.0.1:1234/v1'
            : DEFAULT_HYDE_CONFIG.baseUrl),
    ),
    timeoutMs: timeoutFromEnv ?? persistedHyde?.timeoutMs ?? DEFAULT_HYDE_CONFIG.timeoutMs,
  };
}

function resolveKgLlmConfig(persisted: PersistedConfig): KgLlmConfig {
  const persistedKg = persisted.kgLlm ?? {};
  const enabledFromEnv = parseBoolean(process.env.THOTH_KG_LLM_ENABLED);
  const timeoutFromEnv = parseNumber(process.env.THOTH_KG_LLM_TIMEOUT_MS);
  const minCharsFromEnv = parseNumber(process.env.THOTH_KG_LLM_MIN_CONTENT_CHARS);
  const provider = parseKgLlmProvider(
    process.env.THOTH_KG_LLM_PROVIDER ?? persistedKg.provider,
    DEFAULT_KG_LLM_CONFIG.provider,
  );

  return {
    enabled: enabledFromEnv ?? persistedKg.enabled ?? DEFAULT_KG_LLM_CONFIG.enabled,
    provider,
    model: process.env.THOTH_KG_LLM_MODEL
      ?? persistedKg.model
      ?? (provider === 'transformers_local'
        ? DEFAULT_KG_LLM_CONFIG.model
        : provider === 'ollama'
          ? 'qwen2.5:7b-instruct'
          : 'loaded_model'),
    baseUrl: normalizeBaseUrl(
      process.env.THOTH_KG_LLM_BASE_URL
        ?? persistedKg.baseUrl
        ?? (provider === 'ollama'
          ? 'http://127.0.0.1:11434'
          : provider === 'lmstudio'
            ? 'http://127.0.0.1:1234/v1'
            : DEFAULT_KG_LLM_CONFIG.baseUrl),
    ),
    timeoutMs: timeoutFromEnv ?? persistedKg.timeoutMs ?? DEFAULT_KG_LLM_CONFIG.timeoutMs,
    minContentChars: minCharsFromEnv ?? persistedKg.minContentChars ?? DEFAULT_KG_LLM_CONFIG.minContentChars,
  };
}

function resolveEmbeddingConfig(persisted: PersistedConfig): EmbeddingConfig {
  const persistedEmbedding = persisted.embedding ?? {};
  const provider = parseProvider(process.env.THOTH_EMBEDDING_PROVIDER ?? persistedEmbedding.provider, 'transformers_local');

  const modelFromEnv = process.env.THOTH_EMBEDDING_MODEL;
  const model = modelFromEnv
    ?? persistedEmbedding.model
    ?? (provider === 'transformers_local' ? DEFAULT_LOCAL_EMBEDDING_MODEL : 'nomic-embed-text');

  const dimensionsFromEnv = parseNumber(process.env.THOTH_EMBEDDING_DIMENSIONS);
  const dimensions = dimensionsFromEnv ?? persistedEmbedding.dimensions ?? inferEmbeddingDimensions(model);

  const baseUrl = normalizeBaseUrl(
    process.env.THOTH_EMBEDDING_BASE_URL
      ?? persistedEmbedding.baseUrl
      ?? (provider === 'ollama'
        ? 'http://127.0.0.1:11434'
        : provider === 'lmstudio'
          ? 'http://127.0.0.1:1234'
          : null),
  );

  const hashPayload = {
    provider,
    model,
    baseUrl,
    dimensions,
  };

  const configHash = createHash('sha256')
    .update(JSON.stringify(hashPayload))
    .digest('hex');

  return {
    provider,
    model,
    baseUrl,
    dimensions,
    configHash,
  };
}

export function getConfig(options: { dataDir?: string } = {}): ThothConfig {
  const home = resolveHome();
  const dataDir = options.dataDir || process.env.THOTH_DATA_DIR || join(home, '.thoth');
  const persisted = loadPersistedConfig(dataDir);
  const hyde = resolveHydeConfig(persisted);
  const kgLlm = resolveKgLlmConfig(persisted);
  const httpPortFromPersisted = persisted.http?.port;
  const httpDisabledFromPersisted = persisted.http?.disabled;

  return {
    dataDir,
    dbPath: join(dataDir, 'thoth.db'),
    maxContentLength: parseNumber(process.env.THOTH_MAX_CONTENT_LENGTH) ?? persisted.maxContentLength ?? 100_000,
    maxContextResults: parseNumber(process.env.THOTH_MAX_CONTEXT_RESULTS) ?? persisted.maxContextResults ?? 20,
    maxSearchResults: parseNumber(process.env.THOTH_MAX_SEARCH_RESULTS) ?? persisted.maxSearchResults ?? 20,
    dedupeWindowMinutes: parseNumber(process.env.THOTH_DEDUPE_WINDOW_MINUTES) ?? persisted.dedupeWindowMinutes ?? 15,
    previewLength: parseNumber(process.env.THOTH_PREVIEW_LENGTH) ?? persisted.previewLength ?? 300,
    httpPort: parseNumber(process.env.THOTH_HTTP_PORT) ?? httpPortFromPersisted ?? 7438,
    httpDisabled: parseBoolean(process.env.THOTH_HTTP_DISABLED) ?? httpDisabledFromPersisted ?? false,
    retrievalDefaults: {
      ...DEFAULT_RETRIEVAL_DEFAULTS,
      ...(persisted.retrievalDefaults ?? {}),
    },
    embedding: resolveEmbeddingConfig(persisted),
    hyde,
    kgLlm,
  };
}

/**
 * Ensure the data directory exists (creates recursively if missing).
 */
export function resolveDataDir(config: ThothConfig): void {
  mkdirSync(config.dataDir, { recursive: true });
}
