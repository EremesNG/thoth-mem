import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runCli } from '../src/cli.js';
import { MemoryService } from '../src/memory-core/service.js';

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(): { root: string; path: string } {
  const root = mkdtempSync(join(tmpdir(), 'thoth-adoption-')); roots.push(root);
  const path = join(root, 'memory.sqlite');
  new MemoryService({ databasePath: path }).close();
  const db = new Database(path);
  try {
    db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('p1', 'exact-one', 'Same name', null, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('p2', 'exact-two', 'Same name', null, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    db.prepare('INSERT INTO project_aliases VALUES(?,?,?,?,?)').run('alias-one', 'p1', 'path', '2026-01-01', '2026-01-01');
    const insert = db.prepare("INSERT INTO memories(id,project_id,topic_key,kind,title,content,outcome,status,valid_from,invalid_at,supersedes_id,created_at) VALUES(?,?,?,?,'Title','Content','succeeded',?,'2026-01-01T00:00:00.000Z',NULL,?,'2026-01-01T00:00:00.000Z')");
    insert.run('replaced', 'p1', 'handoff/work', 'handoff', 'superseded', null);
    insert.run('open', 'p1', 'handoff/work', 'handoff', 'current', 'replaced');
    insert.run('closed', 'p1', 'handoff/done', 'handoff', 'superseded', null);
    insert.run('outcome', 'p1', 'handoff/done', 'decision', 'current', 'closed');
    insert.run('other-open', 'p2', 'handoff/work', 'handoff', 'current', null);
  } finally { db.close(); }
  return { root, path };
}

async function cli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = ''; let stderr = '';
  const out = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => { stdout += String(chunk); return true; });
  const err = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => { stderr += String(chunk); return true; });
  try { return { code: await runCli(args), stdout, stderr }; }
  finally { out.mockRestore(); err.mockRestore(); }
}

