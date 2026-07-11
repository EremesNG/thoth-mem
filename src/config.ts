import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { getVersion } from './version.js';
import { KG_RELATION_TYPES } from './indexing/kg-extractor.js';
import { OBSERVATION_TYPES } from './store/types.js';

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
export type GraphFactsSource = 'legacy' | 'kg';

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

export interface KnowledgeGraphConfig {
  kgMultiHopEnabled: boolean;
  kgMaxDepth: number;
  kgNeighborhoodLimit: number;
  kgMultiHopWeight: number;
  kgDepthDecay: number;
  kgTraversalTimeoutMs: number;
  kgRelationAllowList: string[];
  kgSupersedeEnabled: boolean;
  kgSupersedeContentPatterns: boolean;
  kgSupersedeConfidenceThreshold: number;
  kgSupersedeDeprioritizeWeight: number;
  kgPruneEnabled: boolean;
  kgSupersededKeepN: number;
  kgPruneOrphanEntities: boolean;
}

export type MaintenanceDefaultMode = 'dry-run' | 'apply';
export type MaintenanceDecayState = 'active' | 'attenuated' | 'suppressed';
export type CommunityAlgorithm = 'connected_components' | 'louvain' | 'leiden';
export type CommunityStaleBehavior = 'skip' | 'include-degraded';

export interface MaintenanceConfig {
  enabled: boolean;
  defaultMode: MaintenanceDefaultMode;
  automatic: {
    enabled: boolean;
    maxRecordsPerRun: number;
  };
  readPath: {
    enabled: boolean;
  };
  consolidation: {
    enabled: boolean;
    exactHashThreshold: number;
    lexicalSimilarityThreshold: number;
    reviewSimilarityThreshold: number;
  };
  reflection: {
    enabled: boolean;
    minSourceCount: number;
    maxSourceCount: number;
    contentBudgetChars: number;
    modelAssisted: boolean;
  };
  decay: {
    enabled: boolean;
    defaultState: MaintenanceDecayState;
    staleAfterDays: number;
    redundantDuplicateCount: number;
    lowValueTypes: string[];
    scoreMultiplier: number;
  };
}

export interface CommunitySummariesConfig {
  enabled: boolean;
  readPath: {
    enabled: boolean;
  };
  algorithm: CommunityAlgorithm;
  advancedAlgorithmFallback: CommunityAlgorithm;
  summaryMaxChars: number;
  maxCommunitiesPerProject: number;
  maxRetrievalCommunities: number;
  maxEvidencePerCommunity: number;
  sourceObservationLimit: number;
  rebuildMaxTriples: number;
  staleBehavior: CommunityStaleBehavior;
  kgCommunityWeight: number;
  enrichment: {
    enabled: boolean;
    timeoutMs: number;
    maxCostUsd: number;
    maxChars: number;
  };
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
  project: {
    default: string | null;
  };
  /** Input-side save validation warning threshold; never truncates stored content. */
  maxContentLength: number;
  /** Output-side context/summary response budget; 0 explicitly disables the cap. */
  maxContextChars: number;
  maxContextResults: number;
  maxSearchResults: number;
  dedupeWindowMinutes: number;
  previewLength: number;
  httpPort: number;
  httpDisabled: boolean;
  graphFactsSource?: GraphFactsSource;
  retrievalDefaults?: RetrievalDefaults;
  embedding?: EmbeddingConfig;
  hyde?: HydeConfig;
  kgLlm?: KgLlmConfig;
  knowledgeGraph?: KnowledgeGraphConfig;
  communitySummaries: CommunitySummariesConfig;
  maintenance: MaintenanceConfig;
}

interface PersistedEmbeddingConfig extends Partial<EmbeddingConfig> {
  hyde?: Partial<HydeConfig>;
}

interface PersistedMaintenanceConfig {
  enabled?: boolean;
  defaultMode?: MaintenanceDefaultMode;
  automatic?: Partial<MaintenanceConfig['automatic']>;
  readPath?: Partial<MaintenanceConfig['readPath']>;
  consolidation?: Partial<MaintenanceConfig['consolidation']>;
  reflection?: Partial<MaintenanceConfig['reflection']>;
  decay?: Partial<MaintenanceConfig['decay']>;
}

interface PersistedCommunitySummariesConfig {
  enabled?: boolean;
  readPath?: Partial<CommunitySummariesConfig['readPath']>;
  algorithm?: CommunityAlgorithm;
  advancedAlgorithmFallback?: CommunityAlgorithm;
  summaryMaxChars?: number;
  maxCommunitiesPerProject?: number;
  maxRetrievalCommunities?: number;
  maxEvidencePerCommunity?: number;
  sourceObservationLimit?: number;
  rebuildMaxTriples?: number;
  staleBehavior?: CommunityStaleBehavior;
  kgCommunityWeight?: number;
  enrichment?: Partial<CommunitySummariesConfig['enrichment']>;
}

