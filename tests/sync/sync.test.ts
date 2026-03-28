import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { Store } from '../../src/store/index.js';
import { syncExport, syncImport } from '../../src/sync/index.js';
import type { ExportData, SyncChunkV2 } from '../../src/store/types.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'thoth-mem-sync-'));
}

function seedStore(store: Store): void {
  store.startSession('session-1', 'project-a', '/workspace/project-a');
  store.saveObservation({ session_id: 'session-1', title: 'Observation A', content: 'Content A', project: 'project-a' });
  store.savePrompt('session-1', 'Prompt A', 'project-a');
}

function writeChunk(syncDir: string, filename: string, data: ExportData): void {
  mkdirSync(join(syncDir, 'chunks'), { recursive: true });
  writeFileSync(join(syncDir, 'chunks', filename), gzipSync(Buffer.from(JSON.stringify(data), 'utf-8')));
}

function writeV2Chunk(syncDir: string, filename: string, chunk: SyncChunkV2): void {
  mkdirSync(join(syncDir, 'chunks'), { recursive: true });
  writeFileSync(join(syncDir, 'chunks', filename), gzipSync(Buffer.from(JSON.stringify(chunk), 'utf-8')));
}

function createLegacyObservationChunk(input: {
  exported_at: string;
  session_id: string;
  session_started_at: string;
  observation_id: number;
  observation_sync_id: string;
  title: string;
  content: string;
  project?: string;
}): ExportData {
  const project = input.project ?? 'project-a';

  return {
    version: 1,
    exported_at: input.exported_at,
    sessions: [{
      id: input.session_id,
      project,
      directory: null,
      started_at: input.session_started_at,
      ended_at: null,
      summary: null,
    }],
    observations: [{
      id: input.observation_id,
      sync_id: input.observation_sync_id,
      session_id: input.session_id,
      type: 'manual',
      title: input.title,
      content: input.content,
      tool_name: null,
      project,
      scope: 'project',
      topic_key: null,
      normalized_hash: null,
      revision_count: 1,
      duplicate_count: 1,
      last_seen_at: null,
      created_at: input.session_started_at,
      updated_at: input.session_started_at,
      deleted_at: null,
    }],
    prompts: [],
  };
}

