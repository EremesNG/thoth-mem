import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { MemoryService } from '../../src/memory-core/service.js';

const roots: string[] = [];

function service(): MemoryService {
  const root = mkdtempSync(join(tmpdir(), 'thoth-project-adoption-'));
  roots.push(root);
  return new MemoryService({ databasePath: join(root, 'memory.sqlite') });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('canonical project adoption', () => {
  it('adopts only the first matching path project and makes aliases win over shadowed rows', () => {
    const memory = service();
    try {
      const main = memory.save({
        project: { key: 'path:C:/repo', name: 'repo' },
        evidence: { kind: 'explicit_save', content: 'main evidence' },
        memory: { kind: 'decision', title: 'Main decision', content: 'main canonical content' },
      });
      const linked = memory.save({
        project: { key: 'path:C:/repo-worktree', name: 'repo-worktree' },
        evidence: { kind: 'explicit_save', content: 'linked evidence' },
        memory: { kind: 'decision', title: 'Linked decision', content: 'linked shadow content' },
      });

      const adopted = memory.save({
        project: {
          key: 'git:11111111-1111-4111-8111-111111111111',
          name: 'new hint ignored after adoption',
          aliases: ['path:C:/repo', 'path:C:/repo-worktree'],
        },
        evidence: { kind: 'explicit_save', content: 'post-adoption evidence' },
        memory: { kind: 'decision', title: 'Adopted decision', content: 'post adoption content' },
      });

      expect(adopted.projectId).toBe(main.projectId);
      expect(adopted.projectId).not.toBe(linked.projectId);
      expect(memory.recall({ projectKey: 'path:C:/repo-worktree', query: 'canonical' }).items.map((item) => item.title)).toContain('Main decision');
      expect(memory.recall({ projectKey: 'path:C:/repo-worktree', query: 'shadow' }).items).toEqual([]);
      expect(memory.listProjects()).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: main.projectId,
          key: 'git:11111111-1111-4111-8111-111111111111',
          name: 'repo',
          aliases: ['path:C:/repo', 'path:C:/repo-worktree'],
        }),
        expect.objectContaining({ id: linked.projectId, key: 'path:C:/repo-worktree', shadowed: true }),
      ]));
    } finally { memory.close(); }
  });

  it('renames display metadata idempotently without changing canonical identity or recall', () => {
    const memory = service();
    try {
      const saved = memory.save({
        project: { key: 'git:22222222-2222-4222-8222-222222222222', name: 'Before', aliases: ['path:C:/before'] },
        evidence: { kind: 'explicit_save', content: 'rename evidence' },
        memory: { kind: 'architecture', title: 'Stable identity', content: 'recall survives rename' },
      });
      const before = memory.recall({ projectKey: 'path:C:/before', query: 'survives' }).items;
      expect(memory.renameProject({ selector: 'path:C:/before', name: 'After' })).toEqual({
        projectId: saved.projectId,
        key: 'git:22222222-2222-4222-8222-222222222222',
        oldName: 'Before',
        newName: 'After',
        changed: true,
      });
      expect(memory.renameProject({ selector: 'git:22222222-2222-4222-8222-222222222222', name: 'After' }).changed).toBe(false);
      expect(memory.recall({ projectKey: 'path:C:/before', query: 'survives' }).items).toEqual(before);
      expect(memory.listProjects()).toContainEqual(expect.objectContaining({ key: 'git:22222222-2222-4222-8222-222222222222', name: 'After' }));
      expect(() => memory.renameProject({ selector: 'path:C:/before', name: ' bad\nname ' })).toThrow(/display name/i);
    } finally { memory.close(); }
  });

  it('rolls back adoption when an alias belongs to another canonical project', () => {
    const memory = service();
    try {
      const first = memory.save({ project: { key: 'git:33333333-3333-4333-8333-333333333333', name: 'First', aliases: ['path:C:/collision'] }, evidence: { kind: 'explicit_save', content: 'first' } });
      expect(() => memory.save({ project: { key: 'git:44444444-4444-4444-8444-444444444444', name: 'Second', aliases: ['path:C:/collision'] }, evidence: { kind: 'explicit_save', content: 'second' } })).toThrow(/alias.*another project/i);
      expect(memory.listProjects()).toHaveLength(1);
      expect(memory.listProjects()[0]).toMatchObject({ id: first.projectId, key: 'git:33333333-3333-4333-8333-333333333333' });
    } finally { memory.close(); }
  });

  it('preserves exact non-empty path aliases without trimming', () => {
    const memory = service();
    try {
      const exactAlias = 'path:C:/repository ';
      const canonical = memory.save({
        project: {
          key: 'git:55555555-5555-4555-8555-555555555555',
          name: 'Repository',
          aliases: [exactAlias],
        },
        evidence: { kind: 'explicit_save', content: 'exact alias evidence' },
        memory: { kind: 'discovery', title: 'Exact alias', content: 'trailing space remains part of the alias' },
      });

      expect(memory.listProjects()).toContainEqual(expect.objectContaining({ aliases: [exactAlias] }));
      expect(memory.recall({ projectKey: exactAlias, query: 'trailing space' }).items).toHaveLength(1);
      expect(memory.save({
        project: { key: exactAlias, name: 'Ignored alias hint' },
        evidence: { kind: 'explicit_save', content: 'save through exact alias' },
      }).projectId).toBe(canonical.projectId);
      expect(memory.lifecycle({
        operation: 'recover',
        harness: 'codex',
        project: { key: exactAlias, name: 'Ignored lifecycle alias hint' },
        rootSessionKey: 'exact-alias-session',
        eventKey: 'exact-alias-recover',
      }).projectKey).toBe('git:55555555-5555-4555-8555-555555555555');
      expect(memory.listProjects()).toHaveLength(1);
      expect(() => memory.save({
        project: { key: 'git:66666666-6666-4666-8666-666666666666', name: 'Invalid', aliases: ['   '] },
        evidence: { kind: 'explicit_save', content: 'invalid whitespace alias' },
      })).toThrow(/path alias is invalid/i);
    } finally { memory.close(); }
  });

  it('rejects unsafe project keys and aliases without committing project rows', () => {
    const memory = service();
    try {
      for (const unsafe of ['   ', 'path:C:/tab\tname', 'path:C:/escape\u001bname', 'path:C:/unit\u001fname', 'path:C:/line\nname', 'path:C:/nul\0name']) {
        expect(() => memory.save({
          project: { key: unsafe, name: 'Unsafe' },
          evidence: { kind: 'explicit_save', content: 'must not persist' },
        })).toThrow(/project identity/i);
        expect(() => memory.save({
          project: { key: 'git:88888888-8888-4888-8888-888888888888', name: 'Unsafe alias', aliases: [unsafe] },
          evidence: { kind: 'explicit_save', content: 'must not persist alias' },
        })).toThrow(/path alias is invalid/i);
      }
      expect(memory.listProjects()).toEqual([]);
    } finally { memory.close(); }
  });

  it('bounds alias inspection without limiting exact alias resolution', () => {
    const memory = service();
    try {
      const aliases = Array.from({ length: 260 }, (_, index) => `path:C:/alias-${String(index).padStart(3, '0')}`);
      memory.save({
        project: {
          key: 'git:99999999-9999-4999-8999-999999999999',
          name: 'Many aliases',
          aliases,
        },
        evidence: { kind: 'explicit_save', content: 'bounded alias evidence' },
        memory: { kind: 'discovery', title: 'Bounded aliases', content: 'all exact aliases continue to resolve' },
      });

      const project = memory.listProjects()[0]!;
      expect(project.aliases).toHaveLength(256);
      expect(project.aliases).toEqual(aliases.slice(0, 256));
      expect(project.aliasCount).toBe(260);
      expect(project.aliasesTruncated).toBe(true);
      expect(memory.recall({ projectKey: aliases[259]!, query: 'continue to resolve' }).items).toHaveLength(1);
    } finally { memory.close(); }
  });
});
