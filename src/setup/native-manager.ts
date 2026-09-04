import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getRuntimeConfigPath, loadRuntimeConfig, persistRuntimeConfig } from '../config/runtime.js';
import { atomicWriteText } from './transaction.js';

export type NativeManagerHost = 'codex' | 'claude';

const PLUGIN_NAME = 'thoth-mem';
const MARKETPLACE_NAME = 'thoth-plugins';
const MARKETPLACE_SOURCE = 'https://github.com/EremesNG/thoth-plugins.git';
const CODEX_LEGACY_MARKETPLACE_SOURCE = 'https://github.com/EremesNG/thoth-mem.git';
const CODEX_LEGACY_PLUGIN_IDS = ['thoth-mem@thoth-mem', 'thoth-mem@thoth-mem-codex'] as const;
const CODEX_LEGACY_MARKETPLACE_NAMES = ['thoth-mem', 'thoth-mem-codex'] as const;
const CODEX_LEGACY_ROOTS = [
  { relativePath: 'plugins/cache/thoth-mem', kind: 'cache', marketplaceName: 'thoth-mem' },
  { relativePath: 'plugins/cache/thoth-mem-codex', kind: 'cache', marketplaceName: 'thoth-mem-codex' },
  { relativePath: '.tmp/marketplaces/thoth-mem', kind: 'snapshot', marketplaceName: 'thoth-mem' },
  { relativePath: '.tmp/marketplaces/thoth-mem-codex', kind: 'snapshot', marketplaceName: 'thoth-mem-codex' },
] as const;
type MarketplaceName = typeof MARKETPLACE_NAME;
type CodexLegacyRoot = (typeof CODEX_LEGACY_ROOTS)[number];

interface ApprovedCodexLegacyRoot {
  definition: CodexLegacyRoot;
  path: string;
  realPath: string;
}

interface CodexCleanupPlan {
  codexHome: string;
  roots: ApprovedCodexLegacyRoot[];
}

export interface ManagerCommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export interface NativeManagerExecutor {
  run(command: string, args: string[]): ManagerCommandResult;
}

export interface NativeManagerInvocationOptions {
  commandShell?: string;
  implicitCodex: boolean;
  platform?: NodeJS.Platform;
}

export interface NativeManagerInvocation {
  command: string;
  args: string[];
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
  legacyPluginIds: string[];
  legacyMarketplaceNames: string[];
  legacyMarketplaceConflicts: string[];
}

interface ManagerIdentity {
  marketplaceName: MarketplaceName;
  pluginId: `${typeof PLUGIN_NAME}@${MarketplaceName}`;
}

interface ManagerJournal {
  schemaVersion: 2;
  operationId: string;
  host: NativeManagerHost;
  marketplaceName: ManagerIdentity['marketplaceName'];
  pluginId: ManagerIdentity['pluginId'];
  source: string;
  version: string;
  before: Pick<ManagerState, 'marketplace' | 'plugin' | 'enabled'>;
  providerConfigPath: string;
  providerExisted: boolean;
  providerBeforeText: string | null;
  providerChanged: boolean;
  outcomes: Array<{ operation: string; status: number | null }>;
}

export function getNativeManagerInvocation(
  command: string,
  args: readonly string[],
  options: NativeManagerInvocationOptions,
): NativeManagerInvocation {
  if (command !== 'codex' || !options.implicitCodex || (options.platform ?? process.platform) !== 'win32') {
    return { command, args: [...args] };
  }

  return {
    command: options.commandShell ?? process.env.ComSpec ?? 'cmd.exe',
    args: ['/d', '/s', '/c', 'codex', ...args],
  };
}

class ProcessManagerExecutor implements NativeManagerExecutor {
  constructor(private readonly env: NodeJS.ProcessEnv, private readonly implicitCodex: boolean) {}

