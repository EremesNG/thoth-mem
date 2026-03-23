import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import type { Store } from '../store/index.js';
import type { ExportData } from '../store/types.js';

// ── Types ──

export interface ChunkMeta {
  id: string;
  filename: string;
  created_at: string;
  project?: string;
  sessions_count: number;
  observations_count: number;
  prompts_count: number;
}

export interface SyncManifest {
  version: number;
  last_export_at: string | null;
  chunks: ChunkMeta[];
}

export interface SyncExportResult {
  chunk_id: string;
  filename: string;
  sessions: number;
  observations: number;
  prompts: number;
}

export interface SyncImportResult {
  chunks_processed: number;
  sessions_imported: number;
  observations_imported: number;
  prompts_imported: number;
  skipped: number;
}

// ── Constants ──

const MANIFEST_FILE = 'manifest.json';
const CHUNKS_DIR = 'chunks';

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

// ── Public API ──

/**
 * Export memory data to an append-only compressed chunk.
 * Each chunk is a gzipped JSON file containing an ExportData payload.
 * The manifest tracks all chunks for ordered import.
 *
 * Deduplication on import is handled by sync_id — calling export
 * multiple times is safe (creates redundant chunks, but import skips dupes).
 */
export function syncExport(store: Store, syncDir: string, project?: string): SyncExportResult {
  ensureSyncDir(syncDir);
  const manifest = loadManifest(syncDir);

  const data = store.exportData(project);

  if (data.sessions.length === 0 && data.observations.length === 0 && data.prompts.length === 0) {
    return { chunk_id: '', filename: '', sessions: 0, observations: 0, prompts: 0 };
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const shortId = randomUUID().slice(0, 8);
  const chunkId = `chunk-${timestamp}-${shortId}`;
  const filename = `${chunkId}.json.gz`;

  const json = JSON.stringify(data);
  const compressed = gzipSync(Buffer.from(json, 'utf-8'));
  writeFileSync(join(syncDir, CHUNKS_DIR, filename), compressed);

  const chunkMeta: ChunkMeta = {
    id: chunkId,
    filename,
    created_at: new Date().toISOString(),
    project,
    sessions_count: data.sessions.length,
    observations_count: data.observations.length,
    prompts_count: data.prompts.length,
  };

  manifest.chunks.push(chunkMeta);
  manifest.last_export_at = new Date().toISOString();
  saveManifest(syncDir, manifest);

  return {
    chunk_id: chunkId,
    filename,
    sessions: data.sessions.length,
    observations: data.observations.length,
    prompts: data.prompts.length,
  };
}

/**
 * Import memory data from all compressed chunks in a sync directory.
 * Reads the manifest for ordered chunk processing, or scans the chunks
 * directory if no manifest exists. Deduplication is handled by sync_id
 * in the store's importData method — safe to re-import the same chunks.
 */
export function syncImport(store: Store, syncDir: string): SyncImportResult {
  const emptyResult: SyncImportResult = {
    chunks_processed: 0,
    sessions_imported: 0,
    observations_imported: 0,
    prompts_imported: 0,
    skipped: 0,
  };

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

  const totalResult: SyncImportResult = { ...emptyResult };

  for (const filename of chunkFiles) {
    const chunkPath = join(chunksDir, filename);
    if (!existsSync(chunkPath)) continue;

    const compressed = readFileSync(chunkPath);
    const json = gunzipSync(compressed).toString('utf-8');
    const data: ExportData = JSON.parse(json) as ExportData;

    const result = store.importData(data);

    totalResult.chunks_processed++;
    totalResult.sessions_imported += result.sessions_imported;
    totalResult.observations_imported += result.observations_imported;
    totalResult.prompts_imported += result.prompts_imported;
    totalResult.skipped += result.skipped;
  }

  return totalResult;
}