interface PersistedConfig {
  $schema?: string;
  version?: number;
  maxContentLength?: number;
  maxContextChars?: number;
  maxContextResults?: number;
  maxSearchResults?: number;
  dedupeWindowMinutes?: number;
  previewLength?: number;
  http?: {
    port?: number;
    disabled?: boolean;
  };
  project?: {
    default?: string | null;
  };
  embedding?: PersistedEmbeddingConfig;
  hyde?: Partial<HydeConfig>;
  kgLlm?: Partial<KgLlmConfig>;
  knowledgeGraph?: Partial<KnowledgeGraphConfig>;
  communitySummaries?: PersistedCommunitySummariesConfig;
  maintenance?: PersistedMaintenanceConfig;
  graphFactsSource?: GraphFactsSource;
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

const CONFIG_SCHEMA_REF = `https://unpkg.com/thoth-mem@${getVersion()}/config.schema.json`;
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
  timeoutMs: 30_000,
  minContentChars: 12_000,
};

export const DEFAULT_KG_RELATION_ALLOW_LIST = [
  'USES',
  'DEPENDS_ON',
  'BELONGS_TO',
  'PART_OF',
  'OWNS',
  'CONFIGURES',
  'IMPLEMENTS',
  'RUNS_IN',
  'DEPLOYS_TO',
  'CAUSES',
  'FIXES',
  'BLOCKS',
  'UNBLOCKS',
  'AFFECTS',
  'REFERENCES',
  'AUTHENTICATES_WITH',
  'PRECEDES',
  'FOLLOWS',
] as const;

export const DEFAULT_KNOWLEDGE_GRAPH_CONFIG: KnowledgeGraphConfig = {
  kgMultiHopEnabled: true,
  kgMaxDepth: 2,
  kgNeighborhoodLimit: 50,
  kgMultiHopWeight: 0.7,
  kgDepthDecay: 0.5,
  kgTraversalTimeoutMs: 50,
  kgRelationAllowList: [...DEFAULT_KG_RELATION_ALLOW_LIST],
  kgSupersedeEnabled: true,
  kgSupersedeContentPatterns: false,
  kgSupersedeConfidenceThreshold: 0.8,
  kgSupersedeDeprioritizeWeight: 0.5,
  kgPruneEnabled: true,
  kgSupersededKeepN: 10,
  kgPruneOrphanEntities: true,
};

export const DEFAULT_MAINTENANCE_CONFIG: MaintenanceConfig = {
  enabled: true,
  defaultMode: 'dry-run',
  automatic: {
    enabled: false,
    maxRecordsPerRun: 500,
  },
  readPath: {
    enabled: true,
  },
  consolidation: {
    enabled: true,
    exactHashThreshold: 1,
    lexicalSimilarityThreshold: 0.92,
    reviewSimilarityThreshold: 0.82,
  },
  reflection: {
    enabled: true,
    minSourceCount: 2,
    maxSourceCount: 8,
    contentBudgetChars: 1200,
    modelAssisted: false,
  },
  decay: {
    enabled: true,
    defaultState: 'attenuated',
    staleAfterDays: 180,
    redundantDuplicateCount: 2,
    lowValueTypes: ['discovery', 'manual'],
    scoreMultiplier: 0.6,
  },
};

export const DEFAULT_COMMUNITY_SUMMARIES_CONFIG: CommunitySummariesConfig = {
  enabled: true,
  readPath: {
    enabled: false,
  },
  algorithm: 'connected_components',
  advancedAlgorithmFallback: 'connected_components',
  summaryMaxChars: 1200,
  maxCommunitiesPerProject: 200,
  maxRetrievalCommunities: 3,
  maxEvidencePerCommunity: 8,
  sourceObservationLimit: 12,
  rebuildMaxTriples: 5000,
  staleBehavior: 'skip',
  kgCommunityWeight: 0.45,
  enrichment: {
    enabled: false,
    timeoutMs: 8000,
    maxCostUsd: 0,
    maxChars: 1200,
  },
};