  run(command: string, args: string[]): ManagerCommandResult {
    const invocation = getNativeManagerInvocation(command, args, {
      commandShell: this.env.ComSpec ?? this.env.COMSPEC,
      implicitCodex: this.implicitCodex,
    });
    const result = spawnSync(invocation.command, invocation.args, {
      encoding: 'utf8',
      env: this.env,
      shell: false,
      windowsHide: true,
    });
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

function managerIdentity(): ManagerIdentity {
  return { marketplaceName: MARKETPLACE_NAME, pluginId: `${PLUGIN_NAME}@${MARKETPLACE_NAME}` };
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

function parseJson(result: ManagerCommandResult, label: string): unknown {
  if (result.status !== 0) throw new Error(`${label} is unavailable: ${result.stderr.slice(0, 240)}`);
  try { return JSON.parse(result.stdout) as unknown; }
  catch { throw new Error(`${label} returned malformed JSON`); }
}

function recordArray(value: unknown, key?: string): Array<Record<string, unknown>> {
  const candidate = key && value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : value;
  return Array.isArray(candidate) ? candidate.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
}

function normalizeSource(value: string): string {
  return value
    .trim()
    .replaceAll('\\', '/')
    .replace(/#.*$/u, '')
    .replace(/^git@github\.com:/iu, '')
    .replace(/^(?:https?|ssh):\/\/(?:git@)?github\.com\//iu, '')
    .replace(/^github\.com\//iu, '')
    .replace(/\/?\.git\/?$/iu, '')
    .replace(/\/$/u, '')
    .toLowerCase();
}

function lstatIfPresent(path: string) {
  try { return lstatSync(path); }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function strictDescendant(base: string, candidate: string): boolean {
  const suffix = relative(base, candidate);
  return suffix !== '' && suffix !== '..' && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix);
}

function parseObjectFile(path: string, label: string): Record<string, unknown> {
  const file = lstatIfPresent(path);
  if (!file || file.isSymbolicLink() || !file.isFile()) throw new Error(`${label} must be a regular non-link file`);
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    return value as Record<string, unknown>;
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validateCacheManifest(root: string): void {
  const productEntries = readdirSync(root, { withFileTypes: true });
  if (productEntries.length === 0) return;
  if (productEntries.length !== 1 || productEntries[0]?.name !== PLUGIN_NAME) {
    throw new Error(`Legacy cache ${root} contains state outside ${PLUGIN_NAME}`);
  }
  const productRoot = join(root, PLUGIN_NAME);
  const product = lstatIfPresent(productRoot);
  if (!product || product.isSymbolicLink() || !product.isDirectory()) throw new Error(`Legacy cache product root ${productRoot} is unsafe`);
  const versions = readdirSync(productRoot, { withFileTypes: true });
  if (versions.length === 0) throw new Error(`Legacy cache ${root} has no plugin manifest`);
  for (const entry of versions) {
    const versionRoot = join(productRoot, entry.name);
    const version = lstatIfPresent(versionRoot);
    if (!entry.isDirectory() || !version || version.isSymbolicLink() || !version.isDirectory()) throw new Error(`Legacy cache version root ${versionRoot} is unsafe`);
    const manifest = parseObjectFile(join(versionRoot, '.codex-plugin', 'plugin.json'), `Legacy cache manifest for ${versionRoot}`);
    if (manifest.name !== PLUGIN_NAME) throw new Error(`Legacy cache manifest for ${versionRoot} does not identify ${PLUGIN_NAME}`);
  }
}

function validateSnapshotManifest(root: string, marketplaceName: string): void {
  if (readdirSync(root).length === 0) return;
  const installation = parseObjectFile(join(root, '.codex-marketplace-install.json'), `Legacy marketplace receipt for ${marketplaceName}`);
  if (typeof installation.source !== 'string' || normalizeSource(installation.source) !== normalizeSource(CODEX_LEGACY_MARKETPLACE_SOURCE)) {
    throw new Error(`Legacy marketplace snapshot ${marketplaceName} has conflicting provenance`);
  }
  const marketplace = parseObjectFile(join(root, '.agents', 'plugins', 'marketplace.json'), `Legacy marketplace manifest for ${marketplaceName}`);
  const plugins = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];
  const pluginNames = plugins.map((plugin) => plugin && typeof plugin === 'object' && !Array.isArray(plugin) ? (plugin as Record<string, unknown>).name : null);
  if (marketplace.name !== marketplaceName || pluginNames.length === 0 || pluginNames.some((name) => name !== PLUGIN_NAME)) {
    throw new Error(`Legacy marketplace snapshot ${marketplaceName} does not identify only ${PLUGIN_NAME}`);
  }
}

function resolveCodexHome(options: NativeManagerSetupOptions): string {
  const environment = managerEnvironment(options);
  const configured = environment.CODEX_HOME?.trim();
  if (configured) return resolve(configured);
  const userHome = environment.USERPROFILE?.trim() || environment.HOME?.trim();
  if (!userHome) throw new Error('CODEX_HOME could not be resolved; set CODEX_HOME or provide a home directory');
  return resolve(userHome, '.codex');
}

function validateCodexLegacyRoot(codexHome: string, definition: CodexLegacyRoot, expectedRealPath?: string): ApprovedCodexLegacyRoot | null {
  const path = resolve(codexHome, ...definition.relativePath.split('/'));
  if (!strictDescendant(codexHome, path)) throw new Error(`Legacy cleanup target escapes CODEX_HOME: ${definition.relativePath}`);
  const target = lstatIfPresent(path);
  if (!target) return null;
  const home = lstatIfPresent(codexHome);
  if (!home || !home.isDirectory()) throw new Error(`Resolved CODEX_HOME is not a directory: ${codexHome}`);
  let boundary = codexHome;
  for (const segment of definition.relativePath.split('/')) {
    boundary = join(boundary, segment);
    const value = lstatIfPresent(boundary);
    if (!value || value.isSymbolicLink() || !value.isDirectory()) throw new Error(`Legacy cleanup boundary is not a real directory: ${boundary}`);
  }
  const realHome = realpathSync(codexHome);
  const realPath = realpathSync(path);
  if (!strictDescendant(realHome, realPath)) throw new Error(`Legacy cleanup target resolves outside CODEX_HOME: ${definition.relativePath}`);
  if (expectedRealPath && realPath !== expectedRealPath) throw new Error(`Legacy cleanup target changed after preflight: ${definition.relativePath}`);
  if (definition.kind === 'cache') validateCacheManifest(path);
  else validateSnapshotManifest(path, definition.marketplaceName);
  return { definition, path, realPath };
}

function preflightCodexCleanup(options: NativeManagerSetupOptions): CodexCleanupPlan {
  const codexHome = resolveCodexHome(options);
  const roots = CODEX_LEGACY_ROOTS
    .map((definition) => validateCodexLegacyRoot(codexHome, definition))
    .filter((root): root is ApprovedCodexLegacyRoot => root !== null);
  return { codexHome, roots };
}

function marketplaceMatches(item: Record<string, unknown>, source: string, marketplaceName: string): boolean {
  if (item.name !== marketplaceName) return false;
  const marketplaceSource = item.marketplaceSource && typeof item.marketplaceSource === 'object' ? item.marketplaceSource as Record<string, unknown> : null;
  const expected = normalizeSource(source);
  return [item.repo, item.source, item.url, marketplaceSource?.repo, marketplaceSource?.source, marketplaceSource?.url]
    .filter((value): value is string => typeof value === 'string')
    .some((value) => normalizeSource(value) === expected);
}

function inspectManager(host: NativeManagerHost, executor: NativeManagerExecutor, command: string, version: string, source: string): ManagerState {
  const identity = managerIdentity();
  const marketplaceValue = parseJson(executor.run(command, ['plugin', 'marketplace', 'list', '--json']), `${host} marketplace inspection`);
  const pluginValue = parseJson(executor.run(command, ['plugin', 'list', '--json']), `${host} plugin inspection`);
  const marketplaces = recordArray(marketplaceValue, host === 'codex' ? 'marketplaces' : undefined);
  const namedMarketplaces = marketplaces.filter((item) => item.name === identity.marketplaceName);
  const marketplace = namedMarketplaces.some((item) => marketplaceMatches(item, source, identity.marketplaceName));
  const marketplaceAmbiguous = namedMarketplaces.some((item) => !marketplaceMatches(item, source, identity.marketplaceName));
  const plugins = recordArray(pluginValue, host === 'codex' ? 'installed' : undefined);
  const target = plugins.find((item) => item.pluginId === identity.pluginId || item.id === identity.pluginId || (item.name === PLUGIN_NAME && item.marketplaceName === identity.marketplaceName));
  const pluginId = (item: Record<string, unknown>) => typeof item.pluginId === 'string' ? item.pluginId : typeof item.id === 'string' ? item.id : null;
  const legacyPluginIds = host === 'codex'
    ? CODEX_LEGACY_PLUGIN_IDS.filter((id) => plugins.some((item) => pluginId(item) === id))
    : [];
  const legacyMarketplaceNames = host === 'codex'
    ? CODEX_LEGACY_MARKETPLACE_NAMES.filter((name) => marketplaces.some((item) => marketplaceMatches(item, CODEX_LEGACY_MARKETPLACE_SOURCE, name)))
    : [];
  const legacyMarketplaceConflicts = host === 'codex'
    ? CODEX_LEGACY_MARKETPLACE_NAMES.filter((name) => marketplaces.some((item) => item.name === name && !marketplaceMatches(item, CODEX_LEGACY_MARKETPLACE_SOURCE, name)))
    : [];
  const residue = plugins.some((item) => item.name === PLUGIN_NAME && item !== target && !legacyPluginIds.some((legacyPluginId) => legacyPluginId === pluginId(item)));
  return {
    marketplace,
    marketplaceAmbiguous,
    plugin: Boolean(target && target.installed !== false),
    enabled: Boolean(target && target.installed !== false && target.enabled !== false),
    versionExact: Boolean(target && target.version === version),
    residue,
    legacyPluginIds,
    legacyMarketplaceNames,
    legacyMarketplaceConflicts,
  };
}

function emptyManagerState(): ManagerState {
  return {
    marketplace: false,
    marketplaceAmbiguous: false,
    plugin: false,
    enabled: false,
    versionExact: false,
    residue: false,
    legacyPluginIds: [],
    legacyMarketplaceNames: [],
    legacyMarketplaceConflicts: [],
  };
}

function centralManagerVerified(state: ManagerState): boolean {
  return state.marketplace && !state.marketplaceAmbiguous && state.plugin && state.enabled && state.versionExact;
}

function legacyManagerClean(state: ManagerState): boolean {
  return state.legacyPluginIds.length === 0 && state.legacyMarketplaceNames.length === 0 && state.legacyMarketplaceConflicts.length === 0;
}

function managerCapabilities(host: NativeManagerHost, executor: NativeManagerExecutor, command: string): boolean {
  const commands = host === 'codex'
    ? [['plugin', '--help'], ['plugin', 'marketplace', 'add', '--help'], ['plugin', 'marketplace', 'remove', '--help'], ['plugin', 'add', '--help'], ['plugin', 'remove', '--help'], ['plugin', 'list', '--help']]
    : [['plugin', '--help'], ['plugin', 'marketplace', 'add', '--help'], ['plugin', 'install', '--help'], ['plugin', 'uninstall', '--help'], ['plugin', 'list', '--help']];
  const text = commands.map((args) => executor.run(command, args)).filter((result) => result.status === 0).map((result) => result.stdout).join('\n');
  const required = host === 'codex' ? ['marketplace add', 'marketplace remove', 'plugin add', 'plugin remove', 'plugin list'] : ['marketplace add', 'plugin install', 'plugin uninstall', 'plugin list'];
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

function loadJournal(path: string, host: NativeManagerHost, identity: ManagerIdentity, source: string, providerConfigPath: string): ManagerJournal | null {
  if (!existsSync(path)) return null;
  const value = JSON.parse(readFileSync(path, 'utf8')) as ManagerJournal;
  if (value.schemaVersion !== 2 || value.host !== host || value.marketplaceName !== identity.marketplaceName || value.pluginId !== identity.pluginId || value.source !== source || value.providerConfigPath !== providerConfigPath || !Array.isArray(value.outcomes)) {
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
  const source = MARKETPLACE_SOURCE;
  const identity = managerIdentity();
  const command = commandFor(options.host, options.command);
  const executor = options.executor ?? new ProcessManagerExecutor(
    managerEnvironment(options),
    options.host === 'codex' && options.command === undefined,
  );
  const versionResult = executor.run(command, ['--version']);
  const observedVersion = versionResult.status === 0 ? versionResult.stdout.trim() : '';
  const capabilities = managerCapabilities(options.host, executor, command);
  let state: ManagerState;
  try { state = inspectManager(options.host, executor, command, version, source); }
  catch (error) {
    return {
      ...resultBase(options, source, version, emptyManagerState(), []),
      status: 'unsupported', changed: false, strategy: 'unsupported', receiptPath: null, recovered: false, restartRequired: false, warnings: [], diagnostics: [(error instanceof Error ? error.message : String(error)).slice(0, 300), 'Native manager capability inspection failed; no legacy fallback was selected.'],
    };
  }
  const installWord = options.host === 'codex' ? 'add' : 'install';
  const actions = [
    `${command} plugin marketplace add ${source}${options.host === 'claude' ? ' --scope user' : ' --json'}`,
    `${command} plugin ${installWord} ${identity.pluginId}${options.host === 'claude' ? ' --scope user' : ' --json'}`,
    `verify marketplace ${identity.marketplaceName} and enabled ${identity.pluginId} state`,
    ...(options.host === 'codex' ? [
      'require every Codex process to be closed before legacy cleanup',
      ...CODEX_LEGACY_PLUGIN_IDS.map((pluginId) => `${command} plugin remove ${pluginId} --json when registered`),
      ...CODEX_LEGACY_MARKETPLACE_NAMES.map((marketplaceName) => `${command} plugin marketplace remove ${marketplaceName} --json when registered`),
      ...CODEX_LEGACY_ROOTS.map(({ relativePath }) => `remove ${relativePath} only when present and preflight-approved`),
    ] : []),
    ...(wantedRuntimeEntry ? [`bind local runtime ${wantedRuntimeEntry}`] : []),
    `restart ${options.host === 'codex' ? 'Codex' : 'Claude Code'}`,
  ];
  const supportedCodex = options.host !== 'codex' || /^codex-cli 0\.151\./u.test(observedVersion);
  const forcedOverride = options.host === 'codex' && !supportedCodex && options.forceVersion === true && capabilities;
  if (!capabilities || (!supportedCodex && !forcedOverride)) {
    const diagnostic = !capabilities
      ? `${options.host} native manager capability contract is incomplete or unsafe.`
      : `Codex ${observedVersion || 'unknown'} is outside the supported unforced 0.151.x contract.`;
    return { ...resultBase(options, source, version, state, actions), status: 'unsupported', changed: false, strategy: 'unsupported', receiptPath: null, recovered: false, restartRequired: false, warnings: [], diagnostics: [diagnostic] };
  }
  if (state.marketplaceAmbiguous) {
    return { ...resultBase(options, source, version, state, actions), status: 'requires-user-action', changed: false, strategy: 'plugin_manager', receiptPath: null, recovered: false, restartRequired: false, warnings: [], diagnostics: [`A ${identity.marketplaceName} marketplace with different provenance already exists; no manager mutation was attempted.`] };
  }
  if (state.legacyMarketplaceConflicts.length > 0) {
    return { ...resultBase(options, source, version, state, actions), status: 'requires-user-action', changed: false, strategy: 'plugin_manager', receiptPath: null, recovered: false, restartRequired: false, warnings: [], diagnostics: [`Legacy marketplace provenance conflicts were found for ${state.legacyMarketplaceConflicts.join(', ')}; no manager mutation was attempted.`] };
  }
  let cleanupPlan: CodexCleanupPlan | null = null;
  if (options.host === 'codex') {
    try { cleanupPlan = preflightCodexCleanup(options); }
    catch (error) {
      return { ...resultBase(options, source, version, state, actions), status: 'requires-user-action', changed: false, strategy: 'plugin_manager', receiptPath: null, recovered: false, restartRequired: false, warnings: [], diagnostics: [`Legacy cleanup preflight failed: ${error instanceof Error ? error.message : String(error)}. No manager mutation was attempted.`] };
    }
  }
  const warnings = forcedOverride ? [`A forced Codex version override bypassed the 0.151.x gate after the complete safe manager capability contract was verified (${observedVersion}).`] : [];
  const diagnostics = state.residue ? ['Additional externally owned thoth-mem manager state was observed and preserved.'] : [];
  if (options.planOnly) {
    return { ...resultBase(options, source, version, state, actions), status: 'planned', changed: false, strategy: 'plugin_manager', receiptPath: null, recovered: false, restartRequired: false, warnings, diagnostics };
  }

  const { journalPath, receiptPath, providerConfigPath } = journalPaths(options);
  const previousJournal = loadJournal(journalPath, options.host, identity, source, providerConfigPath);
  const recovered = previousJournal !== null;
  const wantedDataDir = options.dataDir ? resolve(options.dataDir) : null;
  const runtime = loadRuntimeConfig(options);
  const dataDirCurrent = wantedDataDir === null || (runtime.provider?.dataDir ? resolve(runtime.provider.dataDir) === wantedDataDir : false);
  const runtimeEntryCurrent = wantedRuntimeEntry === null
    ? runtime.provider?.runtimeEntry === undefined
    : runtime.provider?.runtimeEntry !== undefined && resolve(runtime.provider.runtimeEntry) === wantedRuntimeEntry;
  const providerCurrent = dataDirCurrent && runtimeEntryCurrent;
  const managerCleanupComplete = options.host !== 'codex' || (legacyManagerClean(state) && cleanupPlan?.roots.length === 0);
  const complete = state.marketplace && state.plugin && state.enabled && state.versionExact && providerCurrent && managerCleanupComplete;
  if (complete) {
    if (previousJournal) {
      atomicWriteText(receiptPath, `${JSON.stringify({ schemaVersion: 1, host: options.host, source, version, result: 'complete', recovered: true, verification: verification(state, options.host) }, null, 2)}\n`);
      rmSync(journalPath, { force: true });
    }
    return { ...resultBase(options, source, version, state, actions), status: 'complete', changed: recovered, strategy: 'plugin_manager', receiptPath: existsSync(receiptPath) ? receiptPath : null, recovered, restartRequired: recovered, warnings, diagnostics };
  }

  const providerExisted = existsSync(providerConfigPath);
  const journal: ManagerJournal = previousJournal ?? {
    schemaVersion: 2,
    operationId: randomUUID(),
    host: options.host,
    marketplaceName: identity.marketplaceName,
    pluginId: identity.pluginId,
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
      ? ['plugin', 'enable', identity.pluginId]
      : ['plugin', installWord, identity.pluginId, ...(options.host === 'codex' ? ['--json'] : ['--scope', 'user'])];
    const outcome = executor.run(command, args);
    journal.outcomes.push({ operation: state.plugin ? 'plugin-enable-or-repair' : 'plugin-install', status: outcome.status });
    writeJournal(journalPath, journal);
    changed = true;
    state = inspectManager(options.host, executor, command, version, source);
  }

  const finalComplete = centralManagerVerified(state) && state.legacyMarketplaceConflicts.length === 0;
  if (!finalComplete) {
    if (!journal.before.plugin && state.plugin) {
      executor.run(command, ['plugin', options.host === 'codex' ? 'remove' : 'uninstall', identity.pluginId, ...(options.host === 'claude' ? ['--scope', 'user', '--yes'] : ['--json'])]);
    }
    state = inspectManager(options.host, executor, command, version, source);
    if (!journal.before.marketplace && state.marketplace && !state.plugin) {
      executor.run(command, ['plugin', 'marketplace', 'remove', identity.marketplaceName, ...(options.host === 'claude' ? ['--scope', 'user'] : [])]);
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

  let cleanupReceipt: { pluginIds: string[]; marketplaceNames: string[]; fallbackRoots: string[]; verifiedAbsentRoots: string[] } | undefined;
  if (options.host === 'codex') {
    let cleanupError: string | null = null;
    const removedRoots: string[] = [];
    const legacyPluginIds = [...state.legacyPluginIds];
    const legacyMarketplaceNames = [...state.legacyMarketplaceNames];
    try {
      for (const legacyPluginId of state.legacyPluginIds) {
        const outcome = executor.run(command, ['plugin', 'remove', legacyPluginId, '--json']);
        journal.outcomes.push({ operation: `legacy-plugin-remove:${legacyPluginId}`, status: outcome.status });
        writeJournal(journalPath, journal);
        changed = true;
      }
      for (const legacyMarketplaceName of state.legacyMarketplaceNames) {
        const outcome = executor.run(command, ['plugin', 'marketplace', 'remove', legacyMarketplaceName, '--json']);
        journal.outcomes.push({ operation: `legacy-marketplace-remove:${legacyMarketplaceName}`, status: outcome.status });
        writeJournal(journalPath, journal);
        changed = true;
      }
      state = inspectManager(options.host, executor, command, version, source);
      if (state.marketplaceAmbiguous || !legacyManagerClean(state)) {
        throw new Error('Official manager removal left registered thoth-mem legacy state');
      }
      for (const root of cleanupPlan?.roots ?? []) {
        if (!lstatIfPresent(root.path)) continue;
        validateCodexLegacyRoot(cleanupPlan!.codexHome, root.definition, root.realPath);
        rmSync(root.path, { recursive: true, force: false });
        if (lstatIfPresent(root.path)) throw new Error(`Legacy cleanup target still exists: ${root.definition.relativePath}`);
        removedRoots.push(root.definition.relativePath);
        journal.outcomes.push({ operation: `legacy-root-remove:${root.definition.relativePath}`, status: 0 });
        writeJournal(journalPath, journal);
        changed = true;
      }
      state = inspectManager(options.host, executor, command, version, source);
    } catch (error) {
      cleanupError = (error instanceof Error ? error.message : String(error)).slice(0, 300);
    }
    const rootsAbsent = CODEX_LEGACY_ROOTS.every(({ relativePath }) => !lstatIfPresent(resolve(cleanupPlan!.codexHome, ...relativePath.split('/'))));
    cleanupReceipt = {
      pluginIds: legacyPluginIds,
      marketplaceNames: legacyMarketplaceNames,
      fallbackRoots: removedRoots,
      verifiedAbsentRoots: rootsAbsent ? CODEX_LEGACY_ROOTS.map(({ relativePath }) => relativePath) : [],
    };
    const cleanupComplete = cleanupError === null && rootsAbsent && centralManagerVerified(state) && legacyManagerClean(state);
    if (!cleanupComplete) {
      atomicWriteText(receiptPath, `${JSON.stringify({ schemaVersion: 1, host: options.host, source, version, result: 'requires-user-action', outcomes: journal.outcomes, cleanup: { ...cleanupReceipt, error: cleanupError }, verification: verification(state, options.host) }, null, 2)}\n`);
      rmSync(journalPath, { force: true });
      return { ...resultBase(options, source, version, state, actions), status: 'requires-user-action', changed, strategy: 'plugin_manager', receiptPath, recovered, restartRequired: changed, warnings, diagnostics: [...diagnostics, `Central ${identity.pluginId} remains installed. Close Codex and rerun setup to finish exact thoth-mem legacy cleanup${cleanupError ? `: ${cleanupError}` : ''}.`] };
    }
  }

  atomicWriteText(receiptPath, `${JSON.stringify({ schemaVersion: 1, host: options.host, source, version, result: 'complete', outcomes: journal.outcomes, ...(cleanupReceipt ? { cleanup: cleanupReceipt } : {}), verification: verification(state, options.host) }, null, 2)}\n`);
  rmSync(journalPath, { force: true });
  return { ...resultBase(options, source, version, state, actions), status: 'complete', changed, strategy: 'plugin_manager', receiptPath, recovered, restartRequired: changed, warnings, diagnostics };
}
