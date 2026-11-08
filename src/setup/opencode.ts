import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'jsonc-parser';

import { getRuntimeConfigPath, loadRuntimeConfig, persistRuntimeDataDir } from '../config/runtime.js';
import {
  desiredOpenCodePlugins,
  getOpenCodeConfigDirectory,
  inspectOpenCodeConfig,
  isThothMemPluginEntry,
  updateOpenCodePluginText,
  type OpenCodeConfigOptions,
} from './opencode-config.js';
import { inspectOpenCodeSkill, restoreOpenCodeSkill } from './opencode-skills.js';
import { atomicWriteText, isPathWithin } from './transaction.js';

export type OpenCodeSetupMode = 'public' | 'local';

export interface OpenCodeSetupOptions extends OpenCodeConfigOptions {
  mode: OpenCodeSetupMode;
  packageRoot?: string;
  dataDir?: string;
  planOnly?: boolean;
  versionRunner?: () => string | null;
  failAfter?: 'provider' | 'config' | 'skill';
  interruptAfter?: 'config' | 'receipt';
}

export interface OpenCodeSetupResult {
  status: 'planned' | 'complete';
  changed: boolean;
  plugin: string;
  opencodeVersion: string;
  configPath: string;
  skillPath: string;
  providerConfigPath: string;
  receiptPath: string | null;
  actions: string[];
  recovered: boolean;
  warnings: string[];
}

interface OpenCodeJournal {
  schemaVersion: 1;
  host: 'opencode';
  operationId: string;
  configDirectory: string;
  configPath: string;
  configExisted: boolean;
  configChanged: boolean;
  priorManagedPlugins: unknown[];
  configBeforeText?: string;
  configAfterText?: string;
  skillPath: string;
  skillExisted: boolean;
  skillChanged: boolean;
  skillBackupPath: string;
  providerConfigPath: string;
  providerExisted: boolean;
  providerChanged: boolean;
  providerBeforeText: string | null;
}

class SimulatedOpenCodeInterruption extends Error {}

function defaultPackageRoot(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  return basename(moduleDirectory) === 'dist' ? dirname(moduleDirectory) : resolve(moduleDirectory, '../..');
}

function packageVersion(packageRoot: string): string {
  const value = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as { name?: unknown; version?: unknown };
  if (value.name !== 'thoth-mem' || typeof value.version !== 'string' || !/^\d+\.\d+\.\d+$/u.test(value.version)) {
    throw new Error('Executing thoth-mem package metadata is invalid');
  }
  return value.version;
}

function desiredPlugin(mode: OpenCodeSetupMode, packageRoot: string, version: string): string {
  if (mode === 'public') return `thoth-mem@${version}`;
  const entry = join(packageRoot, 'dist', 'opencode.js');
  if (!existsSync(entry) || !statSync(entry).isFile()) throw new Error('Local OpenCode setup requires an explicit package root with dist/opencode.js');
  // V2 resolves local plugins from package directories, not bundle file URLs.
  return packageRoot;
}

function injectFailure(stage: OpenCodeSetupOptions['failAfter'], current: NonNullable<OpenCodeSetupOptions['failAfter']>): void {
  if (stage === current) throw new Error(`Injected setup failure after ${current}`);
}

function validateJournal(value: unknown, configDirectory: string, providerConfigPath: string): OpenCodeJournal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('OpenCode in-progress receipt is invalid');
  const journal = value as OpenCodeJournal;
  const receiptDirectory = join(configDirectory, '.thoth-mem');
  if (
    journal.schemaVersion !== 1 || journal.host !== 'opencode' || journal.configDirectory !== configDirectory ||
    !isPathWithin(configDirectory, journal.configPath) || !isPathWithin(configDirectory, journal.skillPath) ||
    !isPathWithin(receiptDirectory, journal.skillBackupPath) || journal.providerConfigPath !== providerConfigPath ||
    typeof journal.configChanged !== 'boolean' || typeof journal.skillChanged !== 'boolean' || typeof journal.providerChanged !== 'boolean' ||
    !Array.isArray(journal.priorManagedPlugins) ||
    (journal.configBeforeText !== undefined && typeof journal.configBeforeText !== 'string') ||
    (journal.configAfterText !== undefined && typeof journal.configAfterText !== 'string') ||
    (journal.providerBeforeText !== null && typeof journal.providerBeforeText !== 'string')
  ) throw new Error('OpenCode in-progress receipt is invalid');
  return journal;
}

