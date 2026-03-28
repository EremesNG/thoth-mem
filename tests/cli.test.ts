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

  describe('--tools= flag removal', () => {
    it('--tools=agent does not change registered tool set', () => {
      const withoutToolsFlag = parseArgs(['node', 'thoth-mem', 'mcp']);
      const withToolsFlag = parseArgs(['node', 'thoth-mem', 'mcp', '--tools=agent']);

      expect(withToolsFlag).toEqual(withoutToolsFlag);
      expect(ALL_TOOLS).toHaveLength(13);
    });

    it('--tools=admin does not change registered tool set', () => {
      const withoutToolsFlag = parseArgs(['node', 'thoth-mem', 'mcp', '--data-dir', '/tmp/mem']);
      const withToolsFlag = parseArgs(['node', 'thoth-mem', 'mcp', '--tools=admin', '--data-dir', '/tmp/mem']);

      expect(withToolsFlag).toEqual(withoutToolsFlag);
      expect(ALL_TOOLS.map((tool) => tool.name)).toHaveLength(13);
    });

    it('startup without --tools= registers all 13 tools', () => {
      const parsed = parseArgs(['node', 'thoth-mem', 'mcp']);

      expect(parsed).toEqual({ dataDir: undefined, httpDisabled: false });
      expect(shouldRunCli(['mcp'])).toBe(false);
      expect(ALL_TOOLS).toHaveLength(13);
    });

    it('--tools= flag is silently ignored', () => {
      const parsed = parseArgs(['node', 'thoth-mem', 'mcp', '--tools=agent', '--no-http']);

      expect(parsed).toEqual({ dataDir: undefined, httpDisabled: true });
      expect(shouldRunCli(['mcp', '--tools=agent'])).toBe(false);
    });
  });
});
