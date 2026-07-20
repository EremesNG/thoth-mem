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
import { createHash } from 'node:crypto';
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
import type {
  CodexCommandExecutor,
  CodexCommandResult,
} from '../../src/setup/codex-cli.js';
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

interface ControlledCodexState {
  version?: string;
  projectScoped?: boolean;
  marketplace: boolean;
  plugin: boolean;
  mutations: string[];
  events?: string[];
}

function controlledCodexExecutor(state: ControlledCodexState): CodexCommandExecutor {
  const success = (stdout: string): CodexCommandResult => ({ exitCode: 0, stdout, stderr: '' });
  return {
    async execute(args): Promise<CodexCommandResult> {
      const command = [...args];
      const key = command.filter((argument) => argument !== '--json').join(' ');
      if (key === '--version') {
        return success(state.version ?? 'codex-cli 0.144.0');
      }
      if (key === '--help') {
        return success('Usage: codex\nCommands:\n  plugin  Manage plugins');
      }
      if (key === 'plugin --help') {
        return success('Usage: codex plugin <COMMAND>\nCommands:\n  list\n  add\n  marketplace');
      }
      if (key === 'plugin marketplace --help') {
        return success('Usage: codex plugin marketplace <COMMAND>\nCommands:\n  list\n  add');
      }
      if (key === 'plugin marketplace add --help') {
        return success(`Usage: codex plugin marketplace add [OPTIONS] <SOURCE>${state.projectScoped ? '\nOptions:\n  --project <PATH>' : ''}`);
      }
      if (key === 'plugin marketplace list --help') {
        return success(`Usage: codex plugin marketplace list [OPTIONS] [--json]${state.projectScoped ? '\nOptions:\n  --project <PATH>' : ''}`);
      }
      if (key === 'plugin add --help') {
        return success(`Usage: codex plugin add [OPTIONS] <PLUGIN>${state.projectScoped ? '\nOptions:\n  --project <PATH>' : ''}`);
      }
      if (key === 'plugin list --help') {
        return success(`Usage: codex plugin list [OPTIONS] [--json]${state.projectScoped ? '\nOptions:\n  --project <PATH>' : ''}`);
      }
      const normalized = command.filter((argument, index) => (
        argument !== '--json'
        && argument !== '--project'
        && command[index - 1] !== '--project'
      )).join(' ');
      if (normalized === 'plugin marketplace list') {
        return success(JSON.stringify({
          marketplaces: state.marketplace
            ? [{
                name: 'thoth-mem',
                marketplaceSource: {
                  sourceType: 'git',
                  source: 'https://github.com/EremesNG/thoth-mem.git',
                },
                unrelatedSecret: 'private-marketplace-token',
              }]
            : [],
        }));
      }
      if (normalized === 'plugin list') {
        return success(JSON.stringify({
          installed: state.plugin
            ? [{
                pluginId: 'thoth-mem@thoth-mem',
                name: 'thoth-mem',
                marketplaceName: 'thoth-mem',
                installed: true,
                enabled: true,
                unrelatedSecret: 'private-plugin-token',
              }]
            : [],
          available: [],
        }));
      }
      if (normalized === 'plugin marketplace add EremesNG/thoth-mem') {
        state.mutations.push(normalized);
        state.events?.push(`manager:${normalized}`);
        state.marketplace = true;
        return success('registered private-command-token');
      }
      if (normalized === 'plugin add thoth-mem') {
        state.mutations.push(normalized);
        state.events?.push(`manager:${normalized}`);
        state.plugin = true;
        return success('installed private-command-token');
      }
      return { exitCode: 64, stdout: '', stderr: 'unexpected private-command-token' };
    },
  };
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
  await mkdir(join(packageRoot, 'plugin', 'skills', 'thoth-mem'), { recursive: true });
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
  await writeFile(
    join(packageRoot, 'plugin', 'skills', 'thoth-mem', 'SKILL.md'),
    '# packaged skill\n',
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

async function runControlledCodexSetup(
  fixture: SetupFixture,
  state: ControlledCodexState,
  options: Pick<RunSetupOptions, 'trace' | 'receiptFault' | 'filesystemFault'> & {
    id?: string;
    request?: SetupRequest;
  } = {},
): Promise<SetupResult> {
  const request: SetupRequest = options.request ?? {
    harness: 'codex',
    scope: 'global',
    planOnly: false,
    force: false,
    json: false,
  };
  fixture.paths = resolveSetupPaths(request, fixture.roots);
  await mkdir(join(fixture.roots.packageRoot, 'plugin'), { recursive: true });
  return inspectAndPlanSetup(request, {
    roots: fixture.roots,
    dataDir: fixture.dataDir,
    executablePath: fixture.executablePath,
    codexExecutor: controlledCodexExecutor(state),
    transaction: {
      idFactory: () => options.id ?? 'codex-v2',
      now: () => new Date('2026-07-09T12:00:00.000Z'),
      trace: options.trace,
      receiptFault: options.receiptFault,
      filesystemFault: options.filesystemFault,
    },
  });
}

async function installLegacyCodex(
  fixture: SetupFixture,
  state: ControlledCodexState,
  id = 'legacy-v2',
): Promise<SetupResult> {
  state.version = 'codex-cli 0.145.0';
  await mkdir(join(fixture.roots.packageRoot, 'plugin'), { recursive: true });
  await writeFile(
    join(fixture.roots.packageRoot, 'plugin', 'codex.mcp.json'),
    '{"mcpServers":{}}\n',
    'utf8',
  );
  return runControlledCodexSetup(fixture, state, { id });
}

function ownedConfig(text: string): unknown {
  const parsed = parse(text) as Record<string, unknown>;
  return (parsed.mcp as Record<string, unknown> | undefined)?.['thoth-mem'];
}

const CODEX_OWNED_LOCATION = 'plugins."thoth-mem".mcp_servers."thoth-mem"';
const CODEX_MANAGED_FRAGMENT = [
  '# >>> thoth-mem managed >>>',
  '[plugins."thoth-mem".mcp_servers."thoth-mem"]',
  'enabled = true',
  '# <<< thoth-mem managed <<<',
  '',
].join('\n');

function fragmentSha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

describe('versioned setup receipt dispatch', () => {
  it('persists signed Codex V2 strategy, checkpoints, and final reread evidence', async () => {
    await withTemporaryFixture(async (fixture) => {
      const events: string[] = [];
      const state: ControlledCodexState = {
        marketplace: false,
        plugin: false,
        mutations: [],
        events,
      };

      const result = await runControlledCodexSetup(fixture, state, {
        trace: ({ kind }) => events.push(`trace:${kind}`),
      });

      expect(result).toMatchObject({ status: 'complete', changed: true });
      const raw = JSON.parse(await readFile(result.receipt!, 'utf8')) as Record<string, unknown>;
      expect(raw).toMatchObject({
        schema_version: 2,
        strategy: 'plugin_manager',
        capability_evidence: {
          version: { value: '0.144.0', classification: 'tested' },
          capabilities: { scope: 'global', complete: true },
          managerState: 'absent',
        },
        manager_evidence: {
          initial_state: 'absent',
          marketplace: {
            name: 'thoth-mem',
            source: 'EremesNG/thoth-mem',
            pre_existing_verified: false,
            created_by_attempt: true,
            final_verified: true,
          },
          plugin: {
            plugin_id: 'thoth-mem@thoth-mem',
            name: 'thoth-mem',
            marketplace_name: 'thoth-mem',
            pre_existing_verified: false,
            created_by_attempt: true,
            final_verified: true,
          },
          final_verified_at: '2026-07-09T12:00:00.000Z',
        },
        external_checkpoints: [
          expect.objectContaining({ sequence: 1, id: 'codex-marketplace', outcome: 'confirmed' }),
          expect.objectContaining({ sequence: 2, id: 'codex-marketplace', outcome: 'confirmed' }),
          expect.objectContaining({ sequence: 3, id: 'codex-plugin', outcome: 'confirmed' }),
          expect.objectContaining({ sequence: 4, id: 'codex-plugin', outcome: 'confirmed' }),
        ],
      });
      expect(events.indexOf('trace:receipt_in_progress'))
        .toBeLessThan(events.indexOf('manager:plugin marketplace add EremesNG/thoth-mem'));
      expect(JSON.stringify(raw)).not.toContain('private-marketplace-token');
      expect(JSON.stringify(raw)).not.toContain('private-plugin-token');
      expect(JSON.stringify(raw)).not.toContain('private-command-token');

      const loaded = await loadVerifiedReceipt(fixture, result.receipt!);
      expect(loaded.ok).toBe(true);
      const managerEvidence = raw.manager_evidence as Record<string, unknown>;
      raw.manager_evidence = { ...managerEvidence, final_verified_at: null };
      await writeFile(result.receipt!, JSON.stringify(raw), 'utf8');
      expect(await loadVerifiedReceipt(fixture, result.receipt!))
        .toMatchObject({ ok: false, reason: 'hmac_mismatch' });

      const v1 = createSetupReceipt({
        id: 'bounded-v1',
        operation: 'setup',
        status: 'in_progress',
        harness: 'opencode',
        scope: 'global',
        target: fixture.paths.targetRoot,
        package_version: getVersion(),
        force: false,
        started_at: '2026-07-09T12:00:00.000Z',
        updated_at: '2026-07-09T12:00:00.000Z',
        steps: [],
      });
      expect(v1.schema_version).toBe(1);
      expect(v1).not.toHaveProperty('strategy');
      expect(v1).not.toHaveProperty('manager_evidence');
      expect(v1).not.toHaveProperty('external_checkpoints');
    });
  });

  it('stops manager mutation when a V2 attempt checkpoint cannot be persisted', async () => {
    await withTemporaryFixture(async (fixture) => {
      const state: ControlledCodexState = {
        marketplace: false,
        plugin: false,
        mutations: [],
      };
      let receiptRenames = 0;

      const result = await runControlledCodexSetup(fixture, state, {
        receiptFault: ({ point }) => {
          if (point === 'receipt-rename' && ++receiptRenames === 2) {
            throw new Error('checkpoint unavailable');
          }
        },
      });

      expect(result.status).toBe('failed');
      expect(state.mutations).toEqual(['plugin marketplace add EremesNG/thoth-mem']);
      const raw = JSON.parse(await readFile(result.receipt!, 'utf8')) as Record<string, unknown>;
      expect(raw).toMatchObject({
        schema_version: 2,
        status: 'in_progress',
        strategy: 'plugin_manager',
        external_checkpoints: [],
      });
    });
  });

  it('binds legacy setup authority to the exact signed managed fragment only', async () => {
    await withTemporaryFixture(async (fixture) => {
      const state: ControlledCodexState = { marketplace: false, plugin: false, mutations: [] };
      fixture.paths = resolveSetupPaths({
        harness: 'codex',
        scope: 'global',
        planOnly: false,
        force: false,
        json: false,
      }, fixture.roots);
      const original = [
        'model = "gpt-5"',
        'private_token = "must-not-enter-receipt"',
        '',
        '[features]',
        'web_search = true',
        '',
      ].join('\n');
      await mkdir(dirname(fixture.paths.configPath), { recursive: true });
      await writeFile(fixture.paths.configPath, original, 'utf8');

      const legacy = await installLegacyCodex(fixture, state, 'legacy-fragment-evidence-v2');

      expect(legacy).toMatchObject({ status: 'complete', changed: true });
      const raw = JSON.parse(await readFile(legacy.receipt!, 'utf8')) as {
        steps: Array<Record<string, unknown>>;
      };
      const configStep = raw.steps.find((step) => step.id === 'config');
      expect(configStep).toMatchObject({
        outcome: 'confirmed',
        path: fixture.paths.configPath,
        managed_fragment: {
          config_path: fixture.paths.configPath,
          owned_location: CODEX_OWNED_LOCATION,
          operation: 'apply',
          kind: 'insert',
          pre_state: { state: 'absent' },
          post_state: {
            state: 'present',
            sha256: fragmentSha256(CODEX_MANAGED_FRAGMENT),
          },
          restore: {
            leading_separator: '\n',
            before_text: null,
            after_text: CODEX_MANAGED_FRAGMENT,
          },
        },
      });
      expect(configStep).not.toHaveProperty('pre_hash');
      expect(configStep).not.toHaveProperty('post_hash');
      const receiptJson = JSON.stringify(raw);
      expect(receiptJson).not.toContain('must-not-enter-receipt');
      expect(receiptJson).not.toContain('web_search');

      const installed = await readFile(fixture.paths.configPath, 'utf8');
      await writeFile(
        fixture.paths.configPath,
        `${installed}\n[plugins."foreign@market"]\nenabled = true\n`,
        'utf8',
      );
      const rollback = await runControlledCodexSetup(fixture, state, {
        id: 'legacy-fragment-evidence-rollback',
        request: {
          harness: 'codex',
          scope: 'global',
          planOnly: false,
          force: false,
          rollbackReceipt: legacy.receipt!,
          json: false,
        },
      });

      expect(rollback).toMatchObject({ status: 'complete', changed: true });
      const restored = await readFile(fixture.paths.configPath, 'utf8');
      expect(restored).toContain('private_token = "must-not-enter-receipt"');
      expect(restored).toContain('[plugins."foreign@market"]');
      expect(restored).not.toContain('thoth-mem managed');
    });
  });
});

describe('Codex dual-state migration and strategy rollback', () => {
  it('uses an exact signed legacy receipt when live package corroboration is unavailable', async () => {
    await withTemporaryFixture(async (fixture) => {
      const state: ControlledCodexState = { marketplace: false, plugin: false, mutations: [] };
      const legacy = await installLegacyCodex(fixture, state, 'signed-proof-v2');
      expect(legacy.status).toBe('complete');
      await rm(join(fixture.roots.packageRoot, 'plugin'), {
        recursive: true,
        force: true,
      });
      state.version = 'codex-cli 0.144.0';
      state.marketplace = true;
      state.plugin = true;

      const migrated = await runControlledCodexSetup(fixture, state, { id: 'signed-migration-v2' });

      expect(migrated).toMatchObject({ status: 'complete', changed: true });
    });
  });

  it('fails closed when the signed legacy fragment is stale or the receipt is tampered', async () => {
    await withTemporaryFixture(async (fixture) => {
      const state: ControlledCodexState = { marketplace: false, plugin: false, mutations: [] };
      const legacy = await installLegacyCodex(fixture, state, 'stale-proof-v2');
      await rm(join(fixture.roots.packageRoot, 'plugin'), {
        recursive: true,
        force: true,
      });
      await writeFile(
        fixture.paths.configPath,
        (await readFile(fixture.paths.configPath, 'utf8')).replace(
          'enabled = true',
          'enabled = false',
        ),
        'utf8',
      );
      state.version = 'codex-cli 0.144.0';
      state.marketplace = true;
      state.plugin = true;
      const stale = await runControlledCodexSetup(fixture, state, { id: 'stale-migration-v2' });
      expect(stale).toMatchObject({ status: 'requires_user_action', changed: false });

      const raw = JSON.parse(await readFile(legacy.receipt!, 'utf8')) as Record<string, unknown>;
      raw.force = true;
      await writeFile(legacy.receipt!, JSON.stringify(raw), 'utf8');
      const tampered = await runControlledCodexSetup(fixture, state, { id: 'tampered-v2' });
      expect(tampered).toMatchObject({ status: 'requires_user_action', changed: false });
    });
  });

  it('migrates an explicit project target without changing global Codex state', async () => {
    await withTemporaryFixture(async (fixture) => {
      const projectRequest: SetupRequest = {
        harness: 'codex',
        scope: 'project',
        projectPath: fixture.projectPath,
        planOnly: false,
        force: false,
        json: false,
      };
      const state: ControlledCodexState = {
        marketplace: false,
        plugin: false,
        mutations: [],
        projectScoped: true,
      };
      state.version = 'codex-cli 0.145.0';
      const legacy = await runControlledCodexSetup(fixture, state, {
        id: 'project-legacy-v2',
        request: projectRequest,
      });
      expect(legacy.status).toBe('complete');
      const globalRoot = fixture.roots.codexHome!;
      await mkdir(globalRoot, { recursive: true });
      await writeFile(join(globalRoot, 'sentinel.txt'), 'global-unchanged', 'utf8');
      state.version = 'codex-cli 0.144.0';
      state.marketplace = true;
      state.plugin = true;

      const migrated = await runControlledCodexSetup(fixture, state, {
        id: 'project-migration-v2',
        request: projectRequest,
      });

      expect(migrated).toMatchObject({ status: 'complete', changed: true, scope: 'project' });
      expect(await readFile(join(globalRoot, 'sentinel.txt'), 'utf8')).toBe('global-unchanged');
      expect(migrated.target).toBe(join(fixture.projectPath, '.codex'));
    });
  });

  it('preserves usable dual state when the manager checkpoint cannot persist', async () => {
    await withTemporaryFixture(async (fixture) => {
      const state: ControlledCodexState = { marketplace: false, plugin: false, mutations: [] };
      await installLegacyCodex(fixture, state);
      state.version = 'codex-cli 0.144.0';
      state.marketplace = true;
      state.plugin = true;
      let renames = 0;
      const failed = await runControlledCodexSetup(fixture, state, {
        id: 'manager-checkpoint-failure',
        receiptFault: ({ point }) => {
          if (point === 'receipt-rename' && ++renames === 1) {
            throw new Error('manager checkpoint unavailable');
          }
        },
      });
      expect(failed).toMatchObject({ status: 'failed', changed: false });
      expect(await readFile(fixture.paths.configPath, 'utf8')).toContain('thoth-mem managed');
      expect(await stat(fixture.paths.assetPath)).toBeDefined();

      const retried = await runControlledCodexSetup(fixture, state, { id: 'manager-checkpoint-retry' });
      expect(retried).toMatchObject({ status: 'complete', changed: true });
    });
  });

  it.each([
    { name: 'config', failedRename: 2 },
    { name: 'metadata', failedRename: 4 },
    { name: 'assets', failedRename: 6 },
  ])('recovers safely after the $name fragment checkpoint fails', async ({ failedRename }) => {
    await withTemporaryFixture(async (fixture) => {
      const state: ControlledCodexState = { marketplace: false, plugin: false, mutations: [] };
      await installLegacyCodex(fixture, state);
      state.version = 'codex-cli 0.144.0';
      state.marketplace = true;
      state.plugin = true;
      let renames = 0;
      let fragmentCheckpointReached = false;
      const interrupted = await runControlledCodexSetup(fixture, state, {
        id: `fragment-failure-${failedRename}`,
        receiptFault: ({ point }) => {
          if (point === 'receipt-rename' && ++renames === failedRename) {
            fragmentCheckpointReached = true;
            throw new Error('fragment checkpoint unavailable');
          }
        },
      });
      expect(interrupted.status).toBe('failed');
      expect(interrupted.receipt).not.toBeNull();
      expect(fragmentCheckpointReached).toBe(true);

      if (failedRename === 6) {
        const receiptDirectory = dirname(interrupted.receipt!);
        const expectedMetadataBackup = join(
          receiptDirectory,
          'backups',
          'migration-metadata',
          'plugins',
          'thoth-mem',
          'thoth-mem.installation.json',
        );
        const expectedAssetBackup = join(
          receiptDirectory,
          'backups',
          'migration-assets',
          'plugins',
          'thoth-mem',
        );
        const loaded = await loadVerifiedReceipt(fixture, interrupted.receipt!);
        expect(loaded.ok).toBe(true);
        if (!loaded.ok) {
          throw new Error(loaded.reason);
        }
        const metadataStep = loaded.receipt.steps.find((step) => step.id === 'migration-metadata');
        const assetStep = loaded.receipt.steps.find((step) => step.id === 'migration-assets');
        expect(metadataStep).toMatchObject({
          outcome: 'confirmed',
          backup_path: expectedMetadataBackup,
        });
        expect(assetStep).toMatchObject({
          outcome: 'planned',
          backup_path: expectedAssetBackup,
        });
        expect(assetStep?.backup_path).not.toBe(metadataStep?.backup_path);
        expect(relative(receiptDirectory, metadataStep!.backup_path!)).toBe(join(
          'backups',
          'migration-metadata',
          'plugins',
          'thoth-mem',
          'thoth-mem.installation.json',
        ));
        expect(relative(receiptDirectory, assetStep!.backup_path!)).toBe(join(
          'backups',
          'migration-assets',
          'plugins',
          'thoth-mem',
        ));
      }

      const recovered = await runControlledCodexSetup(fixture, state, {
        id: `fragment-recovery-${failedRename}`,
        request: {
          harness: 'codex',
          scope: 'global',
          planOnly: false,
          force: false,
          rollbackReceipt: interrupted.receipt!,
          json: false,
        },
      });
      expect(recovered.status).toBe('complete');
      expect(await readFile(fixture.paths.configPath, 'utf8')).toContain('thoth-mem managed');
      expect(await stat(fixture.paths.assetPath)).toBeDefined();
    });
  });

  it('checkpoints verified manager state before removing each proven legacy fragment', async () => {
    await withTemporaryFixture(async (fixture) => {
      const events: string[] = [];
      const state: ControlledCodexState = {
        marketplace: false,
        plugin: false,
        mutations: [],
        events,
      };
      const legacy = await installLegacyCodex(fixture, state);
      expect(legacy.status).toBe('complete');
      state.version = 'codex-cli 0.144.0';
      state.marketplace = true;
      state.plugin = true;

      const migrated = await runControlledCodexSetup(fixture, state, {
        id: 'migration-v2',
        trace: ({ kind, path }) => events.push(`trace:${kind}:${path ?? ''}`),
      });

      expect(migrated).toMatchObject({ status: 'complete', changed: true });
      expect(await readFile(fixture.paths.configPath, 'utf8')).not.toContain('thoth-mem managed');
      await expect(stat(fixture.paths.assetPath)).rejects.toMatchObject({ code: 'ENOENT' });
      const raw = JSON.parse(await readFile(migrated.receipt!, 'utf8')) as {
        steps: Array<{ id: string; outcome: string; backup_path?: string }>;
      };
      expect(raw.steps).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'migration-manager', outcome: 'confirmed' }),
        expect.objectContaining({ id: 'migration-config', outcome: 'confirmed' }),
        expect.objectContaining({ id: 'migration-metadata', outcome: 'confirmed' }),
        expect.objectContaining({ id: 'migration-assets', outcome: 'confirmed' }),
        expect.objectContaining({ id: 'verify', outcome: 'confirmed' }),
      ]));
      const managerCheckpoint = events.findIndex((event) => event.startsWith('trace:migration_manager_checkpoint'));
      const firstRemoval = events.findIndex((event) => event.startsWith('trace:migration_fragment_removed'));
      expect(managerCheckpoint).toBeGreaterThanOrEqual(0);
      expect(managerCheckpoint).toBeLessThan(firstRemoval);
      expect(state.mutations).toEqual([]);
    });
  });

  it('records migration removal and restores from signed fragment evidence around unrelated edits', async () => {
    await withTemporaryFixture(async (fixture) => {
      const state: ControlledCodexState = { marketplace: false, plugin: false, mutations: [] };
      fixture.paths = resolveSetupPaths({
        harness: 'codex',
        scope: 'global',
        planOnly: false,
        force: false,
        json: false,
      }, fixture.roots);
      await mkdir(dirname(fixture.paths.configPath), { recursive: true });
      await writeFile(
        fixture.paths.configPath,
        'model = "gpt-5"\nprivate_token = "migration-secret"\n',
        'utf8',
      );
      const legacy = await installLegacyCodex(fixture, state, 'legacy-before-bounded-migration');
      expect(legacy.status).toBe('complete');
      await writeFile(
        fixture.paths.configPath,
        `${await readFile(fixture.paths.configPath, 'utf8')}\n[plugins."foreign-before@market"]\nenabled = true\n`,
        'utf8',
      );
      await rm(join(fixture.roots.packageRoot, 'plugin'), {
        recursive: true,
        force: true,
      });
      state.version = 'codex-cli 0.144.0';
      state.marketplace = true;
      state.plugin = true;

      const migrated = await runControlledCodexSetup(fixture, state, {
        id: 'bounded-migration-fragment-v2',
      });

      expect(migrated).toMatchObject({ status: 'complete', changed: true });
      const raw = JSON.parse(await readFile(migrated.receipt!, 'utf8')) as {
        steps: Array<Record<string, unknown>>;
      };
      const configStep = raw.steps.find((step) => step.id === 'migration-config');
      expect(configStep).toMatchObject({
        outcome: 'confirmed',
        path: fixture.paths.configPath,
        managed_fragment: {
          config_path: fixture.paths.configPath,
          owned_location: CODEX_OWNED_LOCATION,
          operation: 'remove',
          kind: 'insert',
          pre_state: {
            state: 'present',
            sha256: fragmentSha256(CODEX_MANAGED_FRAGMENT),
          },
          post_state: { state: 'absent' },
          restore: {
            before_text: null,
            after_text: CODEX_MANAGED_FRAGMENT,
          },
        },
      });
      expect(configStep).not.toHaveProperty('pre_hash');
      expect(configStep).not.toHaveProperty('post_hash');
      const receiptJson = JSON.stringify(raw);
      expect(receiptJson).not.toContain('migration-secret');
      expect(receiptJson).not.toContain('foreign-before@market');

      await writeFile(
        fixture.paths.configPath,
        `${await readFile(fixture.paths.configPath, 'utf8')}\n[plugins."foreign-after@market"]\nenabled = true\n`,
        'utf8',
      );
      const rollback = await runControlledCodexSetup(fixture, state, {
        id: 'bounded-migration-fragment-rollback',
        request: {
          harness: 'codex',
          scope: 'global',
          planOnly: false,
          force: false,
          rollbackReceipt: migrated.receipt!,
          json: false,
        },
      });

      expect(rollback).toMatchObject({ status: 'complete', changed: true });
      const restored = await readFile(fixture.paths.configPath, 'utf8');
      expect(restored).toContain('private_token = "migration-secret"');
      expect(restored).toContain('[plugins."foreign-before@market"]');
      expect(restored).toContain('[plugins."foreign-after@market"]');
      expect(restored).toContain('thoth-mem managed');
    });
  });

  it('accepts complete corroborating legacy proof without a prior receipt', async () => {
    await withTemporaryFixture(async (fixture) => {
      const state: ControlledCodexState = { marketplace: false, plugin: false, mutations: [] };
      const legacy = await installLegacyCodex(fixture, state);
      expect(legacy.status).toBe('complete');
      await rm(receiptBasePath(fixture), { recursive: true, force: true });
      state.version = 'codex-cli 0.144.0';
      state.marketplace = true;
      state.plugin = true;

      const migrated = await runControlledCodexSetup(fixture, state, { id: 'corroborated-v2' });

      expect(migrated).toMatchObject({ status: 'complete', changed: true });
      expect(state.mutations).toEqual([]);
    });
  });

  it.each([
    {
      name: 'missing metadata',
      mutate: async (fixture: SetupFixture) => unlink(join(
        fixture.paths.assetPath,
        'thoth-mem.installation.json',
      )),
    },
    {
      name: 'drifted owned content',
      mutate: async (fixture: SetupFixture) => writeFile(
        join(fixture.paths.assetPath, 'codex.mcp.json'),
        '{"drifted":true}\n',
        'utf8',
      ),
    },
    {
      name: 'missing exact marker',
      mutate: async (fixture: SetupFixture) => writeFile(
        fixture.paths.configPath,
        'model = "keep"\n',
        'utf8',
      ),
    },
  ])('keeps partial corroborating proof zero-write: $name', async ({ mutate }) => {
    await withTemporaryFixture(async (fixture) => {
      const state: ControlledCodexState = { marketplace: false, plugin: false, mutations: [] };
      await installLegacyCodex(fixture, state);
      await rm(receiptBasePath(fixture), { recursive: true, force: true });
      await mutate(fixture);
      const configBefore = await readFile(fixture.paths.configPath, 'utf8');
      state.version = 'codex-cli 0.144.0';
      state.marketplace = true;
      state.plugin = true;

      const result = await runControlledCodexSetup(fixture, state, {
        id: 'ambiguous-v2',
        request: {
          harness: 'codex',
          scope: 'global',
          planOnly: false,
          force: true,
          json: false,
        },
      });

      expect(result).toMatchObject({ status: 'requires_user_action', changed: false, receipt: null });
      expect(await readFile(fixture.paths.configPath, 'utf8')).toBe(configBefore);
      expect(state.mutations).toEqual([]);
    });
  });

  it('keeps modern manager rollback manual-only and never touches cache or config', async () => {
    await withTemporaryFixture(async (fixture) => {
      const state: ControlledCodexState = { marketplace: false, plugin: false, mutations: [] };
      const modern = await runControlledCodexSetup(fixture, state, { id: 'modern-created-v2' });
      expect(modern.status).toBe('complete');
      const configPath = fixture.paths.configPath;
      await mkdir(dirname(configPath), { recursive: true });
      await writeFile(configPath, 'user_setting = true\n', 'utf8');

      const rollback = await runControlledCodexSetup(fixture, state, {
        id: 'modern-rollback',
        request: {
          harness: 'codex',
          scope: 'global',
          planOnly: false,
          force: false,
          rollbackReceipt: modern.receipt!,
          json: false,
        },
      });

      expect(rollback).toMatchObject({ status: 'requires_user_action', changed: false });
      expect(rollback.manual_actions.join(' ')).toContain('Codex plugin manager');
      expect(await readFile(configPath, 'utf8')).toBe('user_setting = true\n');
      expect(state.mutations).toEqual([
        'plugin marketplace add EremesNG/thoth-mem',
        'plugin add thoth-mem',
      ]);
    });
  });

  it('rolls back legacy setup by removing only its marker and owned assets', async () => {
    await withTemporaryFixture(async (fixture) => {
      const state: ControlledCodexState = { marketplace: false, plugin: false, mutations: [] };
      const legacy = await installLegacyCodex(fixture, state);
      const installed = await readFile(fixture.paths.configPath, 'utf8');
      await writeFile(
        fixture.paths.configPath,
        `${installed}\n[plugins."foreign@market"]\nenabled = true\n`,
        'utf8',
      );

      const rollback = await runControlledCodexSetup(fixture, state, {
        id: 'legacy-rollback',
        request: {
          harness: 'codex',
          scope: 'global',
          planOnly: false,
          force: false,
          rollbackReceipt: legacy.receipt!,
          json: false,
        },
      });

      expect(rollback).toMatchObject({ status: 'complete', changed: true });
      const restored = await readFile(fixture.paths.configPath, 'utf8');
      expect(restored).toContain('[plugins."foreign@market"]');
      expect(restored).not.toContain('thoth-mem managed');
      await expect(stat(fixture.paths.assetPath)).rejects.toMatchObject({ code: 'ENOENT' });
    });
  });

  it('restores only migration-owned legacy fragments and keeps later config edits', async () => {
    await withTemporaryFixture(async (fixture) => {
      const state: ControlledCodexState = { marketplace: false, plugin: false, mutations: [] };
      await installLegacyCodex(fixture, state);
      state.version = 'codex-cli 0.144.0';
      state.marketplace = true;
      state.plugin = true;
      const migrated = await runControlledCodexSetup(fixture, state, { id: 'migration-for-rollback' });
      expect(migrated.status).toBe('complete');
      await writeFile(
        fixture.paths.configPath,
        'user_setting = true\n\n[plugins."foreign@market"]\nenabled = true\n',
        'utf8',
      );

      const rollback = await runControlledCodexSetup(fixture, state, {
        id: 'migration-rollback',
        request: {
          harness: 'codex',
          scope: 'global',
          planOnly: false,
          force: false,
          rollbackReceipt: migrated.receipt!,
          json: false,
        },
      });

      expect(rollback).toMatchObject({ status: 'complete', changed: true });
      const restored = await readFile(fixture.paths.configPath, 'utf8');
      expect(restored).toContain('user_setting = true');
      expect(restored).toContain('[plugins."foreign@market"]');
      expect(restored).toContain('thoth-mem managed');
      expect(await stat(fixture.paths.assetPath)).toBeDefined();

      const repeated = await runControlledCodexSetup(fixture, state, {
        id: 'migration-rollback-repeat',
        request: {
          harness: 'codex',
          scope: 'global',
          planOnly: false,
          force: false,
          rollbackReceipt: migrated.receipt!,
          json: false,
        },
      });
      expect(repeated).toMatchObject({ status: 'complete', changed: false });
    });
  });
});

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
  it('recomposes and restores only the exact Codex managed fragment around later edits', async () => {
    const codexHarness: Record<string, unknown> = await import('../../src/setup/harnesses/codex.js');
    const planFragment: unknown = codexHarness.planCodexManagedFragment;
    const applyFragment: unknown = codexHarness.applyCodexManagedFragment;
    const restoreFragment: unknown = codexHarness.restoreCodexManagedFragment;

    expect(typeof planFragment).toBe('function');
    expect(typeof applyFragment).toBe('function');
    expect(typeof restoreFragment).toBe('function');
    if (
      typeof planFragment !== 'function'
      || typeof applyFragment !== 'function'
      || typeof restoreFragment !== 'function'
    ) {
      return;
    }

    const original = 'model = "gpt-5"\n\n[features]\nweb_search = true\n';
    const planned = planFragment({ before: original, force: false }) as {
      fragment: unknown;
      conflicts: unknown[];
    };
    expect(planned.conflicts).toEqual([]);
    const withLateUserEdit = `${original}\n[user]\nkeep = "later"\n`;
    const installed = applyFragment(withLateUserEdit, planned.fragment) as string;
    expect(installed).toContain('[user]\nkeep = "later"');

    const withLaterCodexEdit = `${installed}\n[plugins."foreign@market"]\nenabled = true\n`;
    const restored = restoreFragment(withLaterCodexEdit, planned.fragment) as string;
    expect(restored).toBe(`${withLateUserEdit}\n[plugins."foreign@market"]\nenabled = true\n`);
    expect(restored).not.toContain('thoth-mem managed');
  });

  it('rejects ambiguous Codex marker contents even with force', async () => {
    const codexHarness: Record<string, unknown> = await import('../../src/setup/harnesses/codex.js');
    const planFragment: unknown = codexHarness.planCodexManagedFragment;
    expect(typeof planFragment).toBe('function');
    if (typeof planFragment !== 'function') {
      return;
    }
    const before = [
      '# >>> thoth-mem managed >>>',
      '[plugins."thoth-mem".mcp_servers."thoth-mem"]',
      'enabled = true',
      '[plugins."thoth-mem@thoth-mem"]',
      'enabled = true',
      '# <<< thoth-mem managed <<<',
      '',
    ].join('\n');

    const plan = planFragment({ before, force: true }) as {
      changed: boolean;
      conflicts: Array<{ forceable: boolean }>;
    };
    expect(plan.changed).toBe(false);
    expect(plan.conflicts).toEqual([expect.objectContaining({ forceable: false })]);
  });
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

  it('rolls back the bundled skill only from receipt-owned OpenCode assets', async () => {
    await withTemporaryFixture(async (fixture) => {
      const sharedSkillRoot = join(fixture.paths.targetRoot, 'skills');
      const sharedSentinel = join(sharedSkillRoot, 'user-owned-skill', 'SKILL.md');
      await mkdir(dirname(sharedSentinel), { recursive: true });
      await writeFile(sharedSentinel, '# user owned\n', 'utf8');

      const setup = await runSetup(fixture, fixture.request, { ids: ['setup-with-skill'] });
      expect(setup, JSON.stringify(setup)).toMatchObject({
        status: 'complete',
        changed: true,
      });
      const installedSkill = join(
        fixture.paths.assetPath,
        'opencode',
        'skills',
        'thoth-mem',
        'SKILL.md',
      );
      expect(await readFile(installedSkill, 'utf8')).toBe('# packaged skill\n');

      const rollback = await runSetup(fixture, {
        ...fixture.request,
        rollbackReceipt: setup.receipt!,
      }, { ids: ['rollback-with-skill'] });

      expect(rollback, JSON.stringify(rollback)).toMatchObject({
        status: 'complete',
        changed: true,
      });
      await expect(stat(fixture.paths.assetPath)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readFile(sharedSentinel, 'utf8')).toBe('# user owned\n');
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