function restoreManagedConfig(journal: OpenCodeJournal): void {
  if (!existsSync(journal.configPath)) return;
  const current = inspectOpenCodeConfig({ env: { OPENCODE_CONFIG_DIR: journal.configDirectory } });
  if (journal.configBeforeText !== undefined && current.text === journal.configAfterText) {
    if (!journal.configExisted) rmSync(journal.configPath, { force: true });
    else atomicWriteText(journal.configPath, journal.configBeforeText);
    return;
  }
  // Preserve concurrent unrelated edits; old V1 journals restore into the legacy key.
  const prior = journal.configBeforeText === undefined ? null : parse(journal.configBeforeText) as { plugin?: string[] };
  const restored = [...current.plugins.filter((entry) => !isThothMemPluginEntry(entry)), ...(prior ? journal.priorManagedPlugins : [])];
  const priorLegacy = prior ? (prior.plugin ?? []).filter(isThothMemPluginEntry) : journal.priorManagedPlugins.filter((entry): entry is string => typeof entry === 'string');
  const legacy = [...current.legacyPlugins.filter((entry) => !isThothMemPluginEntry(entry)), ...priorLegacy];
  const text = updateOpenCodePluginText(current.text, restored, legacy);
  if (text !== current.text) atomicWriteText(journal.configPath, text);
}

function rollbackJournal(journal: OpenCodeJournal): void {
  if (journal.skillChanged) restoreOpenCodeSkill(journal.skillPath, journal.skillBackupPath, journal.skillExisted);
  if (journal.configChanged) restoreManagedConfig(journal);
  if (journal.providerChanged) {
    if (journal.providerExisted && journal.providerBeforeText !== null) atomicWriteText(journal.providerConfigPath, journal.providerBeforeText);
    else rmSync(journal.providerConfigPath, { force: true });
  }
}

function recoverInterruptedSetup(journalPath: string, configDirectory: string, providerConfigPath: string): boolean {
  if (!existsSync(journalPath)) return false;
  const journal = validateJournal(JSON.parse(readFileSync(journalPath, 'utf8')) as unknown, configDirectory, providerConfigPath);
  // A matching durable receipt is the commit point. Finish cleanup rather than
  // restoring a Skill after the receipt has deliberately relinquished ownership.
  let committed = false;
  try {
    const receipt = JSON.parse(readFileSync(join(configDirectory, '.thoth-mem', 'opencode.json'), 'utf8')) as { schemaVersion?: unknown; operationId?: unknown };
    committed = receipt.schemaVersion === 2 && receipt.operationId === journal.operationId;
  } catch { /* No committed receipt: recover the prior owned state. */ }
  if (committed) rmSync(journal.skillBackupPath, { recursive: true, force: true });
  else rollbackJournal(journal);
  rmSync(journalPath, { force: true });
  return true;
}

function installedOpenCodeVersion(): string | null {
  const options = { encoding: 'utf8' as const, timeout: 5_000, maxBuffer: 16_384, windowsHide: true };
  // Windows shims need a shell; keep its command fixed and omit shell arguments (DEP0190).
  const result = process.platform === 'win32'
    ? spawnSync('opencode --version', { ...options, shell: true })
    : spawnSync('opencode', ['--version'], { ...options, shell: false });
  return result.status === 0 && !result.error ? result.stdout : null;
}

function requireOpenCodeVersion(runner: () => string | null): string {
  let output: string | null = null;
  try { output = runner(); } catch { /* Missing or failed executable fails closed. */ }
  const match = /^(?:opencode\s+)?v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/iu.exec(output?.trim() ?? '');
  if (!match || !(Number(match[1]) > 2 || (Number(match[1]) === 2 && (Number(match[2]) > 2 || (Number(match[2]) === 2 && Number(match[3]) >= 6))))) {
    throw new Error('OpenCode stable 2.2.6 or later is required; install or upgrade OpenCode and ensure opencode --version works before setup.');
  }
  return `${match[1]}.${match[2]}.${match[3]}`;
}

