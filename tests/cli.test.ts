import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/store/index.js';
import type { ExportData } from '../src/store/types.js';
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

async function captureCli(args: string[]): Promise<{ stdout: string; stderr: string }> {
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

  try {
    await runCli(args);
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  }

  return { stdout, stderr };
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
