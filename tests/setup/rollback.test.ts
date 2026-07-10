import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';

import { parse } from 'jsonc-parser';
import { describe, expect, it } from 'vitest';

import { getVersion } from '../../src/version.js';
import {
  applyAtomicFilesystemChanges,
  type FilesystemFaultPoint,
} from '../../src/setup/filesystem.js';
import { inspectAndPlanSetup } from '../../src/setup/engine.js';
import {
  resolveSetupPaths,
  type SetupPaths,
  type SetupRoots,
} from '../../src/setup/paths.js';
import {
  createSetupReceipt,
  getReceiptKeyPath,
  loadSetupReceipt,
  persistSetupReceipt,
  resolveSetupReceiptPaths,
  type ReceiptFaultPoint,
  type SetupReceiptStep,
} from '../../src/setup/receipt.js';
import {
  getSetupExitCode,
  type SetupRequest,
  type SetupResult,
} from '../../src/setup/types.js';

interface SetupFixture {
  root: string;
  dataDir: string;
  executablePath: string;
  projectPath: string;
  request: SetupRequest;
  roots: SetupRoots;
  paths: SetupPaths;
}

interface RunSetupOptions {
  ids?: string[];
  trace?: (event: { kind: string; path?: string }) => void | Promise<void>;
  filesystemFault?: (event: {
    point: FilesystemFaultPoint;
    targetPath: string;
    stagePath?: string;
  }) => void | Promise<void>;
  receiptFault?: (event: { point: ReceiptFaultPoint; path: string }) => void | Promise<void>;
}

