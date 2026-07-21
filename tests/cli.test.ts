import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/store/index.js';
import type { ExportData } from '../src/store/types.js';
import type { SetupResult } from '../src/setup/types.js';
import { runCli } from '../src/cli.js';
import { parseArgs, shouldRunCli } from '../src/index.js';
import { ALL_TOOLS } from '../src/tools/index.js';
import { VERSION } from '../src/version.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'thoth-mem-cli-'));
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function seedStore(dataDir: string): void {
  ensureDir(dataDir);
  const store = new Store(join(dataDir, 'thoth.db'));

  try {
    store.startSession('session-1', 'cli-project', '/workspace/cli-project');
    store.saveObservation({
      session_id: 'session-1',
      title: 'CLI saved observation',
      content: 'Searchable CLI content',
      type: 'manual',
      project: 'cli-project',
    });
    store.saveObservation({
      session_id: 'session-1',
      title: 'Second observation',
      content: 'Follow-up timeline content',
      type: 'bugfix',
      project: 'cli-project',
    });
    store.savePrompt('session-1', 'Remember CLI behavior', 'cli-project');
  } finally {
    store.close();
  }
}

function seedLargeContextStore(dataDir: string): string {
  ensureDir(dataDir);
  const store = new Store(join(dataDir, 'thoth.db'));
  const marker = 'CLI-CONTEXT-FULL-MARKER';

  try {
    store.startSession('large-context-session', 'cli-large-project', '/workspace/cli-large-project');
    for (let i = 0; i < 30; i++) {
      store.saveObservation({
        session_id: 'large-context-session',
        title: `Large CLI observation ${i}`,
        content: `${'cli context body '.repeat(220)}${marker}-${i}`,
        type: 'manual',
        project: 'cli-large-project',
      });
    }
  } finally {
    store.close();
  }

  return marker;
}

function clearGraphFacts(dataDir: string): void {
  const store = new Store(join(dataDir, 'thoth.db'));

  try {
    store.getDb().prepare("DELETE FROM kg_triples WHERE source_type = 'observation'").run();
  } finally {
    store.close();
  }
}

function seedPrunableGraph(dataDir: string, project = 'cli-project'): void {
  ensureDir(dataDir);
  const store = new Store(join(dataDir, 'thoth.db'));

  try {
    const db = store.getDb();
    const subject = db.prepare(
      `INSERT INTO kg_entities (entity_key, entity_type, canonical_name)
       VALUES (?, 'concept', ?)
       ON CONFLICT(entity_key) DO UPDATE SET updated_at = datetime('now')
       RETURNING id`
    ).get('prune:subject', 'Prune subject') as { id: number };
    db.prepare(
      `INSERT INTO kg_entities (entity_key, entity_type, canonical_name)
       VALUES (?, 'concept', ?)
       ON CONFLICT(entity_key) DO UPDATE SET updated_at = datetime('now')`
    ).run('prune:unrelated-orphan', 'Unrelated prune orphan');

    for (let index = 1; index <= 3; index++) {
      const object = db.prepare(
        `INSERT INTO kg_entities (entity_key, entity_type, canonical_name)
         VALUES (?, 'concept', ?)
         ON CONFLICT(entity_key) DO UPDATE SET updated_at = datetime('now')
         RETURNING id`
      ).get(`prune:object:${index}`, `Prune object ${index}`) as { id: number };
      db.prepare(
        `INSERT INTO kg_triples (
          subject_entity_id, relation, object_entity_id, source_type, source_id,
          project, provenance, confidence, triple_hash, extractor_version, superseded_at
        ) VALUES (?, 'HAS_WHAT', ?, 'observation', 9001, ?, 'test', 0.9, ?, 'test', ?)`
      ).run(subject.id, object.id, project, `prune:${index}`, `2026-01-0${index} 00:00:00`);
    }
  } finally {
    store.close();
  }
}

function seedCommunityGraph(dataDir: string, project = 'cli-community-project'): void {
  ensureDir(dataDir);
  const store = new Store(join(dataDir, 'thoth.db'));

  try {
    const db = store.getDb();
    db.prepare('INSERT INTO sessions (id, project) VALUES (?, ?) ON CONFLICT(id) DO NOTHING')
      .run(`${project}-session`, project);
    const source = db.prepare(
      `INSERT INTO observations (session_id, type, title, content, project, scope, normalized_hash, sync_id)
       VALUES (?, 'manual', ?, 'community source body', ?, 'project', ?, ?)`
    ).run(
      `${project}-session`,
      `${project} community source`,
      project,
      `${project}-community-hash`,
      `${project}-community-sync`,
    ).lastInsertRowid as number;
    const subject = db.prepare(
      `INSERT INTO kg_entities (entity_key, entity_type, canonical_name)
       VALUES (?, 'concept', ?) RETURNING id`
    ).get(`${project}:subject`, `${project} Subject`) as { id: number };
    const object = db.prepare(
      `INSERT INTO kg_entities (entity_key, entity_type, canonical_name)
       VALUES (?, 'concept', ?) RETURNING id`
    ).get(`${project}:object`, `${project} Object`) as { id: number };
    db.prepare(
      `INSERT INTO kg_triples (
        subject_entity_id, relation, object_entity_id, source_type, source_id,
        project, provenance, confidence, triple_hash
      ) VALUES (?, 'HAS_WHAT', ?, 'observation', ?, ?, '{}', 0.9, ?)`
    ).run(subject.id, object.id, source, project, `${project}:community-triple`);
  } finally {
    store.close();
  }
}

