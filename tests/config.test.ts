import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  DEFAULT_COMMUNITY_SUMMARIES_CONFIG,
  DEFAULT_KG_RELATION_ALLOW_LIST,
  DEFAULT_KNOWLEDGE_GRAPH_CONFIG,
  DEFAULT_MAINTENANCE_CONFIG,
  getConfig,
  resolveCommunitySummariesConfig,
  resolveMaintenanceConfig,
  resolveKnowledgeGraphConfig,
  resolveDataDir,
} from '../src/config.js';
import { getVersion } from '../src/version.js';

describe('getConfig', () => {
  const originalEnv = { ...process.env };
  let tmpDataDir: string | null = null;

  beforeEach(() => {
    process.env = { ...originalEnv };
    tmpDataDir = mkdtempSync(join(tmpdir(), 'thoth-config-test-'));
    process.env.THOTH_DATA_DIR = tmpDataDir;
  });

  afterEach(() => {
    if (tmpDataDir) {
      rmSync(tmpDataDir, { recursive: true, force: true });
      tmpDataDir = null;
    }
    process.env = { ...originalEnv };
  });

  it('returns sensible defaults', () => {
    const config = getConfig();
    expect(config.maxContentLength).toBe(100_000);
    expect(config.maxContextChars).toBe(8000);
    expect(config.maxContextResults).toBe(20);
    expect(config.maxSearchResults).toBe(20);
    expect(config.dedupeWindowMinutes).toBe(15);
    expect(config.previewLength).toBe(300);
    expect(config.httpPort).toBe(7438);
    expect(config.httpDisabled).toBe(false);
    expect(config.graphFactsSource).toBe('kg');
    expect(config.knowledgeGraph).toEqual(DEFAULT_KNOWLEDGE_GRAPH_CONFIG);
    expect(config.communitySummaries).toEqual(DEFAULT_COMMUNITY_SUMMARIES_CONFIG);
    expect(config.maintenance).toEqual(DEFAULT_MAINTENANCE_CONFIG);
    expect(config.dataDir).toBe(tmpDataDir);
    expect(config.dbPath).toBe(join(tmpDataDir!, 'thoth.db'));
  });

  it('respects THOTH_DATA_DIR env var', () => {
    const customPath = mkdtempSync(join(tmpdir(), 'thoth-custom-config-test-'));
    process.env.THOTH_DATA_DIR = customPath;
    const config = getConfig();
    expect(config.dataDir).toBe(customPath);
    expect(config.dbPath).toBe(join(customPath, 'thoth.db'));
    rmSync(customPath, { recursive: true, force: true });
  });

  it('respects numeric env var overrides', () => {
    process.env.THOTH_MAX_CONTENT_LENGTH = '50000';
    process.env.THOTH_MAX_CONTEXT_CHARS = '2500';
    process.env.THOTH_MAX_CONTEXT_RESULTS = '10';
    process.env.THOTH_MAX_SEARCH_RESULTS = '5';
    process.env.THOTH_DEDUPE_WINDOW_MINUTES = '30';
    process.env.THOTH_PREVIEW_LENGTH = '500';
    process.env.THOTH_HTTP_PORT = '9000';
    process.env.THOTH_HTTP_DISABLED = 'true';
    const config = getConfig();
    expect(config.maxContentLength).toBe(50000);
    expect(config.maxContextChars).toBe(2500);
    expect(config.maxContextResults).toBe(10);
    expect(config.maxSearchResults).toBe(5);
    expect(config.dedupeWindowMinutes).toBe(30);
    expect(config.previewLength).toBe(500);
    expect(config.httpPort).toBe(9000);
    expect(config.httpDisabled).toBe(true);
  });

  it('dbPath is derived from dataDir', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-dbpath-config-test-'));
    process.env.THOTH_DATA_DIR = dataDir;
    const config = getConfig();
    expect(config.dbPath).toBe(join(dataDir, 'thoth.db'));
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('resolves maxContextChars from persisted config when env is unset', () => {
    writeFileSync(join(tmpDataDir!, 'config.json'), JSON.stringify({
      maxContextChars: 4321,
    }, null, 2));

    const config = getConfig();

    expect(config.maxContextChars).toBe(4321);
  });

  it('resolves THOTH_MAX_CONTEXT_CHARS before persisted config and preserves sentinel 0', () => {
    writeFileSync(join(tmpDataDir!, 'config.json'), JSON.stringify({
      maxContextChars: 4321,
    }, null, 2));
    process.env.THOTH_MAX_CONTEXT_CHARS = '0';

    const config = getConfig();

    expect(config.maxContextChars).toBe(0);
  });

  it('resolves graphFactsSource from persisted config when provided', () => {
    writeFileSync(join(tmpDataDir!, 'config.json'), JSON.stringify({
      graphFactsSource: 'legacy',
    }, null, 2));

    const config = getConfig();

    expect(config.graphFactsSource).toBe('legacy');
  });

  it('resolves knowledgeGraph from persisted config when env is unset', () => {
    writeFileSync(join(tmpDataDir!, 'config.json'), JSON.stringify({
      knowledgeGraph: {
        kgMultiHopEnabled: false,
        kgMaxDepth: 3,
        kgNeighborhoodLimit: 12,
        kgMultiHopWeight: 0.6,
        kgDepthDecay: 0.4,
        kgTraversalTimeoutMs: 25,
        kgRelationAllowList: ['USES', 'MENTIONS', 'NOT_A_RELATION'],
      },
    }, null, 2));

    const config = getConfig();

    expect(config.knowledgeGraph).toEqual({
      kgMultiHopEnabled: false,
      kgMaxDepth: 3,
      kgNeighborhoodLimit: 12,
      kgMultiHopWeight: 0.6,
      kgDepthDecay: 0.4,
      kgTraversalTimeoutMs: 25,
      kgRelationAllowList: ['USES', 'MENTIONS'],
      kgSupersedeEnabled: true,
      kgSupersedeContentPatterns: false,
      kgSupersedeConfidenceThreshold: 0.8,
      kgSupersedeDeprioritizeWeight: 0.5,
      kgPruneEnabled: true,
      kgSupersededKeepN: 10,
      kgPruneOrphanEntities: true,
    });
  });

  it('resolves THOTH_KG env vars before persisted knowledgeGraph config', () => {
    writeFileSync(join(tmpDataDir!, 'config.json'), JSON.stringify({
      knowledgeGraph: {
        kgMultiHopEnabled: false,
        kgMaxDepth: 3,
        kgNeighborhoodLimit: 12,
        kgMultiHopWeight: 0.6,
        kgDepthDecay: 0.4,
        kgTraversalTimeoutMs: 25,
        kgRelationAllowList: ['USES'],
      },
    }, null, 2));
    process.env.THOTH_KG_MULTI_HOP_ENABLED = 'true';
    process.env.THOTH_KG_MAX_DEPTH = '4';
    process.env.THOTH_KG_NEIGHBORHOOD_LIMIT = '7';
    process.env.THOTH_KG_MULTI_HOP_WEIGHT = '0.55';
    process.env.THOTH_KG_DEPTH_DECAY = '0.25';
    process.env.THOTH_KG_TRAVERSAL_TIMEOUT_MS = '0';
    process.env.THOTH_KG_RELATION_ALLOW_LIST = 'depends_on, affects NOT_A_RELATION';

    const config = getConfig();

    expect(config.knowledgeGraph).toEqual({
      kgMultiHopEnabled: true,
      kgMaxDepth: 4,
      kgNeighborhoodLimit: 7,
      kgMultiHopWeight: 0.55,
      kgDepthDecay: 0.25,
      kgTraversalTimeoutMs: 0,
      kgRelationAllowList: ['DEPENDS_ON', 'AFFECTS'],
      kgSupersedeEnabled: true,
      kgSupersedeContentPatterns: false,
      kgSupersedeConfidenceThreshold: 0.8,
      kgSupersedeDeprioritizeWeight: 0.5,
      kgPruneEnabled: true,
      kgSupersededKeepN: 10,
      kgPruneOrphanEntities: true,
    });
  });

  it('fails safe to the structural KG relation allow-list for empty or invalid overrides', () => {
    process.env.THOTH_KG_RELATION_ALLOW_LIST = 'UNKNOWN, ALSO_UNKNOWN';
    const invalid = getConfig();
    expect(invalid.knowledgeGraph?.kgRelationAllowList).toEqual(DEFAULT_KG_RELATION_ALLOW_LIST);

    process.env.THOTH_KG_RELATION_ALLOW_LIST = '   ';
    const empty = getConfig();
    expect(empty.knowledgeGraph?.kgRelationAllowList).toEqual(DEFAULT_KG_RELATION_ALLOW_LIST);
  });

  it('resolves KG supersession knobs from env, persisted config, then defaults', () => {
    expect(resolveKnowledgeGraphConfig({})).toMatchObject({
      kgSupersedeEnabled: true,
      kgSupersedeContentPatterns: false,
      kgSupersedeConfidenceThreshold: 0.8,
      kgSupersedeDeprioritizeWeight: 0.5,
    });

    const persisted = resolveKnowledgeGraphConfig({
      knowledgeGraph: {
        kgSupersedeEnabled: false,
        kgSupersedeContentPatterns: true,
        kgSupersedeConfidenceThreshold: 0.7,
        kgSupersedeDeprioritizeWeight: 0.25,
      },
    });
    expect(persisted).toMatchObject({
      kgSupersedeEnabled: false,
      kgSupersedeContentPatterns: true,
      kgSupersedeConfidenceThreshold: 0.7,
      kgSupersedeDeprioritizeWeight: 0.25,
    });

    process.env.THOTH_KG_SUPERSEDE_ENABLED = 'true';
    process.env.THOTH_KG_SUPERSEDE_CONTENT_PATTERNS = 'false';
    process.env.THOTH_KG_SUPERSEDE_CONFIDENCE_THRESHOLD = '0.9';
    process.env.THOTH_KG_SUPERSEDE_DEPRIORITIZE_WEIGHT = '0.4';

    expect(resolveKnowledgeGraphConfig({
      knowledgeGraph: {
        kgSupersedeEnabled: false,
        kgSupersedeContentPatterns: true,
        kgSupersedeConfidenceThreshold: 0.7,
        kgSupersedeDeprioritizeWeight: 0.25,
      },
    })).toMatchObject({
      kgSupersedeEnabled: true,
      kgSupersedeContentPatterns: false,
      kgSupersedeConfidenceThreshold: 0.9,
      kgSupersedeDeprioritizeWeight: 0.4,
    });
  });

  it('resolves KG pruning knobs from env, persisted config, then defaults', () => {
    expect(resolveKnowledgeGraphConfig({})).toMatchObject({
      kgPruneEnabled: true,
      kgSupersededKeepN: 10,
      kgPruneOrphanEntities: true,
    });

    const persisted = resolveKnowledgeGraphConfig({
      knowledgeGraph: {
        kgPruneEnabled: false,
        kgSupersededKeepN: 0,
        kgPruneOrphanEntities: false,
      },
    });
    expect(persisted).toMatchObject({
      kgPruneEnabled: false,
      kgSupersededKeepN: 0,
      kgPruneOrphanEntities: false,
    });

    process.env.THOTH_KG_PRUNE_ENABLED = 'true';
    process.env.THOTH_KG_SUPERSEDED_KEEP_N = '3';
    process.env.THOTH_KG_PRUNE_ORPHAN_ENTITIES = 'true';

    expect(resolveKnowledgeGraphConfig({
      knowledgeGraph: {
        kgPruneEnabled: false,
        kgSupersededKeepN: 7,
        kgPruneOrphanEntities: false,
      },
    })).toMatchObject({
      kgPruneEnabled: true,
      kgSupersededKeepN: 3,
      kgPruneOrphanEntities: true,
    });
  });

  it('resolves maintenance config from env, persisted config, then conservative defaults', () => {
    expect(resolveMaintenanceConfig({})).toMatchObject({
      enabled: true,
      defaultMode: 'dry-run',
      automatic: { enabled: false },
      readPath: { enabled: true },
      decay: { enabled: true, defaultState: 'attenuated', scoreMultiplier: 0.6 },
    });

    const persisted = resolveMaintenanceConfig({
      maintenance: {
        automatic: { enabled: true, maxRecordsPerRun: 25 },
        readPath: { enabled: false },
        decay: { staleAfterDays: 30, scoreMultiplier: 0.4 },
      },
    });
    expect(persisted).toMatchObject({
      automatic: { enabled: true, maxRecordsPerRun: 25 },
      readPath: { enabled: false },
      decay: { staleAfterDays: 30, scoreMultiplier: 0.4 },
    });

    process.env.THOTH_MAINTENANCE_AUTOMATIC_ENABLED = 'false';
    process.env.THOTH_MAINTENANCE_READ_PATH_ENABLED = 'true';
    process.env.THOTH_MAINTENANCE_DECAY_STALE_AFTER_DAYS = '90';
    process.env.THOTH_MAINTENANCE_DECAY_SCORE_MULTIPLIER = '0.2';

    expect(resolveMaintenanceConfig({
      maintenance: {
        automatic: { enabled: true },
        readPath: { enabled: false },
        decay: { staleAfterDays: 30, scoreMultiplier: 0.4 },
      },
    })).toMatchObject({
      automatic: { enabled: false },
      readPath: { enabled: true },
      decay: { staleAfterDays: 90, scoreMultiplier: 0.2 },
    });
  });

  it('falls back to conservative maintenance defaults for out-of-range policy values', () => {
    process.env.THOTH_MAINTENANCE_CONSOLIDATION_LEXICAL_SIMILARITY_THRESHOLD = '1.5';
    process.env.THOTH_MAINTENANCE_CONSOLIDATION_REVIEW_SIMILARITY_THRESHOLD = '-0.1';
    process.env.THOTH_MAINTENANCE_DECAY_SCORE_MULTIPLIER = '2';
    process.env.THOTH_MAINTENANCE_DECAY_LOW_VALUE_TYPES = 'discovery,unknown,learning';

    const config = resolveMaintenanceConfig({
      maintenance: {
        automatic: { maxRecordsPerRun: 0 },
        reflection: { contentBudgetChars: 10 },
        decay: { scoreMultiplier: -1, lowValueTypes: ['not-real', 'manual'] },
      },
    });

    expect(config.automatic.maxRecordsPerRun).toBe(DEFAULT_MAINTENANCE_CONFIG.automatic.maxRecordsPerRun);
    expect(config.consolidation.lexicalSimilarityThreshold)
      .toBe(DEFAULT_MAINTENANCE_CONFIG.consolidation.lexicalSimilarityThreshold);
    expect(config.consolidation.reviewSimilarityThreshold)
      .toBe(DEFAULT_MAINTENANCE_CONFIG.consolidation.reviewSimilarityThreshold);
    expect(config.reflection.contentBudgetChars).toBe(DEFAULT_MAINTENANCE_CONFIG.reflection.contentBudgetChars);
    expect(config.decay.scoreMultiplier).toBe(DEFAULT_MAINTENANCE_CONFIG.decay.scoreMultiplier);
    expect(config.decay.lowValueTypes).toEqual(['discovery', 'learning']);
  });

  it('maintenance disablement switches stop optional outcomes independently', () => {
    process.env.THOTH_MAINTENANCE_ENABLED = 'false';
    process.env.THOTH_MAINTENANCE_AUTOMATIC_ENABLED = 'true';

    const config = getConfig();

    expect(config.maintenance.enabled).toBe(false);
    expect(config.maintenance.automatic.enabled).toBe(false);
    expect(config.maintenance.consolidation.enabled).toBe(false);
    expect(config.maintenance.reflection.enabled).toBe(false);
    expect(config.maintenance.decay.enabled).toBe(false);
    expect(config.maintenance.readPath.enabled).toBe(false);
  });

  it('allows explicit read-path override when maintenance is disabled', () => {
    process.env.THOTH_MAINTENANCE_ENABLED = 'false';
    process.env.THOTH_MAINTENANCE_READ_PATH_ENABLED = 'true';

    expect(resolveMaintenanceConfig({}).readPath.enabled).toBe(true);
  });

  it('communitySummaries has deterministic offline defaults', () => {
    const config = getConfig();

    expect(config.communitySummaries).toEqual({
      enabled: true,
      readPath: { enabled: false },
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
    });
  });

  it('communitySummaries env overrides persisted config', () => {
    writeFileSync(join(tmpDataDir!, 'config.json'), JSON.stringify({
      communitySummaries: {
        enabled: false,
        readPath: { enabled: true },
        algorithm: 'louvain',
        advancedAlgorithmFallback: 'louvain',
        summaryMaxChars: 2400,
        maxCommunitiesPerProject: 50,
        maxRetrievalCommunities: 2,
        maxEvidencePerCommunity: 4,
        sourceObservationLimit: 6,
        rebuildMaxTriples: 1000,
        staleBehavior: 'include-degraded',
        kgCommunityWeight: 0.8,
        enrichment: {
          enabled: true,
          timeoutMs: 12000,
          maxCostUsd: 1,
          maxChars: 2000,
        },
      },
    }, null, 2));
    process.env.THOTH_COMMUNITY_ENABLED = 'true';
    process.env.THOTH_COMMUNITY_READ_PATH_ENABLED = 'false';
    process.env.THOTH_COMMUNITY_ALGORITHM = 'not-real';
    process.env.THOTH_COMMUNITY_ADVANCED_ALGORITHM_FALLBACK = 'connected_components';
    process.env.THOTH_COMMUNITY_SUMMARY_MAX_CHARS = '900';
    process.env.THOTH_COMMUNITY_MAX_COMMUNITIES_PER_PROJECT = '25';
    process.env.THOTH_COMMUNITY_MAX_RETRIEVAL_COMMUNITIES = '1';
    process.env.THOTH_COMMUNITY_MAX_EVIDENCE_PER_COMMUNITY = '5';
    process.env.THOTH_COMMUNITY_SOURCE_OBSERVATION_LIMIT = '7';
    process.env.THOTH_COMMUNITY_REBUILD_MAX_TRIPLES = '300';
    process.env.THOTH_COMMUNITY_STALE_BEHAVIOR = 'skip';
    process.env.THOTH_COMMUNITY_KG_WEIGHT = '0.35';
    process.env.THOTH_COMMUNITY_ENRICHMENT_ENABLED = 'false';
    process.env.THOTH_COMMUNITY_ENRICHMENT_TIMEOUT_MS = '5000';
    process.env.THOTH_COMMUNITY_ENRICHMENT_MAX_COST_USD = '0';
    process.env.THOTH_COMMUNITY_ENRICHMENT_MAX_CHARS = '800';

    const config = getConfig();

    expect(config.communitySummaries).toEqual({
      enabled: true,
      readPath: { enabled: false },
      algorithm: 'connected_components',
      advancedAlgorithmFallback: 'connected_components',
      summaryMaxChars: 900,
      maxCommunitiesPerProject: 25,
      maxRetrievalCommunities: 1,
      maxEvidencePerCommunity: 5,
      sourceObservationLimit: 7,
      rebuildMaxTriples: 300,
      staleBehavior: 'skip',
      kgCommunityWeight: 0.35,
      enrichment: {
        enabled: false,
        timeoutMs: 5000,
        maxCostUsd: 0,
        maxChars: 800,
      },
    });

    const invalidCommunitySummariesConfig = { communitySummaries: { algorithm: 'not-real' } } as unknown as Parameters<
      typeof resolveCommunitySummariesConfig
    >[0];

    expect(resolveCommunitySummariesConfig(invalidCommunitySummariesConfig).algorithm)
      .toBe('connected_components');
  });

  it('communitySummaries read path remains default-off unless explicitly opted in', () => {
    expect(resolveCommunitySummariesConfig({}).readPath.enabled).toBe(false);

    expect(resolveCommunitySummariesConfig({
      communitySummaries: {
        readPath: { enabled: true },
      },
    }).readPath.enabled).toBe(true);

    process.env.THOTH_COMMUNITY_READ_PATH_ENABLED = 'true';
    expect(resolveCommunitySummariesConfig({
      communitySummaries: {
        readPath: { enabled: false },
      },
    }).readPath.enabled).toBe(true);

    delete process.env.THOTH_COMMUNITY_READ_PATH_ENABLED;
    expect(resolveCommunitySummariesConfig({
      communitySummaries: {
        readPath: { enabled: false },
      },
    }).readPath.enabled).toBe(false);
  });

  it('communitySummaries clamps over-max persisted and env budgets to schema maximums', () => {
    const persisted = resolveCommunitySummariesConfig({
      communitySummaries: {
        summaryMaxChars: 80_001,
        maxCommunitiesPerProject: 10_001,
        maxRetrievalCommunities: 201,
        maxEvidencePerCommunity: 1_001,
        sourceObservationLimit: 1_001,
        rebuildMaxTriples: 1_000_001,
        enrichment: {
          maxChars: 80_001,
        },
      },
    });

    expect(persisted.summaryMaxChars).toBe(8000);
    expect(persisted.maxCommunitiesPerProject).toBe(1000);
    expect(persisted.maxRetrievalCommunities).toBe(20);
    expect(persisted.maxEvidencePerCommunity).toBe(100);
    expect(persisted.sourceObservationLimit).toBe(100);
    expect(persisted.rebuildMaxTriples).toBe(100000);
    expect(persisted.enrichment.maxChars).toBe(8000);

    process.env.THOTH_COMMUNITY_SUMMARY_MAX_CHARS = '90000';
    process.env.THOTH_COMMUNITY_MAX_COMMUNITIES_PER_PROJECT = '9000';
    process.env.THOTH_COMMUNITY_MAX_RETRIEVAL_COMMUNITIES = '90';
    process.env.THOTH_COMMUNITY_MAX_EVIDENCE_PER_COMMUNITY = '900';
    process.env.THOTH_COMMUNITY_SOURCE_OBSERVATION_LIMIT = '900';
    process.env.THOTH_COMMUNITY_REBUILD_MAX_TRIPLES = '900000';
    process.env.THOTH_COMMUNITY_ENRICHMENT_MAX_CHARS = '90000';

    const env = resolveCommunitySummariesConfig({});

    expect(env.summaryMaxChars).toBe(8000);
    expect(env.maxCommunitiesPerProject).toBe(1000);
    expect(env.maxRetrievalCommunities).toBe(20);
    expect(env.maxEvidencePerCommunity).toBe(100);
    expect(env.sourceObservationLimit).toBe(100);
    expect(env.rebuildMaxTriples).toBe(100000);
    expect(env.enrichment.maxChars).toBe(8000);
  });

  it('community config schema rejects invalid budgets', () => {
    const schema = JSON.parse(readFileSync(join(process.cwd(), 'config.schema.json'), 'utf8'));
    const community = schema.properties.communitySummaries;

    expect(community.additionalProperties).toBe(false);
    expect(community.properties.algorithm.enum).toEqual(['connected_components', 'louvain', 'leiden']);
    expect(community.properties.summaryMaxChars).toMatchObject({ type: 'integer', minimum: 200, maximum: 8000 });
    expect(community.properties.maxCommunitiesPerProject).toMatchObject({ type: 'integer', minimum: 1, maximum: 1000 });
    expect(community.properties.maxRetrievalCommunities).toMatchObject({ type: 'integer', minimum: 1, maximum: 20 });
    expect(community.properties.maxEvidencePerCommunity).toMatchObject({ type: 'integer', minimum: 1, maximum: 100 });
    expect(community.properties.sourceObservationLimit).toMatchObject({ type: 'integer', minimum: 1, maximum: 100 });
    expect(community.properties.rebuildMaxTriples).toMatchObject({ type: 'integer', minimum: 1, maximum: 100000 });
    expect(community.properties.kgCommunityWeight).toMatchObject({ type: 'number', minimum: 0, maximum: 1 });
    expect(community.properties.enrichment.required).toBeUndefined();
    expect(community.properties.enrichment.properties.maxCostUsd).toMatchObject({ type: 'number', minimum: 0, maximum: 100 });
    expect(community.properties.readPath.properties.enabled).toMatchObject({
      type: 'boolean',
      default: false,
    });
    expect(community.properties.readPath.properties.enabled.description).toContain('explicit opt-in');
    expect(community.properties.readPath.properties.enabled.description).toContain('Clearing');
  });
});

describe('resolveDataDir', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('creates data directory if it does not exist', () => {
    const tmpBase = mkdtempSync(join(tmpdir(), 'thoth-test-'));
    const dataDir = join(tmpBase, 'nested', 'dir');
    process.env.THOTH_DATA_DIR = dataDir;
    const config = getConfig();
    config.dataDir = dataDir;

    resolveDataDir(config);

    expect(existsSync(dataDir)).toBe(true);

    rmSync(tmpBase, { recursive: true, force: true });
  });
});

