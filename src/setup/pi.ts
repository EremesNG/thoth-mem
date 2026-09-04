import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { getRuntimeConfigPath, loadRuntimeConfig, persistRuntimeConfig } from '../config/runtime.js';
import { atomicWriteText } from './transaction.js';

export interface PiCommandResult { status: number | null; stdout: string; stderr: string }
export interface PiExecutor { run(command: string, args: string[]): PiCommandResult }
export interface PiPackageRecord { scope: 'user' | 'project'; source: string; installedPath: string | null }

export interface PiSetupOptions {
  packageRoot?: string;
  dataDir?: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
  planOnly?: boolean;
  forceVersion?: boolean;
  command?: string;
  executor?: PiExecutor;
  extensionProbe?: (extensionPath: string) => PiCommandResult;
  journalRemover?: (journalPath: string) => void;
  failAfter?: 'provider' | 'remove' | 'install';
  interruptAfter?: 'remove' | 'install' | 'rollback-cleanup' | 'commit-cleanup';
}

export interface PiSetupResult {
  host: 'pi';
  status: 'planned' | 'complete';
  changed: boolean;
  source: string;
  version: string;
  piVersion: string;
  actions: string[];
  receiptPath: string | null;
  recovered: boolean;
  verification: { package: boolean; source: boolean; manifest: boolean };
  warnings: string[];
}

interface PiJournal {
  schemaVersion: 2;
  host: 'pi';
  operationId: string;
  desiredSource: string;
  priorSource: string | null;
  providerConfigPath: string;
  providerExisted: boolean;
  providerBeforeText: string | null;
  providerChanged: boolean;
  receiptExisted: boolean;
  receiptBeforeText: string | null;
  managerRecordsBefore: PiPackageRecord[];
  mutationPhase: 'prepared' | 'remove-intent' | 'remove-complete' | 'install-intent' | 'install-complete' | 'rollback-verified' | 'receipt-committed';
  priorInstalledPath: string | null;
  priorBackupPath: string | null;
  priorBackupReady: boolean;
}

interface PiReceipt {
  schemaVersion: 1;
  host: 'pi';
  source: string;
  provenance: 'public' | 'local';
  version: string;
  installedPath: string;
  piVersion: string;
}

function defaultPackageRoot(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  return basename(moduleDirectory) === 'dist' ? dirname(moduleDirectory) : resolve(moduleDirectory, '../..');
}

function manifest(path: string): Record<string, unknown> {
  if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !statSync(path).isFile()) throw new Error(`Pi package manifest is missing: ${path}`);
  const value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Pi package manifest is invalid');
  return value as Record<string, unknown>;
}

function executingVersion(packageRoot: string): string {
  const value = manifest(join(packageRoot, 'package.json'));
  if (value.name !== 'thoth-mem' || typeof value.version !== 'string' || !/^\d+\.\d+\.\d+$/u.test(value.version)) throw new Error('Executing thoth-mem package metadata is invalid');
  return value.version;
}

function isRegularDirectory(path: string): boolean {
  return existsSync(path) && !lstatSync(path).isSymbolicLink() && statSync(path).isDirectory();
}

function isRegularFile(path: string): boolean {
  return existsSync(path) && !lstatSync(path).isSymbolicLink() && statSync(path).isFile();
}

function defaultExtensionProbe(extensionPath: string): PiCommandResult {
  const expression = `await import(${JSON.stringify(pathToFileURL(extensionPath).href)})`;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', expression], {
    encoding: 'utf8',
    maxBuffer: 256_000,
    timeout: 10_000,
    windowsHide: true,
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.error?.message ?? result.stderr ?? '' };
}

