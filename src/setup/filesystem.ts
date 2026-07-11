import { createHash, randomUUID } from 'node:crypto';
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  readdir,
  rename,
  rm,
} from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';

export type FilesystemFaultPoint =
  | 'backup-parent-sync'
  | 'before-write'
  | 'stage-write'
  | 'stage-sync'
  | 'before-prestate-check'
  | 'atomic-rename'
  | 'parent-sync'
  | 'after-rename'
  | 'post-write-verify'
  | 'cleanup-displaced'
  | 'cleanup-artifact'
  | 'restore';

export interface FilesystemFaultEvent {
  point: FilesystemFaultPoint;
  targetPath: string;
  stagePath?: string;
}

export interface FilesystemFaultOptions {
  fault?: (event: FilesystemFaultEvent) => void | Promise<void>;
  beforeMutations?: (context: { backups: FilesystemBackup[] }) => void | Promise<void>;
  afterChange?: (event: {
    index: number;
    targetPath: string;
    kind: FilesystemChange['kind'];
  }) => void | Promise<void>;
}

export interface FilesystemFileChange {
  kind: 'file';
  targetPath: string;
  content: string;
}

export interface FilesystemDirectoryEntry {
  sourcePath: string;
  targetRelativePath: string;
}

export interface FilesystemGeneratedFile {
  targetRelativePath: string;
  content: string;
  mode?: number;
}

export interface FilesystemDirectoryChange {
  kind: 'directory';
  targetPath: string;
  entries: FilesystemDirectoryEntry[];
  generatedFiles?: FilesystemGeneratedFile[];
}

export interface FilesystemRemoveChange {
  kind: 'remove';
  targetPath: string;
}

export type FilesystemChange =
  | FilesystemFileChange
  | FilesystemDirectoryChange
  | FilesystemRemoveChange;

export interface AtomicFilesystemPlan {
  targetRoot: string;
  backupRoot: string;
  sourceRoot?: string;
  changes: FilesystemChange[];
}

export interface FilesystemBackup {
  targetPath: string;
  backupPath: string;
  kind: 'file' | 'directory';
}

export interface AtomicFilesystemResult {
  outcome: 'confirmed' | 'failed';
  changed: boolean;
  backups: FilesystemBackup[];
  restored: string[];
  unrestored: string[];
  remainingArtifacts: string[];
  diagnostics: string[];
}

type EntryKind = 'missing' | 'file' | 'directory' | 'other';

interface PreparedChange {
  change: FilesystemChange;
  originalKind: EntryKind;
  originalMode?: number;
  originalSnapshot: string;
  targetRoot: string;
  backup?: FilesystemBackup;
}

interface AppliedChange extends PreparedChange {
  expectedSnapshot: string;
}

class SafeFilesystemError extends Error {}

export async function applyAtomicFilesystemChanges(
  plan: AtomicFilesystemPlan,
  options: FilesystemFaultOptions = {},
): Promise<AtomicFilesystemResult> {
  let prepared: PreparedChange[];
  try {
    prepared = await prepareChanges(plan);
  } catch {
    return failedResult([], [], [], [], false, 'filesystem-plan-invalid');
  }

  const backups: FilesystemBackup[] = [];
  try {
    for (const item of prepared) {
      if (item.backup) {
        await createBackup(item.backup, options);
        backups.push(item.backup);
        item.originalSnapshot = await snapshotEntry(item.backup.backupPath);
      }
    }
  } catch {
    return failedResult(backups, [], [], [], false, 'filesystem-backup-failed');
  }

  const applied: AppliedChange[] = [];
  const activeArtifacts = new Set<string>();
  try {
    await options.beforeMutations?.({ backups });
    for (let index = 0; index < prepared.length; index++) {
      const item = prepared[index]!;
      await invokeFault(options, {
        point: 'before-write',
        targetPath: item.change.targetPath,
      });
      await applyChange(
        item,
        options,
        activeArtifacts,
        (appliedChange) => applied.push(appliedChange),
      );
      await options.afterChange?.({
        index,
        targetPath: item.change.targetPath,
        kind: item.change.kind,
      });
    }
    if (activeArtifacts.size > 0) {
      throw new SafeFilesystemError('filesystem-artifact-cleanup-incomplete');
    }
    return {
      outcome: 'confirmed',
      changed: prepared.length > 0,
      backups,
      restored: [],
      unrestored: [],
      remainingArtifacts: [],
      diagnostics: [],
    };
  } catch {
    const remainingArtifacts = await cleanupArtifacts(activeArtifacts, options);
    const { restored, unrestored } = await restoreAppliedChanges(applied, options);
    const cleanupIncomplete = remainingArtifacts.length > 0;
    return failedResult(
      backups,
      restored,
      unrestored,
      remainingArtifacts,
      unrestored.length > 0 || cleanupIncomplete,
      cleanupIncomplete
        ? 'filesystem-artifact-cleanup-incomplete'
        : unrestored.length > 0
          ? 'filesystem-apply-failed-restoration-incomplete'
          : 'filesystem-apply-failed-restored',
    );
  }
}

