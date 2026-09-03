import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { MemoryService } from '../../src/memory-core/service.js';

function saveMemory(service: MemoryService, projectKey: string, eventKey: string, capturedAt: string, title: string, topicKey: string) {
  return service.save({
    project: { key: projectKey, name: projectKey },
    eventKey,
    evidence: { kind: 'explicit_save', content: `Evidence for ${title}`, capturedAt },
    memory: { kind: 'decision', title, content: `Content for ${title}`, topicKey, outcome: 'succeeded' },
  }).memory!;
}

describe('promoted-memory timeline', () => {
  it('lists only the exact project in deterministic reverse-validity order across temporal statuses', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const superseded = saveMemory(service, 'repo:timeline', 'old', '2026-01-01T00:00:00.000Z', 'Superseded', 'decision/shared');
      const current = saveMemory(service, 'repo:timeline', 'new', '2026-01-03T00:00:00.000Z', 'Current', 'decision/shared');
      const tiedA = saveMemory(service, 'repo:timeline', 'tie-a', '2026-01-02T00:00:00.000Z', 'Tie A', 'decision/tie-a');
      const tiedB = saveMemory(service, 'repo:timeline', 'tie-b', '2026-01-02T00:00:00.000Z', 'Tie B', 'decision/tie-b');
      const retracted = saveMemory(service, 'repo:timeline', 'retracted', '2025-12-31T00:00:00.000Z', 'Retracted', 'decision/retracted');
      service.retract({ id: retracted.id, evidence: { kind: 'explicit_save', content: 'Retract it', capturedAt: '2026-01-04T00:00:00.000Z' } });
      saveMemory(service, 'repo:other', 'foreign', '2027-01-01T00:00:00.000Z', 'Foreign secret', 'decision/foreign');

      const result = service.timeline({ projectKey: 'repo:timeline', limit: 100, budgetChars: 20_000 });
      const tied = [tiedA, tiedB].sort((left, right) => left.id.localeCompare(right.id));

      expect(result.items.map((item) => [item.id, item.status])).toEqual([
        [current.id, 'current'],
        ...tied.map((item) => [item.id, 'current']),
        [superseded.id, 'superseded'],
        [retracted.id, 'retracted'],
      ]);
      expect(result.items.map((item) => item.title)).not.toContain('Foreign secret');
      expect(result).toMatchObject({ hasMore: false, nextCursor: null });
    } finally {
      service.close();
    }
  });

  it('normalizes inclusive bounds and traverses tied and backdated historical rows exactly once', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-timeline-'));
    const databasePath = join(root, 'memory.sqlite');
    const writer = new MemoryService({ databasePath });
    const newest = saveMemory(writer, 'repo:paged', 'newest', '2026-01-04T00:00:00.000Z', 'Newest', 'page/newest');
    const tiedA = saveMemory(writer, 'repo:paged', 'tie-a', '2026-01-03T00:00:00.000Z', 'Tie A', 'page/tie-a');
    const tiedB = saveMemory(writer, 'repo:paged', 'tie-b', '2026-01-03T01:00:00+01:00', 'Tie B', 'page/tie-b');
    const backdated = saveMemory(writer, 'repo:paged', 'imported', '2026-01-01T00:00:00.000Z', 'Imported historical', 'page/imported');
    saveMemory(writer, 'repo:paged', 'too-old', '2025-12-31T23:59:59.999Z', 'Too old', 'page/old');
    writer.close();
    const database = new Database(databasePath);
    database.prepare("UPDATE memories SET status='historical' WHERE id=?").run(backdated.id);
    database.close();

    const service = new MemoryService({ databasePath, readonly: true });
    try {
      const expected = [newest, ...[tiedA, tiedB].sort((left, right) => left.id.localeCompare(right.id)), backdated].map((item) => item.id);
      const first = service.timeline({
        projectKey: 'repo:paged',
        since: '2026-01-01T01:00:00+01:00',
        until: '2026-01-04T00:00:00Z',
        limit: 2,
        budgetChars: 20_000,
      });
      const second = service.timeline({
        projectKey: 'repo:paged',
        since: '2026-01-01T00:00:00.000Z',
        until: '2026-01-04T00:00:00.000Z',
        cursor: first.nextCursor!,
        limit: 2,
        budgetChars: 20_000,
      });

      expect(first.hasMore).toBe(true);
      expect(first.nextCursor).toEqual(expect.any(String));
      expect([...first.items, ...second.items].map((item) => item.id)).toEqual(expected);
      expect(second).toMatchObject({ hasMore: false, nextCursor: null });
      expect(second.items.at(-1)?.status).toBe('historical');
    } finally {
      service.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps live keyset traversal stable when backdated memories arrive between pages', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const newest = saveMemory(service, 'repo:live', 'newest', '2026-04-05T00:00:00.000Z', 'Newest', 'live/newest');
      const anchor = saveMemory(service, 'repo:live', 'anchor', '2026-04-04T00:00:00.000Z', 'Cursor anchor', 'live/anchor');
      const oldest = saveMemory(service, 'repo:live', 'oldest', '2026-04-01T00:00:00.000Z', 'Oldest', 'live/oldest');
      const first = service.timeline({ projectKey: 'repo:live', limit: 2, budgetChars: 20_000 });

      const beforeCursor = saveMemory(service, 'repo:live', 'before-cursor', '2026-04-04T12:00:00.000Z', 'Before cursor', 'live/before');
      const afterCursor = saveMemory(service, 'repo:live', 'after-cursor', '2026-04-03T00:00:00.000Z', 'After cursor', 'live/after');
      const second = service.timeline({ projectKey: 'repo:live', cursor: first.nextCursor!, limit: 100, budgetChars: 20_000 });
      const traversed = [...first.items, ...second.items].map((item) => item.id);

      expect(first.items.map((item) => item.id)).toEqual([newest.id, anchor.id]);
      expect(second.items.map((item) => item.id)).toEqual([afterCursor.id, oldest.id]);
      expect(traversed).toEqual([newest.id, anchor.id, afterCursor.id, oldest.id]);
      expect(new Set(traversed).size).toBe(4);
      expect(second).toMatchObject({ hasMore: false, nextCursor: null });

      const fresh = service.timeline({ projectKey: 'repo:live', limit: 100, budgetChars: 20_000 });
      expect(fresh.items.map((item) => item.id)).toEqual([newest.id, beforeCursor.id, anchor.id, afterCursor.id, oldest.id]);
    } finally {
      service.close();
    }
  });

  it('clips Unicode safely and makes cursor progress under the minimum aggregate character budget', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const expected: string[] = [];
      for (let index = 0; index < 8; index += 1) {
        expected.push(saveMemory(
          service,
          'repo:budget',
          `budget-${index}`,
          `2026-02-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
          `😀${'T'.repeat(200)}-${index}`,
          `😀${'K'.repeat(200)}-${index}`,
        ).id);
      }

      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = service.timeline({ projectKey: 'repo:budget', cursor, limit: 100, budgetChars: 1 });
        expect(page.requestedChars).toBe(1_024);
        expect(page.returnedChars).toBeLessThanOrEqual(page.requestedChars);
        expect(page.items.length).toBeGreaterThan(0);
        for (const item of page.items) {
          expect(Array.from(item.title).length).toBeLessThanOrEqual(64);
          expect(Array.from(item.topicKey ?? '').length).toBeLessThanOrEqual(64);
          expect(Array.from(item.snippet).length).toBeLessThanOrEqual(160);
          expect(JSON.stringify(item)).not.toContain('�');
          seen.push(item.id);
        }
        cursor = page.nextCursor ?? undefined;
        expect(page.hasMore).toBe(Boolean(cursor));
      } while (cursor);

      expect(seen).toEqual([...expected].reverse());
      expect(new Set(seen).size).toBe(expected.length);
    } finally {
      service.close();
    }
  });

  it('rejects invalid bounds and cursors at the service seam without creating projects', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      saveMemory(service, 'repo:cursor-a', 'a-1', '2026-03-02T00:00:00.000Z', 'A1', 'cursor/a1');
      saveMemory(service, 'repo:cursor-a', 'a-2', '2026-03-01T00:00:00.000Z', 'A2', 'cursor/a2');
      saveMemory(service, 'repo:cursor-b', 'b-1', '2026-03-01T00:00:00.000Z', 'B1', 'cursor/b1');
      const cursor = service.timeline({ projectKey: 'repo:cursor-a', limit: 1 }).nextCursor!;
      const before = service.listProjects();

      expect(() => service.timeline({ projectKey: 'repo:cursor-a', since: 'not-a-time' })).toThrow(/ISO-8601/iu);
      expect(() => service.timeline({ projectKey: 'repo:cursor-a', since: '2026-03-02T00:00:00Z', until: '2026-03-01T00:00:00Z' })).toThrow(/since/iu);
      expect(() => service.timeline({ projectKey: 'repo:cursor-a', cursor: 'not+a+base64url+cursor' })).toThrow(/cursor/iu);
      expect(() => service.timeline({ projectKey: 'repo:cursor-b', cursor })).toThrow(/cursor.*project/iu);
      expect(() => service.timeline({ projectKey: 'repo:cursor-a', cursor, since: '2026-01-01T00:00:00Z' })).toThrow(/cursor.*time range/iu);
      expect(service.timeline({ projectKey: 'repo:unknown' })).toEqual({ items: [], nextCursor: null, hasMore: false, requestedChars: 4_000, returnedChars: 0 });
      expect(service.listProjects()).toEqual(before);
    } finally {
      service.close();
    }
  });

  it('rejects canonical base64url cursors with unsupported or malformed payloads', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      saveMemory(service, 'repo:cursor-shape', 'shape-1', '2026-05-02T00:00:00.000Z', 'Shape 1', 'cursor/shape-1');
      saveMemory(service, 'repo:cursor-shape', 'shape-2', '2026-05-01T00:00:00.000Z', 'Shape 2', 'cursor/shape-2');
      const cursor = service.timeline({ projectKey: 'repo:cursor-shape', limit: 1 }).nextCursor!;
      const payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<string, unknown>;
      const corruptedPayloads = [
        { label: 'unsupported version', value: { ...payload, v: 2 } },
        { label: 'extra key', value: { ...payload, unexpected: true } },
        { label: 'empty project ID', value: { ...payload, projectId: '' } },
        { label: 'empty last ID', value: { ...payload, lastId: '' } },
        { label: 'empty cursor position', value: { ...payload, lastValidFrom: '' } },
      ];
      const before = service.listProjects();

      for (const corrupted of corruptedPayloads) {
        const encoded = Buffer.from(JSON.stringify(corrupted.value), 'utf8').toString('base64url');
        expect(() => service.timeline({ projectKey: 'repo:cursor-shape', cursor: encoded }), corrupted.label).toThrow(/cursor/iu);
      }
      expect(service.listProjects()).toEqual(before);
    } finally {
      service.close();
    }
  });
});
