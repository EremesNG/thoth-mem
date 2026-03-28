import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import type { Store } from '../store/index.js';
import type {
  ExportData,
  Observation,
  Session,
  SyncChunkV2,
  SyncMutation,
  SyncMutationEnvelopeV2,
  UserPrompt,
} from '../store/types.js';

// ── Types ──

export interface ChunkMeta {
  id: string;
  filename: string;
  created_at: string;
  project?: string;
  chunk_version?: 1 | 2;
  exported_count?: number;
  skipped_count?: number;
  from_mutation_id?: number;
  to_mutation_id?: number;
  sessions_count: number;
  observations_count: number;
  prompts_count: number;
}

export interface SyncManifest {
  version: number;
  last_export_at: string | null;
  last_export_mutation_id?: number;
  chunks: ChunkMeta[];
}

export interface SyncExportResult {
  chunk_id: string;
  filename: string;
  sessions: number;
  observations: number;
  prompts: number;
  exported: number;
  skipped: number;
  chunks: number;
  from_mutation_id: number | null;
  to_mutation_id: number | null;
  message?: string;
}

export interface SyncImportResult {
  chunks_processed: number;
  imported: number;
  skipped: number;
  failed: number;
  /**
   * @deprecated Legacy compatibility field for existing callers.
   */
  sessions_imported: number;
  /**
   * @deprecated Legacy compatibility field for existing callers.
   */
  observations_imported: number;
  /**
   * @deprecated Legacy compatibility field for existing callers.
   */
  prompts_imported: number;
}

// ── Constants ──

const MANIFEST_FILE = 'manifest.json';
const CHUNKS_DIR = 'chunks';

const NO_CHANGES_MESSAGE = 'No new changes to export';

// ── Internal helpers ──

function ensureSyncDir(syncDir: string): void {
  mkdirSync(join(syncDir, CHUNKS_DIR), { recursive: true });
}

function loadManifest(syncDir: string): SyncManifest {
  const manifestPath = join(syncDir, MANIFEST_FILE);
  if (!existsSync(manifestPath)) {
    return { version: 1, last_export_at: null, chunks: [] };
  }
  return JSON.parse(readFileSync(manifestPath, 'utf-8')) as SyncManifest;
}

function saveManifest(syncDir: string, manifest: SyncManifest): void {
  writeFileSync(
    join(syncDir, MANIFEST_FILE),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );
}

