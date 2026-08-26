import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getRuntimeConfigPath, loadRuntimeConfig, persistRuntimeConfig } from '../config/runtime.js';
import { atomicWriteText } from './transaction.js';

export type NativeManagerHost = 'codex' | 'claude';

export interface ManagerCommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export interface NativeManagerExecutor {
  run(command: string, args: string[]): ManagerCommandResult;
}

export interface NativeManagerSetupOptions {
  host: NativeManagerHost;
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
  packageRoot?: string;
  dataDir?: string;
  planOnly?: boolean;
  forceVersion?: boolean;
  executor?: NativeManagerExecutor;
  command?: string;
  interruptAfter?: 'marketplace';
}

export interface NativeManagerSetupResult {
  host: NativeManagerHost;
  status: 'planned' | 'complete' | 'unsupported' | 'requires-user-action';
  changed: boolean;
  strategy: 'plugin_manager' | 'unsupported';
  source: string;
  version: string;
  actions: string[];
  receiptPath: string | null;
  recovered: boolean;
  restartRequired: boolean;
  warnings: string[];
  diagnostics: string[];
  verification: { marketplace: boolean; plugin: boolean; enabled: boolean; modelUse?: false };
}

interface ManagerState {
  marketplace: boolean;
  marketplaceAmbiguous: boolean;
  plugin: boolean;
  enabled: boolean;
  versionExact: boolean;
  residue: boolean;
}

interface ManagerJournal {
  schemaVersion: 1;
  operationId: string;
  host: NativeManagerHost;
  source: string;
  version: string;
  before: Pick<ManagerState, 'marketplace' | 'plugin' | 'enabled'>;
  providerConfigPath: string;
  providerExisted: boolean;
  providerBeforeText: string | null;
  providerChanged: boolean;
  outcomes: Array<{ operation: string; status: number | null }>;
}

class ProcessManagerExecutor implements NativeManagerExecutor {
  constructor(private readonly env: NodeJS.ProcessEnv) {}

  run(command: string, args: string[]): ManagerCommandResult {
    const result = spawnSync(command, args, { encoding: 'utf8', env: this.env, windowsHide: true });
    return { status: result.status, stdout: result.stdout ?? '', stderr: result.error?.message ?? result.stderr ?? '' };
  }
}

function defaultPackageRoot(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  return basename(moduleDirectory) === 'dist' ? dirname(moduleDirectory) : resolve(moduleDirectory, '../..');
}

function executingVersion(packageRoot: string): string {
  const value = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as { name?: unknown; version?: unknown };
  if (value.name !== 'thoth-mem' || typeof value.version !== 'string' || !/^\d+\.\d+\.\d+$/u.test(value.version)) throw new Error('Executing thoth-mem package metadata is invalid');
  return value.version;
}

function localRuntimeEntry(packageRoot: string): string {
  const entry = join(packageRoot, 'dist', 'index.js');
  if (!existsSync(entry) || !statSync(entry).isFile()) throw new Error('Local thoth-mem runtime entry is missing; build the package before setup');
  return entry;
}

function commandFor(host: NativeManagerHost, explicit?: string): string {
  return explicit ?? (host === 'codex' ? 'codex' : 'claude');
}

function managerEnvironment(options: NativeManagerSetupOptions): NodeJS.ProcessEnv {
  const environment = { ...(options.env ?? process.env) };
  if (!options.homeDir) return environment;
  const home = resolve(options.homeDir);
  environment.HOME = home;
  environment.USERPROFILE = home;
  if (options.host === 'codex') environment.CODEX_HOME = join(home, '.codex');
  else environment.CLAUDE_CONFIG_DIR = join(home, '.claude');
  return environment;
}

function managerSource(options: NativeManagerSetupOptions): string {
  return options.packageRoot ? resolve(options.packageRoot) : 'EremesNG/thoth-mem';
}

function parseJson(result: ManagerCommandResult, label: string): unknown {
  if (result.status !== 0) throw new Error(`${label} is unavailable: ${result.stderr.slice(0, 240)}`);
  try { return JSON.parse(result.stdout) as unknown; }
  catch { throw new Error(`${label} returned malformed JSON`); }
}

function recordArray(value: unknown, key?: string): Array<Record<string, unknown>> {
  const candidate = key && value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : value;
  return Array.isArray(candidate) ? candidate.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
}