function verifyInstalled(record: PiPackageRecord, expectedVersion: string, extensionProbe: (extensionPath: string) => PiCommandResult): void {
  if (!record.installedPath || !isAbsolute(record.installedPath) || !isRegularDirectory(record.installedPath)) throw new Error('Pi installed package path is invalid');
  const value = manifest(join(record.installedPath, 'package.json'));
  const pi = value.pi && typeof value.pi === 'object' && !Array.isArray(value.pi) ? value.pi as Record<string, unknown> : null;
  const extensions = pi?.extensions;
  const skills = pi?.skills;
  if (value.name !== 'thoth-mem' || value.version !== expectedVersion
    || !Array.isArray(extensions) || extensions.length !== 1 || extensions[0] !== './dist/pi.js'
    || !Array.isArray(skills) || skills.length !== 1 || skills[0] !== './integrations/pi/skills/thoth-mem') throw new Error('Pi installed package manifest or resources are invalid');
  const skillRoot = join(record.installedPath, 'integrations', 'pi', 'skills', 'thoth-mem');
  if (!isRegularDirectory(skillRoot) || !isRegularDirectory(join(skillRoot, 'references'))) throw new Error('Pi installed package Skill directories are invalid');
  for (const relative of [
    'dist/pi.js',
    'integrations/pi/skills/thoth-mem/SKILL.md',
    'integrations/pi/skills/thoth-mem/references/observation-review.md',
    'integrations/pi/skills/thoth-mem/references/pi.md',
  ]) if (!isRegularFile(join(record.installedPath, relative))) throw new Error(`Pi installed package resource is not a regular file: ${relative}`);
  const probe = extensionProbe(join(record.installedPath, 'dist', 'pi.js'));
  if (probe.status !== 0) throw new Error(`Pi installed extension load probe failed: ${probe.stderr.slice(0, 240)}`);
}

function pathIdentity(value: string): string {
  const resolved = resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function samePath(left: string, right: string): boolean { return pathIdentity(left) === pathIdentity(right); }

function isLocalSource(source: string): boolean {
  return isAbsolute(source) || source === '.' || source === '..' || /^\.\.?[\\/]/u.test(source);
}

function localSourceMatches(record: PiPackageRecord, localRoot: string): boolean {
  return isLocalSource(record.source) && record.installedPath !== null && isAbsolute(record.installedPath)
    && samePath(record.installedPath, localRoot);
}

function isThothMemPackagePath(path: string): boolean {
  try { return manifest(join(path, 'package.json')).name === 'thoth-mem'; } catch { return false; }
}

function isThothMemLocalRecord(record: PiPackageRecord): boolean {
  if (!isLocalSource(record.source)) return false;
  if (record.installedPath !== null && isAbsolute(record.installedPath)) return isThothMemPackagePath(record.installedPath);
  return isThothMemPackagePath(resolve(record.source));
}

function sourceMatchesDesired(record: PiPackageRecord, desiredSource: string, localRoot: string | undefined): boolean {
  return record.source === desiredSource || (localRoot !== undefined && localSourceMatches(record, localRoot));
}

function receiptOwnsRecord(receipt: PiReceipt | null, record: PiPackageRecord): boolean {
  if (!receipt || record.installedPath === null || !samePath(receipt.installedPath, record.installedPath)) return false;
  return receipt.provenance === 'local' || receipt.source === record.source;
}

export function parsePiList(output: string): PiPackageRecord[] {
  if (Buffer.byteLength(output, 'utf8') > 256_000 || /\x1b\[/u.test(output)) throw new Error('Pi package list output is malformed');
  const lines = output.replaceAll('\r\n', '\n').split('\n');
  const records: PiPackageRecord[] = [];
  let scope: PiPackageRecord['scope'] | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!line.trim() || line.trim() === 'No packages installed.') continue;
    if (line === 'User packages:') { scope = 'user'; continue; }
    if (line === 'Project packages:') { scope = 'project'; continue; }
    if (!scope || !/^  \S/u.test(line)) throw new Error('Pi package list output is malformed');
    const source = line.slice(2).replace(/ \(filtered\)$/u, '');
    if (!source || /[\r\n\0]/u.test(source)) throw new Error('Pi package source is malformed');
    const following = lines[index + 1];
    const installedPath = following?.startsWith('    ') ? following.slice(4) : null;
    if (installedPath !== null) index += 1;
    records.push({ scope, source, installedPath });
  }
  const identities = new Set(records.map((record) => `${record.scope}\0${record.source}`));
  if (identities.size !== records.length) throw new Error('Pi package list output is ambiguous');
  return records;
}