function sha256Hex(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function sha256HexBuffer(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

function deriveV1ChunkId(filename: string, payloadHash: string): string {
  const withoutExtensions = filename
    .replace(/\.json\.gz$/i, '')
    .replace(/\.json$/i, '')
    .trim();

  if (withoutExtensions.length > 0) {
    return `v1-${withoutExtensions}`;
  }

  return `v1-${payloadHash}`;
}

function isPayloadImported(store: Store, payloadHash: string): boolean {
  const row = store.getDb().prepare(
    "SELECT 1 as imported FROM sync_chunks WHERE payload_hash = ? AND status = 'applied' LIMIT 1"
  ).get(payloadHash) as { imported: number } | undefined;

  return row !== undefined;
}

function createSyncImportResult(): SyncImportResult {
  const result = {
    chunks_processed: 0,
    sessions_imported: 0,
    observations_imported: 0,
    prompts_imported: 0,
    skipped: 0,
  } as SyncImportResult;

  Object.defineProperties(result, {
    imported: {
      value: 0,
      writable: true,
      enumerable: false,
      configurable: true,
    },
    failed: {
      value: 0,
      writable: true,
      enumerable: false,
      configurable: true,
    },
  });

  return result;
}

function getEntityCounts(store: Store): { sessions: number; observations: number; prompts: number } {
  const db = store.getDb();

  const sessionsRow = db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number };
  const observationsRow = db.prepare('SELECT COUNT(*) as count FROM observations WHERE deleted_at IS NULL').get() as { count: number };
  const promptsRow = db.prepare('SELECT COUNT(*) as count FROM user_prompts').get() as { count: number };

  return {
    sessions: sessionsRow.count,
    observations: observationsRow.count,
    prompts: promptsRow.count,
  };
}

function createNoopExportResult(skipped: number = 0): SyncExportResult {
  return {
    chunk_id: '',
    filename: '',
    sessions: 0,
    observations: 0,
    prompts: 0,
    exported: 0,
    skipped,
    chunks: 0,
    from_mutation_id: null,
    to_mutation_id: null,
    message: NO_CHANGES_MESSAGE,
  };
}

function toRecord(value: Observation | Session | UserPrompt): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

function resolveMutationEnvelope(store: Store, mutation: SyncMutation, project?: string): SyncMutationEnvelopeV2 | null {
  const db = store.getDb();

  if (mutation.entity_type === 'observation') {
    const observation = db.prepare('SELECT * FROM observations WHERE id = ?').get(mutation.entity_id) as Observation | undefined;

    if (project && (!observation || observation.project !== project)) {
      return null;
    }

    if (mutation.operation === 'delete') {
      if (!mutation.sync_id) {
        return null;
      }

      return {
        operation: mutation.operation,
        entity_type: mutation.entity_type,
        entity_id: mutation.entity_id,
        sync_id: mutation.sync_id,
        data: null,
      };
    }

    if (!observation) {
      return null;
    }

    return {
      operation: mutation.operation,
      entity_type: mutation.entity_type,
      entity_id: mutation.entity_id,
      sync_id: mutation.sync_id,
      data: toRecord(observation),
    };
  }

  if (mutation.entity_type === 'prompt') {
    const prompt = db.prepare('SELECT * FROM user_prompts WHERE id = ?').get(mutation.entity_id) as UserPrompt | undefined;

    if (project && (!prompt || prompt.project !== project)) {
      return null;
    }

    if (mutation.operation === 'delete') {
      if (!mutation.sync_id) {
        return null;
      }

      return {
        operation: mutation.operation,
        entity_type: mutation.entity_type,
        entity_id: mutation.entity_id,
        sync_id: mutation.sync_id,
        data: null,
      };
    }

    if (!prompt) {
      return null;
    }

    return {
      operation: mutation.operation,
      entity_type: mutation.entity_type,
      entity_id: mutation.entity_id,
      sync_id: mutation.sync_id,
      data: toRecord(prompt),
    };
  }

  const sessionId = mutation.sync_id ?? String(mutation.entity_id);
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as Session | undefined;

  if (project && (!session || session.project !== project)) {
    return null;
  }

  if (mutation.operation === 'delete') {
    if (!sessionId) {
      return null;
    }

    return {
      operation: mutation.operation,
      entity_type: mutation.entity_type,
      entity_id: mutation.entity_id,
      sync_id: sessionId,
      data: null,
    };
  }

  if (!session) {
    return null;
  }

  return {
    operation: mutation.operation,
    entity_type: mutation.entity_type,
    entity_id: mutation.entity_id,
    sync_id: session.id,
    data: toRecord(session),
  };
}

function countEntitiesInMutations(mutations: SyncMutationEnvelopeV2[]): {
  sessions: number;
  observations: number;
  prompts: number;
} {
  let sessions = 0;
  let observations = 0;
  let prompts = 0;

  for (const mutation of mutations) {
    if (mutation.data === null) {
      continue;
    }

    if (mutation.entity_type === 'session') {
      sessions++;
      continue;
    }

    if (mutation.entity_type === 'observation') {
      observations++;
      continue;
    }

    prompts++;
  }

  return { sessions, observations, prompts };
}

function isSyncChunkV2(value: unknown): value is SyncChunkV2 {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const chunk = value as Record<string, unknown>;
  return chunk.version === 2
    && typeof chunk.chunk_id === 'string'
    && typeof chunk.from_mutation_id === 'number'
     && typeof chunk.to_mutation_id === 'number'
     && Array.isArray(chunk.mutations);
}

type ImportChunkFormat = 'v1' | 'v2' | 'unknown';

interface PreparedImportChunk {
  filename: string;
  payloadHash: string;
  parsed: unknown;
  format: ImportChunkFormat;
  versionValue: unknown;
  chunkVersion: number;
  chunkId: string;
  fromMutationId?: number;
  toMutationId?: number;
  order: number;
}

function detectImportChunkFormat(parsed: unknown): {
  format: ImportChunkFormat;
  versionValue: unknown;
  chunkVersion: number;
} {
  if (typeof parsed !== 'object' || parsed === null) {
    return {
      format: 'v1',
      versionValue: undefined,
      chunkVersion: 1,
    };
  }

  const record = parsed as Record<string, unknown>;
  const hasVersion = Object.prototype.hasOwnProperty.call(record, 'version');

  if (!hasVersion) {
    return {
      format: 'v1',
      versionValue: undefined,
      chunkVersion: 1,
    };
  }

  const versionValue = record.version;

  if (versionValue === 1) {
    return {
      format: 'v1',
      versionValue,
      chunkVersion: 1,
    };
  }

  if (versionValue === 2) {
    return {
      format: 'v2',
      versionValue,
      chunkVersion: 2,
    };
  }

  return {
    format: 'unknown',
    versionValue,
    chunkVersion: typeof versionValue === 'number' && Number.isFinite(versionValue)
      ? versionValue
      : 1,
  };
}

function estimateChunkSkipCount(parsed: unknown): number {
  if (isSyncChunkV2(parsed)) {
    return parsed.mutations.length;
  }

  if (typeof parsed === 'object' && parsed !== null) {
    const legacy = parsed as Partial<ExportData>;
    if (Array.isArray(legacy.sessions) && Array.isArray(legacy.observations) && Array.isArray(legacy.prompts)) {
      return legacy.sessions.length + legacy.observations.length + legacy.prompts.length;
    }
  }

  return 1;
}

function getImportChunkPriority(format: ImportChunkFormat): number {
  if (format === 'v1') {
    return 0;
  }

  if (format === 'v2') {
    return 1;
  }

  return 2;
}

// ── Public API ──

/**
 * Export memory data to an append-only compressed chunk.
 *
 * v2 exports are incremental: each chunk includes only mutations newer than
 * the last successful export watermark. If no new mutations exist, no chunk
 * is emitted.
 */
export function syncExport(store: Store, syncDir: string, project?: string): SyncExportResult {
  ensureSyncDir(syncDir);
  const manifest = loadManifest(syncDir);

  const watermark = store.getExportWatermark();
  const mutations = store.getMutationsSince(watermark);

  if (mutations.length === 0) {
    return createNoopExportResult();
  }

  const envelopes: SyncMutationEnvelopeV2[] = [];
  const mutationIds: number[] = [];
  let skipped = 0;

  for (const mutation of mutations) {
    const envelope = resolveMutationEnvelope(store, mutation, project);

    if (!envelope) {
      skipped++;
      continue;
    }

    envelopes.push(envelope);
    mutationIds.push(mutation.id);
  }

  if (envelopes.length === 0) {
    return createNoopExportResult(skipped);
  }

  const fromMutationId = mutationIds[0];
  const toMutationId = mutationIds[mutationIds.length - 1];
  const createdAt = new Date().toISOString();

  const payloadForHash = {
    version: 2 as const,
    from_mutation_id: fromMutationId,
    to_mutation_id: toMutationId,
    created_at: createdAt,
    mutations: envelopes,
  };

  const payloadHash = sha256Hex(JSON.stringify(payloadForHash));
  const chunkId = `chunk-${payloadHash}`;
  const filename = `${chunkId}.json.gz`;

  const chunk: SyncChunkV2 = {
    version: 2,
    chunk_id: chunkId,
    from_mutation_id: fromMutationId,
    to_mutation_id: toMutationId,
    created_at: createdAt,
    mutations: envelopes,
  };

  const json = JSON.stringify(chunk);
  const compressed = gzipSync(Buffer.from(json, 'utf-8'));
  writeFileSync(join(syncDir, CHUNKS_DIR, filename), compressed);

  const counts = countEntitiesInMutations(envelopes);
  const now = new Date().toISOString();

  const chunkMeta: ChunkMeta = {
    id: chunkId,
    filename,
    created_at: now,
    project,
    chunk_version: 2,
    exported_count: envelopes.length,
    skipped_count: skipped,
    from_mutation_id: fromMutationId,
    to_mutation_id: toMutationId,
    sessions_count: counts.sessions,
    observations_count: counts.observations,
    prompts_count: counts.prompts,
  };

  manifest.version = Math.max(manifest.version, 2);
  manifest.chunks.push(chunkMeta);
  manifest.last_export_at = now;
  manifest.last_export_mutation_id = toMutationId;
  saveManifest(syncDir, manifest);

  store.recordSyncChunk({
    chunk_id: chunkId,
    payload_hash: payloadHash,
    status: 'applied',
    from_mutation_id: fromMutationId,
    to_mutation_id: toMutationId,
    chunk_version: 2,
  });

  return {
    chunk_id: chunkId,
    filename,
    sessions: counts.sessions,
    observations: counts.observations,
    prompts: counts.prompts,
    exported: envelopes.length,
    skipped,
    chunks: 1,
    from_mutation_id: fromMutationId,
    to_mutation_id: toMutationId,
  };
}

/**
 * Import memory data from all compressed chunks in a sync directory.
 * Reads the manifest for ordered chunk processing, or scans the chunks
 * directory if no manifest exists. Deduplication is handled by sync_id
 * in the store's importData method — safe to re-import the same chunks.
 */
export function syncImport(store: Store, syncDir: string): SyncImportResult {
  const emptyResult = createSyncImportResult();

  if (!existsSync(syncDir)) {
    return emptyResult;
  }

  const manifest = loadManifest(syncDir);
  const chunksDir = join(syncDir, CHUNKS_DIR);

  if (!existsSync(chunksDir)) {
    return emptyResult;
  }

  // Use manifest order when available; fall back to sorted directory scan
  const chunkFiles = manifest.chunks.length > 0
    ? manifest.chunks.map(c => c.filename)
    : readdirSync(chunksDir).filter(f => f.endsWith('.json.gz')).sort();

  const totalResult = createSyncImportResult();

  const preparedChunks: PreparedImportChunk[] = [];

  for (const [order, filename] of chunkFiles.entries()) {
    const chunkPath = join(chunksDir, filename);
    if (!existsSync(chunkPath)) {
      continue;
    }

    totalResult.chunks_processed++;

    const compressed = readFileSync(chunkPath);
    const payloadHash = sha256HexBuffer(compressed);

    let chunkVersion = 1;
    let chunkId = deriveV1ChunkId(filename, payloadHash);
    let fromMutationId: number | undefined;
    let toMutationId: number | undefined;

    try {
      let json: string;

      try {
        json = gunzipSync(compressed).toString('utf-8');
      } catch {
        json = compressed.toString('utf-8');
      }

      const parsed = JSON.parse(json) as unknown;
      const formatInfo = detectImportChunkFormat(parsed);

      chunkVersion = formatInfo.chunkVersion;

      if (typeof parsed === 'object' && parsed !== null) {
        const maybeChunk = parsed as Record<string, unknown>;

        if (typeof maybeChunk.chunk_id === 'string' && maybeChunk.chunk_id.length > 0) {
          chunkId = maybeChunk.chunk_id;
        }

        if (typeof maybeChunk.from_mutation_id === 'number') {
          fromMutationId = maybeChunk.from_mutation_id;
        }

        if (typeof maybeChunk.to_mutation_id === 'number') {
          toMutationId = maybeChunk.to_mutation_id;
        }
      }

      preparedChunks.push({
        filename,
        payloadHash,
        parsed,
        format: formatInfo.format,
        versionValue: formatInfo.versionValue,
        chunkVersion,
        chunkId,
        fromMutationId,
        toMutationId,
        order,
      });
    } catch {
      totalResult.failed++;
      store.recordSyncChunk({
        chunk_id: chunkId,
        payload_hash: payloadHash,
        status: 'failed',
        from_mutation_id: fromMutationId,
        to_mutation_id: toMutationId,
        chunk_version: chunkVersion,
      });
    }
  }

  const orderedChunks = preparedChunks
    .slice()
    .sort((a, b) => {
      const byFormat = getImportChunkPriority(a.format) - getImportChunkPriority(b.format);
      if (byFormat !== 0) {
        return byFormat;
      }

      return a.order - b.order;
    });

  for (const chunk of orderedChunks) {
    const {
      filename,
      payloadHash,
      parsed,
      format,
      versionValue,
      chunkVersion,
      chunkId,
      fromMutationId,
      toMutationId,
    } = chunk;

    try {
      if (store.isChunkImported(chunkId) || isPayloadImported(store, payloadHash)) {
        totalResult.skipped += estimateChunkSkipCount(parsed);
        store.recordSyncChunk({
          chunk_id: chunkId,
          payload_hash: payloadHash,
          status: 'skipped',
          from_mutation_id: fromMutationId,
          to_mutation_id: toMutationId,
          chunk_version: chunkVersion,
        });
        continue;
      }

      if (format === 'unknown') {
        process.stderr.write(
          `[thoth-sync] Skipping chunk "${filename}" with unknown version "${String(versionValue)}"\n`
        );
        totalResult.skipped++;
        store.recordSyncChunk({
          chunk_id: chunkId,
          payload_hash: payloadHash,
          status: 'skipped',
          from_mutation_id: fromMutationId,
          to_mutation_id: toMutationId,
          chunk_version: chunkVersion,
        });
        continue;
      }

      if (format === 'v2') {
        const before = getEntityCounts(store);
        const result = store.applyV2Chunk(parsed as SyncChunkV2);
        const after = getEntityCounts(store);

        totalResult.sessions_imported += Math.max(0, after.sessions - before.sessions);
        totalResult.observations_imported += Math.max(0, after.observations - before.observations);
        totalResult.prompts_imported += Math.max(0, after.prompts - before.prompts);
        totalResult.skipped += result.skipped;
      } else {
        const data = parsed as ExportData;
        const result = store.importData(data);

        totalResult.sessions_imported += result.sessions_imported;
        totalResult.observations_imported += result.observations_imported;
        totalResult.prompts_imported += result.prompts_imported;
        totalResult.skipped += result.skipped;
      }

      totalResult.imported++;

      store.recordSyncChunk({
        chunk_id: chunkId,
        payload_hash: payloadHash,
        status: 'applied',
        from_mutation_id: fromMutationId,
        to_mutation_id: toMutationId,
        chunk_version: chunkVersion,
      });
    } catch {
      totalResult.failed++;
      store.recordSyncChunk({
        chunk_id: chunkId,
        payload_hash: payloadHash,
        status: 'failed',
        from_mutation_id: fromMutationId,
        to_mutation_id: toMutationId,
        chunk_version: chunkVersion,
      });
    }
  }

  return totalResult;
}
