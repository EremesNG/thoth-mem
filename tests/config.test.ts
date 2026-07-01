import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  DEFAULT_KG_RELATION_ALLOW_LIST,
  DEFAULT_KNOWLEDGE_GRAPH_CONFIG,
  getConfig,
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
      timeoutMs: 8000,
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
      timeoutMs: 8000,
      minContentChars: 12000,
    });
    expect(saved.maxContentLength).toBe(100_000);
    expect(saved.maxContextChars).toBe(8000);
    expect(saved.knowledgeGraph).toEqual(DEFAULT_KNOWLEDGE_GRAPH_CONFIG);
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
