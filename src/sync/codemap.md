# src/sync/

## Responsibility

Implements incremental data synchronization for the memory store via append-only compressed chunks.
Exports observations, sessions, and prompts as mutations since a watermark, and imports them back with format evolution support (v1 legacy full-data and v2 mutation-based) and deduplication.

## Design Patterns

* Incremental export via mutation watermarks: `syncExport()` queries mutations since the last successful export watermark, resolves them to envelopes, and emits only new changes as a v2 chunk.
* Manifest-driven chunk tracking: `manifest.json` records chunk metadata and export history; chunks are stored in `chunks/` directory as gzip-compressed JSON files.
* Chunk format evolution with priority-based import: v1 (legacy full-data export) and v2 (mutation envelope) formats are detected at import time; v1 chunks are processed first, then v2, ensuring backward compatibility.
* SHA256 payload hashing for integrity and deduplication: both compressed chunk content and JSON payload are hashed; import checks `sync_chunks` table to skip already-applied chunks.
* Mutation envelope abstraction: v2 chunks wrap mutations in `SyncMutationEnvelopeV2` (operation, entity_type, entity_id, sync_id, data) to support create/update/delete operations with null data for deletes.
* Chunk status recording: each imported chunk is recorded in the store with status ('applied', 'skipped', 'failed') for audit and resumability.

## Data & Control Flow

**Export Flow:**
1. `syncExport()` ensures sync directory and chunks subdirectory exist.
2. Load manifest from `manifest.json` or initialize empty manifest.
3. Query store watermark via `store.getExportWatermark()` and fetch mutations since that point via `store.getMutationsSince()`.
4. For each mutation, resolve to a `SyncMutationEnvelopeV2` via `resolveMutationEnvelope()`, filtering by project if specified; skip mutations that resolve to null (e.g., deleted entities outside project scope).
5. If no envelopes remain after filtering, return no-op result with skipped count.
6. Create v2 chunk with mutation range (from_mutation_id to to_mutation_id), hash the JSON payload, and derive chunk ID as `chunk-{payloadHash}`.
7. Serialize chunk to JSON, compress with gzip, and write to `chunks/{chunkId}.json.gz`.
8. Count entities in envelopes (sessions, observations, prompts) and create chunk metadata.
9. Update manifest with new chunk metadata, last export timestamp, and mutation ID watermark.
10. Record chunk in store via `store.recordSyncChunk()` with status 'applied'.
11. Return result with chunk ID, filename, entity counts, exported/skipped mutation counts, and mutation ID range.

**Import Flow:**
1. `syncImport()` checks if sync directory exists; return empty result if not.
2. Load manifest or scan `chunks/` directory for `.json.gz` files; use manifest order when available, fall back to sorted directory scan.
3. For each chunk file, read compressed content and compute SHA256 hash of the compressed buffer.
4. Attempt to decompress with gzip; fall back to raw UTF-8 if decompression fails (legacy uncompressed chunks).
5. Parse JSON and detect format via `detectImportChunkFormat()`: check for `version` field; v1 (no version or version=1), v2 (version=2), or unknown.
6. Extract chunk metadata (chunk_id, from_mutation_id, to_mutation_id) from parsed object if present.
7. Collect all prepared chunks with their format, version, and original file order.
8. Sort prepared chunks by import priority: v1 first (priority 0), v2 second (priority 1), unknown last (priority 2); preserve file order within each priority tier.
9. For each chunk in sorted order:
   - Check if chunk is already imported via `store.isChunkImported(chunkId)` or `isPayloadImported(store, payloadHash)`.
   - If imported, increment skipped count and record status 'skipped'.
   - If format is 'unknown', log warning to stderr, increment skipped, and record status 'skipped'.
   - If format is 'v2', call `store.applyV2Chunk(parsed)` and track entity count deltas (sessions, observations, prompts).
   - If format is 'v1', call `store.importData(parsed)` and accumulate legacy import counts.
   - On success, increment imported count and record status 'applied'.
   - On error, increment failed count and record status 'failed'.
10. Return aggregated result with chunks processed, imported, skipped, failed counts, and legacy entity counts.

## Integration Points

* Depends on `src/store/index.js` (Store) for mutation queries (`getExportWatermark()`, `getMutationsSince()`), chunk application (`applyV2Chunk()`, `importData()`), watermark tracking, and status recording (`recordSyncChunk()`, `isChunkImported()`).
* Depends on `src/store/types.js` for row models and sync contracts: `ExportData`, `Observation`, `Session`, `UserPrompt`, `SyncChunkV2`, `SyncMutation`, `SyncMutationEnvelopeV2`.
* Depends on Node built-ins: `node:fs` (file I/O), `node:path` (path resolution), `node:zlib` (gzip compression), `node:crypto` (SHA256 hashing).
* Consumed indirectly by CLI commands and MCP tools that need to export/import memory across instances or persist to external storage.