export async function filesystemEntriesEqual(
  leftPath: string,
  rightPath: string,
): Promise<boolean> {
  try {
    return await snapshotEntry(leftPath) === await snapshotEntry(rightPath);
  } catch {
    return false;
  }
}

export async function filesystemEntrySnapshot(path: string): Promise<string> {
  return snapshotMaybe(path);
}

export async function filesystemDirectoryMatches(
  targetPath: string,
  entries: FilesystemDirectoryEntry[],
  ignoredRelativePaths: string[] = [],
): Promise<boolean> {
  try {
    if (await entryKind(targetPath) !== 'directory') {
      return false;
    }
    const expected: string[] = [];
    for (const entry of entries) {
      if (await entryKind(entry.sourcePath) !== 'directory') {
        return false;
      }
      const prefix = normalizeRelativePath(entry.targetRelativePath);
      if (prefix) {
        expected.push(`directory:${prefix}`);
      }
      await collectDirectoryRecords(
        entry.sourcePath,
        entry.sourcePath,
        expected,
        prefix,
        new Set(),
      );
    }

    const actual: string[] = [];
    await collectDirectoryRecords(
      targetPath,
      targetPath,
      actual,
      '',
      new Set(ignoredRelativePaths.map(normalizeRelativePath)),
    );
    expected.sort();
    actual.sort();
    return expected.join('\n') === actual.join('\n');
  } catch {
    return false;
  }
}

async function prepareChanges(plan: AtomicFilesystemPlan): Promise<PreparedChange[]> {
  const targetRoot = requireAbsolute(plan.targetRoot);
  const backupRoot = requireAbsolute(plan.backupRoot);
  const sourceRoot = plan.sourceRoot === undefined
    ? undefined
    : requireAbsolute(plan.sourceRoot);
  const seenTargets = new Set<string>();
  const prepared: PreparedChange[] = [];

  for (const change of plan.changes) {
    const targetPath = requireAbsolute(change.targetPath);
    if (
      !await isRealPathContained(targetRoot, targetPath)
      || seenTargets.has(targetPath)
    ) {
      throw new SafeFilesystemError('invalid-target');
    }
    seenTargets.add(targetPath);

    if (change.kind === 'directory') {
      if (
        !sourceRoot
        || (change.entries.length === 0 && (change.generatedFiles?.length ?? 0) === 0)
      ) {
        throw new SafeFilesystemError('invalid-source');
      }
      const destinations = new Set<string>();
      for (const entry of change.entries) {
        const sourcePath = requireAbsolute(entry.sourcePath);
        const destination = resolve(targetPath, entry.targetRelativePath);
        if (
          !await isRealPathContained(sourceRoot, sourcePath)
          || !await isRealPathContained(targetPath, destination)
          || destinations.has(destination)
        ) {
          throw new SafeFilesystemError('invalid-source');
        }
        destinations.add(destination);
        await validateSourceTree(sourcePath);
      }
      for (const generatedFile of change.generatedFiles ?? []) {
        const destination = resolve(targetPath, generatedFile.targetRelativePath);
        if (
          !await isRealPathContained(targetPath, destination)
          || destinations.has(destination)
        ) {
          throw new SafeFilesystemError('invalid-generated-file');
        }
        destinations.add(destination);
      }
    }

    const originalDetails = await entryDetails(targetPath);
    const originalKind = originalDetails.kind;
    if (originalKind === 'other') {
      throw new SafeFilesystemError('unsupported-target');
    }
    if (
      change.kind !== 'remove'
      &&
      originalKind !== 'missing'
      && originalKind !== change.kind
    ) {
      throw new SafeFilesystemError('target-kind-conflict');
    }

    const targetRelativePath = relative(targetRoot, targetPath);
    const backupPath = resolve(backupRoot, targetRelativePath);
    if (!await isRealPathContained(backupRoot, backupPath)) {
      throw new SafeFilesystemError('invalid-backup');
    }
    prepared.push({
      change: { ...change, targetPath },
      originalKind,
      originalMode: originalDetails.mode,
      originalSnapshot: await snapshotMaybe(targetPath),
      targetRoot,
      ...(originalKind === 'file' || originalKind === 'directory'
        ? {
            backup: {
              targetPath,
              backupPath,
              kind: originalKind,
            },
          }
        : {}),
    });
  }

  return prepared;
}