function seedDeleteProjectStore(dataDir: string): void {
  ensureDir(dataDir);
  const store = new Store(join(dataDir, 'thoth.db'));

  try {
    store.startSession('delete-session', 'delete-me', '/workspace/delete-me');
    store.startSession('keep-session', 'keep-me', '/workspace/keep-me');

    store.saveObservation({
      session_id: 'delete-session',
      title: 'Delete observation',
      content: 'Delete project observation content',
      project: 'delete-me',
    });
    store.savePrompt('delete-session', 'Delete project prompt', 'delete-me');

    store.saveObservation({
      session_id: 'keep-session',
      title: 'Keep observation',
      content: 'Keep project observation content',
      project: 'keep-me',
    });
    store.savePrompt('keep-session', 'Keep project prompt', 'keep-me');
  } finally {
    store.close();
  }
}

function seedBlockedDeleteProjectStore(dataDir: string): void {
  ensureDir(dataDir);
  const store = new Store(join(dataDir, 'thoth.db'));

  try {
    store.startSession('shared-session', 'delete-me', '/workspace/delete-me');
    store.saveObservation({
      session_id: 'shared-session',
      title: 'Target observation',
      content: 'Owned by delete-me',
      project: 'delete-me',
    });
    store.savePrompt('shared-session', 'Foreign prompt', 'other-project');
  } finally {
    store.close();
  }
}

async function captureCli(
  args: string[],
  options?: Parameters<typeof runCli>[1],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  let stdout = '';
  let stderr = '';

  const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write);
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write);

  let exitCode = 0;
  try {
    exitCode = await runCli(args, options);
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  }

  return { stdout, stderr, exitCode };
}

