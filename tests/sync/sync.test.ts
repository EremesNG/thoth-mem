import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync, gzipSync } from 'node:zlib';
import { Store } from '../../src/store/index.js';
import { syncExport, syncImport } from '../../src/sync/index.js';
import type { ExportData } from '../../src/store/types.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'thoth-mem-sync-'));
}

function normalizeForRoundTrip(data: ExportData) {
  return {
    sessions: data.sessions.map((session) => ({
      id: session.id,
      project: session.project,
      directory: session.directory,
      started_at: session.started_at,
      ended_at: session.ended_at,
      summary: session.summary,
    })),
    observations: data.observations.map((observation) => ({
      sync_id: observation.sync_id,
      session_id: observation.session_id,
      type: observation.type,
      title: observation.title,
      content: observation.content,
      tool_name: observation.tool_name,
      project: observation.project,
      scope: observation.scope,
      topic_key: observation.topic_key,
      normalized_hash: observation.normalized_hash,
      revision_count: observation.revision_count,
      duplicate_count: observation.duplicate_count,
      last_seen_at: observation.last_seen_at,
      created_at: observation.created_at,
      updated_at: observation.updated_at,
      deleted_at: observation.deleted_at,
    })),
    prompts: data.prompts.map((prompt) => ({
      sync_id: prompt.sync_id,
      session_id: prompt.session_id,
      content: prompt.content,
      project: prompt.project,
      created_at: prompt.created_at,
    })),
  };
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

  it('syncExport creates a chunk file and manifest', () => {
    seedStore(store);
    const syncDir = createTempDir();
    tempDirs.push(syncDir);

    const result = syncExport(store, syncDir);

    expect(result.chunk_id).not.toBe('');
    expect(existsSync(join(syncDir, 'manifest.json'))).toBe(true);
    expect(existsSync(join(syncDir, 'chunks', result.filename))).toBe(true);

    const manifest = JSON.parse(readFileSync(join(syncDir, 'manifest.json'), 'utf-8')) as {
      chunks: Array<{ filename: string }>;
    };

    expect(manifest.chunks).toHaveLength(1);
    expect(manifest.chunks[0].filename).toBe(result.filename);
  });

  it('syncExport returns an empty result when there is no data to export', () => {
    const syncDir = createTempDir();
    tempDirs.push(syncDir);

    const result = syncExport(store, syncDir);

    expect(result).toEqual({
      chunk_id: '',
      filename: '',
      sessions: 0,
      observations: 0,
      prompts: 0,
    });
  });

  it('syncExport creates a gzipped chunk that can be decompressed', () => {
    seedStore(store);
    const syncDir = createTempDir();
    tempDirs.push(syncDir);

    const result = syncExport(store, syncDir);
    const compressed = readFileSync(join(syncDir, 'chunks', result.filename));
    const decompressed = gunzipSync(compressed).toString('utf-8');
    const exported = JSON.parse(decompressed) as ExportData;

    expect(exported.version).toBe(1);
    expect(exported.sessions).toHaveLength(1);
    expect(exported.observations).toHaveLength(1);
    expect(exported.prompts).toHaveLength(1);
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

  it('syncImport deduplicates repeated imports of the same chunks', () => {
    seedStore(store);
    const syncDir = createTempDir();
    tempDirs.push(syncDir);
    syncExport(store, syncDir);

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
        skipped: 2,
      });
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

      expect(normalizeForRoundTrip(targetStore.exportData())).toEqual(normalizeForRoundTrip(store.exportData()));
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
});
