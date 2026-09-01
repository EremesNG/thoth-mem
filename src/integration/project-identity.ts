import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import type { ProjectIdentityInput } from '../memory-core/contracts.js';

export const PROJECT_ID_MARKER = 'thoth-mem.project-id';

export interface ProjectIdentityResolverOptions {
  link?: (existingPath: string, newPath: string) => void;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\n$/u;

function normalizePath(directory: string): string {
  return resolve(directory).replaceAll('\\', '/').replace(/\/$/u, '');
}

function runGit(directory: string, args: string[], allowNonRepository = false): string | null {
  const result = spawnSync('git', ['-C', directory, ...args], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw new Error(`Git project identity is unavailable: ${result.error.message}`);
  if (result.status !== 0) {
    const diagnostic = `${result.stderr}\n${result.stdout}`;
    if (allowNonRepository && /not a git repository|outside repository/iu.test(diagnostic)) return null;
    throw new Error(`Git project identity is unavailable: ${diagnostic.trim().slice(0, 300)}`);
  }
  return result.stdout;
}

function readMarker(markerPath: string): string {
  const marker = lstatSync(markerPath);
  if (marker.isSymbolicLink() || !marker.isFile() || marker.size > 64) {
    throw new Error('Git project identity marker is unsafe');
  }
  const content = readFileSync(markerPath, 'utf8');
  if (!UUID_PATTERN.test(content)) throw new Error('Git project identity marker is malformed');
  return content.slice(0, -1);
}

function publishMarker(commonDirectory: string, options: ProjectIdentityResolverOptions): string {
  const markerPath = join(commonDirectory, PROJECT_ID_MARKER);
  if (existsSync(markerPath)) return readMarker(markerPath);

  const candidate = randomUUID();
  const temporaryPath = join(commonDirectory, `${PROJECT_ID_MARKER}.${process.pid}.${randomUUID()}.tmp`);
  let descriptor: number | null = null;
  try {
    descriptor = openSync(temporaryPath, 'wx', 0o600);
    writeFileSync(descriptor, `${candidate}\n`, { encoding: 'utf8' });
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    try {
      (options.link ?? linkSync)(temporaryPath, markerPath);
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') {
        throw new Error(`Git project identity marker cannot be published atomically: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return readMarker(markerPath);
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    rmSync(temporaryPath, { force: true });
  }
}

function worktreePaths(directory: string): string[] {
  const output = runGit(directory, ['worktree', 'list', '--porcelain', '-z']);
  if (output === null) return [];
  const paths = output
    .split('\0')
    .filter((field) => field.startsWith('worktree '))
    .map((field) => normalizePath(field.slice('worktree '.length)));
  return [...new Set(paths)];
}

export function resolveLocalProjectIdentity(directory: string, options: ProjectIdentityResolverOptions = {}): ProjectIdentityInput {
  if (!existsSync(resolve(directory))) {
    const normalized = normalizePath(directory);
    return { key: `path:${normalized}`, name: basename(normalized), aliases: [], rootHint: resolve(directory) };
  }
  const root = realpathSync(resolve(directory));
  if (!statSync(root).isDirectory()) throw new Error('Project workspace must be a directory');
  const insideWorktree = runGit(root, ['rev-parse', '--is-inside-work-tree'], true);
  if (insideWorktree === null || insideWorktree.trim() !== 'true') {
    return { key: `path:${normalizePath(root)}`, name: basename(root), aliases: [], rootHint: root };
  }

  const commonOutput = runGit(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (commonOutput === null) throw new Error('Git common directory is unavailable');
  const commonDirectory = realpathSync(resolve(root, commonOutput.trim()));
  if (!statSync(commonDirectory).isDirectory()) throw new Error('Git common directory is invalid');
  const markerPath = join(commonDirectory, PROJECT_ID_MARKER);
  if (dirname(markerPath) !== commonDirectory) throw new Error('Git project identity marker escaped its boundary');

  const uuid = publishMarker(commonDirectory, options);
  const orderedWorktrees = worktreePaths(root);
  const currentPath = normalizePath(root);
  const paths = orderedWorktrees.includes(currentPath) ? orderedWorktrees : [currentPath, ...orderedWorktrees];
  const mainWorktree = paths[0] ?? currentPath;
  return {
    key: `git:${uuid}`,
    name: basename(mainWorktree),
    aliases: paths.map((path) => `path:${path}`),
    rootHint: root,
  };
}