describe('read-only adoption baseline', () => {
  it('counts distinct session-attributed agent saves only, retaining sessions with zero saves', () => {
    const { path } = fixture();
    const db = new Database(path);
    try {
      const session = db.prepare("INSERT INTO sessions(id,project_id,root_session_key,harness,started_at) VALUES(?,?,?,'cli','2026-01-01')");
      session.run('s1', 'p1', 'root-one'); session.run('s0', 'p1', 'zero'); session.run('s2', 'p2', 'root-two');
      const evidence = db.prepare("INSERT INTO evidence VALUES(?,?,?,?,?,'hash',NULL,'2026-01-01','{}')");
      const event = db.prepare("INSERT INTO session_events VALUES(?,?,?,?,'root_user','project','standard')");
      const cases = [
        ['save', 'explicit_save', 'agent'], ['handoff-save', 'handoff', 'agent'],
        ['prompt', 'root_prompt', 'user'], ['checkpoint', 'checkpoint', 'agent'],
        ['summary', 'session_summary', 'agent'], ['legacy', 'legacy_observation', 'agent'],
        ['user-save', 'explicit_save', 'user'], ['no-event', 'explicit_save', null],
      ];
      for (const [index, [id, kind, actor]] of cases.entries()) {
        evidence.run(id, 'p1', 's1', kind, 'Content');
        if (actor) event.run(id, 's1', index + 1, actor);
      }
      evidence.run('unattributed', 'p1', null, 'explicit_save', 'Content');
      evidence.run('other-save', 'p2', 's2', 'explicit_save', 'Content'); event.run('other-save', 's2', 1, 'agent');
      // Two receipt keys still refer to just one evidence id.
      db.prepare('INSERT INTO save_receipts VALUES(?,?,?,?,?)').run('p1', 'retry-one', 'hash', 'save', null);
      db.prepare('INSERT INTO save_receipts VALUES(?,?,?,?,?)').run('p1', 'retry-two', 'hash', 'save', null);
    } finally { db.close(); }
    const service = new MemoryService({ databasePath: path, readonly: true });
    try {
      expect(service.adoption('exact-one').sessions).toEqual({ count: 2, zeroSaves: 1, totalSaves: 2, perSession: [
        { sessionId: 's0', rootSessionKey: 'zero', harness: 'cli', saves: 0 },
        { sessionId: 's1', rootSessionKey: 'root-one', harness: 'cli', saves: 2 },
      ] });
      expect(service.adoption('exact-two').sessions.totalSaves).toBe(1);
    } finally { service.close(); }
  });

  it('prints versioned JSON and compact human metrics without changing database bytes or schema', async () => {
    const { root, path } = fixture();
    const before = readFileSync(path);
    const schema = () => {
      const db = new Database(path, { readonly: true, fileMustExist: true });
      try { return db.prepare('SELECT * FROM sqlite_master ORDER BY name').all(); } finally { db.close(); }
    };
    const beforeSchema = schema();
    const json = await cli(['adoption', '--project=exact-one', '--data-dir', root, '--json']);
    expect(json.code, json.stderr).toBe(0);
    expect(JSON.parse(json.stdout)).toMatchObject({ schema: 'thoth-mem.adoption.v1', data: {
      project: { key: 'exact-one' }, asOf: expect.any(String), recallUsage: 'not measured',
      handoffs: { open: 1, replaced: 1, closed: 1, openAges: [{ memoryId: 'open', ageSeconds: expect.any(Number) }] },
      sessions: { count: 0, zeroSaves: 0, totalSaves: 0, perSession: [] },
    } });
    const human = await cli(['adoption', '--project', 'exact-one', '--data-dir', root]);
    expect(human.code, human.stderr).toBe(0);
    expect(human.stdout).toContain('Handoffs: open=1; replaced=1; closed=1');
    expect(human.stdout).toContain('age=');
    expect(human.stdout).toContain('Recall usage is not measured.');
    expect(readFileSync(path)).toEqual(before);
    expect(schema()).toEqual(beforeSchema);
  });

  it('fails clearly for missing databases and unknown projects without creating a database', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-adoption-missing-')); roots.push(root);
    const missingDir = join(root, 'not-created');
    const missing = await cli(['adoption', '--project', 'exact-one', '--data-dir', missingDir]);
    expect(missing.code).toBe(1); expect(missing.stderr).toContain('database does not exist');
    expect(existsSync(missingDir)).toBe(false);
    const seeded = fixture();
    const unknown = await cli(['adoption', '--project', 'missing-key', '--data-dir', seeded.root]);
    expect(unknown.code).toBe(1); expect(unknown.stderr).toContain('Project selector did not match a project');
  });

  it('advertises adoption and rejects missing, duplicate, or unknown options before opening storage', async () => {
    expect((await cli(['--help'])).stdout).toContain('adoption --project <exact-key-or-alias>');
    for (const args of [[], ['--project'], ['--project', 'x', '--project=x'], ['--project=x', '--json', '--json'], ['--project=x', '--unknown'], ['--project=x', '--json=true']]) {
      expect((await cli(['adoption', ...args])).code).toBe(2);
    }
  });

  it('counts an explicitly superseded handoff as replaced when its handoff successor changes topic', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-adoption-cross-topic-')); roots.push(root);
    const service = new MemoryService({ databasePath: join(root, 'memory.sqlite') });
    const project = { key: 'cross-topic', name: 'Cross-topic' };
    try {
      const old = service.save({
        project,
        evidence: { kind: 'handoff', content: 'Continue the old workstream.' },
        memory: { kind: 'handoff', title: 'Old handoff', content: 'Continue the old workstream.', topicKey: 'handoff/old' },
      }).memory!;
      const next = service.save({
        project,
        evidence: { kind: 'handoff', content: 'Continue under the new workstream.' },
        memory: { kind: 'handoff', title: 'New handoff', content: 'Continue under the new workstream.', topicKey: 'handoff/new', supersedesId: old.id },
      }).memory!;
      expect(service.adoption(project.key).handoffs).toMatchObject({
        replaced: 1, open: 1, closed: 0, openAges: [{ memoryId: next.id, topicKey: 'handoff/new' }],
      });
    } finally { service.close(); }
  });

  it('does not count a cross-topic non-handoff successor as closing a handoff', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-adoption-cross-topic-')); roots.push(root);
    const service = new MemoryService({ databasePath: join(root, 'memory.sqlite') });
    const project = { key: 'cross-topic', name: 'Cross-topic' };
    try {
      const old = service.save({
        project,
        evidence: { kind: 'handoff', content: 'Continue the old workstream.' },
        memory: { kind: 'handoff', title: 'Old handoff', content: 'Continue the old workstream.', topicKey: 'handoff/old' },
      }).memory!;
      service.save({
        project,
        evidence: { kind: 'explicit_save', content: 'An outcome on another topic.' },
        memory: { kind: 'decision', title: 'Different topic', content: 'An outcome on another topic.', topicKey: 'handoff/new', supersedesId: old.id },
      });
      expect(service.adoption(project.key).handoffs).toEqual({ open: 0, replaced: 0, closed: 0, openAges: [] });
    } finally { service.close(); }
  });

  it('classifies handoffs by their immediate successor and reports open ages for an exact project or alias', () => {
    const { path } = fixture();
    const service = new MemoryService({ databasePath: path, readonly: true });
    try {
      const result = service.adoption('exact-one', new Date('2026-01-03T00:00:00.000Z'));
      expect(result.project.key).toBe('exact-one');
      expect(result.handoffs).toEqual({ open: 1, replaced: 1, closed: 1, openAges: [{ memoryId: 'open', topicKey: 'handoff/work', createdAt: '2026-01-01T00:00:00.000Z', ageSeconds: 172800 }] });
      expect(service.adoption('alias-one').project.key).toBe('exact-one');
      expect(service.adoption('exact-two').handoffs).toMatchObject({ open: 1, replaced: 0, closed: 0 });
      expect(() => service.adoption('Same name')).toThrow('Project selector did not match a project');
      expect(() => service.adoption('exact')).toThrow('Project selector did not match a project');
    } finally { service.close(); }
  });
});