function sha256Hex(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

describe('sync export/import', () => {
  let store: Store;
  let tempDirs: string[];

  beforeEach(() => {
    store = new Store(':memory:');
    tempDirs = [];
  });

  afterEach(() => {
    store.close();
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('syncExport creates a v2 chunk file and manifest', () => {
    seedStore(store);
    const syncDir = createTempDir();
    tempDirs.push(syncDir);

    const result = syncExport(store, syncDir);

    expect(result.chunk_id).not.toBe('');
    expect(result.chunks).toBe(1);
    expect(result.exported).toBe(3);
    expect(result.from_mutation_id).toBeTypeOf('number');
    expect(result.to_mutation_id).toBeTypeOf('number');
    expect(result.observations).toBe(1);
    expect(result.prompts).toBe(1);
    expect(existsSync(join(syncDir, 'manifest.json'))).toBe(true);
    expect(existsSync(join(syncDir, 'chunks', result.filename))).toBe(true);

    const manifest = JSON.parse(readFileSync(join(syncDir, 'manifest.json'), 'utf-8')) as {
      version: number;
      last_export_mutation_id?: number;
      chunks: Array<{
        filename: string;
        chunk_version?: number;
        from_mutation_id?: number;
        to_mutation_id?: number;
      }>;
    };

    expect(manifest.version).toBe(2);
    expect(manifest.last_export_mutation_id).toBe(result.to_mutation_id);
    expect(manifest.chunks).toHaveLength(1);
    expect(manifest.chunks[0].filename).toBe(result.filename);
    expect(manifest.chunks[0].chunk_version).toBe(2);
    expect(manifest.chunks[0].from_mutation_id).toBe(result.from_mutation_id);
    expect(manifest.chunks[0].to_mutation_id).toBe(result.to_mutation_id);
  });

  it('syncExport returns a no-op summary when there are no new mutations', () => {
    seedStore(store);
    const syncDir = createTempDir();
    tempDirs.push(syncDir);

    const first = syncExport(store, syncDir);
    expect(first.chunk_id).not.toBe('');

    const result = syncExport(store, syncDir);

    expect(result).toEqual({
      chunk_id: '',
      filename: '',
      sessions: 0,
      observations: 0,
      prompts: 0,
      exported: 0,
      skipped: 0,
      chunks: 0,
      from_mutation_id: null,
      to_mutation_id: null,
      message: 'No new changes to export',
    });

    const manifest = JSON.parse(readFileSync(join(syncDir, 'manifest.json'), 'utf-8')) as {
      chunks: Array<{ filename: string }>;
    };
    expect(manifest.chunks).toHaveLength(1);
  });

  it('syncExport exports only new mutation deltas after a previous export', () => {
    seedStore(store);
    const syncDir = createTempDir();
    tempDirs.push(syncDir);

    const first = syncExport(store, syncDir);
    const created = store.saveObservation({
      session_id: 'session-1',
      title: 'Observation delta',
      content: 'Delta content',
      project: 'project-a',
    });

    const second = syncExport(store, syncDir);

    expect(second.exported).toBe(1);
    expect(second.sessions).toBe(0);
    expect(second.observations).toBe(1);
    expect(second.prompts).toBe(0);
    expect(second.from_mutation_id).toBeTypeOf('number');
    expect(second.to_mutation_id).toBeTypeOf('number');
    expect((second.from_mutation_id as number) > (first.to_mutation_id as number)).toBe(true);

    const compressed = readFileSync(join(syncDir, 'chunks', second.filename));
    const chunk = JSON.parse(gunzipSync(compressed).toString('utf-8')) as SyncChunkV2;

    expect(chunk.mutations).toHaveLength(1);
    expect(chunk.mutations[0]).toMatchObject({
      operation: 'create',
      entity_type: 'observation',
      sync_id: created.observation.sync_id,
    });
  });

  it('syncExport creates a gzipped v2 chunk that can be decompressed', () => {
    seedStore(store);
    const syncDir = createTempDir();
    tempDirs.push(syncDir);

    const result = syncExport(store, syncDir);
    const compressed = readFileSync(join(syncDir, 'chunks', result.filename));
    const decompressed = gunzipSync(compressed).toString('utf-8');
    const exported = JSON.parse(decompressed) as SyncChunkV2;

    expect(exported.version).toBe(2);
    expect(exported.chunk_id).toBe(result.chunk_id);
    expect(exported.from_mutation_id).toBe(result.from_mutation_id);
    expect(exported.to_mutation_id).toBe(result.to_mutation_id);
    expect(exported.mutations).toHaveLength(3);
    expect(exported.mutations.some((mutation) => mutation.entity_type === 'session' && mutation.operation === 'create')).toBe(true);
    expect(exported.mutations.some((mutation) => mutation.entity_type === 'observation' && mutation.operation === 'create')).toBe(true);
    expect(exported.mutations.some((mutation) => mutation.entity_type === 'prompt' && mutation.operation === 'create')).toBe(true);
  });

  it('syncExport uses deterministic v2 chunk metadata and envelope shape', () => {
    seedStore(store);
    const syncDir = createTempDir();
    tempDirs.push(syncDir);

    const result = syncExport(store, syncDir);
    const compressed = readFileSync(join(syncDir, 'chunks', result.filename));
    const chunk = JSON.parse(gunzipSync(compressed).toString('utf-8')) as SyncChunkV2;

    const expectedPayloadHash = sha256Hex(JSON.stringify({
      version: 2,
      from_mutation_id: chunk.from_mutation_id,
      to_mutation_id: chunk.to_mutation_id,
      created_at: chunk.created_at,
      mutations: chunk.mutations,
    }));

    expect(chunk.chunk_id).toBe(`chunk-${expectedPayloadHash}`);
    expect(result.filename).toBe(`${result.chunk_id}.json.gz`);
    expect(Date.parse(chunk.created_at)).not.toBeNaN();

    for (const mutation of chunk.mutations) {
      expect(mutation).toMatchObject({
        operation: expect.any(String),
        entity_type: expect.any(String),
        entity_id: expect.any(Number),
        sync_id: expect.any(String),
      });

      expect(Object.prototype.hasOwnProperty.call(mutation, 'data')).toBe(true);
    }
  });

  it('syncExport emits delete mutations as tombstone envelopes with data null', () => {
    store.startSession('session-delete', 'project-a', '/workspace/project-a');
    const saved = store.saveObservation({
      session_id: 'session-delete',
      title: 'To delete',
      content: 'Soon removed',
      project: 'project-a',
    });
    store.deleteObservation(saved.observation.id);

    const syncDir = createTempDir();
    tempDirs.push(syncDir);

    const result = syncExport(store, syncDir);
    const compressed = readFileSync(join(syncDir, 'chunks', result.filename));
    const chunk = JSON.parse(gunzipSync(compressed).toString('utf-8')) as SyncChunkV2;

    const tombstones = chunk.mutations.filter((mutation) => mutation.operation === 'delete');
    expect(tombstones.length).toBeGreaterThan(0);
    expect(tombstones.every((mutation) => mutation.data === null)).toBe(true);
  });

  it('syncExport appends to manifest while preserving existing entries', () => {
    seedStore(store);
    const syncDir = createTempDir();
    tempDirs.push(syncDir);

    const first = syncExport(store, syncDir);

    store.saveObservation({
      session_id: 'session-1',
      title: 'Observation B',
      content: 'Content B',
      project: 'project-a',
    });

    const second = syncExport(store, syncDir);

    const manifest = JSON.parse(readFileSync(join(syncDir, 'manifest.json'), 'utf-8')) as {
      version: number;
      chunks: Array<{ filename: string }>;
    };

    expect(manifest.version).toBe(2);
    expect(manifest.chunks).toHaveLength(2);
    expect(manifest.chunks.map((chunk) => chunk.filename)).toEqual([first.filename, second.filename]);
  });

  it('syncImport reads chunk files and imports their data', () => {
    seedStore(store);
    const syncDir = createTempDir();
    tempDirs.push(syncDir);
    syncExport(store, syncDir);

    const targetStore = new Store(':memory:');

    try {
      const result = syncImport(targetStore, syncDir);

      expect(result).toEqual({
        chunks_processed: 1,
        sessions_imported: 1,
        observations_imported: 1,
        prompts_imported: 1,
        skipped: 0,
      });
      expect(targetStore.exportData().observations).toHaveLength(1);
      expect(targetStore.exportData().prompts).toHaveLength(1);
    } finally {
      targetStore.close();
    }
  });

  it('syncImport deduplicates repeated imports by chunk id', () => {
    seedStore(store);
    const syncDir = createTempDir();
    tempDirs.push(syncDir);
    const exported = syncExport(store, syncDir);

    const targetStore = new Store(':memory:');

    try {
      const firstImport = syncImport(targetStore, syncDir);
      const secondImport = syncImport(targetStore, syncDir);

      expect(firstImport).toEqual({
        chunks_processed: 1,
        sessions_imported: 1,
        observations_imported: 1,
        prompts_imported: 1,
        skipped: 0,
      });
      expect(secondImport).toEqual({
        chunks_processed: 1,
        sessions_imported: 0,
        observations_imported: 0,
        prompts_imported: 0,
        skipped: 3,
      });

      const chunkRecords = targetStore.getSyncChunks();
      expect(chunkRecords).toHaveLength(1);
      expect(chunkRecords[0].chunk_id).toBe(exported.chunk_id);
    } finally {
      targetStore.close();
    }
  });

  it('syncImport deduplicates equivalent payload by hash even with different filenames', () => {
    const syncDir = createTempDir();
    tempDirs.push(syncDir);

    const legacy = createLegacyObservationChunk({
      exported_at: '2026-03-24T10:00:00.000Z',
      session_id: 'session-hash',
      session_started_at: '2026-03-24 10:00:00',
      observation_id: 100,
      observation_sync_id: 'hash-dedupe-observation',
      title: 'Hash dedupe title',
      content: 'Hash dedupe content',
    });

    writeChunk(syncDir, 'a-original.json.gz', legacy);
    const samePayload = readFileSync(join(syncDir, 'chunks', 'a-original.json.gz'));
    writeFileSync(join(syncDir, 'chunks', 'b-renamed.json.gz'), samePayload);

    const targetStore = new Store(':memory:');

    try {
      const result = syncImport(targetStore, syncDir);

      expect(result).toEqual({
        chunks_processed: 2,
        sessions_imported: 1,
        observations_imported: 1,
        prompts_imported: 0,
        skipped: 2,
      });

      const chunkRecords = targetStore.getSyncChunks();
      expect(chunkRecords).toHaveLength(2);
      expect(new Set(chunkRecords.map((chunk) => chunk.payload_hash)).size).toBe(1);
      expect(chunkRecords.filter((chunk) => chunk.status === 'applied')).toHaveLength(1);
      expect(chunkRecords.filter((chunk) => chunk.status === 'skipped')).toHaveLength(1);
    } finally {
      targetStore.close();
    }
  });

  it('syncImport returns an empty result when the sync directory has no chunks', () => {
    const syncDir = createTempDir();
    tempDirs.push(syncDir);

    const result = syncImport(store, syncDir);

    expect(result).toEqual({
      chunks_processed: 0,
      sessions_imported: 0,
      observations_imported: 0,
      prompts_imported: 0,
      skipped: 0,
    });
  });

  it('round-trips data through a sync directory into a fresh store', () => {
    seedStore(store);
    const syncDir = createTempDir();
    tempDirs.push(syncDir);
    syncExport(store, syncDir);

    const targetStore = new Store(':memory:');

    try {
      syncImport(targetStore, syncDir);

      const source = store.exportData();
      const target = targetStore.exportData();

      expect(target.sessions.some((session) => session.id === 'session-1')).toBe(true);
      expect(target.observations.map((observation) => ({
        sync_id: observation.sync_id,
        session_id: observation.session_id,
        type: observation.type,
        title: observation.title,
        content: observation.content,
        project: observation.project,
        scope: observation.scope,
      }))).toEqual(source.observations.map((observation) => ({
        sync_id: observation.sync_id,
        session_id: observation.session_id,
        type: observation.type,
        title: observation.title,
        content: observation.content,
        project: observation.project,
        scope: observation.scope,
      })));
      expect(target.prompts.map((prompt) => ({
        sync_id: prompt.sync_id,
        session_id: prompt.session_id,
        content: prompt.content,
        project: prompt.project,
      }))).toEqual(source.prompts.map((prompt) => ({
        sync_id: prompt.sync_id,
        session_id: prompt.session_id,
        content: prompt.content,
        project: prompt.project,
      })));
    } finally {
      targetStore.close();
    }
  });

  it('syncImport converges observation deletes through v2 tombstones', () => {
    store.startSession('session-delete-import', 'project-a', '/workspace/project-a');
    store.saveObservation({
      session_id: 'session-delete-import',
      title: 'Delete me remotely',
      content: 'This should become a tombstone',
      project: 'project-a',
    });
    const local = store.exportData();
    const created = local.observations.find((observation) => observation.title === 'Delete me remotely');
    expect(created).toBeDefined();
    store.deleteObservation(created!.id);

    const syncDir = createTempDir();
    tempDirs.push(syncDir);
    syncExport(store, syncDir);

    const targetStore = new Store(':memory:');

    try {
      syncImport(targetStore, syncDir);

      expect(targetStore.exportData().observations).toHaveLength(0);
      const deletedRow = targetStore.getDb().prepare(
        'SELECT deleted_at FROM observations WHERE sync_id = ? LIMIT 1'
      ).get(created!.sync_id) as { deleted_at: string | null } | undefined;

      expect(deletedRow).toBeDefined();
      expect(deletedRow?.deleted_at).not.toBeNull();
    } finally {
      targetStore.close();
    }
  });

  it('syncImport keeps tombstone replay idempotent', () => {
    store.startSession('session-delete-replay', 'project-a', '/workspace/project-a');
    store.saveObservation({
      session_id: 'session-delete-replay',
      title: 'Delete me twice',
      content: 'Replay-safe delete',
      project: 'project-a',
    });
    const local = store.exportData();
    const created = local.observations.find((observation) => observation.title === 'Delete me twice');
    expect(created).toBeDefined();
    store.deleteObservation(created!.id);

    const syncDir = createTempDir();
    tempDirs.push(syncDir);
    syncExport(store, syncDir);

    const targetStore = new Store(':memory:');

    try {
      const firstImport = syncImport(targetStore, syncDir);
      const secondImport = syncImport(targetStore, syncDir);

      expect(firstImport.chunks_processed).toBe(1);
      expect(secondImport).toEqual({
        chunks_processed: 1,
        sessions_imported: 0,
        observations_imported: 0,
        prompts_imported: 0,
        skipped: 3,
      });

      const deletedRow = targetStore.getDb().prepare(
        'SELECT deleted_at FROM observations WHERE sync_id = ? LIMIT 1'
      ).get(created!.sync_id) as { deleted_at: string | null } | undefined;

      expect(deletedRow).toBeDefined();
      expect(deletedRow?.deleted_at).not.toBeNull();
      expect(targetStore.exportData().observations).toHaveLength(0);
    } finally {
      targetStore.close();
    }
  });

  it('imports multiple chunks in manifest order', () => {
    const syncDir = createTempDir();
    tempDirs.push(syncDir);

    const firstChunk: ExportData = {
      version: 1,
      exported_at: '2026-03-23T10:00:00.000Z',
      sessions: [{
        id: 'session-1',
        project: 'project-a',
        directory: null,
        started_at: '2026-03-23 10:00:00',
        ended_at: null,
        summary: null,
      }],
      observations: [{
        id: 1,
        sync_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        session_id: 'session-1',
        type: 'manual',
        title: 'First from manifest',
        content: 'First content',
        tool_name: null,
        project: 'project-a',
        scope: 'project',
        topic_key: null,
        normalized_hash: null,
        revision_count: 1,
        duplicate_count: 1,
        last_seen_at: null,
        created_at: '2026-03-23 10:00:00',
        updated_at: '2026-03-23 10:00:00',
        deleted_at: null,
      }],
      prompts: [],
    };
    const secondChunk: ExportData = {
      version: 1,
      exported_at: '2026-03-23T10:10:00.000Z',
      sessions: [{
        id: 'session-2',
        project: 'project-a',
        directory: null,
        started_at: '2026-03-23 10:10:00',
        ended_at: null,
        summary: null,
      }],
      observations: [{
        id: 2,
        sync_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        session_id: 'session-2',
        type: 'manual',
        title: 'Second from manifest',
        content: 'Second content',
        tool_name: null,
        project: 'project-a',
        scope: 'project',
        topic_key: null,
        normalized_hash: null,
        revision_count: 1,
        duplicate_count: 1,
        last_seen_at: null,
        created_at: '2026-03-23 10:10:00',
        updated_at: '2026-03-23 10:10:00',
        deleted_at: null,
      }],
      prompts: [],
    };

    writeChunk(syncDir, 'z-first.json.gz', firstChunk);
    writeChunk(syncDir, 'a-second.json.gz', secondChunk);
    writeFileSync(join(syncDir, 'manifest.json'), JSON.stringify({
      version: 1,
      last_export_at: '2026-03-23T10:10:00.000Z',
      chunks: [
        {
          id: 'chunk-1',
          filename: 'z-first.json.gz',
          created_at: '2026-03-23T10:00:00.000Z',
          project: 'project-a',
          sessions_count: 1,
          observations_count: 1,
          prompts_count: 0,
        },
        {
          id: 'chunk-2',
          filename: 'a-second.json.gz',
          created_at: '2026-03-23T10:10:00.000Z',
          project: 'project-a',
          sessions_count: 1,
          observations_count: 1,
          prompts_count: 0,
        },
      ],
    }, null, 2), 'utf-8');

    const targetStore = new Store(':memory:');

    try {
      const result = syncImport(targetStore, syncDir);

      expect(result.chunks_processed).toBe(2);
      expect(targetStore.exportData().observations.map((observation) => observation.title)).toEqual([
        'First from manifest',
        'Second from manifest',
      ]);
    } finally {
      targetStore.close();
    }
  });

  it('syncImport processes mixed v1 and v2 chunks in a single run', () => {
    const syncDir = createTempDir();
    tempDirs.push(syncDir);

    const sharedSyncId = 'mixed-v1-v2-observation';

    const legacyChunk = createLegacyObservationChunk({
      exported_at: '2026-03-25T09:00:00.000Z',
      session_id: 'session-mixed',
      session_started_at: '2026-03-25 09:00:00',
      observation_id: 501,
      observation_sync_id: sharedSyncId,
      title: 'Legacy title',
      content: 'Legacy content',
    });

    const v2Chunk: SyncChunkV2 = {
      version: 2,
      chunk_id: 'chunk-mixed-v2',
      from_mutation_id: 20,
      to_mutation_id: 20,
      created_at: '2026-03-25T09:05:00.000Z',
      mutations: [{
        operation: 'update',
        entity_type: 'observation',
        entity_id: 501,
        sync_id: sharedSyncId,
        data: {
          title: 'Updated by v2',
        },
      }],
    };

    writeV2Chunk(syncDir, 'a-v2-update.json.gz', v2Chunk);
    writeChunk(syncDir, 'b-v1-base.json.gz', legacyChunk);
    writeFileSync(join(syncDir, 'manifest.json'), JSON.stringify({
      version: 2,
      last_export_at: '2026-03-25T09:05:00.000Z',
      chunks: [
        {
          id: 'chunk-v2-first-in-manifest',
          filename: 'a-v2-update.json.gz',
          created_at: '2026-03-25T09:05:00.000Z',
          chunk_version: 2,
          sessions_count: 0,
          observations_count: 0,
          prompts_count: 0,
        },
        {
          id: 'chunk-v1-second-in-manifest',
          filename: 'b-v1-base.json.gz',
          created_at: '2026-03-25T09:00:00.000Z',
          chunk_version: 1,
          sessions_count: 1,
          observations_count: 1,
          prompts_count: 0,
        },
      ],
    }, null, 2), 'utf-8');

    const targetStore = new Store(':memory:');

    try {
      const result = syncImport(targetStore, syncDir);

      expect(result.chunks_processed).toBe(2);
      const observations = targetStore.exportData().observations;
      expect(observations).toHaveLength(1);
      expect(observations[0].title).toBe('Updated by v2');
    } finally {
      targetStore.close();
    }
  });

  it('syncImport falls back to alphabetical chunk filename order without manifest', () => {
    const syncDir = createTempDir();
    tempDirs.push(syncDir);

    const sharedSyncId = 'alphabetic-fallback-observation';
    const firstAlphabetic = createLegacyObservationChunk({
      exported_at: '2026-03-26T10:00:00.000Z',
      session_id: 'session-alpha',
      session_started_at: '2026-03-26 10:00:00',
      observation_id: 701,
      observation_sync_id: sharedSyncId,
      title: 'Alphabetic first',
      content: 'First content',
    });
    const secondAlphabetic = createLegacyObservationChunk({
      exported_at: '2026-03-26T10:05:00.000Z',
      session_id: 'session-alpha',
      session_started_at: '2026-03-26 10:00:00',
      observation_id: 702,
      observation_sync_id: sharedSyncId,
      title: 'Alphabetic second',
      content: 'Second content',
    });

    writeChunk(syncDir, 'z-second.json.gz', secondAlphabetic);
    writeChunk(syncDir, 'a-first.json.gz', firstAlphabetic);

    const targetStore = new Store(':memory:');

    try {
      const result = syncImport(targetStore, syncDir);

      expect(result.chunks_processed).toBe(2);
      const observations = targetStore.exportData().observations;
      expect(observations).toHaveLength(1);
      expect(observations[0].title).toBe('Alphabetic first');
    } finally {
      targetStore.close();
    }
  });
});
