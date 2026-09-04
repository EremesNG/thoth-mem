import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { observationFromId, rebuildObservationProjection } from '../../src/memory-core/observations.js';
import { MemoryService } from '../../src/memory-core/service.js';

describe('observation SQLite invariants', () => {
  it('blocks direct mutation and keeps the prior valid projection when canonical evidence is malformed', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-observation-schema-'));
    const path = join(root, 'memory.sqlite');
    const service = new MemoryService({ databasePath: path });
    let observationId = '';
    try {
      const project = { key: 'repo:schema', name: 'schema' };
      const source = service.save({ project, evidence: { kind: 'explicit_save', content: 'Valid support.' } });
      observationId = service.submitObservation({ project, eventKey: 'candidate', observation: {
        kind: 'fact', scope: 'project', title: 'Immutable candidate', claim: 'Candidates are immutable.',
        proposedMemory: { kind: 'architecture', title: 'Immutable candidate', content: 'Keep candidates immutable.' },
        supportIds: [source.evidence.id], generator: { kind: 'root_agent', name: 'codex' },
      } }).observation.id;
    } finally { service.close(); }

    const database = new Database(path);
    try {
      expect(() => database.prepare("UPDATE observations SET claim='forged' WHERE id=?").run(observationId)).toThrow(/immutable/i);
      expect(() => database.prepare('DELETE FROM observation_supports WHERE observation_id=?').run(observationId)).toThrow(/immutable/i);
      const projectId = (database.prepare('SELECT project_id FROM observations WHERE id=?').get(observationId) as { project_id: string }).project_id;
      database.prepare('INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?)').run('malformed-observation-evidence', projectId, null, 'observation', '{}', 'malformed-hash', null, '2026-08-29T00:00:00.000Z', '{}');
      expect(() => rebuildObservationProjection(database)).toThrow(/unsupported schema/i);
      expect(observationFromId(database, observationId)).toMatchObject({ id: observationId, state: 'pending' });
      expect(database.pragma('foreign_key_check')).toEqual([]);
    } finally {
      database.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