async function withTemporaryFixture<T>(
  run: (fixture: SetupFixture) => Promise<T>,
  scope: SetupRequest['scope'] = 'global',
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'thoth-mem rollback '));
  const dataDir = join(root, 'thoth data');
  const packageRoot = join(root, 'package with spaces');
  const projectPath = join(root, 'project with spaces');
  const executablePath = join(root, 'bin', 'thoth-mem.js');
  const roots: SetupRoots = {
    homeDir: join(root, 'home'),
    cwd: root,
    packageRoot,
    xdgConfigHome: join(root, 'Harness Config'),
    codexHome: join(root, 'Codex Home'),
  };
  const request: SetupRequest = {
    harness: 'opencode',
    scope,
    ...(scope === 'project' ? { projectPath } : {}),
    planOnly: false,
    force: false,
    json: false,
  };
  const paths = resolveSetupPaths(request, roots);

  await mkdir(join(packageRoot, 'integrations', 'opencode'), { recursive: true });
  await mkdir(join(packageRoot, 'integrations', 'shared'), { recursive: true });
  await mkdir(dirname(executablePath), { recursive: true });
  await writeFile(
    join(packageRoot, 'integrations', 'opencode', 'plugin.mjs'),
    'export default {};\n',
    'utf8',
  );
  await writeFile(
    join(packageRoot, 'integrations', 'opencode', 'memory-protocol.md'),
    '# memory\n',
    'utf8',
  );
  await writeFile(
    join(packageRoot, 'integrations', 'shared', 'hook-runner.mjs'),
    'export {};\n',
    'utf8',
  );
  await writeFile(executablePath, '#!/usr/bin/env node\n', 'utf8');

  try {
    return await run({
      root,
      dataDir,
      executablePath,
      projectPath,
      request,
      roots,
      paths,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function runSetup(
  fixture: SetupFixture,
  request: SetupRequest = fixture.request,
  options: RunSetupOptions = {},
): Promise<SetupResult> {
  const ids = [...(options.ids ?? ['setup-receipt'])];
  return inspectAndPlanSetup(request, {
    roots: fixture.roots,
    dataDir: fixture.dataDir,
    executablePath: fixture.executablePath,
    transaction: {
      idFactory: () => ids.shift() ?? `receipt-${Date.now()}`,
      now: () => new Date('2026-07-09T12:00:00.000Z'),
      trace: options.trace,
      filesystemFault: options.filesystemFault,
      receiptFault: options.receiptFault,
    },
  });
}

function receiptBasePath(fixture: SetupFixture): string {
  return fixture.request.scope === 'global'
    ? join(fixture.dataDir, 'setup', 'receipts')
    : join(fixture.projectPath, '.thoth', 'setup', 'receipts');
}

async function loadVerifiedReceipt(fixture: SetupFixture, receiptPath: string) {
  return loadSetupReceipt(receiptPath, {
    dataDir: fixture.dataDir,
    expectedBasePath: receiptBasePath(fixture),
  });
}

async function receiptDirectoryCount(fixture: SetupFixture): Promise<number> {
  try {
    return (await readdir(receiptBasePath(fixture), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory()).length;
  } catch {
    return 0;
  }
}

function ownedConfig(text: string): unknown {
  const parsed = parse(text) as Record<string, unknown>;
  return (parsed.mcp as Record<string, unknown> | undefined)?.['thoth-mem'];
}

describe('write-ahead setup receipts', () => {
  it('orders target lock, backups, in-progress receipt, target mutation, and final receipt', async () => {
    await withTemporaryFixture(async (fixture) => {
      await mkdir(dirname(fixture.paths.configPath), { recursive: true });
      await writeFile(fixture.paths.configPath, '{ "theme": "keep" }\n', 'utf8');
      const trace: string[] = [];

      const result = await runSetup(fixture, fixture.request, {
        trace: (event) => trace.push(event.kind),
      });

      expect(result).toMatchObject({
        status: 'complete',
        changed: true,
        harness: 'opencode',
        receipt: expect.any(String),
      });
      expect(trace.indexOf('lock_acquired')).toBeLessThan(trace.indexOf('backup_synced'));
      expect(trace.indexOf('backup_synced')).toBeLessThan(trace.indexOf('receipt_in_progress'));
      expect(trace.indexOf('receipt_in_progress')).toBeLessThan(trace.indexOf('target_renamed'));
      expect(trace.indexOf('target_renamed')).toBeLessThan(trace.indexOf('receipt_complete'));
      const loaded = await loadVerifiedReceipt(fixture, result.receipt!);
      expect(loaded).toMatchObject({
        ok: true,
        receipt: {
          schema_version: 1,
          operation: 'setup',
          status: 'complete',
          package_version: getVersion(),
          hmac_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      });
      expect(await readFile(fixture.paths.configPath, 'utf8')).toContain('"theme": "keep"');
      expect(ownedConfig(await readFile(fixture.paths.configPath, 'utf8'))).toBeDefined();
    });
  });

  it('performs no target mutation when the initial receipt cannot be persisted', async () => {
    await withTemporaryFixture(async (fixture) => {
      await mkdir(dirname(fixture.paths.configPath), { recursive: true });
      const original = '{ "theme": "unchanged" }\n';
      await writeFile(fixture.paths.configPath, original, 'utf8');

      const result = await runSetup(fixture, fixture.request, {
        receiptFault: ({ point }) => {
          if (point === 'receipt-rename') {
            throw new Error('must-not-leak receipt failure');
          }
        },
      });

      expect(result.status).toBe('failed');
      expect(result.changed).toBe(false);
      expect(result.receipt).toBeNull();
      expect(await readFile(fixture.paths.configPath, 'utf8')).toBe(original);
      await expect(stat(fixture.paths.assetPath)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(JSON.stringify(result)).not.toContain('must-not-leak');
    });
  });

  it('propagates the selected data directory to key and global receipt resolution', async () => {
    await withTemporaryFixture(async (fixture) => {
      const result = await runSetup(fixture);

      expect(result.status).toBe('complete');
      expect(result.receipt).toBe(
        join(fixture.dataDir, 'setup', 'receipts', 'setup-receipt', 'receipt.json'),
      );
      expect(await stat(getReceiptKeyPath(fixture.dataDir))).toBeDefined();
    });
  });

  it('detects every durable same-target in-progress checkpoint before managed no-op inspection', async () => {
    await withTemporaryFixture(async (fixture) => {
      const installed = await runSetup(fixture);
      expect(installed.status).toBe('complete');
      const complete = await loadVerifiedReceipt(fixture, installed.receipt!);
      expect(complete.ok).toBe(true);
      if (!complete.ok) {
        return;
      }

      for (let confirmedCount = 0; confirmedCount <= complete.receipt.steps.length; confirmedCount++) {
        const id = `interrupted-${confirmedCount}`;
        const receiptPaths = resolveSetupReceiptPaths(receiptBasePath(fixture), id);
        const steps = complete.receipt.steps.map((step, index) => ({
          ...step,
          outcome: index < confirmedCount ? 'confirmed' as const : 'planned' as const,
        }));
        const interrupted = createSetupReceipt({
          ...complete.receipt,
          id,
          status: 'in_progress',
          started_at: '2026-07-09T12:01:00.000Z',
          updated_at: '2026-07-09T12:01:00.000Z',
          steps,
        });
        const persisted = await persistSetupReceipt(
          receiptPaths.receiptPath,
          interrupted,
          { dataDir: fixture.dataDir },
        );
        expect(persisted.ok).toBe(true);

        const result = await runSetup(fixture, fixture.request, { ids: [`blocked-${confirmedCount}`] });
        expect(result.status).toBe('requires_user_action');
        expect(result.changed).toBe(false);
        expect(result.diagnostics).toContain(`Incomplete setup receipt: ${receiptPaths.receiptPath}`);
      }
    });
  });

  it('serializes concurrent setup attempts with a target-scoped exclusive lock', async () => {
    await withTemporaryFixture(async (fixture) => {
      let releaseFirst!: () => void;
      let receiptPersisted!: () => void;
      const hold = new Promise<void>((resolve) => { releaseFirst = resolve; });
      const reachedReceipt = new Promise<void>((resolve) => { receiptPersisted = resolve; });
      const first = runSetup(fixture, fixture.request, {
        ids: ['first'],
        trace: async ({ kind }) => {
          if (kind === 'receipt_in_progress') {
            receiptPersisted();
            await hold;
          }
        },
      });
      const reachedBeforeCompletion = await Promise.race([
        reachedReceipt.then(() => true),
        first.then(() => false),
      ]);
      expect(reachedBeforeCompletion).toBe(true);
      if (!reachedBeforeCompletion) {
        return;
      }

      const second = await runSetup(fixture, fixture.request, { ids: ['second'] });
      expect(second.status).toBe('requires_user_action');
      expect(second.changed).toBe(false);
      expect(second.diagnostics).toContain('Selected setup target is locked by another operation.');

      releaseFirst();
      expect((await first).status).toBe('complete');
    });
  });
});

describe('strict receipt integrity and binding', () => {
  it('verifies semantic JSON reordering but rejects any signed-field mutation', async () => {
    await withTemporaryFixture(async (fixture) => {
      const result = await runSetup(fixture);
      const raw = JSON.parse(await readFile(result.receipt!, 'utf8')) as Record<string, unknown>;
      const reordered = Object.fromEntries(Object.entries(raw).reverse());
      await writeFile(result.receipt!, JSON.stringify(reordered, null, 7), 'utf8');
      expect((await loadVerifiedReceipt(fixture, result.receipt!)).ok).toBe(true);

      reordered.force = !reordered.force;
      await writeFile(result.receipt!, JSON.stringify(reordered), 'utf8');
      const tampered = await loadVerifiedReceipt(fixture, result.receipt!);
      expect(tampered).toMatchObject({ ok: false, reason: 'hmac_mismatch' });
    });
  });

  it('refuses a tampered receipt even when rollback is forced', async () => {
    await withTemporaryFixture(async (fixture) => {
      const setup = await runSetup(fixture);
      const raw = JSON.parse(await readFile(setup.receipt!, 'utf8')) as Record<string, unknown>;
      raw.status = 'rolled_back';
      await writeFile(setup.receipt!, JSON.stringify(raw), 'utf8');
      const before = await readFile(fixture.paths.configPath, 'utf8');

      const rollback = await runSetup(fixture, {
        ...fixture.request,
        force: true,
        rollbackReceipt: setup.receipt!,
      }, { ids: ['rollback'] });

      expect(rollback.status).toBe('requires_user_action');
      expect(rollback.changed).toBe(false);
      expect(await readFile(fixture.paths.configPath, 'utf8')).toBe(before);
    });
  });

  it('refuses a receipt-owned backup whose signed pre-state no longer matches', async () => {
    await withTemporaryFixture(async (fixture) => {
      await mkdir(dirname(fixture.paths.configPath), { recursive: true });
      await writeFile(fixture.paths.configPath, JSON.stringify({
        theme: 'keep',
        mcp: {
          'thoth-mem': {
            type: 'local',
            command: ['previous-thoth'],
            enabled: true,
          },
        },
      }, null, 2), 'utf8');
      const setup = await runSetup(fixture, {
        ...fixture.request,
        force: true,
      });
      const loaded = await loadVerifiedReceipt(fixture, setup.receipt!);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) {
        return;
      }
      const configStep = loaded.receipt.steps.find((step) => step.id === 'config');
      expect(configStep?.backup_path).toEqual(expect.any(String));
      await writeFile(configStep!.backup_path!, JSON.stringify({
        theme: 'keep',
        mcp: { 'thoth-mem': { command: ['tampered-backup'] } },
      }), 'utf8');
      const current = await readFile(fixture.paths.configPath, 'utf8');

      const rollback = await runSetup(fixture, {
        ...fixture.request,
        force: true,
        rollbackReceipt: setup.receipt!,
      }, { ids: ['must-not-rollback'] });

      expect(rollback.status).toBe('requires_user_action');
      expect(rollback.changed).toBe(false);
      expect(await readFile(fixture.paths.configPath, 'utf8')).toBe(current);
    });
  });

  it('does not rotate a missing or corrupt key while selected receipts exist', async () => {
    await withTemporaryFixture(async (fixture) => {
      const setup = await runSetup(fixture);
      const keyPath = getReceiptKeyPath(fixture.dataDir);
      await unlink(keyPath);

      const missingKey = await runSetup(fixture, fixture.request, { ids: ['must-not-create'] });
      expect(missingKey.status).toBe('requires_user_action');
      await expect(stat(keyPath)).rejects.toMatchObject({ code: 'ENOENT' });

      await writeFile(keyPath, 'not-a-valid-key', 'utf8');
      const corruptKey = await runSetup(fixture, {
        ...fixture.request,
        rollbackReceipt: setup.receipt!,
      }, { ids: ['must-not-rotate'] });
      expect(corruptKey.status).toBe('requires_user_action');
      expect(await readFile(keyPath, 'utf8')).toBe('not-a-valid-key');
    });
  });

  it('rejects a valid signed receipt copied across canonical project targets', async () => {
    await withTemporaryFixture(async (source) => {
      const setup = await runSetup(source);
      await withTemporaryFixture(async (destination) => {
        await mkdir(dirname(getReceiptKeyPath(destination.dataDir)), { recursive: true });
        await cp(getReceiptKeyPath(source.dataDir), getReceiptKeyPath(destination.dataDir));
        const copiedRoot = join(receiptBasePath(destination), basename(dirname(setup.receipt!)));
        await mkdir(dirname(copiedRoot), { recursive: true });
        await cp(dirname(setup.receipt!), copiedRoot, { recursive: true });
        const copiedReceipt = join(copiedRoot, 'receipt.json');
        expect((await loadVerifiedReceipt(destination, copiedReceipt)).ok).toBe(true);

        const result = await runSetup(destination, {
          ...destination.request,
          force: true,
          rollbackReceipt: copiedReceipt,
        }, { ids: ['cross-project-rollback'] });
        expect(result.status).toBe('requires_user_action');
        expect(result.changed).toBe(false);
      }, 'project');
    }, 'project');
  });

  it('records owner-only key intent without claiming POSIX enforcement on Windows', async () => {
    await withTemporaryFixture(async (fixture) => {
      const result = await runSetup(fixture);
      const key = await stat(getReceiptKeyPath(fixture.dataDir));

      if (process.platform === 'win32') {
        expect(result.diagnostics).toContain(
          'Receipt key owner-only permissions are best-effort on Windows.',
        );
      } else {
        expect(key.mode & 0o777).toBe(0o600);
        expect(result.diagnostics).not.toContain(
          'Receipt key owner-only permissions are best-effort on Windows.',
        );
      }
    });
  });
});

describe('receipt-owned rollback', () => {
  it('preserves unrelated post-install config additions while restoring only the owned key', async () => {
    await withTemporaryFixture(async (fixture) => {
      await mkdir(dirname(fixture.paths.configPath), { recursive: true });
      await writeFile(fixture.paths.configPath, '{ "theme": "before" }\n', 'utf8');
      const setup = await runSetup(fixture, fixture.request, { ids: ['setup'] });
      const installed = await readFile(fixture.paths.configPath, 'utf8');
      await writeFile(
        fixture.paths.configPath,
        installed.replace('{', '{\n  "late_setting": "preserve",'),
        'utf8',
      );

      const rollback = await runSetup(fixture, {
        ...fixture.request,
        rollbackReceipt: setup.receipt!,
      }, { ids: ['rollback'] });

      expect(rollback).toMatchObject({ status: 'complete', changed: true });
      expect(rollback.receipt).not.toBe(setup.receipt);
      const restored = parse(await readFile(fixture.paths.configPath, 'utf8')) as Record<string, unknown>;
      expect(restored.theme).toBe('before');
      expect(restored.late_setting).toBe('preserve');
      expect((restored.mcp as Record<string, unknown> | undefined)?.['thoth-mem']).toBeUndefined();
      await expect(stat(fixture.paths.assetPath)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(stat(fixture.paths.pluginEntryPath)).rejects.toMatchObject({ code: 'ENOENT' });
    });
  });

  it('requires action for owned divergence and bounds force to receipt-owned locations', async () => {
    await withTemporaryFixture(async (fixture) => {
      const setup = await runSetup(fixture, fixture.request, { ids: ['setup'] });
      const installed = await readFile(fixture.paths.configPath, 'utf8');
      const diverged = installed
        .replace('"thoth-mem",\n        "mcp"', '"different-command"')
        .replace('{', '{\n  "unrelated_after": true,');
      await writeFile(fixture.paths.configPath, diverged, 'utf8');

      const blocked = await runSetup(fixture, {
        ...fixture.request,
        rollbackReceipt: setup.receipt!,
      }, { ids: ['blocked'] });
      expect(blocked.status).toBe('requires_user_action');
      expect(blocked.changed).toBe(false);
      expect(await readFile(fixture.paths.configPath, 'utf8')).toBe(diverged);

      const forced = await runSetup(fixture, {
        ...fixture.request,
        force: true,
        rollbackReceipt: setup.receipt!,
      }, { ids: ['forced-rollback'] });
      expect(forced).toMatchObject({ status: 'complete', changed: true });
      const restored = parse(await readFile(fixture.paths.configPath, 'utf8')) as Record<string, unknown>;
      expect(restored.unrelated_after).toBe(true);
      expect((restored.mcp as Record<string, unknown> | undefined)?.['thoth-mem']).toBeUndefined();

      const rollbackReceipt = await loadVerifiedReceipt(fixture, forced.receipt!);
      expect(rollbackReceipt).toMatchObject({
        ok: true,
        receipt: { operation: 'rollback', status: 'complete', force: true },
      });
      if (rollbackReceipt.ok) {
        const configStep = rollbackReceipt.receipt.steps.find((step) => step.owned_key === 'mcp.thoth-mem');
        expect(configStep?.backup_path).toEqual(expect.any(String));
        expect(await readFile(configStep!.backup_path!, 'utf8')).toBe(diverged);
      }
    });
  });

  it('keeps repeated verified setup and completed rollback idempotent', async () => {
    await withTemporaryFixture(async (fixture) => {
      const setup = await runSetup(fixture, fixture.request, { ids: ['setup'] });
      const afterSetupCount = await receiptDirectoryCount(fixture);
      const repeatedSetup = await runSetup(fixture, fixture.request, { ids: ['unused-setup'] });
      expect(repeatedSetup).toMatchObject({ status: 'complete', changed: false, receipt: null });
      expect(await receiptDirectoryCount(fixture)).toBe(afterSetupCount);

      const rollback = await runSetup(fixture, {
        ...fixture.request,
        rollbackReceipt: setup.receipt!,
      }, { ids: ['rollback'] });
      expect(rollback.status).toBe('complete');
      const afterRollbackCount = await receiptDirectoryCount(fixture);
      const repeatedRollback = await runSetup(fixture, {
        ...fixture.request,
        rollbackReceipt: setup.receipt!,
      }, { ids: ['unused-rollback'] });
      expect(repeatedRollback).toMatchObject({ status: 'complete', changed: false });
      expect(await receiptDirectoryCount(fixture)).toBe(afterRollbackCount);
    });
  });

  it('removes a setup-created config only when no unrelated later content exists', async () => {
    await withTemporaryFixture(async (fixture) => {
      const setup = await runSetup(fixture, fixture.request, { ids: ['setup'] });
      const rollback = await runSetup(fixture, {
        ...fixture.request,
        rollbackReceipt: setup.receipt!,
      }, { ids: ['rollback'] });

      expect(rollback.status).toBe('complete');
      await expect(stat(fixture.paths.configPath)).rejects.toMatchObject({ code: 'ENOENT' });
    });
  });
});

describe('OpenCode failure status mapping', () => {
  it('maps setup post-state verification failure to failed/1 while retaining changed recovery evidence', async () => {
    await withTemporaryFixture(async (fixture) => {
      const result = await runSetup(fixture, fixture.request, {
        trace: async ({ kind, path }) => {
          if (kind === 'target_renamed' && path === fixture.paths.pluginEntryPath) {
            await writeFile(fixture.paths.configPath, '{}\n', 'utf8');
          }
        },
      });

      expect(result).toMatchObject({
        status: 'failed',
        changed: true,
        receipt: expect.any(String),
        manual_actions: expect.arrayContaining([expect.stringContaining('in-progress receipt')]),
      });
      expect(getSetupExitCode(result.status)).toBe(1);
    });
  });

  it('maps setup final-receipt persistence failure to failed/1 with the durable receipt path', async () => {
    await withTemporaryFixture(async (fixture) => {
      let receiptRenames = 0;
      const result = await runSetup(fixture, fixture.request, {
        receiptFault: ({ point }) => {
          if (point === 'receipt-rename' && ++receiptRenames === 5) {
            throw new Error('final setup receipt failure');
          }
        },
      });

      expect(result).toMatchObject({
        status: 'failed',
        changed: true,
        receipt: expect.any(String),
      });
      expect(getSetupExitCode(result.status)).toBe(1);
    });
  });

  it('maps rollback filesystem failure to failed/1 while reporting an unrestored change', async () => {
    await withTemporaryFixture(async (fixture) => {
      const setup = await runSetup(fixture, fixture.request, { ids: ['setup'] });
      let parentSyncFailed = false;
      const result = await runSetup(fixture, {
        ...fixture.request,
        rollbackReceipt: setup.receipt!,
      }, {
        ids: ['rollback'],
        filesystemFault: ({ point }) => {
          if (point === 'parent-sync' && !parentSyncFailed) {
            parentSyncFailed = true;
            throw new Error('rollback parent sync failure');
          }
          if (point === 'restore') {
            throw new Error('rollback restore failure');
          }
        },
      });

      expect(result).toMatchObject({
        status: 'failed',
        changed: true,
        receipt: expect.any(String),
      });
      expect(getSetupExitCode(result.status)).toBe(1);
    });
  });

  it('maps rollback post-state verification failure to failed/1 with recovery evidence', async () => {
    await withTemporaryFixture(async (fixture) => {
      const setup = await runSetup(fixture, fixture.request, { ids: ['setup'] });
      const result = await runSetup(fixture, {
        ...fixture.request,
        rollbackReceipt: setup.receipt!,
      }, {
        ids: ['rollback'],
        trace: async ({ kind, path }) => {
          if (kind === 'target_renamed' && path === fixture.paths.pluginEntryPath) {
            await mkdir(dirname(fixture.paths.configPath), { recursive: true });
            await writeFile(fixture.paths.configPath, JSON.stringify({
              mcp: {
                'thoth-mem': {
                  type: 'local',
                  command: ['unexpected'],
                  enabled: true,
                },
              },
            }), 'utf8');
          }
        },
      });

      expect(result).toMatchObject({
        status: 'failed',
        changed: true,
        receipt: expect.any(String),
      });
      expect(getSetupExitCode(result.status)).toBe(1);
    });
  });

  it('maps rollback final-receipt persistence failure to failed/1 with the rollback receipt', async () => {
    await withTemporaryFixture(async (fixture) => {
      const setup = await runSetup(fixture, fixture.request, { ids: ['setup'] });
      let receiptRenames = 0;
      const result = await runSetup(fixture, {
        ...fixture.request,
        rollbackReceipt: setup.receipt!,
      }, {
        ids: ['rollback'],
        receiptFault: ({ point }) => {
          if (point === 'receipt-rename' && ++receiptRenames === 6) {
            throw new Error('final rollback receipt failure');
          }
        },
      });

      expect(result).toMatchObject({
        status: 'failed',
        changed: true,
        receipt: expect.any(String),
      });
      expect(getSetupExitCode(result.status)).toBe(1);
    });
  });
});

describe('filesystem transaction hardening', () => {
  it('tracks a renamed target before parent sync so sync failure restores it', async () => {
    await withTemporaryFixture(async (fixture) => {
      const targetRoot = join(fixture.root, 'atomic target');
      const targetPath = join(targetRoot, 'config.json');
      await mkdir(targetRoot, { recursive: true });
      await writeFile(targetPath, 'before', 'utf8');

      const result = await applyAtomicFilesystemChanges({
        targetRoot,
        backupRoot: join(fixture.root, 'atomic backups'),
        changes: [{ kind: 'file', targetPath, content: 'after' }],
      }, {
        fault: ({ point }) => {
          if (point === 'parent-sync') {
            throw new Error('parent sync failed');
          }
        },
      });

      expect(result.outcome).toBe('failed');
      expect(result.changed).toBe(false);
      expect(result.unrestored).toEqual([]);
      expect(await readFile(targetPath, 'utf8')).toBe('before');
    });
  });

  it('syncs every newly created backup parent before the write-ahead callback', async () => {
    await withTemporaryFixture(async (fixture) => {
      const targetRoot = join(fixture.root, 'sync target');
      const targetPath = join(targetRoot, 'config.json');
      await mkdir(targetRoot, { recursive: true });
      await writeFile(targetPath, 'before', 'utf8');
      const trace: string[] = [];

      const result = await applyAtomicFilesystemChanges({
        targetRoot,
        backupRoot: join(fixture.root, 'sync backups'),
        changes: [{ kind: 'file', targetPath, content: 'after' }],
      }, {
        fault: ({ point }) => trace.push(point),
        beforeMutations: async () => { trace.push('receipt'); },
      });

      expect(result.outcome).toBe('confirmed');
      expect(trace.indexOf('backup-parent-sync')).toBeLessThan(trace.indexOf('receipt'));
      expect(trace.indexOf('receipt')).toBeLessThan(trace.indexOf('before-write'));
    });
  });

  it('revalidates the backed-up pre-state immediately before rename', async () => {
    await withTemporaryFixture(async (fixture) => {
      const targetRoot = join(fixture.root, 'concurrent target');
      const targetPath = join(targetRoot, 'config.json');
      await mkdir(targetRoot, { recursive: true });
      await writeFile(targetPath, 'backed-up', 'utf8');

      const result = await applyAtomicFilesystemChanges({
        targetRoot,
        backupRoot: join(fixture.root, 'concurrent backups'),
        changes: [{ kind: 'file', targetPath, content: 'planned' }],
      }, {
        fault: async ({ point }) => {
          if (point === 'before-prestate-check') {
            await writeFile(targetPath, 'concurrent-edit', 'utf8');
          }
        },
      });

      expect(result.outcome).toBe('failed');
      expect(result.changed).toBe(false);
      expect(await readFile(targetPath, 'utf8')).toBe('concurrent-edit');
    });
  });

  it.each(['target', 'source', 'backup'] as const)(
    'rejects a realpath escape through a %s symlink or junction ancestor',
    async (escapeKind, context) => {
      await withTemporaryFixture(async (fixture) => {
        const outside = join(fixture.root, 'outside', escapeKind);
        await mkdir(outside, { recursive: true });
        const targetRoot = join(fixture.root, 'contained target');
        const sourceRoot = join(fixture.root, 'contained source');
        const backupRoot = join(fixture.root, 'contained backup');
        await mkdir(targetRoot, { recursive: true });
        await mkdir(sourceRoot, { recursive: true });
        await mkdir(backupRoot, { recursive: true });
        const linkRoot = escapeKind === 'target'
          ? targetRoot
          : escapeKind === 'source'
            ? sourceRoot
            : backupRoot;
        const link = join(linkRoot, 'escaped');
        try {
          await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
        } catch (error) {
          const code = error instanceof Error && 'code' in error
            ? (error as NodeJS.ErrnoException).code
            : undefined;
          if (code === 'EPERM' || code === 'EACCES') {
            context.skip();
            return;
          }
          throw error;
        }

        let plan;
        if (escapeKind === 'source') {
          await writeFile(join(outside, 'payload.txt'), 'outside', 'utf8');
          plan = {
            targetRoot,
            sourceRoot,
            backupRoot,
            changes: [{
              kind: 'directory' as const,
              targetPath: join(targetRoot, 'assets'),
              entries: [{ sourcePath: link, targetRelativePath: '.' }],
            }],
          };
        } else {
          const targetPath = escapeKind === 'target'
            ? join(link, 'config.json')
            : join(targetRoot, 'escaped', 'config.json');
          if (escapeKind === 'backup') {
            await mkdir(dirname(targetPath), { recursive: true });
            await writeFile(targetPath, 'before', 'utf8');
          }
          plan = {
            targetRoot,
            backupRoot,
            changes: [{ kind: 'file' as const, targetPath, content: 'after' }],
          };
        }

        const result = await applyAtomicFilesystemChanges(plan);
        expect(result.outcome).toBe('failed');
        expect(result.diagnostics).toContain('filesystem-plan-invalid');
      });
    },
  );

  it('preserves an existing file mode on POSIX replacement', async (context) => {
    if (process.platform === 'win32') {
      context.skip();
      return;
    }
    await withTemporaryFixture(async (fixture) => {
      const targetRoot = join(fixture.root, 'mode target');
      const targetPath = join(targetRoot, 'config.json');
      await mkdir(targetRoot, { recursive: true });
      await writeFile(targetPath, 'before', 'utf8');
      await chmod(targetPath, 0o640);

      const result = await applyAtomicFilesystemChanges({
        targetRoot,
        backupRoot: join(fixture.root, 'mode backups'),
        changes: [{ kind: 'file', targetPath, content: 'after' }],
      });

      expect(result.outcome).toBe('confirmed');
      expect((await stat(targetPath)).mode & 0o777).toBe(0o640);
    });
  });

  it('never confirms when displaced or stage cleanup leaves an orphan', async () => {
    await withTemporaryFixture(async (fixture) => {
      const targetRoot = join(fixture.root, 'cleanup target');
      const sourceRoot = join(fixture.root, 'cleanup source');
      const targetPath = join(targetRoot, 'assets');
      await mkdir(targetPath, { recursive: true });
      await mkdir(sourceRoot, { recursive: true });
      await writeFile(join(targetPath, 'old.txt'), 'old', 'utf8');
      await writeFile(join(sourceRoot, 'new.txt'), 'new', 'utf8');

      const result = await applyAtomicFilesystemChanges({
        targetRoot,
        sourceRoot,
        backupRoot: join(fixture.root, 'cleanup backups'),
        changes: [{
          kind: 'directory',
          targetPath,
          entries: [{ sourcePath: sourceRoot, targetRelativePath: '.' }],
        }],
      }, {
        fault: ({ point }) => {
          if (point === 'cleanup-displaced' || point === 'cleanup-artifact') {
            throw new Error('cleanup failure');
          }
        },
      });

      expect(result.outcome).toBe('failed');
      expect(result.remainingArtifacts.length).toBeGreaterThan(0);
      expect(result.diagnostics).toContain('filesystem-artifact-cleanup-incomplete');
      expect(result.remainingArtifacts.every((path) => (
        path.includes('.thoth-mem-stage-') || path.includes('.thoth-mem-displaced-')
      ))).toBe(true);
    });
  });
});