export function getPiManagerInvocation(command: string, args: readonly string[], options: { platform?: NodeJS.Platform; commandShell?: string; implicit?: boolean } = {}): { command: string; args: string[] } {
  if (command !== 'pi' || options.implicit === false || (options.platform ?? process.platform) !== 'win32') return { command, args: [...args] };
  return { command: options.commandShell ?? process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', 'pi', ...args] };
}

class ProcessPiExecutor implements PiExecutor {
  constructor(private readonly env: NodeJS.ProcessEnv, private readonly implicit: boolean) {}
  run(command: string, args: string[]): PiCommandResult {
    const invocation = getPiManagerInvocation(command, args, { commandShell: this.env.ComSpec ?? this.env.COMSPEC, implicit: this.implicit });
    const result = spawnSync(invocation.command, invocation.args, { encoding: 'utf8', env: this.env, shell: false, windowsHide: true });
    return { status: result.status, stdout: result.stdout ?? '', stderr: result.error?.message ?? result.stderr ?? '' };
  }
}

function checked(executor: PiExecutor, command: string, args: string[], label: string): PiCommandResult {
  const result = executor.run(command, args);
  if (result.status !== 0) throw new Error(`${label} failed: ${result.stderr.slice(0, 240)}`);
  return result;
}

function inspect(executor: PiExecutor, command: string): PiPackageRecord[] {
  return parsePiList(checked(executor, command, ['list', '--no-approve'], 'Pi package inspection').stdout);
}

function capabilities(executor: PiExecutor, command: string): boolean {
  const requirements = [
    { args: ['install', '--help'], fragments: ['install', '--no-approve'] },
    { args: ['remove', '--help'], fragments: ['remove', '--no-approve'] },
    { args: ['list', '--help'], fragments: ['list', '--no-approve'] },
  ];
  return requirements.every(({ args, fragments }) => {
    const result = executor.run(command, args);
    const text = `${result.stdout}\n${result.stderr}`.toLowerCase();
    return result.status === 0 && fragments.every((fragment) => text.includes(fragment));
  });
}

function readReceipt(path: string): PiReceipt | null {
  if (!existsSync(path)) return null;
  const value = JSON.parse(readFileSync(path, 'utf8')) as PiReceipt;
  if (value.schemaVersion !== 1 || value.host !== 'pi' || !['public', 'local'].includes(value.provenance) || typeof value.source !== 'string' || typeof value.version !== 'string' || typeof value.installedPath !== 'string') throw new Error('Pi setup receipt is invalid');
  return value;
}

function expectedReceipt(source: string, provenance: PiReceipt['provenance'], version: string, installedPath: string, piVersion: string): PiReceipt {
  return { schemaVersion: 1, host: 'pi', source, provenance, version, installedPath, piVersion };
}

function sameReceipt(left: PiReceipt | null, right: PiReceipt): boolean {
  return left !== null && Object.keys(left).length === Object.keys(right).length
    && Object.keys(right).every((key) => left[key as keyof PiReceipt] === right[key as keyof PiReceipt]);
}

function journalPaths(options: PiSetupOptions): { journalPath: string; receiptPath: string; providerConfigPath: string } {
  const providerConfigPath = getRuntimeConfigPath(options);
  const receipts = join(dirname(providerConfigPath), 'receipts');
  return { journalPath: join(receipts, 'pi.in-progress.json'), receiptPath: join(receipts, 'pi.json'), providerConfigPath };
}

function writeJournal(path: string, journal: PiJournal): void { atomicWriteText(path, `${JSON.stringify(journal, null, 2)}\n`); }

function loadJournal(path: string, desiredSource: string, providerConfigPath: string): PiJournal | null {
  if (!existsSync(path)) return null;
  const value = JSON.parse(readFileSync(path, 'utf8')) as PiJournal;
  const validRecord = (record: PiPackageRecord): boolean => record !== null && typeof record === 'object'
    && (record.scope === 'user' || record.scope === 'project') && typeof record.source === 'string' && !/[\r\n\0]/u.test(record.source)
    && (record.installedPath === null || typeof record.installedPath === 'string');
  if (value.schemaVersion !== 2 || value.host !== 'pi' || value.desiredSource !== desiredSource || value.providerConfigPath !== providerConfigPath
    || typeof value.operationId !== 'string' || !/^[0-9a-f-]{36}$/iu.test(value.operationId)
    || (value.priorSource !== null && typeof value.priorSource !== 'string') || (value.priorInstalledPath !== null && typeof value.priorInstalledPath !== 'string')
    || (value.priorBackupPath !== null && value.priorBackupPath !== join(dirname(path), `.pi-package-backup-${value.operationId}`)) || typeof value.priorBackupReady !== 'boolean'
    || typeof value.providerExisted !== 'boolean' || (value.providerBeforeText !== null && typeof value.providerBeforeText !== 'string') || typeof value.providerChanged !== 'boolean'
    || typeof value.receiptExisted !== 'boolean' || (value.receiptBeforeText !== null && typeof value.receiptBeforeText !== 'string')
    || !Array.isArray(value.managerRecordsBefore) || !value.managerRecordsBefore.every(validRecord)
    || !['prepared', 'remove-intent', 'remove-complete', 'install-intent', 'install-complete', 'rollback-verified', 'receipt-committed'].includes(value.mutationPhase)) {
    throw new Error('Pi in-progress setup receipt is invalid');
  }
  const priorRecords = value.managerRecordsBefore.filter((record) => record.scope === 'user' && record.source === value.priorSource && record.installedPath === value.priorInstalledPath);
  if ((value.priorSource === null) !== (value.priorInstalledPath === null) || (value.priorSource === null ? priorRecords.length !== 0 : priorRecords.length !== 1)) throw new Error('Pi in-progress setup receipt prior state is invalid');
  return value;
}

function backupPriorPackage(journalPath: string, journal: PiJournal): void {
  if (!journal.priorSource) return;
  if (!journal.priorInstalledPath || !isAbsolute(journal.priorInstalledPath) || !isRegularDirectory(journal.priorInstalledPath)) throw new Error('Pi prior package cannot be backed up exactly');
  journal.priorBackupPath = join(dirname(journalPath), `.pi-package-backup-${journal.operationId}`);
  writeJournal(journalPath, journal);
  cpSync(journal.priorInstalledPath, journal.priorBackupPath, { recursive: true, errorOnExist: true, dereference: false });
  journal.priorBackupReady = true;
  writeJournal(journalPath, journal);
}

function treesEqual(left: string, right: string): boolean {
  if (!existsSync(left) || !existsSync(right)) return false;
  const leftStat = lstatSync(left);
  const rightStat = lstatSync(right);
  if (leftStat.isSymbolicLink() || rightStat.isSymbolicLink()) return leftStat.isSymbolicLink() && rightStat.isSymbolicLink() && readlinkSync(left) === readlinkSync(right);
  if (leftStat.isFile() || rightStat.isFile()) return leftStat.isFile() && rightStat.isFile() && readFileSync(left).equals(readFileSync(right));
  if (!leftStat.isDirectory() || !rightStat.isDirectory()) return false;
  const leftNames = readdirSync(left).sort();
  const rightNames = readdirSync(right).sort();
  return leftNames.length === rightNames.length && leftNames.every((name, index) => name === rightNames[index] && treesEqual(join(left, name), join(right, name)));
}

function recordIdentity(record: PiPackageRecord): string { return `${record.scope}\0${record.source}\0${record.installedPath ?? ''}`; }

function sameRecords(left: readonly PiPackageRecord[], right: readonly PiPackageRecord[]): boolean {
  const leftIdentities = left.map(recordIdentity).sort();
  const rightIdentities = right.map(recordIdentity).sort();
  return leftIdentities.length === rightIdentities.length && leftIdentities.every((identity, index) => identity === rightIdentities[index]);
}

function isJournalDesired(record: PiPackageRecord, journal: PiJournal): boolean {
  return record.scope === 'user' && (record.source === journal.desiredSource
    || (isLocalSource(journal.desiredSource) && record.installedPath !== null && isAbsolute(record.installedPath) && samePath(record.installedPath, journal.desiredSource)));
}

function isJournalPrior(record: PiPackageRecord, journal: PiJournal): boolean {
  return journal.priorSource !== null && journal.priorInstalledPath !== null && record.scope === 'user' && record.source === journal.priorSource
    && record.installedPath !== null && isAbsolute(record.installedPath) && samePath(record.installedPath, journal.priorInstalledPath);
}

function journalRelated(records: readonly PiPackageRecord[], journal: PiJournal): PiPackageRecord[] {
  const related = records.filter((record) => isJournalDesired(record, journal) || isJournalPrior(record, journal));
  const unexpected = records.filter((record) => (/^npm:thoth-mem(?:@|$)/u.test(record.source) || isThothMemLocalRecord(record)) && !related.includes(record));
  if (unexpected.length > 0) throw new Error('Pi rollback found ambiguous thoth-mem package state');
  return related;
}

function restorePriorPackage(executor: PiExecutor, command: string, journal: PiJournal): void {
  if (!journal.priorSource) return;
  if (!journal.priorBackupReady || !journal.priorBackupPath || !journal.priorInstalledPath || !isRegularDirectory(journal.priorBackupPath)) throw new Error('Pi rollback backup is unavailable');
  let records = inspect(executor, command);
  const exactPrior = records.filter((record) => isJournalPrior(record, journal));
  for (const record of journalRelated(records, journal)) {
    if (exactPrior.length === 1 && record === exactPrior[0]) continue;
    checked(executor, command, ['remove', record.source, '--no-approve'], 'Pi rollback remove');
  }
  records = inspect(executor, command);
  if (records.filter((record) => isJournalPrior(record, journal)).length === 0) {
    checked(executor, command, ['install', journal.priorSource, '--no-approve'], 'Pi rollback reinstall');
    records = inspect(executor, command);
  }
  const restored = records.filter((record) => isJournalPrior(record, journal));
  if (restored.length !== 1) throw new Error('Pi rollback could not resolve the exact prior installed package path');
  rmSync(journal.priorInstalledPath, { recursive: true, force: true });
  cpSync(journal.priorBackupPath, journal.priorInstalledPath, { recursive: true, errorOnExist: true, dereference: false });
  if (!treesEqual(journal.priorBackupPath, journal.priorInstalledPath)) throw new Error('Pi rollback could not verify the exact prior package tree');
}

function removePriorBackup(journal: PiJournal): void {
  if (journal.priorBackupPath) rmSync(journal.priorBackupPath, { recursive: true, force: true });
}

function verifyRestoredState(executor: PiExecutor, command: string, journal: PiJournal, receiptPath: string): void {
  if (!sameRecords(inspect(executor, command), journal.managerRecordsBefore)) throw new Error('Pi rollback could not verify exact package-manager state');
  if (journal.providerExisted ? !existsSync(journal.providerConfigPath) || readFileSync(journal.providerConfigPath, 'utf8') !== journal.providerBeforeText : existsSync(journal.providerConfigPath)) throw new Error('Pi rollback could not verify exact provider state');
  if (journal.receiptExisted ? !existsSync(receiptPath) || readFileSync(receiptPath, 'utf8') !== journal.receiptBeforeText : existsSync(receiptPath)) throw new Error('Pi rollback could not verify exact receipt state');
  if (journal.priorBackupPath && existsSync(journal.priorBackupPath)
    && (!journal.priorInstalledPath || !treesEqual(journal.priorBackupPath, journal.priorInstalledPath))) throw new Error('Pi rollback could not reverify the exact prior package tree');
}

function rollback(executor: PiExecutor, command: string, journalPath: string, journal: PiJournal, receiptPath: string): void {
  const commandMayHaveMutated = journal.mutationPhase !== 'prepared';
  if (commandMayHaveMutated) {
    if (journal.priorSource) restorePriorPackage(executor, command, journal);
    else {
      for (const record of journalRelated(inspect(executor, command), journal)) checked(executor, command, ['remove', record.source, '--no-approve'], 'Pi rollback remove');
    }
  }
  if (journal.providerChanged) {
    if (journal.providerExisted && journal.providerBeforeText !== null) atomicWriteText(journal.providerConfigPath, journal.providerBeforeText);
    else rmSync(journal.providerConfigPath, { force: true });
  }
  if (journal.receiptExisted && journal.receiptBeforeText !== null) atomicWriteText(receiptPath, journal.receiptBeforeText);
  else rmSync(receiptPath, { force: true });
  verifyRestoredState(executor, command, journal, receiptPath);
  journal.mutationPhase = 'rollback-verified';
  writeJournal(journalPath, journal);
}

function verifyDesiredCommit(executor: PiExecutor, command: string, journal: PiJournal, receiptPath: string, version: string, piVersion: string, extensionProbe: (extensionPath: string) => PiCommandResult): void {
  const records = inspect(executor, command);
  const matches = records.filter((record) => isJournalDesired(record, journal));
  if (matches.length !== 1 || journalRelated(records, journal).length !== 1) throw new Error('Pi committed package state is invalid');
  verifyInstalled(matches[0]!, version, extensionProbe);
  const installedPath = matches[0]!.installedPath!;
  const wantedReceipt = expectedReceipt(journal.desiredSource, isLocalSource(journal.desiredSource) ? 'local' : 'public', version, installedPath, piVersion);
  if (!sameReceipt(readReceipt(receiptPath), wantedReceipt)) throw new Error('Pi committed receipt is invalid');
}

function cleanupTerminal(journalPath: string, journal: PiJournal, interruptAfter: PiSetupOptions['interruptAfter'], boundary: 'rollback-cleanup' | 'commit-cleanup', journalRemover: NonNullable<PiSetupOptions['journalRemover']>): void {
  removePriorBackup(journal);
  if (interruptAfter === boundary) throw new Error(`Simulated Pi ${boundary === 'rollback-cleanup' ? 'rollback' : 'commit'} cleanup interruption`);
  journalRemover(journalPath);
}

export function setupPi(options: PiSetupOptions = {}): PiSetupResult {
  const executingRoot = defaultPackageRoot();
  const version = executingVersion(executingRoot);
  const localRoot = options.packageRoot;
  if (localRoot !== undefined && (!isAbsolute(localRoot) || resolve(localRoot) !== localRoot)) throw new Error('Local Pi setup requires an explicit absolute package root');
  if (localRoot !== undefined && executingVersion(localRoot) !== version) throw new Error('Local Pi package version does not match the executing thoth-mem version');
  const extensionProbe = options.extensionProbe ?? defaultExtensionProbe;
  const journalRemover = options.journalRemover ?? ((path: string) => rmSync(path, { force: true }));
  if (localRoot !== undefined) {
    const localValue = manifest(join(localRoot, 'package.json'));
    const localPi = localValue.pi && typeof localValue.pi === 'object' && !Array.isArray(localValue.pi) ? localValue.pi as Record<string, unknown> : null;
    if (localValue.name !== 'thoth-mem' || localValue.version !== version
      || !Array.isArray(localPi?.extensions) || localPi.extensions.length !== 1 || localPi.extensions[0] !== './dist/pi.js'
      || !Array.isArray(localPi?.skills) || localPi.skills.length !== 1 || localPi.skills[0] !== './integrations/pi/skills/thoth-mem') throw new Error('Local Pi package manifest or resources are invalid');
    for (const relative of ['dist/pi.js', 'integrations/pi/skills/thoth-mem/SKILL.md', 'integrations/pi/skills/thoth-mem/references/observation-review.md', 'integrations/pi/skills/thoth-mem/references/pi.md']) {
      if (!isRegularFile(join(localRoot, relative))) throw new Error(`Local Pi package resource is not a regular file: ${relative}`);
    }
  }
  const desiredSource = localRoot ?? `npm:thoth-mem@${version}`;
  const command = options.command ?? 'pi';
  const executor = options.executor ?? new ProcessPiExecutor({ ...(options.env ?? process.env), ...(options.homeDir ? { HOME: options.homeDir, USERPROFILE: options.homeDir } : {}) }, options.command === undefined);
  const versionResult = checked(executor, command, ['--version'], 'Pi version inspection');
  const piVersion = versionResult.stdout.trim();
  if (!/^\d+\.\d+\.\d+$/u.test(piVersion)) throw new Error('Pi version output is malformed');
  if (!/^0\.84\.\d+$/u.test(piVersion) && !options.forceVersion) throw new Error(`Pi ${piVersion || 'unknown'} is outside the supported 0.84.x contract`);
  if (!capabilities(executor, command)) throw new Error('Pi package manager capability contract is incomplete');
  let initial = inspect(executor, command);
  const { journalPath, receiptPath, providerConfigPath } = journalPaths(options);
  const previousJournal = loadJournal(journalPath, desiredSource, providerConfigPath);
  let recovered = false;
  if (previousJournal && !options.planOnly) {
    if (previousJournal.mutationPhase === 'rollback-verified') {
      verifyRestoredState(executor, command, previousJournal, receiptPath);
      cleanupTerminal(journalPath, previousJournal, options.interruptAfter, 'rollback-cleanup', journalRemover);
    } else if (previousJournal.mutationPhase === 'receipt-committed') {
      verifyDesiredCommit(executor, command, previousJournal, receiptPath, version, piVersion, extensionProbe);
      cleanupTerminal(journalPath, previousJournal, options.interruptAfter, 'commit-cleanup', journalRemover);
    } else {
      rollback(executor, command, journalPath, previousJournal, receiptPath);
      cleanupTerminal(journalPath, previousJournal, options.interruptAfter, 'rollback-cleanup', journalRemover);
    }
    recovered = true;
    initial = inspect(executor, command);
  }
  const related = initial.filter((record) => record.source === desiredSource || /^npm:thoth-mem(?:@|$)/u.test(record.source) || isThothMemLocalRecord(record));
  if (related.some((record) => record.scope !== 'user')) throw new Error('Project-local thoth-mem Pi state conflicts with global managed setup');
  const receipt = readReceipt(receiptPath);
  const current = related.length === 1 ? related[0] : undefined;
  if (related.length > 1) throw new Error('Pi thoth-mem package state is ambiguous');
  const currentMatchesDesired = current !== undefined && sourceMatchesDesired(current, desiredSource, localRoot);
  if (current && !currentMatchesDesired && !receiptOwnsRecord(receipt, current)) throw new Error('Unowned Pi thoth-mem package provenance conflicts with managed setup');
  let currentVerified = false;
  let repairCurrent = false;
  if (currentMatchesDesired) {
    try {
      verifyInstalled(current, version, extensionProbe);
      currentVerified = true;
    } catch (error) {
      if (!receiptOwnsRecord(receipt, current)) throw new Error(`Unowned matching Pi thoth-mem installation is invalid: ${error instanceof Error ? error.message : String(error)}`);
      repairCurrent = true;
    }
  }
  const runtime = loadRuntimeConfig(options);
  const wantedDataDir = options.dataDir ? resolve(options.dataDir) : null;
  const providerCurrent = wantedDataDir === null || runtime.provider?.dataDir === wantedDataDir;
  const actions = [
    ...(current && (!currentMatchesDesired || repairCurrent) ? [`${command} remove ${current.source} --no-approve`] : []),
    ...(!current || !currentMatchesDesired || repairCurrent ? [`${command} install ${desiredSource} --no-approve`] : []),
    `verify ${desiredSource} manifest and resources`,
    ...(wantedDataDir ? [`bind data directory ${wantedDataDir}`] : []),
  ];
  const complete = currentMatchesDesired && currentVerified && providerCurrent;
  if (options.planOnly) return { host: 'pi', status: 'planned', changed: false, source: desiredSource, version, piVersion, actions, receiptPath: null, recovered: false, verification: { package: Boolean(current), source: currentMatchesDesired, manifest: currentVerified }, warnings: [] };

  if (complete) {
    const wantedReceipt = expectedReceipt(desiredSource, localRoot ? 'local' : 'public', version, current.installedPath!, piVersion);
    const receiptChanged = !sameReceipt(receipt, wantedReceipt);
    if (receiptChanged) atomicWriteText(receiptPath, `${JSON.stringify(wantedReceipt, null, 2)}\n`);
    return { host: 'pi', status: 'complete', changed: recovered || receiptChanged, source: desiredSource, version, piVersion, actions, receiptPath, recovered, verification: { package: true, source: true, manifest: true }, warnings: [] };
  }

  const providerExisted = existsSync(providerConfigPath);
  const receiptExisted = existsSync(receiptPath);
  const operationId = randomUUID();
  const journal: PiJournal = { schemaVersion: 2, host: 'pi', operationId, desiredSource, priorSource: current?.source ?? null, priorInstalledPath: current?.installedPath ?? null, priorBackupPath: null, priorBackupReady: false, providerConfigPath, providerExisted, providerBeforeText: providerExisted ? readFileSync(providerConfigPath, 'utf8') : null, providerChanged: !providerCurrent, receiptExisted, receiptBeforeText: receiptExisted ? readFileSync(receiptPath, 'utf8') : null, managerRecordsBefore: initial, mutationPhase: 'prepared' };
  writeJournal(journalPath, journal);
  try {
    if (current && (!currentMatchesDesired || repairCurrent)) backupPriorPackage(journalPath, journal);
    if (!providerCurrent && wantedDataDir) {
      persistRuntimeConfig({ dataDir: wantedDataDir }, options);
      if (options.failAfter === 'provider') throw new Error('Injected Pi setup failure after provider');
    }
    if (current && (!currentMatchesDesired || repairCurrent)) {
      journal.mutationPhase = 'remove-intent'; writeJournal(journalPath, journal);
      checked(executor, command, ['remove', current.source, '--no-approve'], 'Pi package removal');
      if (options.interruptAfter === 'remove') throw new Error('Simulated Pi setup interruption after remove');
      journal.mutationPhase = 'remove-complete'; writeJournal(journalPath, journal);
      if (options.failAfter === 'remove') throw new Error('Injected Pi setup failure after remove');
    }
    let finalRecords: PiPackageRecord[] | null = null;
    if (!current || !currentMatchesDesired || repairCurrent) {
      journal.mutationPhase = 'install-intent'; writeJournal(journalPath, journal);
      checked(executor, command, ['install', desiredSource, '--no-approve'], 'Pi package installation');
      if (options.interruptAfter === 'install') throw new Error('Simulated Pi setup interruption after install');
      journal.mutationPhase = 'install-complete'; writeJournal(journalPath, journal);
      finalRecords = inspect(executor, command);
      if (options.failAfter === 'install') throw new Error('Injected Pi setup failure after install');
    }
    finalRecords ??= inspect(executor, command);
    const matches = finalRecords.filter((record) => record.scope === 'user' && sourceMatchesDesired(record, desiredSource, localRoot));
    if (matches.length !== 1) throw new Error('Pi post-install package verification failed');
    verifyInstalled(matches[0]!, version, extensionProbe);
    const unrelatedBefore = journal.managerRecordsBefore.filter((record) => !isJournalPrior(record, journal));
    const unrelatedAfter = finalRecords.filter((record) => !isJournalDesired(record, journal));
    if (!sameRecords(unrelatedBefore, unrelatedAfter)) throw new Error('Pi post-install package reconciliation failed');
    const installedPath = matches[0]!.installedPath!;
    const wantedReceipt = expectedReceipt(desiredSource, localRoot ? 'local' : 'public', version, installedPath, piVersion);
    atomicWriteText(receiptPath, `${JSON.stringify(wantedReceipt, null, 2)}\n`);
    if (!sameReceipt(readReceipt(receiptPath), wantedReceipt)) throw new Error('Pi setup receipt commit could not be verified');
    writeJournal(journalPath, { ...journal, mutationPhase: 'receipt-committed' });
    journal.mutationPhase = 'receipt-committed';
    cleanupTerminal(journalPath, journal, options.interruptAfter, 'commit-cleanup', journalRemover);
    return { host: 'pi', status: 'complete', changed: true, source: desiredSource, version, piVersion, actions, receiptPath, recovered, verification: { package: true, source: true, manifest: true }, warnings: [] };
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith('Simulated Pi')) && journal.mutationPhase !== 'receipt-committed') {
      rollback(executor, command, journalPath, journal, receiptPath);
      cleanupTerminal(journalPath, journal, options.interruptAfter, 'rollback-cleanup', journalRemover);
    }
    throw error;
  }
}