function marketplaceMatches(item: Record<string, unknown>, source: string): boolean {
  if (item.name !== 'thoth-mem') return false;
  const marketplaceSource = item.marketplaceSource && typeof item.marketplaceSource === 'object' ? item.marketplaceSource as Record<string, unknown> : null;
  const observed = [item.repo, item.source, marketplaceSource?.source].filter((value): value is string => typeof value === 'string').join('\n').replaceAll('\\', '/').toLowerCase();
  if (!observed) return true;
  if (source === 'EremesNG/thoth-mem') return observed.includes('eremesng/thoth-mem');
  return observed.includes(resolve(source).replaceAll('\\', '/').toLowerCase());
}

function inspectManager(host: NativeManagerHost, executor: NativeManagerExecutor, command: string, version: string, source: string): ManagerState {
  const marketplaceValue = parseJson(executor.run(command, ['plugin', 'marketplace', 'list', '--json']), `${host} marketplace inspection`);
  const pluginValue = parseJson(executor.run(command, ['plugin', 'list', '--json']), `${host} plugin inspection`);
  const marketplaces = recordArray(marketplaceValue, host === 'codex' ? 'marketplaces' : undefined);
  const namedMarketplaces = marketplaces.filter((item) => item.name === 'thoth-mem');
  const marketplace = namedMarketplaces.some((item) => marketplaceMatches(item, source));
  const marketplaceAmbiguous = namedMarketplaces.length > 0 && !marketplace;
  const plugins = recordArray(pluginValue, host === 'codex' ? 'installed' : undefined);
  const target = plugins.find((item) => item.pluginId === 'thoth-mem@thoth-mem' || item.id === 'thoth-mem@thoth-mem' || (item.name === 'thoth-mem' && item.marketplaceName === 'thoth-mem'));
  const residue = plugins.some((item) => item.name === 'thoth-mem' && item !== target);
  return {
    marketplace,
    marketplaceAmbiguous,
    plugin: Boolean(target && target.installed !== false),
    enabled: Boolean(target && target.installed !== false && target.enabled !== false),
    versionExact: Boolean(target && target.version === version),
    residue,
  };
}

function managerCapabilities(host: NativeManagerHost, executor: NativeManagerExecutor, command: string): boolean {
  const commands = host === 'codex'
    ? [['plugin', '--help'], ['plugin', 'marketplace', 'add', '--help'], ['plugin', 'add', '--help'], ['plugin', 'remove', '--help'], ['plugin', 'list', '--help']]
    : [['plugin', '--help'], ['plugin', 'marketplace', 'add', '--help'], ['plugin', 'install', '--help'], ['plugin', 'uninstall', '--help'], ['plugin', 'list', '--help']];
  const text = commands.map((args) => executor.run(command, args)).filter((result) => result.status === 0).map((result) => result.stdout).join('\n');
  const required = host === 'codex' ? ['marketplace add', 'plugin add', 'plugin remove', 'plugin list'] : ['marketplace add', 'plugin install', 'plugin uninstall', 'plugin list'];
  return required.every((fragment) => text.includes(fragment));
}

function verification(state: ManagerState, host: NativeManagerHost) {
  return { marketplace: state.marketplace, plugin: state.plugin && state.versionExact, enabled: state.enabled, ...(host === 'claude' ? { modelUse: false as const } : {}) };
}

function resultBase(options: NativeManagerSetupOptions, source: string, version: string, state: ManagerState, actions: string[]) {
  return { host: options.host, source, version, actions, verification: verification(state, options.host) };
}

function journalPaths(options: NativeManagerSetupOptions): { journalPath: string; receiptPath: string; providerConfigPath: string } {
  const providerConfigPath = getRuntimeConfigPath(options);
  const receipts = join(dirname(providerConfigPath), 'receipts');
  return { journalPath: join(receipts, `${options.host}.in-progress.json`), receiptPath: join(receipts, `${options.host}.json`), providerConfigPath };
}

function loadJournal(path: string, host: NativeManagerHost, source: string, providerConfigPath: string): ManagerJournal | null {
  if (!existsSync(path)) return null;
  const value = JSON.parse(readFileSync(path, 'utf8')) as ManagerJournal;
  if (value.schemaVersion !== 1 || value.host !== host || value.source !== source || value.providerConfigPath !== providerConfigPath || !Array.isArray(value.outcomes)) {
    throw new Error(`${host} in-progress manager receipt is invalid`);
  }
  return value;
}

function writeJournal(path: string, journal: ManagerJournal): void {
  atomicWriteText(path, `${JSON.stringify(journal, null, 2)}\n`);
}

