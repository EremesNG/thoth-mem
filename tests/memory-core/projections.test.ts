import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { MemoryService } from '../../src/memory-core/service.js';

describe('optional projections', () => {
  it('reports disabled, pending, stale, rebuilding, degraded, and source-current readiness truthfully', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      for (const state of ['disabled','pending','rebuilding','degraded'] as const) service.projections.record({ projectionId: state, configHash: 'cfg', sourceWatermark: 0, state });
      service.projections.record({ projectionId: 'ready-current', configHash: 'cfg', sourceWatermark: 0, state: 'ready' });
      expect(service.projections.effectiveStates()).toMatchObject({ disabled: 'disabled', pending: 'pending', rebuilding: 'rebuilding', degraded: 'degraded', 'ready-current': 'ready' });
      service.save({ project: { key: 'repo:p', name: 'p' }, evidence: { kind: 'explicit_save', content: 'Lexical remains.' }, memory: { kind: 'decision', title: 'Lexical', content: 'Lexical remains.' } });
      expect(service.projections.effectiveStates()['ready-current']).toBe('stale');
    } finally { service.close(); }
  });

  it('deduplicates jobs and projection deletion/rebuild never changes lexical authority', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      service.save({ project: { key: 'repo:p', name: 'p' }, evidence: { kind: 'explicit_save', content: 'Authoritative lexical fact.' }, memory: { kind: 'architecture', title: 'Authority', content: 'Authoritative lexical fact.' } });
      const before = service.recall({ projectKey: 'repo:p', query: 'authoritative' }).items.map((item) => item.id);
      const watermark = service.projections.currentWatermark(); service.projections.record({ projectionId: 'fixture', configHash: 'one', sourceWatermark: watermark, state: 'ready' }); service.projections.record({ projectionId: 'fixture', configHash: 'one', sourceWatermark: watermark, state: 'ready' });
      expect(service.projections.list().filter((item) => item.projectionId === 'fixture')).toHaveLength(1);
      service.projections.delete('fixture'); expect(service.projections.list()).toEqual([]);
      service.projections.record({ projectionId: 'fixture', configHash: 'one', sourceWatermark: watermark, state: 'ready' });
      expect(service.recall({ projectKey: 'repo:p', query: 'authoritative' }).items.map((item) => item.id)).toEqual(before);
    } finally { service.close(); }
  });

  it('rebuilds stable source mappings to authoritative hash equivalence after deletion', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      for (const [title, content] of [['One', 'First authoritative source'], ['Two', 'Second authoritative source']]) service.save({ project: { key: 'repo:p', name: 'p' }, evidence: { kind: 'explicit_save', content }, memory: { kind: 'decision', title, content } });
      const first = service.projections.rebuild({ projectionId: 'semantic', configHash: 'cfg-v1' });
      expect(first).toMatchObject({ state: 'ready', duplicate: false, sourceCount: 2, checkpointWatermark: service.projections.currentWatermark() });
      expect(first.projectionHash).toBe(first.authoritativeHash);
      const mappings = service.projections.mappings('semantic');
      expect(mappings).toHaveLength(2);
      expect(mappings.map((item) => item.sourceId)).toEqual([...mappings.map((item) => item.sourceId)].sort());
      service.projections.delete('semantic');
      const rebuilt = service.projections.rebuild({ projectionId: 'semantic', configHash: 'cfg-v1' });
      expect(rebuilt).toMatchObject({ state: 'ready', sourceCount: 2, authoritativeHash: first.authoritativeHash, projectionHash: first.projectionHash });
      expect(service.projections.mappings('semantic')).toEqual(mappings);
    } finally { service.close(); }
  });

  it('converges interrupted duplicate jobs and refuses false readiness on config mismatch', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      for (let index = 0; index < 3; index++) service.save({ project: { key: 'repo:p', name: 'p' }, evidence: { kind: 'explicit_save', content: `source ${index}` }, memory: { kind: 'decision', title: `Source ${index}`, content: `source ${index}` } });
      const partial = service.projections.rebuild({ projectionId: 'semantic', configHash: 'cfg-v1', maxSources: 1 });
      expect(partial).toMatchObject({ state: 'rebuilding', sourceCount: 1 });
      expect(service.projections.effectiveStates().semantic).toBe('rebuilding');
      const complete = service.projections.rebuild({ projectionId: 'semantic', configHash: 'cfg-v1' });
      expect(complete).toMatchObject({ state: 'ready', sourceCount: 3, duplicate: false });
      expect(service.projections.rebuild({ projectionId: 'semantic', configHash: 'cfg-v1' })).toMatchObject({ state: 'ready', duplicate: true, sourceCount: 3 });
      expect(service.projections.ensureConfiguration('semantic', 'cfg-changed')).toBe('stale');
      expect(service.projections.effectiveStates().semantic).toBe('stale');
    } finally { service.close(); }
  });

  it('heals a ready projection job whose registry finalization was interrupted on disk', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-projection-restart-')); const databasePath = join(root, 'memory.sqlite');
    try {
      const initial = new MemoryService({ databasePath });
      let authoritativeHash: string;
      let projectionHash: string;
      let checkpointWatermark: number;
      try {
        for (const [title, content] of [['One', 'First restart source'], ['Two', 'Second restart source']]) initial.save({ project: { key: 'repo:p', name: 'p' }, evidence: { kind: 'explicit_save', content }, memory: { kind: 'decision', title, content } });
        const completed = initial.projections.rebuild({ projectionId: 'semantic', configHash: 'cfg-v1' });
        ({ authoritativeHash, projectionHash, checkpointWatermark } = completed);
      } finally { initial.close(); }

      for (const mutation of [
        "UPDATE projection_state SET state='rebuilding' WHERE projection_id='semantic'",
        "DELETE FROM projection_state WHERE projection_id='semantic'",
        "UPDATE projection_state SET config_hash='cfg-other',source_watermark=0,state='stale' WHERE projection_id='semantic'",
      ]) {
        const fault = new Database(databasePath);
        try { fault.prepare(mutation).run(); }
        finally { fault.close(); }

        const restarted = new MemoryService({ databasePath });
        try {
          const retry = restarted.projections.rebuild({ projectionId: 'semantic', configHash: 'cfg-v1' });
          expect(retry).toMatchObject({ state: 'ready', duplicate: true, checkpointWatermark, authoritativeHash, projectionHash });
          expect(retry.projectionHash).toBe(retry.authoritativeHash);
          expect(restarted.projections.effectiveStates().semantic).toBe('ready');
          expect(restarted.projections.list()).toContainEqual(expect.objectContaining({ projectionId: 'semantic', configHash: 'cfg-v1', sourceWatermark: checkpointWatermark, state: 'ready' }));
        } finally { restarted.close(); }
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('rolls back job readiness when registry publication fails', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-projection-atomic-')); const databasePath = join(root, 'memory.sqlite');
    try {
      const initial = new MemoryService({ databasePath });
      try {
        for (const [title, content] of [['One', 'First atomic source'], ['Two', 'Second atomic source']]) initial.save({ project: { key: 'repo:p', name: 'p' }, evidence: { kind: 'explicit_save', content }, memory: { kind: 'decision', title, content } });
        expect(initial.projections.rebuild({ projectionId: 'semantic', configHash: 'cfg-v1', maxSources: 1 })).toMatchObject({ state: 'rebuilding', sourceCount: 1 });
      } finally { initial.close(); }

      const fault = new Database(databasePath);
      try { fault.exec("CREATE TRIGGER fail_projection_ready BEFORE UPDATE ON projection_state WHEN NEW.state='ready' BEGIN SELECT RAISE(ABORT,'simulated projection publication crash'); END"); }
      finally { fault.close(); }

      const interrupted = new MemoryService({ databasePath });
      try { expect(() => interrupted.projections.rebuild({ projectionId: 'semantic', configHash: 'cfg-v1' })).toThrow('simulated projection publication crash'); }
      finally { interrupted.close(); }

      const repair = new Database(databasePath);
      try { repair.exec('DROP TRIGGER fail_projection_ready'); }
      finally { repair.close(); }

      const restarted = new MemoryService({ databasePath });
      try {
        const retry = restarted.projections.rebuild({ projectionId: 'semantic', configHash: 'cfg-v1' });
        expect(retry).toMatchObject({ state: 'ready', duplicate: false, sourceCount: 2 });
        expect(retry.projectionHash).toBe(retry.authoritativeHash);
        expect(restarted.projections.effectiveStates().semantic).toBe('ready');
      } finally { restarted.close(); }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