export function setupOpenCode(options: OpenCodeSetupOptions): OpenCodeSetupResult {
  const opencodeVersion = requireOpenCodeVersion(options.versionRunner ?? installedOpenCodeVersion);
  const packageRoot = resolve(options.packageRoot ?? defaultPackageRoot());
  const version = packageVersion(packageRoot);
  const plugin = desiredPlugin(options.mode, packageRoot, version);
  const configDirectory = getOpenCodeConfigDirectory(options);
  const skillPath = join(configDirectory, 'skills', 'thoth-mem');
  const receiptDirectory = join(configDirectory, '.thoth-mem');
  const receiptPath = join(receiptDirectory, 'opencode.json');
  const journalPath = join(receiptDirectory, 'opencode.in-progress.json');
  const providerConfigPath = getRuntimeConfigPath(options);
  const actions = [
    `converge one OpenCode plugin entry to ${plugin}`,
    `remove only an unmodified receipt-owned copied Skill at ${skillPath}; use the packaged Skill`,
    options.dataDir ? `persist provider data directory ${resolve(options.dataDir)}` : 'preserve provider configuration',
    'restart OpenCode and verify native tools, packaged Skill, lifecycle, and recovery',
  ];

  if (options.planOnly) {
    const config = inspectOpenCodeConfig(options);
    const skill = inspectOpenCodeSkill(skillPath, receiptPath);
    loadRuntimeConfig(options);
    return { status: 'planned', changed: false, plugin, opencodeVersion, configPath: config.path, skillPath, providerConfigPath, receiptPath: null, actions, recovered: false, warnings: skill.warnings };
  }

  const recovered = recoverInterruptedSetup(journalPath, configDirectory, providerConfigPath);
  const config = inspectOpenCodeConfig(options);
  const wantedPlugins = desiredOpenCodePlugins(config.plugins, plugin);
  const skill = inspectOpenCodeSkill(skillPath, receiptPath);
  const runtime = loadRuntimeConfig(options);
  const wantedDataDir = options.dataDir ? resolve(options.dataDir) : null;
  const nextConfigText = updateOpenCodePluginText(config.text, wantedPlugins);
  const configCurrent = nextConfigText === config.text;
  let receiptCurrent = false;
  try {
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8')) as { schemaVersion?: unknown; host?: unknown; plugin?: unknown };
    receiptCurrent = receipt.schemaVersion === 2 && receipt.host === 'opencode' && receipt.plugin === plugin;
  } catch { /* Missing or stale receipt is repaired. */ }
  const providerCurrent = wantedDataDir === null || (runtime.provider?.dataDir ? resolve(runtime.provider.dataDir) === wantedDataDir : false);
  if (configCurrent && !skill.remove && providerCurrent && receiptCurrent) {
    return { status: 'complete', changed: false, plugin, opencodeVersion, configPath: config.path, skillPath, providerConfigPath, receiptPath: existsSync(receiptPath) ? receiptPath : null, actions, recovered, warnings: skill.warnings };
  }

  const skillBackupPath = join(receiptDirectory, `opencode-skill-backup-${randomUUID()}`);
  const providerExisted = existsSync(providerConfigPath);
  const journal: OpenCodeJournal = {
    schemaVersion: 1,
    host: 'opencode',
    operationId: randomUUID(),
    configDirectory,
    configPath: config.path,
    configExisted: existsSync(config.path),
    configChanged: !configCurrent,
    priorManagedPlugins: config.managedPlugins,
    configBeforeText: config.text,
    configAfterText: nextConfigText,
    skillPath,
    skillExisted: existsSync(skillPath),
    skillChanged: skill.remove,
    skillBackupPath,
    providerConfigPath,
    providerExisted,
    providerChanged: !providerCurrent,
    providerBeforeText: providerExisted ? readFileSync(providerConfigPath, 'utf8') : null,
  };
  atomicWriteText(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
  let committed = false;

  try {
    if (!providerCurrent && wantedDataDir) persistRuntimeDataDir(wantedDataDir, options);
    injectFailure(options.failAfter, 'provider');

    if (nextConfigText !== config.text) atomicWriteText(config.path, nextConfigText);
    injectFailure(options.failAfter, 'config');
    if (options.interruptAfter === 'config') throw new SimulatedOpenCodeInterruption('Simulated OpenCode setup interruption after config');

    if (skill.remove) renameSync(skillPath, skillBackupPath);
    injectFailure(options.failAfter, 'skill');

    const verifiedConfig = inspectOpenCodeConfig(options);
    const verifiedRuntime = loadRuntimeConfig(options);
    if (JSON.stringify(verifiedConfig.plugins) !== JSON.stringify(wantedPlugins) || verifiedConfig.legacyPlugins.some(isThothMemPluginEntry) || (skill.remove && existsSync(skillPath)) || (wantedDataDir && (!verifiedRuntime.provider?.dataDir || resolve(verifiedRuntime.provider.dataDir) !== wantedDataDir))) {
      throw new Error('OpenCode setup post-state verification failed');
    }

    const receipt = {
      schemaVersion: 2,
      operationId: journal.operationId,
      host: 'opencode',
      result: 'complete',
      provenance: options.mode,
      plugin,
      configPath: config.path,
      skill: 'packaged',
      providerConfigPath,
      dataDir: wantedDataDir,
      verification: { plugin: true, provider: true },
    };
    atomicWriteText(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    committed = true;
    if (options.interruptAfter === 'receipt') throw new SimulatedOpenCodeInterruption('Simulated OpenCode setup interruption after receipt');
    rmSync(skillBackupPath, { recursive: true, force: true });
    rmSync(journalPath, { force: true });
    return { status: 'complete', changed: true, plugin, opencodeVersion, configPath: config.path, skillPath, providerConfigPath, receiptPath, actions, recovered, warnings: skill.warnings };
  } catch (error) {
    if (committed || error instanceof SimulatedOpenCodeInterruption) throw error;
    try {
      rollbackJournal(journal);
      rmSync(journalPath, { force: true });
    } catch (rollbackError) {
      throw new Error(`OpenCode setup failed and bounded rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`, { cause: error });
    }
    throw error;
  }
}