export function setupNativeManager(options: NativeManagerSetupOptions): NativeManagerSetupResult {
  const packageRoot = resolve(options.packageRoot ?? defaultPackageRoot());
  const version = executingVersion(packageRoot);
  const wantedRuntimeEntry = options.packageRoot ? localRuntimeEntry(packageRoot) : null;
  const source = managerSource(options);
  const command = commandFor(options.host, options.command);
  const executor = options.executor ?? new ProcessManagerExecutor(managerEnvironment(options));
  const versionResult = executor.run(command, ['--version']);
  const observedVersion = versionResult.status === 0 ? versionResult.stdout.trim() : '';
  const capabilities = managerCapabilities(options.host, executor, command);
  let state: ManagerState;
  try { state = inspectManager(options.host, executor, command, version, source); }
  catch (error) {
    return {
      ...resultBase(options, source, version, { marketplace: false, marketplaceAmbiguous: false, plugin: false, enabled: false, versionExact: false, residue: false }, []),
      status: 'unsupported', changed: false, strategy: 'unsupported', receiptPath: null, recovered: false, restartRequired: false, warnings: [], diagnostics: [(error instanceof Error ? error.message : String(error)).slice(0, 300), 'Native manager capability inspection failed; no legacy fallback was selected.'],
    };
  }
  const installWord = options.host === 'codex' ? 'add' : 'install';
  const actions = [
    `${command} plugin marketplace add ${source}${options.host === 'claude' ? ' --scope user' : ' --json'}`,
    `${command} plugin ${installWord} thoth-mem@thoth-mem${options.host === 'claude' ? ' --scope user' : ' --json'}`,
    'verify marketplace and enabled thoth-mem@thoth-mem state',
    ...(wantedRuntimeEntry ? [`bind local runtime ${wantedRuntimeEntry}`] : []),
    `restart ${options.host === 'codex' ? 'Codex' : 'Claude Code'}`,
  ];
  const supportedCodex = options.host !== 'codex' || /^codex-cli 0\.147\./u.test(observedVersion);
  const forcedOverride = options.host === 'codex' && !supportedCodex && options.forceVersion === true && capabilities;
  if (!capabilities || (!supportedCodex && !forcedOverride)) {
    const diagnostic = !capabilities
      ? `${options.host} native manager capability contract is incomplete or unsafe.`
      : `Codex ${observedVersion || 'unknown'} is outside the supported unforced 0.147.x contract.`;
    return { ...resultBase(options, source, version, state, actions), status: 'unsupported', changed: false, strategy: 'unsupported', receiptPath: null, recovered: false, restartRequired: false, warnings: [], diagnostics: [diagnostic] };
  }
  if (state.marketplaceAmbiguous) {
    return { ...resultBase(options, source, version, state, actions), status: 'requires-user-action', changed: false, strategy: 'plugin_manager', receiptPath: null, recovered: false, restartRequired: false, warnings: [], diagnostics: ['A thoth-mem marketplace with different provenance already exists; no manager mutation was attempted.'] };
  }
  const warnings = forcedOverride ? [`A forced Codex version override bypassed the 0.147.x gate after the complete safe manager capability contract was verified (${observedVersion}).`] : [];
  const diagnostics = state.residue ? ['Additional externally owned thoth-mem manager state was observed and preserved.'] : [];
  if (options.planOnly) {
    return { ...resultBase(options, source, version, state, actions), status: 'planned', changed: false, strategy: 'plugin_manager', receiptPath: null, recovered: false, restartRequired: false, warnings, diagnostics };
  }

  const { journalPath, receiptPath, providerConfigPath } = journalPaths(options);
  const previousJournal = loadJournal(journalPath, options.host, source, providerConfigPath);
  const recovered = previousJournal !== null;
  const wantedDataDir = options.dataDir ? resolve(options.dataDir) : null;
  const runtime = loadRuntimeConfig(options);
  const dataDirCurrent = wantedDataDir === null || (runtime.provider?.dataDir ? resolve(runtime.provider.dataDir) === wantedDataDir : false);
  const runtimeEntryCurrent = wantedRuntimeEntry === null
    ? runtime.provider?.runtimeEntry === undefined
    : runtime.provider?.runtimeEntry !== undefined && resolve(runtime.provider.runtimeEntry) === wantedRuntimeEntry;
  const providerCurrent = dataDirCurrent && runtimeEntryCurrent;
  const complete = state.marketplace && state.plugin && state.enabled && state.versionExact && providerCurrent;
  if (complete) {
    if (previousJournal) {
      atomicWriteText(receiptPath, `${JSON.stringify({ schemaVersion: 1, host: options.host, source, version, result: 'complete', recovered: true, verification: verification(state, options.host) }, null, 2)}\n`);
      rmSync(journalPath, { force: true });
    }
    return { ...resultBase(options, source, version, state, actions), status: 'complete', changed: recovered, strategy: 'plugin_manager', receiptPath: existsSync(receiptPath) ? receiptPath : null, recovered, restartRequired: recovered, warnings, diagnostics };
  }

  const providerExisted = existsSync(providerConfigPath);
  const journal: ManagerJournal = previousJournal ?? {
    schemaVersion: 1,
    operationId: randomUUID(),
    host: options.host,
    source,
    version,
    before: { marketplace: state.marketplace, plugin: state.plugin, enabled: state.enabled },
    providerConfigPath,
    providerExisted,
    providerBeforeText: providerExisted ? readFileSync(providerConfigPath, 'utf8') : null,
    providerChanged: !providerCurrent,
    outcomes: [],
  };
  if (!previousJournal) writeJournal(journalPath, journal);
  if (!providerCurrent) {
    persistRuntimeConfig({ ...(wantedDataDir ? { dataDir: wantedDataDir } : {}), runtimeEntry: wantedRuntimeEntry }, options);
  }

  let changed = !providerCurrent;
  if (!state.marketplace) {
    const args = ['plugin', 'marketplace', 'add', source, ...(options.host === 'codex' ? ['--json'] : ['--scope', 'user'])];
    const outcome = executor.run(command, args);
    journal.outcomes.push({ operation: 'marketplace-add', status: outcome.status });
    writeJournal(journalPath, journal);
    changed = true;
    state = inspectManager(options.host, executor, command, version, source);
    if (options.interruptAfter === 'marketplace') throw new Error('Simulated manager interruption after marketplace');
  }
  if (state.marketplace && (!state.plugin || !state.enabled || !state.versionExact)) {
    const args = state.plugin && !state.enabled && options.host === 'claude'
      ? ['plugin', 'enable', 'thoth-mem@thoth-mem']
      : ['plugin', installWord, 'thoth-mem@thoth-mem', ...(options.host === 'codex' ? ['--json'] : ['--scope', 'user'])];
    const outcome = executor.run(command, args);
    journal.outcomes.push({ operation: state.plugin ? 'plugin-enable-or-repair' : 'plugin-install', status: outcome.status });
    writeJournal(journalPath, journal);
    changed = true;
    state = inspectManager(options.host, executor, command, version, source);
  }

  const finalComplete = state.marketplace && state.plugin && state.enabled && state.versionExact;
  if (!finalComplete) {
    if (!journal.before.plugin && state.plugin) {
      executor.run(command, ['plugin', options.host === 'codex' ? 'remove' : 'uninstall', 'thoth-mem@thoth-mem', ...(options.host === 'claude' ? ['--scope', 'user', '--yes'] : ['--json'])]);
    }
    state = inspectManager(options.host, executor, command, version, source);
    if (!journal.before.marketplace && state.marketplace && !state.plugin) {
      executor.run(command, ['plugin', 'marketplace', 'remove', 'thoth-mem', ...(options.host === 'claude' ? ['--scope', 'user'] : [])]);
    }
    if (journal.providerChanged) {
      if (journal.providerExisted && journal.providerBeforeText !== null) atomicWriteText(providerConfigPath, journal.providerBeforeText);
      else rmSync(providerConfigPath, { force: true });
    }
    state = inspectManager(options.host, executor, command, version, source);
    atomicWriteText(receiptPath, `${JSON.stringify({ schemaVersion: 1, host: options.host, source, version, result: 'requires-user-action', outcomes: journal.outcomes, verification: verification(state, options.host) }, null, 2)}\n`);
    rmSync(journalPath, { force: true });
    return { ...resultBase(options, source, version, state, actions), status: 'requires-user-action', changed, strategy: 'plugin_manager', receiptPath, recovered, restartRequired: false, warnings, diagnostics: [...diagnostics, 'Native manager post-state remained incomplete; no copied or legacy fallback was attempted.'] };
  }

  atomicWriteText(receiptPath, `${JSON.stringify({ schemaVersion: 1, host: options.host, source, version, result: 'complete', outcomes: journal.outcomes, verification: verification(state, options.host) }, null, 2)}\n`);
  rmSync(journalPath, { force: true });
  return { ...resultBase(options, source, version, state, actions), status: 'complete', changed, strategy: 'plugin_manager', receiptPath, recovered, restartRequired: changed, warnings, diagnostics };
}
