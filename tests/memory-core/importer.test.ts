import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, linkSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { LegacyImportFailure, applyLegacyImport, parseImportPlan, parseMappingManifest, planLegacyImport, writeLegacyImportCandidate } from '../../src/memory-core/import/legacy-v1.js';
import { allocateImportArtifacts, cloneBackupToCandidate, closeCandidateForPublication, createVerifiedTargetBackup, publishCandidate } from '../../src/memory-core/import/backup.js';
import { currentBaselineManifest } from '../../src/memory-core/import/inspect.js';
import { databaseCounts, verifyImportedDatabase } from '../../src/memory-core/import/verify.js';
import { sanitizeLegacyImportContent, sanitizePrivateContent } from '../../src/memory-core/privacy.js';
import { MemoryService } from '../../src/memory-core/service.js';
import { migrateCurrentSchema, SQLITE_SCHEMA_REVISION } from '../../src/memory-core/sqlite/migrations.js';

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function createLegacy(path: string): void {
  const database = new Database(path);
  try {
    database.exec(`
      CREATE TABLE sessions(id TEXT PRIMARY KEY,project TEXT,directory TEXT,started_at TEXT,ended_at TEXT,summary TEXT);
      CREATE TABLE user_prompts(id INTEGER PRIMARY KEY,session_id TEXT,content TEXT,project TEXT,directory TEXT,created_at TEXT);
      CREATE TABLE observations(id INTEGER PRIMARY KEY,session_id TEXT,type TEXT,title TEXT,content TEXT,project TEXT,directory TEXT,topic_key TEXT,created_at TEXT,updated_at TEXT,deleted_at TEXT,revision_count INTEGER);
      CREATE TABLE observation_versions(observation_id INTEGER NOT NULL,version_number INTEGER NOT NULL,title TEXT,content TEXT,project TEXT,directory TEXT,created_at TEXT,PRIMARY KEY(observation_id,version_number));
      CREATE TABLE kg_triples(id INTEGER PRIMARY KEY,subject TEXT);
      CREATE TABLE operation_trace(id INTEGER PRIMARY KEY,payload TEXT);
    `);
    database.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run('s-alpha', 'alpha', 'C:/repos/alpha', '2025-01-01T00:00:00.000Z', null, 'Summary');
    database.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run('s-alias', 'alias-source', 'C:/repos/alias', '2025-01-01T00:00:00.000Z', null, null);
    database.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run('s-isolated', 'similar-name', null, '2025-01-01T00:00:00.000Z', null, null);
    database.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run('s-directory', null, 'C:/repos/alias', '2025-01-01T00:00:00.000Z', null, null);
    database.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run('s-ambiguous', 'ambiguous-source', 'C:/repos/ambiguous', '2025-01-01T00:00:00.000Z', null, null);
    database.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run('s-placeholder', 'unknown', null, '2025-01-01T00:00:00.000Z', null, null);
    database.prepare('INSERT INTO user_prompts VALUES(?,?,?,?,?,?)').run(1, 's-alpha', 'root request', 'alpha', null, '2025-01-01T00:00:00.000Z');
    database.prepare('INSERT INTO user_prompts VALUES(?,?,?,?,?,?)').run(2, 's-alpha', 'conflict', 'other', null, '2025-01-01T00:00:00.000Z');
    database.prepare('INSERT INTO user_prompts VALUES(?,?,?,?,?,?)').run(3, 's-placeholder', '<private>unterminated', 'unknown', null, '2025-01-01T00:00:00.000Z');
    database.prepare('INSERT INTO user_prompts VALUES(?,?,?,?,?,?)').run(4, 's-alpha', '<private>unterminated', 'alpha', null, '2025-01-01T00:00:00.000Z');
    database.prepare('INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(1, 's-alpha', 'decision', 'Choice', 'Choose SQLite', 'alpha', null, 'db/choice', '2025-01-01T00:00:01.000Z', '2025-01-02T00:00:00.000Z', null, 2);
    database.prepare('INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(2, 's-alpha', 'learning', 'Deleted', 'Old answer', 'alpha', null, null, '2025-01-01T00:00:02.000Z', null, '2025-01-03T00:00:00.000Z', 1);
    database.prepare('INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(7, 's-alpha', 'learning', 'Malformed', '<private>unterminated', 'alpha', null, null, '2025-01-01T00:00:03.000Z', null, null, 1);
    database.prepare('INSERT INTO observation_versions VALUES(?,?,?,?,?,?,?)').run(1, 1, 'Earlier', 'Earlier choice', 'alpha', null, '2025-01-01T00:00:00.500Z');
    database.prepare('INSERT INTO kg_triples VALUES(?,?)').run(1, 'derived');
    database.prepare('INSERT INTO operation_trace VALUES(?,?)').run(1, 'ignored');
    database.unsafeMode(true);
    database.pragma('writable_schema = ON');
    database.prepare("INSERT INTO sqlite_schema(type,name,tbl_name,rootpage,sql) VALUES('table','legacy_vectors','legacy_vectors',0,'CREATE VIRTUAL TABLE legacy_vectors USING vec0(embedding float[2])')").run();
    database.pragma('writable_schema = OFF');
    database.pragma('schema_version = 2');
  } finally {
    database.close();
  }
}

function createSingleSessionLegacy(path: string, summary: string): void {
  const database = new Database(path);
  try {
    database.exec(`
      CREATE TABLE sessions(id TEXT PRIMARY KEY,project TEXT,directory TEXT,started_at TEXT,ended_at TEXT,summary TEXT);
      CREATE TABLE user_prompts(id INTEGER PRIMARY KEY,session_id TEXT,content TEXT,project TEXT,directory TEXT,created_at TEXT);
      CREATE TABLE observations(id INTEGER PRIMARY KEY,session_id TEXT,type TEXT,title TEXT,content TEXT,project TEXT,directory TEXT,topic_key TEXT,created_at TEXT,updated_at TEXT,deleted_at TEXT,revision_count INTEGER);
      CREATE TABLE observation_versions(observation_id INTEGER NOT NULL,version_number INTEGER NOT NULL,title TEXT,content TEXT,project TEXT,directory TEXT,created_at TEXT,PRIMARY KEY(observation_id,version_number));
    `);
    database.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run('shared-session', 'alpha', null, '2025-01-01T00:00:00.000Z', null, summary);
  } finally { database.close(); }
}

function createTarget(path: string): void {
  const database = new Database(path);
  const timestamp = '2026-09-01T00:00:00.000Z';
  try {
    migrateCurrentSchema(database);
    database.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('project-alpha', 'alpha', 'Alpha', null, timestamp, timestamp);
    database.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('project-alias', 'canonical-alias', 'Alias', null, timestamp, timestamp);
    database.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('project-other', 'other', 'Other', null, timestamp, timestamp);
    database.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('project-ambiguous', 'ambiguous-source', 'Ambiguous', null, timestamp, timestamp);
    database.prepare('INSERT INTO project_aliases VALUES(?,?,?,?,?)').run('path:C:/repos/alias', 'project-alias', 'path', timestamp, timestamp);
    database.prepare('INSERT INTO project_aliases VALUES(?,?,?,?,?)').run('path:C:/repos/ambiguous', 'project-other', 'path', timestamp, timestamp);
  } finally {
    database.close();
  }
}

function populateCurrentBaseline(path: string): void {
  const service = new MemoryService({ databasePath: path });
  const project = { key: 'alpha', name: 'Alpha' };
  const session = { rootSessionKey: 'baseline-root', harness: 'codex' as const };
  try {
    const source = service.save({ project, session, eventKey: 'baseline-source', evidence: { kind: 'explicit_save', content: 'Baseline source evidence.' } });
    const confirmation = service.save({ project, session, eventKey: 'baseline-confirmation', evidence: { kind: 'root_prompt', content: 'Confirm baseline decision.' } });
    service.lifecycle({
      harness: session.harness, project, rootSessionKey: session.rootSessionKey, operation: 'checkpoint_pre_compact', eventKey: 'baseline-summary',
      summary: { kind: 'checkpoint', coverage: { fromSequence: 1, toSequence: 2 }, generator: { kind: 'root_agent', name: 'codex' }, claims: [{ kind: 'objective', content: 'Preserve the populated baseline.', supportIds: [source.evidence.id, confirmation.evidence.id] }] },
    });
    const candidate = service.submitObservation({
      project, session, eventKey: 'baseline-observation', observation: {
        kind: 'decision', scope: 'project', title: 'Baseline decision', claim: 'Preserve every current baseline family.',
        proposedMemory: { kind: 'architecture', title: 'Baseline architecture', content: 'Preserve every current baseline family.', topicKey: 'baseline/all', outcome: 'succeeded' },
        supportIds: [source.evidence.id], generator: { kind: 'root_agent', name: 'codex' }, concepts: ['baseline'], files: ['src/baseline.ts'],
      },
    });
    service.reviewObservation({ project, session, eventKey: 'baseline-review', review: { observationId: candidate.observation.id, verdict: 'accepted', basis: 'root_user_confirmed', policy: { id: 'baseline', version: '1' }, reason: 'Confirmed for preservation coverage.', supportIds: [confirmation.evidence.id] } });
    const promoted = service.promoteObservation({ project, session, eventKey: 'baseline-promotion', observationId: candidate.observation.id });
    const database = (service as unknown as { database: Database.Database }).database;
    database.prepare('INSERT INTO projection_state VALUES(?,?,?,?,?,?)').run('baseline-projection', 'a'.repeat(64), 1, 'ready', '2026-09-02T00:00:00.000Z', null);
    database.prepare('INSERT INTO projection_source_mapping VALUES(?,?,?,?,?)').run('baseline-projection', promoted.memory.id, 'a'.repeat(64), 'b'.repeat(64), 'projected-baseline');
    database.prepare('INSERT INTO projection_jobs VALUES(?,?,?,?,?,?,?,?)').run('baseline-job', 'baseline-projection', 'a'.repeat(64), 1, 'ready', 1, promoted.memory.id, null);
  } finally { service.close(); }
  const closed = new Database(path);
  closed.pragma('wal_checkpoint(TRUNCATE)');
  closed.pragma('journal_mode = DELETE');
  closed.close();
}

describe('legacy import planning', () => {
  it('produces a deterministic hash-bound v3 plan without writing either input or loading virtual modules', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-plan-'));
    const source = join(root, 'legacy.sqlite');
    const target = join(root, 'memory.sqlite');
    createLegacy(source);
    createTarget(target);
    const sourceBefore = sha256(source);
    const targetBefore = sha256(target);
    const filesBefore = readdirSync(root).sort();
    try {
      const first = planLegacyImport({ sourcePath: source, targetPath: target });
      const second = planLegacyImport({ sourcePath: source, targetPath: target });

      expect(second).toEqual(first);
      expect(parseImportPlan(JSON.parse(JSON.stringify(first)))).toEqual(first);
      expect(first).toMatchObject({
        schema: 'thoth-mem.import.plan.v3',
        version: 3,
        source: { path: resolve(source), schema: 'legacy-v1', authoritativeInventory: { session: 6, prompt: 4, session_summary: 1, observation_version: 1, observation: 3 } },
        target: { path: resolve(target), absent: false, schemaRevision: SQLITE_SCHEMA_REVISION },
        integrityExpectations: { targetRevision: SQLITE_SCHEMA_REVISION, receiptCount: 15, requireFtsEquality: true, requireProvenance: true },
      });
      expect(first.source.ignoredSchemaObjects).toEqual(expect.arrayContaining([
        { name: 'kg_triples', type: 'table', category: 'derived', virtual: false },
        { name: 'legacy_vectors', type: 'table', category: 'derived', virtual: true },
        { name: 'operation_trace', type: 'table', category: 'derived', virtual: false },
      ]));
      expect(JSON.stringify(first)).not.toMatch(/Choose SQLite|root request|Earlier choice|Summary/);
      expect(sha256(source)).toBe(sourceBefore);
      expect(sha256(target)).toBe(targetBefore);
      expect(readdirSync(root).sort()).toEqual(filesBefore);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('resolves only explicit selectors, exact identity keys, or exact path aliases and isolates unmatched names', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-map-'));
    const source = join(root, 'legacy.sqlite');
    const target = join(root, 'memory.sqlite');
    createLegacy(source);
    createTarget(target);
    try {
      const mapping = parseMappingManifest({
        schema: 'thoth-mem.import.mapping.v1',
        version: 1,
        mappings: [{ sourceProject: 'similar-name', targetSelector: 'other' }],
      });
      const plan = planLegacyImport({ sourcePath: source, targetPath: target, mapping });
      const bySource = Object.fromEntries(plan.projectMappings.map((item) => [item.sourceProject, item]));

      expect(bySource.alpha).toMatchObject({ disposition: 'mapped', basis: 'exact_identity', resolvedProjectId: 'project-alpha' });
      expect(bySource['alias-source']).toMatchObject({ disposition: 'mapped', basis: 'exact_path_alias', resolvedProjectId: 'project-alias' });
      expect(bySource['C:/repos/alias']).toMatchObject({ disposition: 'mapped', basis: 'exact_path_alias', resolvedProjectId: 'project-alias' });
      expect(bySource['similar-name']).toMatchObject({ disposition: 'mapped', basis: 'explicit', resolvedProjectId: 'project-other' });
      expect(bySource['ambiguous-source']).toMatchObject({ disposition: 'quarantined', basis: 'ambiguous_identity', resolvedProjectId: null });
      expect(bySource.unknown).toMatchObject({ disposition: 'quarantined', basis: 'placeholder_identity', resolvedProjectId: null });
      expect(plan.plannedDispositions.prompt).toEqual({ imported: 1, linked: 0, skipped: 0, quarantined: 3 });
      expect(plan.reasonCounts).toMatchObject({ ambiguous_identity: 1, project_conflict: 1, placeholder_identity: 2, privacy_malformed: 2, deleted: 1 });

      const isolated = planLegacyImport({ sourcePath: source, targetPath: target });
      expect(isolated.projectMappings.find((item) => item.sourceProject === 'similar-name')).toMatchObject({
        disposition: 'isolated', basis: 'isolated_legacy', destinationSelector: 'legacy:similar-name',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed for aliased inputs, unsupported schemas, unused mappings, and tampered or open JSON contracts', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-invalid-'));
    const source = join(root, 'legacy.sqlite');
    const target = join(root, 'memory.sqlite');
    createLegacy(source);
    createTarget(target);
    const unsupported = join(root, 'unsupported.sqlite');
    const database = new Database(unsupported);
    database.exec('CREATE TABLE unrelated(id INTEGER PRIMARY KEY)');
    database.close();
    try {
      expect(() => planLegacyImport({ sourcePath: source, targetPath: source })).toThrow(/distinct paths/i);
      const hardlink = join(root, 'legacy-hardlink.sqlite');
      linkSync(source, hardlink);
      expect(() => planLegacyImport({ sourcePath: source, targetPath: hardlink })).toThrow(/same physical file/i);
      expect(() => planLegacyImport({ sourcePath: unsupported, targetPath: target })).toThrow(/unsupported legacy schema/i);
      expect(() => planLegacyImport({
        sourcePath: source,
        targetPath: target,
        mapping: parseMappingManifest({ schema: 'thoth-mem.import.mapping.v1', version: 1, mappings: [{ sourceProject: 'missing', targetSelector: 'alpha' }] }),
      })).toThrow(/mapping.*source project/i);

      const plan = planLegacyImport({ sourcePath: source, targetPath: target });
      expect(() => parseImportPlan({ ...plan, extra: true })).toThrow(/unknown or missing fields/i);
      expect(() => parseImportPlan({ ...plan, source: { ...plan.source, extra: true } })).toThrow(/unknown or missing fields/i);
      expect(() => parseImportPlan({ ...plan, projectMappings: plan.projectMappings.map((item, index) => index === 0 ? { ...item, disposition: 'guessed' } : item) })).toThrow(/project mapping/i);
      expect(() => parseImportPlan({ ...plan, planHash: '0'.repeat(64) })).toThrow(/hash/i);
      expect(() => parseMappingManifest({ schema: 'thoth-mem.import.mapping.v1', version: 1, mappings: [], extra: true })).toThrow(/unknown or missing fields/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    expect(existsSync(source)).toBe(false);
  });
});

describe('legacy candidate writer', () => {
  it('preserves supported legacy history while keeping target winners authoritative', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-writer-'));
    const source = join(root, 'legacy.sqlite');
    const target = join(root, 'memory.sqlite');
    const candidate = join(root, 'candidate.sqlite');
    createLegacy(source);
    createTarget(target);
    const targetService = new MemoryService({ databasePath: target });
    const currentWinner = targetService.save({
      project: { key: 'alpha', name: 'Alpha' }, eventKey: 'target-winner',
      evidence: { kind: 'explicit_save', content: 'Current target remains authoritative', capturedAt: '2026-08-01T00:00:00.000Z' },
      memory: { kind: 'decision', title: 'Current choice', content: 'Current target remains authoritative', topicKey: 'db/choice' },
    }).memory!;
    const exactExisting = targetService.save({
      project: { key: 'alpha', name: 'Alpha' }, eventKey: 'target-exact',
      evidence: { kind: 'explicit_save', content: 'Exactly once', capturedAt: '2026-08-02T00:00:00.000Z' },
      memory: { kind: 'decision', title: 'Exact legacy', content: 'Exactly once', topicKey: 'exact/topic' },
    }).memory!;
    const stableOrder = targetService.recall({ projectKey: 'alpha', query: 'Current target authoritative', history: false }).items.map((item) => item.id);
    targetService.close();
    const closedTarget = new Database(target);
    closedTarget.pragma('journal_mode = DELETE');
    closedTarget.close();
    const legacy = new Database(source);
    legacy.prepare('INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(3, 's-alpha', 'decision', 'Exact legacy', 'Exactly once', 'alpha', null, 'exact/topic', '2025-02-01T00:00:00.000Z', null, null, 1);
    legacy.prepare('INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(4, 's-isolated', 'learning', 'Isolated head', 'Isolated current memory', 'similar-name', null, 'isolated/topic', '2025-03-02T00:00:00.000Z', '2025-03-03T00:00:00.000Z', null, 2);
    legacy.prepare('INSERT INTO observation_versions VALUES(?,?,?,?,?,?,?)').run(4, 1, 'Isolated prior', 'Isolated historical memory', 'similar-name', null, '2025-03-01T00:00:00.000Z');
    legacy.prepare('INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(5, 's-alpha', 'mystery', 'Unsupported', 'Never recall this', 'alpha', null, 'unsupported/topic', '2025-04-01T00:00:00.000Z', null, null, 1);
    legacy.prepare('INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(6, 's-alpha', 'session_summary', 'Legacy summary', 'Continue with audit work', 'alpha', null, null, '2025-05-01T00:00:00.000Z', null, null, 1);
    legacy.prepare("UPDATE sessions SET summary='Quarantined summary' WHERE id='s-placeholder'").run();
    legacy.prepare('INSERT INTO observation_versions VALUES(?,?,?,?,?,?,?)').run(2, 1, 'Deleted prior', 'Never resurrect this revision', 'alpha', null, '2025-01-01T00:00:01.500Z');
    legacy.close();
    try {
      const plan = planLegacyImport({ sourcePath: source, targetPath: target });
      expect(plan.plannedDispositions.observation.quarantined).toBeGreaterThanOrEqual(1);
      expect(plan.reasonCounts.unsupported_kind).toBe(1);
      copyFileSync(target, candidate);

      const result = writeLegacyImportCandidate({ candidatePath: candidate, plan, importedAt: '2026-09-02T12:00:00.000Z' });

      expect(result).toMatchObject({ importId: expect.any(String), dispositions: plan.plannedDispositions });
      expect(() => writeLegacyImportCandidate({ candidatePath: target, plan, importedAt: '2026-09-02T12:00:00.000Z' })).toThrow(/candidate.*distinct/i);
      const service = new MemoryService({ databasePath: candidate, readonly: true });
      try {
        expect(service.recall({ projectKey: 'alpha', query: 'Current target authoritative' }).items.map((item) => item.id)).toEqual(stableOrder);
        expect(service.recall({ projectKey: 'alpha', query: 'db/choice', history: false }).items.map((item) => item.id)).toEqual([currentWinner.id]);
        const collisionHistory = service.recall({ projectKey: 'alpha', query: 'db/choice', history: true, limit: 10 }).items;
        expect(collisionHistory.map((item) => item.title)).toEqual(expect.arrayContaining(['Current choice', 'Choice', 'Earlier']));
        expect(collisionHistory.find((item) => item.title === 'Choice')?.status).toBe('historical');
        expect(service.recall({ projectKey: 'alpha', query: 'Exactly once', history: true }).items.map((item) => item.id)).toEqual([exactExisting.id]);
        const isolated = service.recall({ projectKey: 'legacy:similar-name', query: 'isolated', history: true, limit: 10 }).items;
        expect(isolated.map((item) => [item.title, item.status])).toEqual(expect.arrayContaining([['Isolated head', 'current'], ['Isolated prior', 'superseded']]));
        const isolatedHead = isolated.find((item) => item.title === 'Isolated head')!;
        expect(service.get({ id: isolatedHead.id, history: true }).lineage.map((item) => 'title' in item ? item.title : '')).toEqual(['Isolated head', 'Isolated prior']);
        expect(service.recall({ projectKey: 'alpha', query: 'Continue audit', history: true }).items).toEqual([expect.objectContaining({ kind: 'handoff', title: 'Legacy summary' })]);
        expect(service.recall({ projectKey: 'alpha', query: 'Never recall', history: true }).items).toEqual([]);
      } finally { service.close(); }

      const database = new Database(candidate, { readonly: true });
      try {
        expect(database.prepare("SELECT started_at,ended_at,state,next_event_sequence FROM sessions WHERE id=(SELECT session_id FROM legacy_import_rows WHERE source_entity='session' AND source_key='s-alpha')").get()).toEqual({ started_at: '2025-01-01T00:00:00.000Z', ended_at: null, state: 'active', next_event_sequence: 0 });
        expect(database.prepare("SELECT count(*) AS count FROM session_events se JOIN evidence e ON e.id=se.evidence_id WHERE e.kind LIKE 'legacy_%'").get()).toEqual({ count: 0 });
        expect(database.prepare("SELECT count(*) AS count FROM evidence WHERE kind='legacy_prompt' AND captured_at='2025-01-01T00:00:00.000Z'").get()).toEqual({ count: 1 });
        expect(database.prepare("SELECT disposition,reason,memory_id FROM legacy_import_rows WHERE source_entity='observation' AND source_key='3'").get()).toEqual({ disposition: 'linked', reason: 'exact_existing', memory_id: exactExisting.id });
        expect(database.prepare("SELECT disposition,reason,evidence_id,memory_id FROM legacy_import_rows WHERE source_entity='observation' AND source_key='5'").get()).toEqual({ disposition: 'quarantined', reason: 'unsupported_kind', evidence_id: null, memory_id: null });
        expect(database.prepare("SELECT disposition,reason FROM legacy_import_rows WHERE source_entity='session_summary' AND source_key='s-placeholder'").get()).toEqual({ disposition: 'quarantined', reason: 'placeholder_identity' });
        expect(database.prepare("SELECT disposition,reason FROM legacy_import_rows WHERE source_entity='observation_version' AND source_key='2'").get()).toEqual({ disposition: 'skipped', reason: 'deleted' });
        expect(database.prepare("SELECT count(*) AS count FROM session_summaries").get()).toEqual({ count: 0 });
        expect(database.prepare("SELECT count(*) AS count FROM observations").get()).toEqual({ count: 0 });
        expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
        expect(database.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
        const counts = database.prepare('SELECT (SELECT count(*) FROM memories) AS memories,(SELECT count(*) FROM memory_fts) AS fts').get() as { memories: number; fts: number };
        expect(counts.fts).toBe(counts.memories);
        const ids = database.prepare('SELECT id FROM memories ORDER BY id').all();
        expect(database.prepare('SELECT memory_id AS id FROM memory_fts ORDER BY memory_id').all()).toEqual(ids);
        expect(database.prepare('SELECT count(*) AS count FROM legacy_import_rows').get()).toEqual({ count: plan.integrityExpectations.receiptCount });
      } finally { database.close(); }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects malformed legacy privacy delimiters without changing normal save filtering', () => {
    expect(sanitizeLegacyImportContent('[private]<private>secret[/private]</private>')).toEqual({ disposition: 'quarantined', reason: 'privacy_malformed' });
    expect(sanitizeLegacyImportContent('prefix <private secret')).toEqual({ disposition: 'quarantined', reason: 'privacy_malformed' });
    expect(sanitizeLegacyImportContent('<private>secret</private>')).toEqual({ disposition: 'quarantined', reason: 'empty_after_filter' });
    expect(sanitizeLegacyImportContent('safe <private>secret</private> text')).toEqual({ disposition: 'accepted', value: 'safe  text', transformed: true });
    expect(sanitizePrivateContent('<private>unterminated')).toBe('<private>unterminated');
  });

  it('accepts an empty current candidate when the bound target was absent', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-absent-'));
    const source = join(root, 'legacy.sqlite');
    const target = join(root, 'absent.sqlite');
    const candidate = join(root, 'candidate.sqlite');
    createLegacy(source);
    const candidateDatabase = new Database(candidate);
    migrateCurrentSchema(candidateDatabase);
    candidateDatabase.close();
    try {
      const plan = planLegacyImport({ sourcePath: source, targetPath: target });
      expect(plan.target.absent).toBe(true);
      expect(writeLegacyImportCandidate({ candidatePath: candidate, plan, importedAt: '2026-09-02T12:00:00.000Z' }).receipts).toBe(plan.integrityExpectations.receiptCount);
      const service = new MemoryService({ databasePath: candidate, readonly: true });
      try {
        expect(service.recall({ projectKey: 'legacy:alpha', query: 'Choose SQLite', history: true }).items).toEqual([
          expect.objectContaining({ title: 'Choice', status: 'current' }),
        ]);
      } finally { service.close(); }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ['receipt transformed hash', (database: Database.Database) => {
      database.exec('DROP TRIGGER legacy_import_rows_immutable_update');
      database.prepare("UPDATE legacy_import_rows SET transformed_hash=? WHERE disposition='imported' AND transformed_hash IS NOT NULL LIMIT 1").run('0'.repeat(64));
    }],
    ['receipt captured time', (database: Database.Database) => {
      database.exec('DROP TRIGGER legacy_import_rows_immutable_update');
      database.prepare("UPDATE legacy_import_rows SET captured_at='1999-01-01T00:00:00.000Z' WHERE disposition='imported' LIMIT 1").run();
    }],
    ['swapped receipt disposition and reason semantics', (database: Database.Database) => {
      database.exec('DROP TRIGGER legacy_import_rows_immutable_update');
      database.prepare("UPDATE legacy_import_rows SET disposition='quarantined',reason='privacy_malformed' WHERE source_entity='observation' AND source_key='2'").run();
      database.prepare("UPDATE legacy_import_rows SET disposition='skipped',reason='deleted' WHERE source_entity='observation' AND source_key='7'").run();
    }],
    ['import header source file fingerprint', (database: Database.Database) => {
      database.exec('DROP TRIGGER legacy_imports_immutable_update');
      database.prepare("UPDATE legacy_imports SET source_file_fingerprint='{}'").run();
    }],
    ['missing import cohort', (database: Database.Database) => {
      database.exec('DROP TRIGGER legacy_import_cohorts_immutable_delete');
      database.prepare('DELETE FROM legacy_import_cohorts').run();
    }],
    ['gapped import cohorts', (database: Database.Database) => {
      database.exec('DROP TRIGGER legacy_import_cohorts_immutable_update');
      database.prepare('UPDATE legacy_import_cohorts SET cohort_sequence=2').run();
    }],
    ['duplicate import cohorts', (database: Database.Database) => {
      const importId = (database.prepare('SELECT id FROM legacy_imports').get() as { id: string }).id;
      database.exec(`
        DROP TRIGGER legacy_import_cohorts_immutable_update;
        DROP TRIGGER legacy_import_cohorts_immutable_delete;
        DROP TABLE legacy_import_cohorts;
        CREATE TABLE legacy_import_cohorts(import_id TEXT NOT NULL, cohort_sequence INTEGER NOT NULL);
      `);
      database.prepare('INSERT INTO legacy_import_cohorts VALUES(?,1),(?,1)').run(importId, importId);
    }],
    ['evidence payload', (database: Database.Database) => {
      database.exec('DROP TRIGGER evidence_immutable_update');
      database.prepare("UPDATE evidence SET content='forged payload' WHERE id IN (SELECT evidence_id FROM legacy_import_rows WHERE evidence_id IS NOT NULL LIMIT 1)").run();
    }],
    ['evidence project scope', (database: Database.Database) => {
      database.exec('DROP TRIGGER evidence_immutable_update');
      database.prepare("UPDATE evidence SET project_id='project-other' WHERE id IN (SELECT evidence_id FROM legacy_import_rows WHERE project_id='project-alpha' AND evidence_id IS NOT NULL LIMIT 1)").run();
    }],
    ['evidence session scope', (database: Database.Database) => {
      database.exec('DROP TRIGGER evidence_immutable_update');
      database.prepare('UPDATE evidence SET session_id=NULL WHERE id IN (SELECT evidence_id FROM legacy_import_rows WHERE session_id IS NOT NULL AND evidence_id IS NOT NULL LIMIT 1)').run();
    }],
    ['evidence source provenance', (database: Database.Database) => {
      database.exec('DROP TRIGGER evidence_immutable_update');
      database.prepare("UPDATE evidence SET source_ref='forged:source' WHERE id IN (SELECT evidence_id FROM legacy_import_rows WHERE evidence_id IS NOT NULL LIMIT 1)").run();
    }],
    ['evidence metadata provenance', (database: Database.Database) => {
      database.exec('DROP TRIGGER evidence_immutable_update');
      database.prepare("UPDATE evidence SET metadata_json='{}' WHERE id IN (SELECT evidence_id FROM legacy_import_rows WHERE evidence_id IS NOT NULL LIMIT 1)").run();
    }],
    ['support provenance', (database: Database.Database) => {
      database.prepare("UPDATE memory_evidence SET relation='derived_from' WHERE memory_id IN (SELECT memory_id FROM legacy_import_rows WHERE memory_id IS NOT NULL LIMIT 1)").run();
    }],
    ['cyclic temporal lineage', (database: Database.Database) => {
      const row = database.prepare('SELECT id FROM memories WHERE supersedes_id IS NOT NULL LIMIT 1').get() as { id: string };
      database.prepare('UPDATE memories SET supersedes_id=? WHERE id=?').run(row.id, row.id);
    }],
    ['branching temporal lineage', (database: Database.Database) => {
      const row = database.prepare('SELECT * FROM memories WHERE supersedes_id IS NOT NULL LIMIT 1').get() as Record<string, unknown>;
      database.prepare('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('forged-branch', row.project_id, row.topic_key, row.kind, row.title, row.content, row.outcome, 'historical', row.valid_from, row.invalid_at, row.supersedes_id, row.created_at);
    }],
    ['incoherent temporal interval', (database: Database.Database) => {
      database.prepare("UPDATE memories SET invalid_at='2099-01-01T00:00:00.000Z' WHERE id IN (SELECT supersedes_id FROM memories WHERE supersedes_id IS NOT NULL LIMIT 1)").run();
    }],
    ['invalid current winner', (database: Database.Database) => {
      database.exec('DROP INDEX memories_current_topic');
      database.prepare("UPDATE memories SET status='current',invalid_at=NULL WHERE status='superseded' AND topic_key IS NOT NULL LIMIT 1").run();
    }],
    ['FTS title', (database: Database.Database) => { database.prepare("UPDATE memory_fts SET title='forged title' WHERE rowid=(SELECT min(rowid) FROM memory_fts)").run(); }],
    ['FTS content', (database: Database.Database) => { database.prepare("UPDATE memory_fts SET content='forged content' WHERE rowid=(SELECT min(rowid) FROM memory_fts)").run(); }],
    ['FTS topic', (database: Database.Database) => { database.prepare("UPDATE memory_fts SET topic_key='forged/topic' WHERE rowid=(SELECT min(rowid) FROM memory_fts)").run(); }],
  ] as Array<[string, (database: Database.Database) => void]>)('rejects %s corruption during candidate verification', (_label, corrupt) => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-corrupt-'));
    const source = join(root, 'legacy.sqlite');
    const target = join(root, 'memory.sqlite');
    const candidate = join(root, 'candidate.sqlite');
    createLegacy(source);
    createTarget(target);
    const plan = planLegacyImport({ sourcePath: source, targetPath: target });
    const targetDatabase = new Database(target, { readonly: true });
    const baseline = currentBaselineManifest(targetDatabase);
    const baseCounts = databaseCounts(targetDatabase);
    targetDatabase.close();
    copyFileSync(target, candidate);
    const written = writeLegacyImportCandidate({ candidatePath: candidate, plan, importedAt: '2026-09-02T12:00:00.000Z' });
    try {
      const database = new Database(candidate);
      try { corrupt(database); }
      finally { database.close(); }
      expect(() => verifyImportedDatabase({ path: candidate, plan, importId: written.importId, baseline, baseCounts })).toThrow(/integrity verification failed/i);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe('legacy import apply and publication', () => {
  it('namespaces overlapping imported sessions by source and replays each exact plan with zero delta', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-overlapping-sessions-'));
    const firstSource = join(root, 'legacy-first.sqlite');
    const secondSource = join(root, 'legacy-second.sqlite');
    const target = join(root, 'memory.sqlite');
    createSingleSessionLegacy(firstSource, 'First independent source');
    createSingleSessionLegacy(secondSource, 'Second independent source');
    createTarget(target);
    try {
      const firstPlan = planLegacyImport({ sourcePath: firstSource, targetPath: target });
      const first = await applyLegacyImport({ plan: firstPlan, startedAt: '2026-09-02T12:00:00.000Z' });
      const secondPlan = planLegacyImport({ sourcePath: secondSource, targetPath: target });
      const second = await applyLegacyImport({ plan: secondPlan, startedAt: '2026-09-02T11:00:00.000Z' });

      const database = new Database(target, { readonly: true });
      const sessions = database.prepare("SELECT import_id,session_id FROM legacy_import_rows WHERE source_entity='session' ORDER BY import_id").all() as Array<{ import_id: string; session_id: string }>;
      const cohorts = database.prepare('SELECT import_id,cohort_sequence FROM legacy_import_cohorts ORDER BY cohort_sequence').all() as Array<{ import_id: string; cohort_sequence: number }>;
      database.close();
      expect(sessions).toHaveLength(2);
      expect(new Set(sessions.map((row) => row.session_id)).size).toBe(2);
      expect(cohorts).toEqual([
        { import_id: first.importId, cohort_sequence: 1 },
        { import_id: second.importId, cohort_sequence: 2 },
      ]);
      expect((await applyLegacyImport({ plan: firstPlan, startedAt: '2026-09-02T14:00:00.000Z' }))).toMatchObject({ importId: first.importId, duplicate: true, rowDelta: { projects: 0, sessions: 0, evidence: 0, memories: 0, memoryEvidence: 0, fts: 0, receipts: 0 } });
      expect((await applyLegacyImport({ plan: secondPlan, startedAt: '2026-09-02T15:00:00.000Z' }))).toMatchObject({ importId: second.importId, duplicate: true, rowDelta: { projects: 0, sessions: 0, evidence: 0, memories: 0, memoryEvidence: 0, fts: 0, receipts: 0 } });
      const replayed = new Database(target, { readonly: true });
      try {
        expect(replayed.prepare('SELECT import_id,cohort_sequence FROM legacy_import_cohorts ORDER BY cohort_sequence').all()).toEqual(cohorts);
      } finally { replayed.close(); }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('preserves every populated current baseline family exactly', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-full-baseline-'));
    const source = join(root, 'legacy.sqlite');
    const target = join(root, 'memory.sqlite');
    createLegacy(source);
    createTarget(target);
    populateCurrentBaseline(target);
    const beforeDatabase = new Database(target, { readonly: true });
    const before = currentBaselineManifest(beforeDatabase);
    beforeDatabase.close();
    expect(Object.entries(before).filter(([, rows]) => rows.length === 0)).toEqual([]);
    const plan = planLegacyImport({ sourcePath: source, targetPath: target });
    try {
      expect((await applyLegacyImport({ plan, startedAt: '2026-09-02T12:00:00.000Z' })).integrity.baselinePreserved).toBe(true);
      const afterDatabase = new Database(target, { readonly: true });
      const after = currentBaselineManifest(afterDatabase);
      afterDatabase.close();
      for (const [table, rows] of Object.entries(before)) expect(after[table]).toEqual(expect.arrayContaining(rows));
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('revalidates the observed target at the publication boundary', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-publication-boundary-'));
    const source = join(root, 'legacy.sqlite');
    const target = join(root, 'memory.sqlite');
    createLegacy(source);
    createTarget(target);
    const plan = planLegacyImport({ sourcePath: source, targetPath: target });
    const artifacts = allocateImportArtifacts(plan);
    try {
      await createVerifiedTargetBackup(plan, artifacts);
      cloneBackupToCandidate(artifacts);
      writeLegacyImportCandidate({ candidatePath: artifacts.candidatePath, plan, importedAt: '2026-09-02T12:00:00.000Z' });
      closeCandidateForPublication(artifacts.candidatePath);

      const mutated = new Database(target);
      mutated.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('late-project', 'late-project', 'Late project', null, '2026-09-02T12:00:01.000Z', '2026-09-02T12:00:01.000Z');
      mutated.close();
      const changedTarget = sha256(target);

      expect(() => publishCandidate(plan, artifacts)).toThrow(/bound import plan/i);
      expect(sha256(target)).toBe(changedTarget);
      expect(existsSync(artifacts.candidatePath)).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('publishes a verified candidate while retaining verified recovery artifacts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-apply-'));
    const source = join(root, 'legacy.sqlite');
    const target = join(root, 'memory.sqlite');
    createLegacy(source);
    createTarget(target);
    const plan = planLegacyImport({ sourcePath: source, targetPath: target });
    const sourceBefore = sha256(source);
    try {
      const report = await applyLegacyImport({ plan, startedAt: '2026-09-02T12:00:00.000Z' });

      expect(report).toMatchObject({
        schema: 'thoth-mem.import.report.v3', version: 3, committed: true, duplicate: false,
        planHash: plan.planHash, importId: expect.any(String),
        integrity: { schemaRevision: true, baselinePreserved: true, receiptClosure: true, temporalLineage: true, provenance: true, foreignKeys: true, sqlite: true, fts: true, sourceUnchanged: true, targetBaseUnchanged: true },
        artifacts: { backupPath: expect.any(String), recoveryBundlePath: expect.any(String), candidateCleaned: true },
      });
      expect(sha256(source)).toBe(sourceBefore);
      expect(existsSync(report.artifacts.backupPath!)).toBe(true);
      expect(existsSync(report.artifacts.recoveryBundlePath!)).toBe(true);
      const published = new Database(target, { readonly: true, fileMustExist: true });
      try {
        expect(published.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
        expect(published.prepare('SELECT count(*) AS count FROM legacy_imports WHERE id=?').get(report.importId)).toEqual({ count: 1 });
      } finally { published.close(); }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('replays the exact committed plan with stable IDs and zero row delta', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-replay-'));
    const source = join(root, 'legacy.sqlite');
    const target = join(root, 'memory.sqlite');
    createLegacy(source);
    createTarget(target);
    const plan = planLegacyImport({ sourcePath: source, targetPath: target });
    try {
      const first = await applyLegacyImport({ plan, startedAt: '2026-09-02T12:00:00.000Z' });
      const before = new Database(target, { readonly: true });
      const countsBefore = before.prepare('SELECT (SELECT count(*) FROM projects) projects,(SELECT count(*) FROM sessions) sessions,(SELECT count(*) FROM evidence) evidence,(SELECT count(*) FROM memories) memories,(SELECT count(*) FROM memory_fts) fts').get();
      before.close();

      const replay = await applyLegacyImport({ plan, startedAt: '2026-09-02T13:00:00.000Z' });

      expect(replay).toMatchObject({ committed: true, duplicate: true, importId: first.importId, rowDelta: { projects: 0, sessions: 0, evidence: 0, memories: 0, memoryEvidence: 0, fts: 0, receipts: 0 } });
      const after = new Database(target, { readonly: true });
      expect(after.prepare('SELECT (SELECT count(*) FROM projects) projects,(SELECT count(*) FROM sessions) sessions,(SELECT count(*) FROM evidence) evidence,(SELECT count(*) FROM memories) memories,(SELECT count(*) FROM memory_fts) fts').get()).toEqual(countsBefore);
      after.close();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('fails closed on changed source and restores the prior bundle after an injected publication failure', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-failure-'));
    const source = join(root, 'legacy.sqlite');
    const target = join(root, 'memory.sqlite');
    createLegacy(source);
    createTarget(target);
    const stalePlan = planLegacyImport({ sourcePath: source, targetPath: target });
    const sourceDb = new Database(source);
    sourceDb.prepare("UPDATE sessions SET summary='changed' WHERE id='s-alpha'").run();
    sourceDb.close();
    const targetBefore = sha256(target);
    try {
      await expect(applyLegacyImport({ plan: stalePlan, startedAt: '2026-09-02T12:00:00.000Z' })).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
      expect(sha256(target)).toBe(targetBefore);

      const freshPlan = planLegacyImport({ sourcePath: source, targetPath: target });
      let failure: LegacyImportFailure | null = null;
      try { await applyLegacyImport({ plan: freshPlan, startedAt: '2026-09-02T13:00:00.000Z', injectFailure: 'after-target-move' }); }
      catch (error) { failure = error as LegacyImportFailure; }
      expect(failure).toMatchObject({ code: 'PUBLICATION_FAILED', report: { committed: false, failure: { priorTargetRestored: true } } });
      expect(sha256(target)).toBe(targetBefore);

      const retryPlan = planLegacyImport({ sourcePath: source, targetPath: target });
      failure = null;
      try { await applyLegacyImport({ plan: retryPlan, startedAt: '2026-09-02T14:00:00.000Z', injectFailure: 'before-reopen-verification' }); }
      catch (error) { failure = error as LegacyImportFailure; }
      expect(failure).toMatchObject({ code: 'INTEGRITY_FAILED', report: { committed: false, failure: { priorTargetRestored: true } } });
      expect(sha256(target)).toBe(targetBefore);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('publishes into an absent target and rejects a locked existing target without changing it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-absent-locked-'));
    const source = join(root, 'legacy.sqlite');
    const absentTarget = join(root, 'absent.sqlite');
    const lockedTarget = join(root, 'locked.sqlite');
    createLegacy(source);
    try {
      const absentPlan = planLegacyImport({ sourcePath: source, targetPath: absentTarget });
      expect((await applyLegacyImport({ plan: absentPlan, startedAt: '2026-09-02T12:00:00.000Z' })).committed).toBe(true);
      expect(existsSync(absentTarget)).toBe(true);

      createTarget(lockedTarget);
      const lockedPlan = planLegacyImport({ sourcePath: source, targetPath: lockedTarget });
      const targetBefore = sha256(lockedTarget);
      const lock = new Database(lockedTarget);
      lock.exec('BEGIN EXCLUSIVE');
      try {
        await expect(applyLegacyImport({ plan: lockedPlan, startedAt: '2026-09-02T13:00:00.000Z' })).rejects.toMatchObject({ code: 'TARGET_LOCKED' });
      } finally { lock.exec('ROLLBACK'); lock.close(); }
      expect(sha256(lockedTarget)).toBe(targetBefore);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('rejects exact replay when a durable child receipt was tampered', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-replay-tamper-'));
    const source = join(root, 'legacy.sqlite');
    const target = join(root, 'memory.sqlite');
    createLegacy(source);
    createTarget(target);
    const plan = planLegacyImport({ sourcePath: source, targetPath: target });
    try {
      const first = await applyLegacyImport({ plan, startedAt: '2026-09-02T12:00:00.000Z' });
      const database = new Database(target);
      database.exec('DROP TRIGGER legacy_import_rows_immutable_update');
      database.prepare("UPDATE legacy_import_rows SET source_hash=? WHERE import_id=? AND source_entity='session' LIMIT 1").run('0'.repeat(64), first.importId);
      database.close();
      await expect(applyLegacyImport({ plan, startedAt: '2026-09-02T13:00:00.000Z' })).rejects.toMatchObject({ code: 'PLAN_STALE' });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