const COMMUNITY_SUMMARIES_LIMITS = {
  summaryMaxChars: { min: 200, max: 8000 },
  maxCommunitiesPerProject: { min: 1, max: 1000 },
  maxRetrievalCommunities: { min: 1, max: 20 },
  maxEvidencePerCommunity: { min: 1, max: 100 },
  sourceObservationLimit: { min: 1, max: 100 },
  rebuildMaxTriples: { min: 1, max: 100000 },
  enrichmentMaxChars: { min: 200, max: 8000 },
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

function normalizeExplicitString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
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

function numberInRange(value: number | null | undefined, min: number, max: number, fallback: number): number {
  if (value === null || value === undefined || value < min || value > max) {
    return fallback;
  }

  return value;
}

function integerAtLeast(value: number | null | undefined, min: number, fallback: number): number {
  if (value === null || value === undefined || value < min) {
    return fallback;
  }

  return Math.floor(value);
}

function integerInRangeClamped(
  value: number | null | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value === null || value === undefined || value < min) {
    return fallback;
  }

  return Math.min(Math.floor(value), max);
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

function parseGraphFactsSource(value: string | null | undefined): GraphFactsSource | null {
  const normalized = value?.trim();
  if (normalized === 'legacy' || normalized === 'kg') {
    return normalized;
  }

  return null;
}

function parseMaintenanceDefaultMode(value: string | null | undefined): MaintenanceDefaultMode | null {
  const normalized = value?.trim();
  if (normalized === 'dry-run' || normalized === 'apply') {
    return normalized;
  }

  return null;
}

function parseMaintenanceDecayState(value: string | null | undefined): MaintenanceDecayState | null {
  const normalized = value?.trim();
  if (normalized === 'active' || normalized === 'attenuated' || normalized === 'suppressed') {
    return normalized;
  }

  return null;
}

function parseCommunityAlgorithm(value: string | null | undefined): CommunityAlgorithm | null {
  const normalized = value?.trim();
  if (normalized === 'connected_components' || normalized === 'louvain' || normalized === 'leiden') {
    return normalized;
  }

  return null;
}

function parseCommunityStaleBehavior(value: string | null | undefined): CommunityStaleBehavior | null {
  const normalized = value?.trim();
  if (normalized === 'skip' || normalized === 'include-degraded') {
    return normalized;
  }

  return null;
}

function parseStringList(value: string | undefined): string[] | null {
  if (value === undefined) return null;
  const normalized = value
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return normalized.length > 0 ? normalized : null;
}

function normalizeMaintenanceLowValueTypes(value: readonly string[] | undefined): string[] | null {
  if (!value) return null;
  const validTypes = new Set<string>(OBSERVATION_TYPES);
  const normalized = Array.from(new Set(value.filter((entry) => validTypes.has(entry))));
  return normalized.length > 0 ? normalized : null;
}

function normalizeRelationAllowList(value: readonly string[] | undefined): string[] | null {
  if (!value) return null;
  const validRelations = new Set<string>(KG_RELATION_TYPES);
  const normalized = Array.from(new Set(value
    .map((relation) => relation.trim().toUpperCase())
    .filter((relation) => validRelations.has(relation))));
  return normalized.length > 0 ? normalized : null;
}

function parseRelationAllowList(value: string | undefined): string[] | null {
  if (value === undefined) return null;
  return normalizeRelationAllowList(value.split(/[,\s]+/));
}

function defaultPersistedConfig(): PersistedConfig {
  return {
    $schema: CONFIG_SCHEMA_REF,
    version: 1,
    maxContentLength: 100_000,
    maxContextChars: 8000,
    maxContextResults: 20,
    maxSearchResults: 20,
    dedupeWindowMinutes: 15,
    previewLength: 300,
    http: {
      port: 7438,
      disabled: false,
    },
    project: {
      default: null,
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
    knowledgeGraph: { ...DEFAULT_KNOWLEDGE_GRAPH_CONFIG },
    communitySummaries: { ...DEFAULT_COMMUNITY_SUMMARIES_CONFIG },
    maintenance: { ...DEFAULT_MAINTENANCE_CONFIG },
    graphFactsSource: 'kg',
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
    project: {
      ...defaults.project,
      ...(existing.project ?? {}),
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
    knowledgeGraph: {
      ...defaults.knowledgeGraph,
      ...(existing.knowledgeGraph ?? {}),
    },
    communitySummaries: {
      ...defaults.communitySummaries,
      ...(existing.communitySummaries ?? {}),
      readPath: {
        ...defaults.communitySummaries?.readPath,
        ...(existing.communitySummaries?.readPath ?? {}),
      },
      enrichment: {
        ...defaults.communitySummaries?.enrichment,
        ...(existing.communitySummaries?.enrichment ?? {}),
      },
    },
    maintenance: {
      ...defaults.maintenance,
      ...(existing.maintenance ?? {}),
      automatic: {
        ...defaults.maintenance?.automatic,
        ...(existing.maintenance?.automatic ?? {}),
      },
      readPath: {
        ...defaults.maintenance?.readPath,
        ...(existing.maintenance?.readPath ?? {}),
      },
      consolidation: {
        ...defaults.maintenance?.consolidation,
        ...(existing.maintenance?.consolidation ?? {}),
      },
      reflection: {
        ...defaults.maintenance?.reflection,
        ...(existing.maintenance?.reflection ?? {}),
      },
      decay: {
        ...defaults.maintenance?.decay,
        ...(existing.maintenance?.decay ?? {}),
      },
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

export function resolveKnowledgeGraphConfig(persisted: PersistedConfig): KnowledgeGraphConfig {
  const persistedKg = persisted.knowledgeGraph ?? {};
  const enabledFromEnv = parseBoolean(process.env.THOTH_KG_MULTI_HOP_ENABLED);
  const maxDepthFromEnv = parseNumber(process.env.THOTH_KG_MAX_DEPTH);
  const neighborhoodLimitFromEnv = parseNumber(process.env.THOTH_KG_NEIGHBORHOOD_LIMIT);
  const multiHopWeightFromEnv = parseNumber(process.env.THOTH_KG_MULTI_HOP_WEIGHT);
  const depthDecayFromEnv = parseNumber(process.env.THOTH_KG_DEPTH_DECAY);
  const traversalTimeoutFromEnv = parseNumber(process.env.THOTH_KG_TRAVERSAL_TIMEOUT_MS);
  const supersedeEnabledFromEnv = parseBoolean(process.env.THOTH_KG_SUPERSEDE_ENABLED);
  const supersedeContentPatternsFromEnv = parseBoolean(process.env.THOTH_KG_SUPERSEDE_CONTENT_PATTERNS);
  const supersedeConfidenceThresholdFromEnv = parseNumber(process.env.THOTH_KG_SUPERSEDE_CONFIDENCE_THRESHOLD);
  const supersedeDeprioritizeWeightFromEnv = parseNumber(process.env.THOTH_KG_SUPERSEDE_DEPRIORITIZE_WEIGHT);
  const pruneEnabledFromEnv = parseBoolean(process.env.THOTH_KG_PRUNE_ENABLED);
  const supersededKeepNFromEnv = parseNumber(process.env.THOTH_KG_SUPERSEDED_KEEP_N);
  const pruneOrphanEntitiesFromEnv = parseBoolean(process.env.THOTH_KG_PRUNE_ORPHAN_ENTITIES);
  const relationAllowList = parseRelationAllowList(process.env.THOTH_KG_RELATION_ALLOW_LIST)
    ?? normalizeRelationAllowList(persistedKg.kgRelationAllowList)
    ?? DEFAULT_KNOWLEDGE_GRAPH_CONFIG.kgRelationAllowList;

  return {
    kgMultiHopEnabled: enabledFromEnv ?? persistedKg.kgMultiHopEnabled ?? DEFAULT_KNOWLEDGE_GRAPH_CONFIG.kgMultiHopEnabled,
    kgMaxDepth: maxDepthFromEnv ?? persistedKg.kgMaxDepth ?? DEFAULT_KNOWLEDGE_GRAPH_CONFIG.kgMaxDepth,
    kgNeighborhoodLimit: neighborhoodLimitFromEnv
      ?? persistedKg.kgNeighborhoodLimit
      ?? DEFAULT_KNOWLEDGE_GRAPH_CONFIG.kgNeighborhoodLimit,
    kgMultiHopWeight: multiHopWeightFromEnv
      ?? persistedKg.kgMultiHopWeight
      ?? DEFAULT_KNOWLEDGE_GRAPH_CONFIG.kgMultiHopWeight,
    kgDepthDecay: depthDecayFromEnv ?? persistedKg.kgDepthDecay ?? DEFAULT_KNOWLEDGE_GRAPH_CONFIG.kgDepthDecay,
    kgTraversalTimeoutMs: traversalTimeoutFromEnv
      ?? persistedKg.kgTraversalTimeoutMs
      ?? DEFAULT_KNOWLEDGE_GRAPH_CONFIG.kgTraversalTimeoutMs,
    kgRelationAllowList: [...relationAllowList],
    kgSupersedeEnabled: supersedeEnabledFromEnv
      ?? persistedKg.kgSupersedeEnabled
      ?? DEFAULT_KNOWLEDGE_GRAPH_CONFIG.kgSupersedeEnabled,
    kgSupersedeContentPatterns: supersedeContentPatternsFromEnv
      ?? persistedKg.kgSupersedeContentPatterns
      ?? DEFAULT_KNOWLEDGE_GRAPH_CONFIG.kgSupersedeContentPatterns,
    kgSupersedeConfidenceThreshold: supersedeConfidenceThresholdFromEnv
      ?? persistedKg.kgSupersedeConfidenceThreshold
      ?? DEFAULT_KNOWLEDGE_GRAPH_CONFIG.kgSupersedeConfidenceThreshold,
    kgSupersedeDeprioritizeWeight: supersedeDeprioritizeWeightFromEnv
      ?? persistedKg.kgSupersedeDeprioritizeWeight
      ?? DEFAULT_KNOWLEDGE_GRAPH_CONFIG.kgSupersedeDeprioritizeWeight,
    kgPruneEnabled: pruneEnabledFromEnv
      ?? persistedKg.kgPruneEnabled
      ?? DEFAULT_KNOWLEDGE_GRAPH_CONFIG.kgPruneEnabled,
    kgSupersededKeepN: supersededKeepNFromEnv
      ?? persistedKg.kgSupersededKeepN
      ?? DEFAULT_KNOWLEDGE_GRAPH_CONFIG.kgSupersededKeepN,
    kgPruneOrphanEntities: pruneOrphanEntitiesFromEnv
      ?? persistedKg.kgPruneOrphanEntities
      ?? DEFAULT_KNOWLEDGE_GRAPH_CONFIG.kgPruneOrphanEntities,
  };
}

export function resolveMaintenanceConfig(persisted: PersistedConfig): MaintenanceConfig {
  const persistedMaintenance = persisted.maintenance ?? {};
  const persistedAutomatic = persistedMaintenance.automatic ?? {};
  const persistedReadPath = persistedMaintenance.readPath ?? {};
  const persistedConsolidation = persistedMaintenance.consolidation ?? {};
  const persistedReflection = persistedMaintenance.reflection ?? {};
  const persistedDecay = persistedMaintenance.decay ?? {};

  const enabledFromEnv = parseBoolean(process.env.THOTH_MAINTENANCE_ENABLED);
  const enabled = enabledFromEnv
    ?? persistedMaintenance.enabled
    ?? DEFAULT_MAINTENANCE_CONFIG.enabled;
  const automaticEnabled = enabled && (
    parseBoolean(process.env.THOTH_MAINTENANCE_AUTOMATIC_ENABLED)
      ?? persistedAutomatic.enabled
      ?? DEFAULT_MAINTENANCE_CONFIG.automatic.enabled
  );
  const readPathEnabledFromEnv = parseBoolean(process.env.THOTH_MAINTENANCE_READ_PATH_ENABLED);
  const explicitReadPathEnabled = readPathEnabledFromEnv
    ?? (enabledFromEnv === false ? undefined : persistedReadPath.enabled);
  const readPathEnabled = explicitReadPathEnabled
    ?? (enabled ? DEFAULT_MAINTENANCE_CONFIG.readPath.enabled : false);
  const consolidationEnabled = enabled && (
    parseBoolean(process.env.THOTH_MAINTENANCE_CONSOLIDATION_ENABLED)
      ?? persistedConsolidation.enabled
      ?? DEFAULT_MAINTENANCE_CONFIG.consolidation.enabled
  );
  const reflectionEnabled = enabled && (
    parseBoolean(process.env.THOTH_MAINTENANCE_REFLECTION_ENABLED)
      ?? persistedReflection.enabled
      ?? DEFAULT_MAINTENANCE_CONFIG.reflection.enabled
  );
  const decayEnabled = enabled && (
    parseBoolean(process.env.THOTH_MAINTENANCE_DECAY_ENABLED)
      ?? persistedDecay.enabled
      ?? DEFAULT_MAINTENANCE_CONFIG.decay.enabled
  );

  const exactHashThreshold = integerAtLeast(
    parseNumber(process.env.THOTH_MAINTENANCE_CONSOLIDATION_EXACT_HASH_THRESHOLD)
      ?? persistedConsolidation.exactHashThreshold,
    1,
    DEFAULT_MAINTENANCE_CONFIG.consolidation.exactHashThreshold,
  );
  const reflectionMinSourceCount = integerAtLeast(
    parseNumber(process.env.THOTH_MAINTENANCE_REFLECTION_MIN_SOURCE_COUNT)
      ?? persistedReflection.minSourceCount,
    2,
    DEFAULT_MAINTENANCE_CONFIG.reflection.minSourceCount,
  );
  const reflectionMaxSourceCount = integerAtLeast(
    parseNumber(process.env.THOTH_MAINTENANCE_REFLECTION_MAX_SOURCE_COUNT)
      ?? persistedReflection.maxSourceCount,
    reflectionMinSourceCount,
    DEFAULT_MAINTENANCE_CONFIG.reflection.maxSourceCount,
  );

  return {
    enabled,
    defaultMode: parseMaintenanceDefaultMode(process.env.THOTH_MAINTENANCE_DEFAULT_MODE)
      ?? persistedMaintenance.defaultMode
      ?? DEFAULT_MAINTENANCE_CONFIG.defaultMode,
    automatic: {
      enabled: automaticEnabled,
      maxRecordsPerRun: integerAtLeast(
        parseNumber(process.env.THOTH_MAINTENANCE_AUTOMATIC_MAX_RECORDS_PER_RUN)
          ?? persistedAutomatic.maxRecordsPerRun,
        1,
        DEFAULT_MAINTENANCE_CONFIG.automatic.maxRecordsPerRun,
      ),
    },
    readPath: {
      enabled: readPathEnabled,
    },
    consolidation: {
      enabled: consolidationEnabled,
      exactHashThreshold,
      lexicalSimilarityThreshold: numberInRange(
        parseNumber(process.env.THOTH_MAINTENANCE_CONSOLIDATION_LEXICAL_SIMILARITY_THRESHOLD)
          ?? persistedConsolidation.lexicalSimilarityThreshold,
        0,
        1,
        DEFAULT_MAINTENANCE_CONFIG.consolidation.lexicalSimilarityThreshold,
      ),
      reviewSimilarityThreshold: numberInRange(
        parseNumber(process.env.THOTH_MAINTENANCE_CONSOLIDATION_REVIEW_SIMILARITY_THRESHOLD)
          ?? persistedConsolidation.reviewSimilarityThreshold,
        0,
        1,
        DEFAULT_MAINTENANCE_CONFIG.consolidation.reviewSimilarityThreshold,
      ),
    },
    reflection: {
      enabled: reflectionEnabled,
      minSourceCount: reflectionMinSourceCount,
      maxSourceCount: reflectionMaxSourceCount,
      contentBudgetChars: integerAtLeast(
        parseNumber(process.env.THOTH_MAINTENANCE_REFLECTION_CONTENT_BUDGET_CHARS)
          ?? persistedReflection.contentBudgetChars,
        200,
        DEFAULT_MAINTENANCE_CONFIG.reflection.contentBudgetChars,
      ),
      modelAssisted: parseBoolean(process.env.THOTH_MAINTENANCE_REFLECTION_MODEL_ASSISTED)
        ?? persistedReflection.modelAssisted
        ?? DEFAULT_MAINTENANCE_CONFIG.reflection.modelAssisted,
    },
    decay: {
      enabled: decayEnabled,
      defaultState: parseMaintenanceDecayState(process.env.THOTH_MAINTENANCE_DECAY_DEFAULT_STATE)
        ?? persistedDecay.defaultState
        ?? DEFAULT_MAINTENANCE_CONFIG.decay.defaultState,
      staleAfterDays: integerAtLeast(
        parseNumber(process.env.THOTH_MAINTENANCE_DECAY_STALE_AFTER_DAYS)
          ?? persistedDecay.staleAfterDays,
        1,
        DEFAULT_MAINTENANCE_CONFIG.decay.staleAfterDays,
      ),
      redundantDuplicateCount: integerAtLeast(
        parseNumber(process.env.THOTH_MAINTENANCE_DECAY_REDUNDANT_DUPLICATE_COUNT)
          ?? persistedDecay.redundantDuplicateCount,
        2,
        DEFAULT_MAINTENANCE_CONFIG.decay.redundantDuplicateCount,
      ),
      lowValueTypes: normalizeMaintenanceLowValueTypes(parseStringList(process.env.THOTH_MAINTENANCE_DECAY_LOW_VALUE_TYPES)
        ?? persistedDecay.lowValueTypes)
        ?? DEFAULT_MAINTENANCE_CONFIG.decay.lowValueTypes,
      scoreMultiplier: numberInRange(
        parseNumber(process.env.THOTH_MAINTENANCE_DECAY_SCORE_MULTIPLIER)
          ?? persistedDecay.scoreMultiplier,
        0,
        1,
        DEFAULT_MAINTENANCE_CONFIG.decay.scoreMultiplier,
      ),
    },
  };
}

export function resolveCommunitySummariesConfig(persisted: PersistedConfig): CommunitySummariesConfig {
  const persistedCommunity = persisted.communitySummaries ?? {};
  const persistedReadPath = persistedCommunity.readPath ?? {};
  const persistedEnrichment = persistedCommunity.enrichment ?? {};
  const enabledFromEnv = parseBoolean(process.env.THOTH_COMMUNITY_ENABLED);
  const algorithmFromEnv = process.env.THOTH_COMMUNITY_ALGORITHM === undefined
    ? null
    : parseCommunityAlgorithm(process.env.THOTH_COMMUNITY_ALGORITHM) ?? DEFAULT_COMMUNITY_SUMMARIES_CONFIG.algorithm;
  const fallbackAlgorithmFromEnv = process.env.THOTH_COMMUNITY_ADVANCED_ALGORITHM_FALLBACK === undefined
    ? null
    : parseCommunityAlgorithm(process.env.THOTH_COMMUNITY_ADVANCED_ALGORITHM_FALLBACK)
      ?? DEFAULT_COMMUNITY_SUMMARIES_CONFIG.advancedAlgorithmFallback;
  const enabled = enabledFromEnv
    ?? persistedCommunity.enabled
    ?? DEFAULT_COMMUNITY_SUMMARIES_CONFIG.enabled;

  return {
    enabled,
    readPath: {
      enabled: enabled && (
        parseBoolean(process.env.THOTH_COMMUNITY_READ_PATH_ENABLED)
          ?? persistedReadPath.enabled
          ?? DEFAULT_COMMUNITY_SUMMARIES_CONFIG.readPath.enabled
      ),
    },
    algorithm: algorithmFromEnv
      ?? parseCommunityAlgorithm(persistedCommunity.algorithm)
      ?? DEFAULT_COMMUNITY_SUMMARIES_CONFIG.algorithm,
    advancedAlgorithmFallback: fallbackAlgorithmFromEnv
      ?? parseCommunityAlgorithm(persistedCommunity.advancedAlgorithmFallback)
      ?? DEFAULT_COMMUNITY_SUMMARIES_CONFIG.advancedAlgorithmFallback,
    summaryMaxChars: integerInRangeClamped(
      parseNumber(process.env.THOTH_COMMUNITY_SUMMARY_MAX_CHARS)
        ?? persistedCommunity.summaryMaxChars,
      COMMUNITY_SUMMARIES_LIMITS.summaryMaxChars.min,
      COMMUNITY_SUMMARIES_LIMITS.summaryMaxChars.max,
      DEFAULT_COMMUNITY_SUMMARIES_CONFIG.summaryMaxChars,
    ),
    maxCommunitiesPerProject: integerInRangeClamped(
      parseNumber(process.env.THOTH_COMMUNITY_MAX_COMMUNITIES_PER_PROJECT)
        ?? persistedCommunity.maxCommunitiesPerProject,
      COMMUNITY_SUMMARIES_LIMITS.maxCommunitiesPerProject.min,
      COMMUNITY_SUMMARIES_LIMITS.maxCommunitiesPerProject.max,
      DEFAULT_COMMUNITY_SUMMARIES_CONFIG.maxCommunitiesPerProject,
    ),
    maxRetrievalCommunities: integerInRangeClamped(
      parseNumber(process.env.THOTH_COMMUNITY_MAX_RETRIEVAL_COMMUNITIES)
        ?? persistedCommunity.maxRetrievalCommunities,
      COMMUNITY_SUMMARIES_LIMITS.maxRetrievalCommunities.min,
      COMMUNITY_SUMMARIES_LIMITS.maxRetrievalCommunities.max,
      DEFAULT_COMMUNITY_SUMMARIES_CONFIG.maxRetrievalCommunities,
    ),
    maxEvidencePerCommunity: integerInRangeClamped(
      parseNumber(process.env.THOTH_COMMUNITY_MAX_EVIDENCE_PER_COMMUNITY)
        ?? persistedCommunity.maxEvidencePerCommunity,
      COMMUNITY_SUMMARIES_LIMITS.maxEvidencePerCommunity.min,
      COMMUNITY_SUMMARIES_LIMITS.maxEvidencePerCommunity.max,
      DEFAULT_COMMUNITY_SUMMARIES_CONFIG.maxEvidencePerCommunity,
    ),
    sourceObservationLimit: integerInRangeClamped(
      parseNumber(process.env.THOTH_COMMUNITY_SOURCE_OBSERVATION_LIMIT)
        ?? persistedCommunity.sourceObservationLimit,
      COMMUNITY_SUMMARIES_LIMITS.sourceObservationLimit.min,
      COMMUNITY_SUMMARIES_LIMITS.sourceObservationLimit.max,
      DEFAULT_COMMUNITY_SUMMARIES_CONFIG.sourceObservationLimit,
    ),
    rebuildMaxTriples: integerInRangeClamped(
      parseNumber(process.env.THOTH_COMMUNITY_REBUILD_MAX_TRIPLES)
        ?? persistedCommunity.rebuildMaxTriples,
      COMMUNITY_SUMMARIES_LIMITS.rebuildMaxTriples.min,
      COMMUNITY_SUMMARIES_LIMITS.rebuildMaxTriples.max,
      DEFAULT_COMMUNITY_SUMMARIES_CONFIG.rebuildMaxTriples,
    ),
    staleBehavior: parseCommunityStaleBehavior(process.env.THOTH_COMMUNITY_STALE_BEHAVIOR)
      ?? parseCommunityStaleBehavior(persistedCommunity.staleBehavior)
      ?? DEFAULT_COMMUNITY_SUMMARIES_CONFIG.staleBehavior,
    kgCommunityWeight: numberInRange(
      parseNumber(process.env.THOTH_COMMUNITY_KG_WEIGHT)
        ?? persistedCommunity.kgCommunityWeight,
      0,
      1,
      DEFAULT_COMMUNITY_SUMMARIES_CONFIG.kgCommunityWeight,
    ),
    enrichment: {
      enabled: enabled && (
        parseBoolean(process.env.THOTH_COMMUNITY_ENRICHMENT_ENABLED)
          ?? persistedEnrichment.enabled
          ?? DEFAULT_COMMUNITY_SUMMARIES_CONFIG.enrichment.enabled
      ),
      timeoutMs: integerAtLeast(
        parseNumber(process.env.THOTH_COMMUNITY_ENRICHMENT_TIMEOUT_MS)
          ?? persistedEnrichment.timeoutMs,
        1,
        DEFAULT_COMMUNITY_SUMMARIES_CONFIG.enrichment.timeoutMs,
      ),
      maxCostUsd: numberInRange(
        parseNumber(process.env.THOTH_COMMUNITY_ENRICHMENT_MAX_COST_USD)
          ?? persistedEnrichment.maxCostUsd,
        0,
        100,
        DEFAULT_COMMUNITY_SUMMARIES_CONFIG.enrichment.maxCostUsd,
      ),
      maxChars: integerInRangeClamped(
        parseNumber(process.env.THOTH_COMMUNITY_ENRICHMENT_MAX_CHARS)
          ?? persistedEnrichment.maxChars,
        COMMUNITY_SUMMARIES_LIMITS.enrichmentMaxChars.min,
        COMMUNITY_SUMMARIES_LIMITS.enrichmentMaxChars.max,
        DEFAULT_COMMUNITY_SUMMARIES_CONFIG.enrichment.maxChars,
      ),
    },
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
  const knowledgeGraph = resolveKnowledgeGraphConfig(persisted);
  const communitySummaries = resolveCommunitySummariesConfig(persisted);
  const maintenance = resolveMaintenanceConfig(persisted);
  const httpPortFromPersisted = persisted.http?.port;
  const httpDisabledFromPersisted = persisted.http?.disabled;

  return {
    dataDir,
    dbPath: join(dataDir, 'thoth.db'),
    project: {
      default: normalizeExplicitString(process.env.THOTH_PROJECT) ?? normalizeExplicitString(persisted.project?.default) ?? null,
    },
    maxContentLength: parseNumber(process.env.THOTH_MAX_CONTENT_LENGTH) ?? persisted.maxContentLength ?? 100_000,
    maxContextChars: parseNumber(process.env.THOTH_MAX_CONTEXT_CHARS) ?? persisted.maxContextChars ?? 8000,
    maxContextResults: parseNumber(process.env.THOTH_MAX_CONTEXT_RESULTS) ?? persisted.maxContextResults ?? 20,
    maxSearchResults: parseNumber(process.env.THOTH_MAX_SEARCH_RESULTS) ?? persisted.maxSearchResults ?? 20,
    dedupeWindowMinutes: parseNumber(process.env.THOTH_DEDUPE_WINDOW_MINUTES) ?? persisted.dedupeWindowMinutes ?? 15,
    previewLength: parseNumber(process.env.THOTH_PREVIEW_LENGTH) ?? persisted.previewLength ?? 300,
    httpPort: parseNumber(process.env.THOTH_HTTP_PORT) ?? httpPortFromPersisted ?? 7438,
    httpDisabled: parseBoolean(process.env.THOTH_HTTP_DISABLED) ?? httpDisabledFromPersisted ?? false,
    graphFactsSource: parseGraphFactsSource(process.env.THOTH_GRAPH_FACTS_SOURCE) ?? persisted.graphFactsSource ?? 'kg',
    retrievalDefaults: {
      ...DEFAULT_RETRIEVAL_DEFAULTS,
      ...(persisted.retrievalDefaults ?? {}),
    },
    embedding: resolveEmbeddingConfig(persisted),
    hyde,
    kgLlm,
    knowledgeGraph,
    communitySummaries,
    maintenance,
  };
}

/**
 * Ensure the data directory exists (creates recursively if missing).
 */
export function resolveDataDir(config: ThothConfig): void {
  mkdirSync(config.dataDir, { recursive: true });
}