describe('embedding config (hybrid retrieval baseline)', () => {
  const originalEnv = { ...process.env };
  let tmpDataDir: string | null = null;

  beforeEach(() => {
    process.env = { ...originalEnv };
    tmpDataDir = mkdtempSync(join(tmpdir(), 'thoth-config-test-'));
    process.env.THOTH_DATA_DIR = tmpDataDir;
  });

  afterEach(() => {
    if (tmpDataDir) {
      rmSync(tmpDataDir, { recursive: true, force: true });
      tmpDataDir = null;
    }
    process.env = { ...originalEnv };
  });

  it('embedding: exposes Hybrid Retrieval retrieval defaults', () => {
    const config = getConfig() as any;

    expect(config.retrievalDefaults).toEqual({
      sentenceTopK: 100,
      chunkTopK: 20,
      lexicalLimit: 20,
      minSemanticScore: 0.3,
      l2DistanceScale: 20,
    });
  });

  it('embedding: resolves provider from env before config file and defaults', () => {
    process.env.THOTH_EMBEDDING_PROVIDER = 'ollama';
    process.env.THOTH_EMBEDDING_MODEL = 'nomic-embed-text';
    process.env.THOTH_EMBEDDING_BASE_URL = 'http://127.0.0.1:11434';

    const config = getConfig() as any;

    expect(config.embedding.provider).toBe('ollama');
    expect(config.embedding.model).toBe('nomic-embed-text');
    expect(config.embedding.baseUrl).toBe('http://127.0.0.1:11434');
    expect(config.embedding.dimensions).toBe(768);
  });

  it('embedding: falls back to local transformers only when provider is unset', () => {
    delete process.env.THOTH_EMBEDDING_PROVIDER;
    delete process.env.THOTH_EMBEDDING_MODEL;
    delete process.env.THOTH_EMBEDDING_BASE_URL;

    const config = getConfig() as any;

    expect(config.embedding.provider).toBe('transformers_local');
    expect(config.embedding.model).toBe('nomic-ai/nomic-embed-text-v1.5');
    expect(config.embedding.dimensions).toBe(768);
  });

  it('hyde: defaults to enabled local Transformers text generation', () => {
    const config = getConfig() as any;

    expect(config.hyde).toEqual({
      enabled: true,
      provider: 'transformers_local',
      model: 'onnx-community/Qwen2.5-Coder-0.5B-Instruct',
      baseUrl: null,
      timeoutMs: 4000,
    });
  });

  it('kg llm: defaults to disabled local Transformers enrichment for long conversations', () => {
    const config = getConfig() as any;

    expect(config.kgLlm).toEqual({
      enabled: false,
      provider: 'transformers_local',
      model: 'onnx-community/Qwen2.5-Coder-0.5B-Instruct',
      baseUrl: null,
      timeoutMs: 30000,
      minContentChars: 12000,
    });
  });

  it('kg llm: resolves provider and thresholds from env before config file and defaults', () => {
    process.env.THOTH_KG_LLM_ENABLED = 'true';
    process.env.THOTH_KG_LLM_PROVIDER = 'lmstudio';
    process.env.THOTH_KG_LLM_MODEL = 'loaded_model';
    process.env.THOTH_KG_LLM_BASE_URL = 'http://127.0.0.1:1234/v1/';
    process.env.THOTH_KG_LLM_TIMEOUT_MS = '11000';
    process.env.THOTH_KG_LLM_MIN_CONTENT_CHARS = '2500';

    const config = getConfig() as any;

    expect(config.kgLlm).toEqual({
      enabled: true,
      provider: 'lmstudio',
      model: 'loaded_model',
      baseUrl: 'http://127.0.0.1:1234/v1',
      timeoutMs: 11000,
      minContentChars: 2500,
    });
  });

  it('hyde: resolves provider from env before config file and defaults', () => {
    process.env.THOTH_HYDE_ENABLED = 'false';
    process.env.THOTH_HYDE_PROVIDER = 'lmstudio';
    process.env.THOTH_HYDE_MODEL = 'loaded_model';
    process.env.THOTH_HYDE_BASE_URL = 'http://127.0.0.1:1234/v1';
    process.env.THOTH_HYDE_TIMEOUT_MS = '9000';

    const config = getConfig() as any;

    expect(config.hyde).toEqual({
      enabled: false,
      provider: 'lmstudio',
      model: 'loaded_model',
      baseUrl: 'http://127.0.0.1:1234/v1',
      timeoutMs: 9000,
    });
  });

  it('config file: creates a complete editable default config when missing', () => {
    const config = getConfig() as any;
    const raw = readFileSync(join(config.dataDir, 'config.json'), 'utf8');
    const saved = JSON.parse(raw);
    const schema = JSON.parse(readFileSync(join(process.cwd(), 'config.schema.json'), 'utf8'));

    expect(Object.keys(saved)[0]).toBe('$schema');
    expect(saved.$schema).toBe(`https://unpkg.com/thoth-mem@${getVersion()}/config.schema.json`);
    expect(saved.version).toBe(1);
    expect(saved.embedding).toEqual({
      provider: 'transformers_local',
      model: 'nomic-ai/nomic-embed-text-v1.5',
      baseUrl: null,
      dimensions: 768,
    });
    expect(saved.hyde).toEqual(config.hyde);
    expect(saved.kgLlm).toEqual(config.kgLlm);
    expect(saved.graphFactsSource).toBe('kg');
    expect(saved.knowledgeGraph).toEqual(config.knowledgeGraph);
    expect(saved.communitySummaries).toEqual(config.communitySummaries);
    expect(saved.maintenance).toEqual(config.maintenance);
    expect(saved.retrievalDefaults).toEqual(config.retrievalDefaults);
    expect(saved.http).toEqual({ port: 7438, disabled: false });
    expect(schema).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'Thoth-Mem Config',
      type: 'object',
      properties: {
        embedding: {
          properties: {
            provider: { enum: ['transformers_local', 'ollama', 'lmstudio'] },
          },
        },
        kgLlm: {
          properties: {
            provider: { enum: ['transformers_local', 'ollama', 'lmstudio'] },
          },
        },
        graphFactsSource: {
          enum: ['legacy', 'kg'],
        },
        knowledgeGraph: {
          properties: {
            kgRelationAllowList: {
              items: {
                enum: expect.arrayContaining(['USES', 'DEPENDS_ON', 'HAS_TOPIC', 'MENTIONS', 'SUPERSEDES']),
              },
            },
            kgSupersedeEnabled: { type: 'boolean' },
            kgSupersedeContentPatterns: { type: 'boolean' },
            kgSupersedeConfidenceThreshold: { type: 'number', minimum: 0, maximum: 1 },
            kgSupersedeDeprioritizeWeight: { type: 'number', minimum: 0 },
            kgPruneEnabled: { type: 'boolean' },
            kgSupersededKeepN: { type: 'integer', minimum: 0 },
            kgPruneOrphanEntities: { type: 'boolean' },
          },
        },
        maintenance: {
          additionalProperties: false,
          properties: {
            defaultMode: { enum: ['dry-run', 'apply'] },
            automatic: { additionalProperties: false },
            readPath: { additionalProperties: false },
            decay: {
              additionalProperties: false,
              properties: {
                defaultState: { enum: ['active', 'attenuated', 'suppressed'] },
                scoreMultiplier: { type: 'number', minimum: 0, maximum: 1 },
              },
            },
          },
        },
        communitySummaries: {
          additionalProperties: false,
          properties: {
            algorithm: { enum: ['connected_components', 'louvain', 'leiden'] },
            staleBehavior: { enum: ['skip', 'include-degraded'] },
            readPath: { additionalProperties: false },
            enrichment: {
              additionalProperties: false,
              properties: {
                enabled: { type: 'boolean' },
                maxCostUsd: { type: 'number', minimum: 0 },
              },
            },
          },
        },
      },
    });
  });

  it('config file: backfills missing defaults while preserving user values', () => {
    writeFileSync(join(tmpDataDir!, 'config.json'), JSON.stringify({
      embedding: {
        provider: 'lmstudio',
        model: 'text-embedding-nomic-embed-text-v1.5@q8_0',
        baseUrl: 'http://169.254.83.107:1234',
        dimensions: 768,
      },
    }, null, 2));

    const config = getConfig() as any;
    const saved = JSON.parse(readFileSync(join(config.dataDir, 'config.json'), 'utf8'));

    expect(config.embedding.provider).toBe('lmstudio');
    expect(saved.embedding).toEqual({
      provider: 'lmstudio',
      model: 'text-embedding-nomic-embed-text-v1.5@q8_0',
      baseUrl: 'http://169.254.83.107:1234',
      dimensions: 768,
    });
    expect(saved.hyde.enabled).toBe(true);
    expect(saved.hyde.provider).toBe('transformers_local');
    expect(saved.kgLlm).toEqual({
      enabled: false,
      provider: 'transformers_local',
      model: 'onnx-community/Qwen2.5-Coder-0.5B-Instruct',
      baseUrl: null,
      timeoutMs: 30000,
      minContentChars: 12000,
    });
    expect(saved.maxContentLength).toBe(100_000);
    expect(saved.maxContextChars).toBe(8000);
    expect(saved.knowledgeGraph).toEqual(DEFAULT_KNOWLEDGE_GRAPH_CONFIG);
    expect(saved.communitySummaries).toEqual(DEFAULT_COMMUNITY_SUMMARIES_CONFIG);
    expect(saved.maintenance).toEqual(DEFAULT_MAINTENANCE_CONFIG);
  });

  it('config file: environment overrides do not rewrite the editable config file', () => {
    process.env.THOTH_EMBEDDING_PROVIDER = 'ollama';
    process.env.THOTH_EMBEDDING_MODEL = 'nomic-embed-text';
    process.env.THOTH_EMBEDDING_BASE_URL = 'http://127.0.0.1:11434';

    const config = getConfig() as any;
    const saved = JSON.parse(readFileSync(join(config.dataDir, 'config.json'), 'utf8'));

    expect(config.embedding.provider).toBe('ollama');
    expect(saved.embedding.provider).toBe('transformers_local');
  });

  it('embedding: exposes canonical config hash that is stable for same inputs and changes when provider changes', () => {
    process.env.THOTH_EMBEDDING_PROVIDER = 'ollama';
    process.env.THOTH_EMBEDDING_MODEL = 'nomic-embed-text';
    process.env.THOTH_EMBEDDING_BASE_URL = 'http://127.0.0.1:11434';

    const configA = getConfig() as any;
    const configB = getConfig() as any;

    process.env.THOTH_EMBEDDING_PROVIDER = 'lmstudio';
    const configC = getConfig() as any;

    expect(configA.embedding.configHash).toBe(configB.embedding.configHash);
    expect(configA.embedding.configHash).not.toBe(configC.embedding.configHash);
  });

  it('embedding: config hash does not change when only HyDE generation config changes', () => {
    process.env.THOTH_EMBEDDING_PROVIDER = 'lmstudio';
    process.env.THOTH_EMBEDDING_MODEL = 'nomic-ai/nomic-embed-text-v1.5';
    process.env.THOTH_EMBEDDING_BASE_URL = 'http://127.0.0.1:1234';

    const configA = getConfig() as any;

    process.env.THOTH_HYDE_MODEL = 'qwen2.5:7b-instruct';
    process.env.THOTH_HYDE_PROVIDER = 'ollama';
    process.env.THOTH_HYDE_BASE_URL = 'http://127.0.0.1:11434';
    const configB = getConfig() as any;

    expect(configA.embedding.configHash).toBe(configB.embedding.configHash);
  });

  it('embedding: config hash does not change when only KG LLM enrichment config changes', () => {
    process.env.THOTH_EMBEDDING_PROVIDER = 'lmstudio';
    process.env.THOTH_EMBEDDING_MODEL = 'nomic-ai/nomic-embed-text-v1.5';
    process.env.THOTH_EMBEDDING_BASE_URL = 'http://127.0.0.1:1234';

    const configA = getConfig() as any;

    process.env.THOTH_KG_LLM_ENABLED = 'true';
    process.env.THOTH_KG_LLM_PROVIDER = 'ollama';
    process.env.THOTH_KG_LLM_MODEL = 'qwen2.5:14b-instruct';
    process.env.THOTH_KG_LLM_MIN_CONTENT_CHARS = '2000';
    const configB = getConfig() as any;

    expect(configA.embedding.configHash).toBe(configB.embedding.configHash);
  });
});
