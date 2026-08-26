import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { getRuntimeConfigPath, loadRuntimeConfig, persistRuntimeDataDir } from '../config/runtime.js';
import {
  desiredOpenCodePlugins,
  getOpenCodeConfigDirectory,
  inspectOpenCodeConfig,
  isThothMemPluginEntry,
  updateOpenCodePluginText,
  type OpenCodeConfigOptions,
} from './opencode-config.js';
import { inspectOpenCodeSkill, restoreOpenCodeSkill, stageOpenCodeSkill } from './opencode-skills.js';
import { atomicWriteText, isPathWithin } from './transaction.js';

export type OpenCodeSetupMode = 'public' | 'local';

export interface OpenCodeSetupOptions extends OpenCodeConfigOptions {
  mode: OpenCodeSetupMode;
  packageRoot?: string;
  dataDir?: string;
  planOnly?: boolean;
  failAfter?: 'provider' | 'config' | 'skill';
  interruptAfter?: 'config';
}

export interface OpenCodeSetupResult {
  status: 'planned' | 'complete';
  changed: boolean;
  plugin: string;
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
  priorManagedPlugins: string[];
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
  return pathToFileURL(entry).href;
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
    !Array.isArray(journal.priorManagedPlugins) || journal.priorManagedPlugins.some((entry) => typeof entry !== 'string') ||
    (journal.providerBeforeText !== null && typeof journal.providerBeforeText !== 'string')
  ) throw new Error('OpenCode in-progress receipt is invalid');
  return journal;
}

function restoreManagedConfig(journal: OpenCodeJournal): void {
  if (!existsSync(journal.configPath)) return;
  const current = inspectOpenCodeConfig({ env: { OPENCODE_CONFIG_DIR: journal.configDirectory } });
  const restored = [...current.plugins.filter((entry) => !isThothMemPluginEntry(entry)), ...journal.priorManagedPlugins];
  if (!journal.configExisted && restored.length === 0) {
    rmSync(journal.configPath, { force: true });
    return;
  }
  const text = updateOpenCodePluginText(current.text, restored);
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
  rollbackJournal(journal);
  rmSync(journalPath, { force: true });
  return true;
}

export function setupOpenCode(options: OpenCodeSetupOptions): OpenCodeSetupResult {
  const packageRoot = resolve(options.packageRoot ?? defaultPackageRoot());
  const version = packageVersion(packageRoot);
  const plugin = desiredPlugin(options.mode, packageRoot, version);
  const configDirectory = getOpenCodeConfigDirectory(options);
  const skillSource = join(packageRoot, 'integrations', 'opencode', 'skills', 'thoth-mem');
  const skillPath = join(configDirectory, 'skills', 'thoth-mem');
  const receiptDirectory = join(configDirectory, '.thoth-mem');
  const receiptPath = join(receiptDirectory, 'opencode.json');
  const journalPath = join(receiptDirectory, 'opencode.in-progress.json');
  const providerConfigPath = getRuntimeConfigPath(options);
  const actions = [
    `converge one OpenCode plugin entry to ${plugin}`,
    `synchronize the owned global Skill at ${skillPath}`,
    options.dataDir ? `persist provider data directory ${resolve(options.dataDir)}` : 'preserve provider configuration',
    'restart OpenCode and verify plugin, MCP, Skill, hooks, and recovery',
  ];

  if (options.planOnly) {
    const config = inspectOpenCodeConfig(options);
    inspectOpenCodeSkill(skillSource, skillPath);
    loadRuntimeConfig(options);
    return { status: 'planned', changed: false, plugin, configPath: config.path, skillPath, providerConfigPath, receiptPath: null, actions, recovered: false, warnings: [] };
  }

  const recovered = recoverInterruptedSetup(journalPath, configDirectory, providerConfigPath);
  const config = inspectOpenCodeConfig(options);
  const wantedPlugins = desiredOpenCodePlugins(config.plugins, plugin);
  const skill = inspectOpenCodeSkill(skillSource, skillPath);
  const runtime = loadRuntimeConfig(options);
  const wantedDataDir = options.dataDir ? resolve(options.dataDir) : null;
  const configCurrent = JSON.stringify(config.plugins) === JSON.stringify(wantedPlugins);
  const providerCurrent = wantedDataDir === null || (runtime.provider?.dataDir ? resolve(runtime.provider.dataDir) === wantedDataDir : false);
  if (configCurrent && skill.current && providerCurrent) {
    return { status: 'complete', changed: false, plugin, configPath: config.path, skillPath, providerConfigPath, receiptPath: existsSync(receiptPath) ? receiptPath : null, actions, recovered, warnings: [] };
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
    skillPath,
    skillExisted: existsSync(skillPath),
    skillChanged: !skill.current,
    skillBackupPath,
    providerConfigPath,
    providerExisted,
    providerChanged: !providerCurrent,
    providerBeforeText: providerExisted ? readFileSync(providerConfigPath, 'utf8') : null,
  };
  atomicWriteText(journalPath, `${JSON.stringify(journal, null, 2)}\n`);

  try {
    if (!providerCurrent && wantedDataDir) persistRuntimeDataDir(wantedDataDir, options);
    injectFailure(options.failAfter, 'provider');

    const nextConfigText = updateOpenCodePluginText(config.text, wantedPlugins);
    if (nextConfigText !== config.text) atomicWriteText(config.path, nextConfigText);
    injectFailure(options.failAfter, 'config');
    if (options.interruptAfter === 'config') throw new SimulatedOpenCodeInterruption('Simulated OpenCode setup interruption after config');

    if (!skill.current) stageOpenCodeSkill(skillSource, skillPath, skillBackupPath);
    injectFailure(options.failAfter, 'skill');

    const verifiedConfig = inspectOpenCodeConfig(options);
    const verifiedSkill = inspectOpenCodeSkill(skillSource, skillPath);
    const verifiedRuntime = loadRuntimeConfig(options);
    if (JSON.stringify(verifiedConfig.plugins) !== JSON.stringify(wantedPlugins) || !verifiedSkill.current || (wantedDataDir && (!verifiedRuntime.provider?.dataDir || resolve(verifiedRuntime.provider.dataDir) !== wantedDataDir))) {
      throw new Error('OpenCode setup post-state verification failed');
    }

    const receipt = {
      schemaVersion: 1,
      host: 'opencode',
      result: 'complete',
      provenance: options.mode,
      plugin,
      configPath: config.path,
      skillPath,
      skillHash: verifiedSkill.sourceHash,
      providerConfigPath,
      dataDir: wantedDataDir,
      verification: { plugin: true, skill: true, provider: true },
    };
    atomicWriteText(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    rmSync(skillBackupPath, { recursive: true, force: true });
    rmSync(journalPath, { force: true });
    return { status: 'complete', changed: true, plugin, configPath: config.path, skillPath, providerConfigPath, receiptPath, actions, recovered, warnings: [] };
  } catch (error) {
    if (error instanceof SimulatedOpenCodeInterruption) throw error;
    try {
      rollbackJournal(journal);
      rmSync(journalPath, { force: true });
    } catch (rollbackError) {
      throw new Error(`OpenCode setup failed and bounded rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`, { cause: error });
    }
    throw error;
  }
}