describe('runCli', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('prints help text with --help', async () => {
    const { stdout, stderr } = await captureCli(['--help']);

    expect(stderr).toBe('');
    expect(stdout).toContain('thoth-mem — Persistent memory for AI coding agents');
    expect(stdout).toContain('search <query>');
    expect(stdout).toContain('delete-project <project>');
    expect(stdout).toContain('rebuild-index');
    expect(stdout).toContain('--data-dir=<path>');
    expect(stdout).toContain('setup <opencode|codex|claude>');
  });

  it('setup command contract keeps project paths command-scoped and returns the setup exit code', async () => {
    const setupDataDir = join(tempDir, 'setup-data');
    const result: SetupResult = {
      status: 'partial',
      changed: false,
      harness: 'codex',
      scope: 'project',
      target: 'C:\\Workspaces\\Project With Spaces\\.codex',
      steps: [{ name: 'Install plugin', outcome: 'failed' }],
      diagnostics: ['Plugin installation was not verified.'],
      manual_actions: ['Install the Codex plugin manually.'],
      receipt: null,
    };
    const setupRunner = vi.fn().mockResolvedValue(result);

    const captured = await captureCli([
      'setup',
      'codex',
      '--scope',
      'project',
      '--project',
      'C:\\Workspaces\\Project With Spaces',
      '--plan',
      '--data-dir',
      setupDataDir,
      '--json',
    ], { setupRunner });

    expect(setupRunner).toHaveBeenCalledWith({
      harness: 'codex',
      scope: 'project',
      projectPath: 'C:\\Workspaces\\Project With Spaces',
      planOnly: true,
      force: false,
      json: true,
    }, { dataDir: setupDataDir });
    expect(JSON.parse(captured.stdout)).toEqual(result);
    expect(captured.stderr).toBe('');
    expect(captured.exitCode).toBe(2);
  });

  it('keeps OpenCode human and JSON setup results aligned for changed and exact no-op outcomes', async () => {
        const changed: SetupResult = {
          status: 'complete',
          changed: true,
          harness: 'opencode',
          scope: 'global',
          target: 'C:\\\\Users\\\\Example User\\\\.config\\\\opencode',
          steps: [{ name: 'Verify exact OpenCode setup post-state', outcome: 'confirmed' }],
          diagnostics: [
            'OpenCode setup succeeded, but target-bound recovery evidence cleanup is incomplete and will be retried.',
          ],
          manual_actions: ['Restart OpenCode to load the updated thoth-mem integration.'],
          receipt: null,
        };
        const changedRunner = vi.fn().mockResolvedValue(changed);
        const json = await captureCli(['setup', 'opencode', '--json'], { setupRunner: changedRunner });
        const human = await captureCli(['setup', 'opencode'], { setupRunner: changedRunner });

        expect(json.exitCode).toBe(0);
        expect(JSON.parse(json.stdout)).toEqual(changed);
        expect(human.exitCode).toBe(0);
        expect(human.stdout).toContain('Status: complete');
        expect(human.stdout).toContain('Changed: yes');
        expect(human.stdout).toContain(changed.diagnostics[0]);
        expect(human.stdout).toContain(changed.manual_actions[0]);
        expect(human.stdout).toContain('Receipt: none');

        const noOp: SetupResult = {
          ...changed,
          changed: false,
          diagnostics: [],
          manual_actions: [],
        };
        const noOpHuman = await captureCli(['setup', 'opencode'], {
          setupRunner: vi.fn().mockResolvedValue(noOp),
        });
        expect(noOpHuman.exitCode).toBe(0);
        expect(noOpHuman.stdout).toContain('Changed: no');
        expect(noOpHuman.stdout).not.toContain('Restart OpenCode');
      });

      it('dispatches claude setup requests through the existing Claude Code setup runner', async () => {
    const result: SetupResult = {
      status: 'complete',
      changed: false,
      harness: 'claude',
      scope: 'global',
      target: 'C:\\Users\\Example User\\.claude',
      steps: [{ name: 'Inspect Claude Code setup', outcome: 'confirmed' }],
      diagnostics: [],
      manual_actions: [],
      receipt: null,
    };
    const setupRunner = vi.fn().mockResolvedValue(result);

    const captured = await captureCli(['setup', 'claude', '--plan', '--json'], { setupRunner });

    expect(setupRunner).toHaveBeenCalledWith({
      harness: 'claude',
      scope: 'global',
      planOnly: true,
      force: false,
      json: true,
    }, {});
    expect(JSON.parse(captured.stdout)).toEqual(result);
    expect(captured.stderr).toBe('');
    expect(captured.exitCode).toBe(0);
  });

  it('rejects the removed claude-code setup target before dispatch', async () => {
    const setupRunner = vi.fn().mockResolvedValue({
      status: 'complete',
      changed: false,
      harness: 'opencode',
      scope: 'global',
      target: 'unused',
      steps: [],
      diagnostics: [],
      manual_actions: [],
      receipt: null,
    } satisfies SetupResult);
    let error: unknown;

    try {
      await captureCli(['setup', 'claude-code', '--plan', '--json'], { setupRunner });
    } catch (caught) {
      error = caught;
    }

    expect.soft(error).toBeInstanceOf(Error);
    expect.soft(error instanceof Error ? error.message : '').toContain('Invalid setup harness: claude-code');
    expect.soft(setupRunner).not.toHaveBeenCalled();
  });

  it('setup command contract renders valid-harness input failures as failed JSON', async () => {
    const setupRunner = vi.fn();

    const captured = await captureCli([
      'setup',
      'opencode',
      '--scope',
      'project',
      '--json',
    ], { setupRunner });

    expect(setupRunner).not.toHaveBeenCalled();
    expect(JSON.parse(captured.stdout)).toEqual({
      status: 'failed',
      changed: false,
      harness: 'opencode',
      scope: 'project',
      target: 'unresolved project target',
      steps: [{ name: 'Validate setup request', outcome: 'failed' }],
      diagnostics: ['--scope project requires --project <path>'],
      manual_actions: ['Correct the setup options and retry.'],
      receipt: null,
    });
    expect(captured.stderr).toBe('');
    expect(captured.exitCode).toBe(1);
  });

  it('searches memories in the configured data directory', async () => {
    const dataDir = join(tempDir, 'data');
    seedStore(dataDir);

    const { stdout } = await captureCli(['--data-dir', dataDir, 'search', 'Searchable', '-p', 'cli-project']);

    expect(stdout).toContain('## Search Results (1 found)');
    expect(stdout).toContain('CLI saved observation');
  });

  it('saves a memory observation and prints the saved observation', async () => {
    const dataDir = join(tempDir, 'data');

    const { stdout } = await captureCli([
      'save',
      'Saved from CLI',
      'CLI content body',
      '--data-dir',
      dataDir,
      '--project',
      'cli-project',
      '--type',
      'manual',
      '--scope',
      'project',
    ]);

    expect(stdout).toContain('Action: created');
    expect(stdout).toContain('Saved from CLI');

    const store = new Store(join(dataDir, 'thoth.db'));
    try {
      const results = store.searchObservations({ query: 'Saved CLI body', project: 'cli-project' });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Saved from CLI');
    } finally {
      store.close();
    }
  });

  it('shows a timeline around an observation id', async () => {
    const dataDir = join(tempDir, 'data');
    seedStore(dataDir);
    const store = new Store(join(dataDir, 'thoth.db'));
    const focus = store.searchObservations({ query: 'Second observation', project: 'cli-project' })[0];
    store.close();

    const { stdout } = await captureCli(['timeline', String(focus.id), '--data-dir', dataDir, '--before', '1', '--after', '0']);

    expect(stdout).toContain(`## Timeline around observation ${focus.id}`);
    expect(stdout).toContain('### Before');
    expect(stdout).toContain('CLI saved observation');
    expect(stdout).toContain('### ► Focus: [bugfix] Second observation');
  });

  it('prints recent context', async () => {
    const dataDir = join(tempDir, 'data');
    seedStore(dataDir);

    const { stdout } = await captureCli(['context', '--data-dir', dataDir, '--project', 'cli-project']);

    expect(stdout).toContain('## Memory from Previous Sessions');
    expect(stdout).toContain('### Recent Prompts');
    expect(stdout).toContain('cli-project');
  });

  it('prints bounded recent context through shared store rendering', async () => {
    const dataDir = join(tempDir, 'data');
    const marker = seedLargeContextStore(dataDir);

    const { stdout } = await captureCli(['context', '--data-dir', dataDir, '--project', 'cli-large-project']);

    expect(stdout.length).toBeLessThanOrEqual(8001);
    expect(stdout).toContain('mem_get(id=');
    expect(stdout).not.toContain(marker);
  });

  it('prints memory statistics', async () => {
    const dataDir = join(tempDir, 'data');
    seedStore(dataDir);

    const { stdout } = await captureCli(['stats', '--data-dir', dataDir]);

    expect(stdout).toContain('## Thoth Memory Statistics');
    expect(stdout).toContain('- **Sessions:** 1');
    expect(stdout).toContain('- **Observations:** 2');
    expect(stdout).toContain('- **User Prompts:** 1');
  });

  it('exports JSON to stdout and to a file', async () => {
    const dataDir = join(tempDir, 'data');
    seedStore(dataDir);
    const exportFile = join(tempDir, 'export.json');

    const stdoutResult = await captureCli(['export', '--data-dir', dataDir, '--project', 'cli-project']);
    const parsed = JSON.parse(stdoutResult.stdout) as ExportData;

    expect(parsed.project).toBe('cli-project');
    expect(parsed.observations).toHaveLength(2);

    const fileResult = await captureCli(['export', exportFile, '--data-dir', dataDir]);

    expect(fileResult.stdout).toContain('Exported memory data to');
    expect(existsSync(exportFile)).toBe(true);
  });

  it('imports JSON from a file', async () => {
    const dataDir = join(tempDir, 'data');
    const importFile = join(tempDir, 'import.json');
    const payload: ExportData = {
      version: 1,
      exported_at: '2026-03-23T12:00:00.000Z',
      project: 'cli-project',
      sessions: [{
        id: 'import-session',
        project: 'cli-project',
        directory: null,
        started_at: '2026-03-23 12:00:00',
        ended_at: null,
        summary: null,
      }],
      observations: [{
        id: 1,
        sync_id: '33333333-3333-4333-8333-333333333333',
        session_id: 'import-session',
        type: 'manual',
        title: 'Imported via CLI',
        content: 'Imported content',
        tool_name: null,
        project: 'cli-project',
        scope: 'project',
        topic_key: null,
        normalized_hash: null,
        revision_count: 1,
        duplicate_count: 1,
        last_seen_at: null,
        created_at: '2026-03-23 12:00:00',
        updated_at: '2026-03-23 12:00:00',
        deleted_at: null,
      }],
      prompts: [],
    };
    writeFileSync(importFile, JSON.stringify(payload, null, 2), 'utf-8');

    const { stdout } = await captureCli(['import', importFile, '--data-dir', dataDir]);

    expect(stdout).toContain('## Memory Import Complete');
    expect(stdout).toContain('- **Observations imported:** 1');

    const store = new Store(join(dataDir, 'thoth.db'));
    try {
      const results = store.searchObservations({ query: 'Imported content', project: 'cli-project' });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Imported via CLI');
    } finally {
      store.close();
    }
  });

  it('creates sync export chunks in the requested directory', async () => {
    const dataDir = join(tempDir, 'data');
    const syncDir = join(tempDir, 'sync');
    seedStore(dataDir);

    const { stdout } = await captureCli(['sync', '--data-dir', dataDir, '--dir', syncDir, '--project', 'cli-project']);

    expect(stdout).toContain('## Sync Export Complete');
    expect(stdout).toContain('- **Observations:** 2');
    expect(existsSync(join(syncDir, 'manifest.json'))).toBe(true);
  });

  it('prints the cwd-based default sync directory when --dir is omitted', async () => {
    const dataDir = join(tempDir, 'data');
    const defaultSyncDir = join(tempDir, '.thoth-sync');
    seedStore(dataDir);

    let stdout = '';
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
    try {
      ({ stdout } = await captureCli(['sync', '--data-dir', dataDir, '--project', 'cli-project']));
    } finally {
      cwdSpy.mockRestore();
    }

    expect(stdout).toContain(`- **Directory:** ${defaultSyncDir}`);
    expect(stdout).toContain('- **Directory default:** current working directory');
    expect(existsSync(join(defaultSyncDir, 'manifest.json'))).toBe(true);
  });

  it('migrates a project to a new name', async () => {
    const dataDir = join(tempDir, 'data');
    seedStore(dataDir);

    const { stdout } = await captureCli(['migrate-project', 'cli-project', 'renamed-project', '--data-dir', dataDir]);

    expect(stdout).toContain('## Project Migration Complete');
    expect(stdout).toContain('- **From:** cli-project');
    expect(stdout).toContain('- **To:** renamed-project');
    expect(stdout).toContain('- **Sessions updated:** 1');
    expect(stdout).toContain('- **Observations updated:** 2');

    const store = new Store(join(dataDir, 'thoth.db'));
    try {
      const results = store.searchObservations({ query: 'CLI content', project: 'renamed-project' });
      expect(results.length).toBeGreaterThan(0);
    } finally {
      store.close();
    }
  });

  it('rebuilds graph facts for a project from the CLI', async () => {
    const dataDir = join(tempDir, 'data');
    seedStore(dataDir);
    clearGraphFacts(dataDir);

    const { stdout, stderr } = await captureCli(['rebuild-graph', '--project', 'cli-project', '--data-dir', dataDir]);

    expect(stderr).toBe('');
    expect(stdout).toContain('## Graph Rebuild Complete');
    expect(stdout).toContain('- **Scope:** project cli-project');
    expect(stdout).toContain('- **Observations scanned:** 2');
    expect(stdout).toContain('- **Facts deleted:** 0');
    expect(stdout).toContain('- **Facts created:**');

    const store = new Store(join(dataDir, 'thoth.db'));
    try {
      expect(store.getObservationFacts({ project: 'cli-project' }).length).toBeGreaterThanOrEqual(4);
    } finally {
      store.close();
    }
  });

  it('rebuilds graph facts for all projects from the CLI', async () => {
    const dataDir = join(tempDir, 'data');
    seedDeleteProjectStore(dataDir);
    clearGraphFacts(dataDir);

    const { stdout, stderr } = await captureCli(['rebuild-graph', '--all', '--data-dir', dataDir]);

    expect(stderr).toBe('');
    expect(stdout).toContain('## Graph Rebuild Complete');
    expect(stdout).toContain('- **Scope:** all projects');
    expect(stdout).toContain('- **Observations scanned:** 2');
    expect(stdout).toContain('- **Facts created:**');
  });

  it('prunes graph history from the CLI with dry-run and real modes', async () => {
    const dataDir = join(tempDir, 'data');
    ensureDir(dataDir);
    writeFileSync(join(dataDir, 'config.json'), JSON.stringify({
      knowledgeGraph: {
        kgSupersededKeepN: 1,
      },
    }));
    seedPrunableGraph(dataDir);

    const dryRun = await captureCli(['prune-graph', '--project', 'cli-project', '--dry-run', '--data-dir', dataDir]);

    expect(dryRun.stderr).toBe('');
    expect(dryRun.stdout).toContain('## Graph Prune Complete');
    expect(dryRun.stdout).toContain('- **Dry run:** yes');
    expect(dryRun.stdout).toContain('- **Triples pruned:** 2');
    expect(dryRun.stdout).toContain('- **Entities pruned:** 2');

    const afterDryRunStore = new Store(join(dataDir, 'thoth.db'));
    try {
      const count = afterDryRunStore.getDb().prepare('SELECT COUNT(*) AS count FROM kg_triples').get() as { count: number };
      expect(count.count).toBe(3);
    } finally {
      afterDryRunStore.close();
    }

    const real = await captureCli(['prune-graph', '--project', 'cli-project', '--data-dir', dataDir]);
    expect(real.stdout).toContain('- **Dry run:** no');
    expect(real.stdout).toContain('- **Triples pruned:** 2');
    expect(real.stdout).toContain('- **Entities pruned:** 2');

    const afterRealStore = new Store(join(dataDir, 'thoth.db'));
    try {
      const count = afterRealStore.getDb().prepare('SELECT COUNT(*) AS count FROM kg_triples').get() as { count: number };
      expect(count.count).toBe(1);
      const unrelatedOrphan = afterRealStore.getDb().prepare(
        "SELECT COUNT(*) AS count FROM kg_entities WHERE entity_key = 'prune:unrelated-orphan'"
      ).get() as { count: number };
      expect(unrelatedOrphan.count).toBe(1);
    } finally {
      afterRealStore.close();
    }
  });

  it('community admin commands are project-scoped', async () => {
    const dataDir = join(tempDir, 'data');
    seedCommunityGraph(dataDir, 'cli-community-project');
    seedCommunityGraph(dataDir, 'cli-community-other');

    const preview = await captureCli(['preview-communities', '--project', 'cli-community-project', '--data-dir', dataDir]);
    expect(preview.stderr).toBe('');
    expect(preview.stdout).toContain('## Community Summary Preview');
    expect(preview.stdout).toContain('- **Scope:** project cli-community-project');
    expect(preview.stdout).toContain('- **Would commit:** no');

    const rebuild = await captureCli(['rebuild-communities', '--project', 'cli-community-project', '--data-dir', dataDir]);
    expect(rebuild.stderr).toBe('');
    expect(rebuild.stdout).toContain('## Community Summary Rebuild Complete');
    expect(rebuild.stdout).toContain('- **Scope:** project cli-community-project');
    expect(rebuild.stdout).toContain('- **Communities created:** 1');

    const status = await captureCli(['communities-status', '--project', 'cli-community-project', '--data-dir', dataDir]);
    expect(status.stdout).toContain('## Community Summary Status');
    expect(status.stdout).toContain('- **Project:** cli-community-project');
    expect(status.stdout).toContain('- **State:** fresh');

    const allStatus = await captureCli(['communities-status', '--all', '--data-dir', dataDir]);
    expect(allStatus.stdout).toContain('## Community Summary Status');
    expect(allStatus.stdout).toContain('- cli-community-project: state=fresh');
    expect(allStatus.stdout).toContain('- cli-community-other: state=missing');

    const drop = await captureCli(['drop-communities', '--project', 'cli-community-project', '--data-dir', dataDir]);
    expect(drop.stdout).toContain('## Community Summaries Dropped');
    expect(drop.stdout).toContain('- **Scope:** project cli-community-project');
    expect(drop.stdout).toContain('- **Communities deleted:** 1');

    const allRebuild = await captureCli(['rebuild-communities', '--all', '--data-dir', dataDir]);
    expect(allRebuild.stdout).toContain('## Community Summary Rebuild Complete');
    expect(allRebuild.stdout).toContain('- cli-community-project: status=committed communities=1');
    expect(allRebuild.stdout).toContain('- cli-community-other: status=committed communities=1');

    let missingScopeError: unknown;
    try {
      await captureCli(['rebuild-communities', '--data-dir', dataDir]);
    } catch (caught) {
      missingScopeError = caught;
    }
    expect(missingScopeError).toBeInstanceOf(Error);
    expect((missingScopeError as Error).message).toContain('rebuild-communities requires --project <name> or --all');
  });

  it('requires exactly one rebuild-graph scope', async () => {
    let missingScopeError: unknown;
    try {
      await captureCli(['rebuild-graph']);
    } catch (caught) {
      missingScopeError = caught;
    }

    expect(missingScopeError).toBeInstanceOf(Error);
    expect((missingScopeError as Error).message).toContain('rebuild-graph requires --project <name> or --all');

    let conflictingScopeError: unknown;
    try {
      await captureCli(['rebuild-graph', '--all', '--project', 'cli-project']);
    } catch (caught) {
      conflictingScopeError = caught;
    }

    expect(conflictingScopeError).toBeInstanceOf(Error);
    expect((conflictingScopeError as Error).message).toContain('Use either --project or --all, not both');
  });

  it('requires exactly one prune-graph scope', async () => {
    let missingScopeError: unknown;
    try {
      await captureCli(['prune-graph']);
    } catch (caught) {
      missingScopeError = caught;
    }

    expect(missingScopeError).toBeInstanceOf(Error);
    expect((missingScopeError as Error).message).toContain('prune-graph requires --project <name> or --all');
  });

  it('previews and applies memory maintenance from the CLI without adding MCP tools', async () => {
    const dataDir = join(tempDir, 'data');
    ensureDir(dataDir);
    writeFileSync(join(dataDir, 'config.json'), JSON.stringify({
      maintenance: {
        defaultMode: 'dry-run',
        reflection: { minSourceCount: 2 },
      },
    }));
    const store = new Store(join(dataDir, 'thoth.db'));
    try {
      store.saveObservation({
        title: 'CLI maintenance source A',
        content: 'cli maintenance duplicate marker',
        project: 'cli-maint-project',
        type: 'decision',
      });
      store.saveObservation({
        title: 'CLI maintenance source B',
        content: 'cli maintenance duplicate marker',
        project: 'cli-maint-project',
        type: 'decision',
      });
    } finally {
      store.close();
    }

    const preview = await captureCli(['maintain-memory', '--project', 'cli-maint-project', '--data-dir', dataDir]);
    expect(preview.stderr).toBe('');
    expect(preview.stdout).toContain('## Memory Maintenance Preview');
    expect(preview.stdout).toContain('- **Mode:** dry-run');
    expect(preview.stdout).toContain('- **Scope:** project cli-maint-project');
    expect(preview.stdout).toContain('- **Consolidation candidates:** 1');

    const afterPreview = new Store(join(dataDir, 'thoth.db'));
    try {
      expect(afterPreview.getDb().prepare('SELECT COUNT(*) AS count FROM maintenance_runs').get()).toEqual({ count: 0 });
    } finally {
      afterPreview.close();
    }

    const applied = await captureCli(['maintain-memory', '--project', 'cli-maint-project', '--apply', '--data-dir', dataDir]);
    expect(applied.stdout).toContain('## Memory Maintenance Applied');
    expect(applied.stdout).toContain('- **Mode:** apply');
    expect(applied.stdout).toContain('- **Run ID:**');
    expect(ALL_TOOLS.map((tool) => tool.name)).toEqual([
      'mem_save',
      'mem_recall',
      'mem_context',
      'mem_get',
      'mem_project',
      'mem_session',
    ]);
  });

  it('queues and reports semantic rebuild-index for a project', async () => {
    const dataDir = join(tempDir, 'data');
    seedStore(dataDir);

    const { stdout, stderr } = await captureCli([
      'rebuild-index',
      '--project',
      'cli-project',
      '--process',
      '0',
      '--reason',
      'test',
      '--data-dir',
      dataDir,
    ]);

    expect(stderr).toBe('');
    expect(stdout).toContain('## Semantic Index Rebuild');
    expect(stdout).toContain('- **Scope:** project cli-project');
    expect(stdout).toContain('- **Queued key:** rebuild:test:cli-project');
    expect(stdout).toContain('- **Jobs processed:** 0');
    expect(stdout).toContain('## Semantic Index Status');
    expect(stdout).toContain('- **Pending jobs:**');
  });

  it('reports semantic rebuild-index status without queueing work', async () => {
    const dataDir = join(tempDir, 'status-data');
    seedStore(dataDir);

    const { stdout, stderr } = await captureCli([
      'rebuild-index',
      '--status',
      '--data-dir',
      dataDir,
    ]);

    expect(stderr).toBe('');
    expect(stdout).toContain('## Semantic Index Status');
    expect(stdout).toContain('- **Scope:** all projects');
    expect(stdout).toContain('- **Queue by state/kind:**');
    expect(stdout).toContain('- **Chunk coverage:**');
    expect(stdout).not.toContain('## Semantic Index Rebuild');
  });

  it('fails clearly when delete-project is missing or has an invalid project argument', async () => {
    let missingError: unknown;
    try {
      await captureCli(['delete-project']);
    } catch (caught) {
      missingError = caught;
    }

    expect(missingError).toBeInstanceOf(Error);
    expect((missingError as Error).message).toContain('delete-project requires <project>');

    let invalidError: unknown;
    try {
      await captureCli(['delete-project', '   ']);
    } catch (caught) {
      invalidError = caught;
    }

    expect(invalidError).toBeInstanceOf(Error);
    expect((invalidError as Error).message).toContain('delete-project requires a non-empty <project>');
  });

  it('deletes a project and prints deterministic deletion counts', async () => {
    const dataDir = join(tempDir, 'data');
    seedDeleteProjectStore(dataDir);

    const { stdout, stderr } = await captureCli(['delete-project', 'delete-me', '--data-dir', dataDir]);

    expect(stderr).toBe('');
    expect(stdout).toContain('## Project Deletion Complete');
    expect(stdout).toContain('- **Project:** delete-me');
    expect(stdout).toContain('- **Observations deleted:** 1');
    expect(stdout).toContain('- **Observation versions deleted:** 0');
    expect(stdout).toContain('- **Prompts deleted:** 1');
    expect(stdout).toContain('- **Sessions deleted:** 1');

    const store = new Store(join(dataDir, 'thoth.db'));
    try {
      expect(store.exportData('delete-me').sessions).toHaveLength(0);
      expect(store.exportData('delete-me').observations).toHaveLength(0);
      expect(store.exportData('delete-me').prompts).toHaveLength(0);
      expect(store.exportData('keep-me').sessions).toHaveLength(1);
      expect(store.exportData('keep-me').observations).toHaveLength(1);
      expect(store.exportData('keep-me').prompts).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it('surfaces the delete-project guardrail error without partial removal', async () => {
    const dataDir = join(tempDir, 'data');
    seedBlockedDeleteProjectStore(dataDir);

    let error: unknown;
    try {
      await captureCli(['delete-project', 'delete-me', '--data-dir', dataDir]);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/delete blocked|cross-project|shared session|other-project/i);

    const store = new Store(join(dataDir, 'thoth.db'));
    try {
      expect(store.exportData('delete-me').sessions).toHaveLength(1);
      expect(store.exportData('delete-me').observations).toHaveLength(1);
      expect(store.exportData('other-project').prompts).toHaveLength(1);
      expect(store.getSession('shared-session')?.project).toBe('delete-me');
      const deleteMutations = store.getDb().prepare(
        "SELECT COUNT(*) as count FROM sync_mutations WHERE operation = 'delete'"
      ).get() as { count: number };
      expect(deleteMutations.count).toBe(0);
    } finally {
      store.close();
    }
  });

  it('prints the CLI version', async () => {
    const { stdout, stderr } = await captureCli(['version']);

    expect(stderr).toBe('');
    expect(stdout.trim()).toBe(VERSION);
  });

  it('routes integration-event once, propagates the selected data directory, and prints one JSON response', async () => {
    const response = {
      protocolVersion: 1 as const,
      harness: 'claude' as const,
      intent: 'enroll_session' as const,
      outcome: 'degraded' as const,
      retryable: false,
      diagnostic: 'bounded lifecycle result',
    };
    const integrationEventRunner = vi.fn().mockResolvedValue({ exitCode: 0, response });

    const result = await captureCli([
      '--data-dir',
      tempDir,
      'integration-event',
    ], { integrationEventRunner });

    expect(result).toEqual({
      stdout: `${JSON.stringify(response)}\n`,
      stderr: '',
      exitCode: 0,
    });
    expect(integrationEventRunner).toHaveBeenCalledOnce();
    expect(integrationEventRunner).toHaveBeenCalledWith({ dataDir: tempDir });
    expect(result.stdout.trim().split('\n')).toHaveLength(1);
  });

  it('writes errors to stderr for invalid commands', async () => {
    let error: unknown;
    try {
      await captureCli(['unknown-command']);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('Unknown command');
  });

  it('routes every documented data-management command through the CLI dispatcher', () => {
    expect(shouldRunCli(['sync-import'])).toBe(true);
    expect(shouldRunCli(['migrate-project', 'old', 'new'])).toBe(true);
    expect(shouldRunCli(['delete-project', 'project-name'])).toBe(true);
    expect(shouldRunCli(['rebuild-graph', '--all'])).toBe(true);
    expect(shouldRunCli(['prune-graph', '--all'])).toBe(true);
    expect(shouldRunCli(['rebuild-communities', '--all'])).toBe(true);
    expect(shouldRunCli(['preview-communities', '--project', 'project-name'])).toBe(true);
    expect(shouldRunCli(['communities-status', '--all'])).toBe(true);
    expect(shouldRunCli(['drop-communities', '--all'])).toBe(true);
    expect(shouldRunCli(['maintain-memory', '--all'])).toBe(true);
    expect(shouldRunCli(['integration-event'])).toBe(true);
    expect(shouldRunCli(['--data-dir', tempDir, 'sync-import'])).toBe(true);
    expect(shouldRunCli(['mcp'])).toBe(false);
  });

  describe('--tools= flag removal', () => {
    it('--tools=agent does not change registered tool set', () => {
      const withoutToolsFlag = parseArgs(['node', 'thoth-mem', 'mcp']);
      const withToolsFlag = parseArgs(['node', 'thoth-mem', 'mcp', '--tools=agent']);

      expect(withToolsFlag).toEqual(withoutToolsFlag);
      expect(ALL_TOOLS).toHaveLength(6);
    });

    it('--tools=admin does not change registered tool set', () => {
      const withoutToolsFlag = parseArgs(['node', 'thoth-mem', 'mcp', '--data-dir', '/tmp/mem']);
      const withToolsFlag = parseArgs(['node', 'thoth-mem', 'mcp', '--tools=admin', '--data-dir', '/tmp/mem']);

      expect(withToolsFlag).toEqual(withoutToolsFlag);
      expect(ALL_TOOLS.map((tool) => tool.name)).toHaveLength(6);
    });

    it('startup without --tools= registers all 6 compact tools', () => {
      const parsed = parseArgs(['node', 'thoth-mem', 'mcp']);

      expect(parsed).toEqual({ dataDir: undefined, httpDisabled: false });
      expect(shouldRunCli(['mcp'])).toBe(false);
      expect(ALL_TOOLS).toHaveLength(6);
    });

    it('--tools= flag is silently ignored', () => {
      const parsed = parseArgs(['node', 'thoth-mem', 'mcp', '--tools=agent', '--no-http']);

      expect(parsed).toEqual({ dataDir: undefined, httpDisabled: true });
      expect(shouldRunCli(['mcp', '--tools=agent'])).toBe(false);
    });
  });
});
