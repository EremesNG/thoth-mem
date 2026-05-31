import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface RetrievalDefaults {
  sentenceTopK: number;
  chunkTopK: number;
  lexicalLimit: number;
  minSemanticScore: number;
  l2DistanceScale: number;
}

export type EmbeddingProvider = 'ollama' | 'lmstudio' | 'transformers_local';

export interface HydeConfig {
  enabled: boolean;
  model: string | null;
  baseUrl: string | null;
  timeoutMs: number;
}

export interface EmbeddingConfig {
  provider: EmbeddingProvider;
  model: string;
  baseUrl: string | null;
  dimensions: number | null;
  hyde: HydeConfig;
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
}

interface PersistedConfig {
  embedding?: Partial<EmbeddingConfig>;
  hyde?: Partial<HydeConfig>;
  retrievalDefaults?: Partial<RetrievalDefaults>;
}

const DEFAULT_RETRIEVAL_DEFAULTS: RetrievalDefaults = {
  sentenceTopK: 100,
  chunkTopK: 20,
  lexicalLimit: 20,
  minSemanticScore: 0.3,
  l2DistanceScale: 20,
};

const DEFAULT_HYDE_CONFIG: HydeConfig = {
  enabled: false,
  model: null,
  baseUrl: null,
  timeoutMs: 4000,
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

function readPersistedConfig(dataDir: string): PersistedConfig {
  const configPath = join(dataDir, 'config.json');
  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const raw = readFileSync(configPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    return parsed as PersistedConfig;
  } catch {
    return {};
  }
}

function resolveHydeConfig(persisted: PersistedConfig): HydeConfig {
  const persistedHyde = persisted.hyde ?? persisted.embedding?.hyde;

  const enabledFromEnv = parseBoolean(process.env.THOTH_HYDE_ENABLED);
  const timeoutFromEnv = parseNumber(process.env.THOTH_HYDE_TIMEOUT_MS);

  return {
    enabled: enabledFromEnv ?? persistedHyde?.enabled ?? DEFAULT_HYDE_CONFIG.enabled,
    model: process.env.THOTH_HYDE_MODEL ?? persistedHyde?.model ?? DEFAULT_HYDE_CONFIG.model,
    baseUrl: normalizeBaseUrl(
      process.env.THOTH_HYDE_BASE_URL ?? persistedHyde?.baseUrl ?? DEFAULT_HYDE_CONFIG.baseUrl,
    ),
    timeoutMs: timeoutFromEnv ?? persistedHyde?.timeoutMs ?? DEFAULT_HYDE_CONFIG.timeoutMs,
  };
}

function resolveEmbeddingConfig(persisted: PersistedConfig, hyde: HydeConfig): EmbeddingConfig {
  const persistedEmbedding = persisted.embedding ?? {};
  const providerCandidate = process.env.THOTH_EMBEDDING_PROVIDER ?? persistedEmbedding.provider;
  const provider = (providerCandidate && providerCandidate.trim().length > 0
    ? providerCandidate
    : 'transformers_local') as EmbeddingProvider;

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
    hyde,
  };

  const configHash = createHash('sha256')
    .update(JSON.stringify(hashPayload))
    .digest('hex');

  return {
    provider,
    model,
    baseUrl,
    dimensions,
    hyde,
    configHash,
  };
}

export function getConfig(): ThothConfig {
  const home = resolveHome();
  const dataDir = process.env.THOTH_DATA_DIR || join(home, '.thoth');
  const persisted = readPersistedConfig(dataDir);
  const hyde = resolveHydeConfig(persisted);

  return {
    dataDir,
    dbPath: join(dataDir, 'thoth.db'),
    maxContentLength: parseInt(process.env.THOTH_MAX_CONTENT_LENGTH || '100000', 10),
    maxContextResults: parseInt(process.env.THOTH_MAX_CONTEXT_RESULTS || '20', 10),
    maxSearchResults: parseInt(process.env.THOTH_MAX_SEARCH_RESULTS || '20', 10),
    dedupeWindowMinutes: parseInt(process.env.THOTH_DEDUPE_WINDOW_MINUTES || '15', 10),
    previewLength: parseInt(process.env.THOTH_PREVIEW_LENGTH || '300', 10),
    httpPort: parseInt(process.env.THOTH_HTTP_PORT || '7438', 10),
    httpDisabled: process.env.THOTH_HTTP_DISABLED === 'true',
    retrievalDefaults: {
      ...DEFAULT_RETRIEVAL_DEFAULTS,
      ...(persisted.retrievalDefaults ?? {}),
    },
    embedding: resolveEmbeddingConfig(persisted, hyde),
  };
}

/**
 * Ensure the data directory exists (creates recursively if missing).
 */
export function resolveDataDir(config: ThothConfig): void {
  mkdirSync(config.dataDir, { recursive: true });
}