function requireAbsolute(path: string): string {
  if (!path.trim() || !isAbsolute(path)) {
    throw new SafeFilesystemError('path-not-absolute');
  }
  return resolve(path);
}

function isContained(root: string, candidate: string): boolean {
  const relativePath = relative(resolve(root), resolve(candidate));
  return relativePath === ''
    || (!isAbsolute(relativePath)
      && relativePath !== '..'
      && !relativePath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`));
}

async function isRealPathContained(root: string, candidate: string): Promise<boolean> {
  if (!isContained(root, candidate)) {
    return false;
  }
  const [resolvedRoot, resolvedCandidate] = await Promise.all([
    resolveFromNearestExistingAncestor(root),
    resolveFromNearestExistingAncestor(candidate),
  ]);
  return isContained(resolvedRoot, resolvedCandidate);
}

async function resolveFromNearestExistingAncestor(path: string): Promise<string> {
  let current = resolve(path);
  const missingSegments: string[] = [];
  while (true) {
    try {
      const existingPath = await realpath(current);
      return resolve(existingPath, ...missingSegments.reverse());
    } catch (error) {
      if (!isMissingPathError(error) && !isNotDirectoryError(error)) {
        throw error;
      }
      const parent = dirname(current);
      if (parent === current) {
        throw error;
      }
      missingSegments.push(basename(current));
      current = parent;
    }
  }
}

async function entryDetails(path: string): Promise<{
  kind: EntryKind;
  mode?: number;
}> {
  try {
    const details = await lstat(path);
    if (details.isSymbolicLink()) {
      return { kind: 'other' };
    }
    if (details.isFile()) {
      return { kind: 'file', mode: details.mode & 0o777 };
    }
    if (details.isDirectory()) {
      return { kind: 'directory', mode: details.mode & 0o777 };
    }
    return { kind: 'other' };
  } catch (error) {
    if (isMissingPathError(error)) {
      return { kind: 'missing' };
    }
    throw error;
  }
}

async function entryKind(path: string): Promise<EntryKind> {
  return (await entryDetails(path)).kind;
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function isNotDirectoryError(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && (error as NodeJS.ErrnoException).code === 'ENOTDIR';
}

async function validateSourceTree(path: string): Promise<void> {
  const kind = await entryKind(path);
  if (kind !== 'directory') {
    throw new SafeFilesystemError('source-not-directory');
  }
  await walkDirectory(path, async (entryPath, entryKindValue) => {
    if (entryKindValue !== 'file' && entryKindValue !== 'directory') {
      throw new SafeFilesystemError('unsupported-source-entry');
    }
  });
}

async function createBackup(
  backup: FilesystemBackup,
  options: FilesystemFaultOptions,
): Promise<void> {
  await mkdir(dirname(backup.backupPath), { recursive: true });
  if (await entryKind(backup.backupPath) !== 'missing') {
    throw new SafeFilesystemError('backup-exists');
  }
  if (backup.kind === 'file') {
    await copyFile(backup.targetPath, backup.backupPath);
  } else {
    await copyTree(backup.targetPath, backup.backupPath);
  }
  await syncEntry(backup.backupPath);
  if (!await filesystemEntriesEqual(backup.targetPath, backup.backupPath)) {
    throw new SafeFilesystemError('backup-verification-failed');
  }
  await invokeFault(options, {
    point: 'backup-parent-sync',
    targetPath: backup.targetPath,
  });
  await syncDirectoryBestEffort(dirname(backup.backupPath));
}

async function applyChange(
  item: PreparedChange,
  options: FilesystemFaultOptions,
  activeArtifacts: Set<string>,
  onApplied: (change: AppliedChange) => void,
): Promise<void> {
  const targetPath = item.change.targetPath;
  await mkdir(dirname(targetPath), { recursive: true });
  if (!await isRealPathContained(item.targetRoot, targetPath)) {
    throw new SafeFilesystemError('target-containment-changed');
  }
  let stagePath: string | undefined;
  let expectedSnapshot = 'missing';
  if (item.change.kind !== 'remove') {
    stagePath = temporarySibling(targetPath, 'stage');
    if (!await isRealPathContained(item.targetRoot, stagePath)) {
      throw new SafeFilesystemError('stage-containment-invalid');
    }
    activeArtifacts.add(stagePath);
    await invokeFault(options, { point: 'stage-write', targetPath, stagePath });

    if (item.change.kind === 'file') {
      await writeStagedFile(
        stagePath,
        item.change.content,
        options,
        targetPath,
        item.originalMode,
      );
    } else {
      await writeStagedDirectory(stagePath, item.change, options);
    }
    expectedSnapshot = await snapshotEntry(stagePath);
  }

  await invokeFault(options, {
    point: 'before-prestate-check',
    targetPath,
    ...(stagePath ? { stagePath } : {}),
  });
  if (
    !await isRealPathContained(item.targetRoot, targetPath)
    || await snapshotMaybe(targetPath) !== item.originalSnapshot
  ) {
    throw new SafeFilesystemError('target-prestate-changed');
  }
  await invokeFault(options, {
    point: 'atomic-rename',
    targetPath,
    ...(stagePath ? { stagePath } : {}),
  });
  let displacedPath: string | undefined;
  if (item.change.kind === 'remove') {
    if (item.originalKind !== 'missing') {
      displacedPath = temporarySibling(targetPath, 'displaced');
      await rename(targetPath, displacedPath);
      activeArtifacts.add(displacedPath);
    }
  } else {
    displacedPath = await renameIntoPlace(
      stagePath!,
      targetPath,
      activeArtifacts,
    );
    activeArtifacts.delete(stagePath!);
  }

  const applied = { ...item, expectedSnapshot };
  onApplied(applied);
  await invokeFault(options, {
    point: 'parent-sync',
    targetPath,
    ...(stagePath ? { stagePath } : {}),
  });
  await syncDirectoryBestEffort(dirname(targetPath));
  await invokeFault(options, {
    point: 'after-rename',
    targetPath,
    ...(stagePath ? { stagePath } : {}),
  });
  await invokeFault(options, {
    point: 'post-write-verify',
    targetPath,
    ...(stagePath ? { stagePath } : {}),
  });
  if (item.change.kind === 'remove') {
    if (await entryKind(targetPath) !== 'missing') {
      throw new SafeFilesystemError('post-remove-verification-failed');
    }
  } else {
    await verifySnapshot(targetPath, expectedSnapshot);
  }
  if (displacedPath) {
    await invokeFault(options, {
      point: 'cleanup-displaced',
      targetPath,
      stagePath: displacedPath,
    });
    await rm(displacedPath, { recursive: true, force: true });
    if (await entryKind(displacedPath) !== 'missing') {
      throw new SafeFilesystemError('displaced-cleanup-failed');
    }
    activeArtifacts.delete(displacedPath);
  }
}

async function writeStagedFile(
  stagePath: string,
  content: string,
  options: FilesystemFaultOptions,
  targetPath: string,
  originalMode?: number,
): Promise<void> {
  const handle = await open(stagePath, 'wx');
  try {
    await handle.writeFile(content, 'utf8');
    if (originalMode !== undefined && process.platform !== 'win32') {
      await handle.chmod(originalMode);
    }
    await invokeFault(options, { point: 'stage-sync', targetPath, stagePath });
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeStagedDirectory(
  stagePath: string,
  change: FilesystemDirectoryChange,
  options: FilesystemFaultOptions,
): Promise<void> {
  await mkdir(stagePath);
  for (const entry of change.entries) {
    await copyTree(entry.sourcePath, resolve(stagePath, entry.targetRelativePath));
  }
  for (const generatedFile of change.generatedFiles ?? []) {
    const generatedPath = resolve(stagePath, generatedFile.targetRelativePath);
    await mkdir(dirname(generatedPath), { recursive: true });
    const handle = await open(generatedPath, 'wx');
    try {
      await handle.writeFile(generatedFile.content, 'utf8');
      if (generatedFile.mode !== undefined && process.platform !== 'win32') {
        await handle.chmod(generatedFile.mode);
      }
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  await invokeFault(options, {
    point: 'stage-sync',
    targetPath: change.targetPath,
    stagePath,
  });
  await syncEntry(stagePath);
}

async function renameIntoPlace(
  stagePath: string,
  targetPath: string,
  activeArtifacts: Set<string>,
): Promise<string | undefined> {
  try {
    await rename(stagePath, targetPath);
    return undefined;
  } catch (error) {
    if (await entryKind(targetPath) !== 'directory') {
      throw error;
    }
  }

  const displacedPath = temporarySibling(targetPath, 'displaced');
  await rename(targetPath, displacedPath);
  activeArtifacts.add(displacedPath);
  try {
    await rename(stagePath, targetPath);
  } catch (error) {
    try {
      await rename(displacedPath, targetPath);
      activeArtifacts.delete(displacedPath);
    } catch {
      // The caller will report and retain the displaced path as an orphan.
    }
    throw error;
  }
  return displacedPath;
}

async function restoreAppliedChanges(
  applied: AppliedChange[],
  options: FilesystemFaultOptions,
): Promise<{ restored: string[]; unrestored: string[] }> {
  const restored: string[] = [];
  const unrestored: string[] = [];

  for (const item of [...applied].reverse()) {
    const targetPath = item.change.targetPath;
    let restoreStage: string | undefined;
    try {
      restoreStage = temporarySibling(targetPath, 'restore');
      await invokeFault(options, {
        point: 'restore',
        targetPath,
        stagePath: restoreStage,
      });
      if (item.originalKind === 'missing') {
        await rm(targetPath, { recursive: true, force: true });
        await syncDirectoryBestEffort(dirname(targetPath));
      } else if (item.backup) {
        if (item.backup.kind === 'file') {
          await copyFile(item.backup.backupPath, restoreStage);
        } else {
          await copyTree(item.backup.backupPath, restoreStage);
        }
        await syncEntry(restoreStage);
        await replaceForRestore(restoreStage, targetPath);
        restoreStage = undefined;
        await syncDirectoryBestEffort(dirname(targetPath));
        await verifyEntriesEqual(item.backup.backupPath, targetPath);
      }
      restored.push(targetPath);
    } catch {
      unrestored.push(targetPath);
    } finally {
      if (restoreStage) {
        await rm(restoreStage, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }

  return { restored, unrestored };
}

async function replaceForRestore(stagePath: string, targetPath: string): Promise<void> {
  try {
    await rename(stagePath, targetPath);
  } catch {
    await rm(targetPath, { recursive: true, force: true });
    await rename(stagePath, targetPath);
  }
}

async function verifySnapshot(path: string, expectedSnapshot: string): Promise<void> {
  if (await snapshotEntry(path) !== expectedSnapshot) {
    throw new SafeFilesystemError('post-write-verification-failed');
  }
}

async function verifyEntriesEqual(leftPath: string, rightPath: string): Promise<void> {
  if (!await filesystemEntriesEqual(leftPath, rightPath)) {
    throw new SafeFilesystemError('restore-verification-failed');
  }
}

async function copyTree(sourcePath: string, targetPath: string): Promise<void> {
  const kind = await entryKind(sourcePath);
  if (kind === 'file') {
    await mkdir(dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
    return;
  }
  if (kind !== 'directory') {
    throw new SafeFilesystemError('unsupported-copy-source');
  }
  await mkdir(targetPath, { recursive: true });
  const entries = await readdir(sourcePath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      throw new SafeFilesystemError('source-link-not-allowed');
    }
    await copyTree(join(sourcePath, entry.name), join(targetPath, entry.name));
  }
}

async function walkDirectory(
  root: string,
  visit: (path: string, kind: EntryKind) => Promise<void>,
): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(root, entry.name);
    const kind = await entryKind(entryPath);
    await visit(entryPath, kind);
    if (kind === 'directory') {
      await walkDirectory(entryPath, visit);
    }
  }
}

async function syncEntry(path: string): Promise<void> {
  const kind = await entryKind(path);
  if (kind === 'file') {
    const handle = await open(path, 'r+');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    return;
  }
  if (kind !== 'directory') {
    throw new SafeFilesystemError('sync-target-invalid');
  }
  await walkDirectory(path, async (entryPath, entryKindValue) => {
    if (entryKindValue === 'file') {
      await syncEntry(entryPath);
    }
  });
  await syncDirectoryBestEffort(path);
}

async function syncDirectoryBestEffort(path: string): Promise<void> {
  let handle;
  try {
    handle = await open(path, 'r');
    await handle.sync();
  } catch (error) {
    const code = error instanceof Error && 'code' in error
      ? (error as NodeJS.ErrnoException).code
      : undefined;
    if (!['EACCES', 'EBADF', 'EINVAL', 'EISDIR', 'EPERM'].includes(code ?? '')) {
      throw error;
    }
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function snapshotEntry(path: string): Promise<string> {
  const kind = await entryKind(path);
  if (kind === 'file') {
    const content = await readFile(path);
    return `file:${createHash('sha256').update(content).digest('hex')}`;
  }
  if (kind !== 'directory') {
    throw new SafeFilesystemError('snapshot-target-invalid');
  }
  const records: string[] = ['directory:.'];
  await snapshotDirectory(path, path, records);
  return records.join('\n');
}

async function snapshotMaybe(path: string): Promise<string> {
  return await entryKind(path) === 'missing'
    ? 'missing'
    : snapshotEntry(path);
}

async function snapshotDirectory(
  root: string,
  current: string,
  records: string[],
): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const entryPath = join(current, entry.name);
    const relativePath = relative(root, entryPath).replaceAll('\\', '/');
    if (entry.isDirectory()) {
      records.push(`directory:${relativePath}`);
      await snapshotDirectory(root, entryPath, records);
    } else if (entry.isFile()) {
      const content = await readFile(entryPath);
      records.push(`file:${relativePath}:${createHash('sha256').update(content).digest('hex')}`);
    } else {
      throw new SafeFilesystemError('snapshot-entry-invalid');
    }
  }
}

async function collectDirectoryRecords(
  root: string,
  current: string,
  records: string[],
  prefix: string,
  ignored: Set<string>,
): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const entryPath = join(current, entry.name);
    const sourceRelativePath = normalizeRelativePath(relative(root, entryPath));
    const targetRelativePath = prefix
      ? `${prefix}/${sourceRelativePath}`
      : sourceRelativePath;
    if (isIgnoredRelativePath(targetRelativePath, ignored)) {
      continue;
    }
    if (entry.isDirectory()) {
      records.push(`directory:${targetRelativePath}`);
      await collectDirectoryRecords(root, entryPath, records, prefix, ignored);
    } else if (entry.isFile()) {
      const content = await readFile(entryPath);
      records.push(`file:${targetRelativePath}:${createHash('sha256').update(content).digest('hex')}`);
    } else {
      throw new SafeFilesystemError('directory-layout-entry-invalid');
    }
  }
}

function normalizeRelativePath(path: string): string {
  const normalized = path.replaceAll('\\', '/');
  return normalized === '.' ? '' : normalized.replace(/^\.\//, '').replace(/\/$/, '');
}

function isIgnoredRelativePath(path: string, ignored: Set<string>): boolean {
  for (const ignoredPath of ignored) {
    if (path === ignoredPath || path.startsWith(`${ignoredPath}/`)) {
      return true;
    }
  }
  return false;
}

function temporarySibling(targetPath: string, purpose: string): string {
  return join(
    dirname(targetPath),
    `.${basename(targetPath)}.thoth-mem-${purpose}-${randomUUID()}`,
  );
}

async function invokeFault(
  options: FilesystemFaultOptions,
  event: FilesystemFaultEvent,
): Promise<void> {
  await options.fault?.(event);
}

async function cleanupArtifacts(
  artifacts: Set<string>,
  options: FilesystemFaultOptions,
): Promise<string[]> {
  for (const artifactPath of [...artifacts]) {
    try {
      await invokeFault(options, {
        point: 'cleanup-artifact',
        targetPath: artifactPath,
        stagePath: artifactPath,
      });
      await rm(artifactPath, { recursive: true, force: true });
      if (await entryKind(artifactPath) === 'missing') {
        artifacts.delete(artifactPath);
      }
    } catch {
      // Remaining artifacts are returned as bounded diagnostics to the caller.
    }
  }
  return [...artifacts].sort();
}

function failedResult(
  backups: FilesystemBackup[],
  restored: string[],
  unrestored: string[],
  remainingArtifacts: string[],
  changed: boolean,
  diagnostic: string,
): AtomicFilesystemResult {
  return {
    outcome: 'failed',
    changed,
    backups,
    restored,
    unrestored,
    remainingArtifacts,
    diagnostics: [diagnostic],
  };
}
