import { execFile, execFileSync } from 'node:child_process';
import { existsSync, linkSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { PROJECT_ID_MARKER, resolveLocalProjectIdentity } from '../../src/integration/project-identity.js';

const execFileAsync = promisify(execFile);

function git(directory: string, ...args: string[]): string {
  return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
}

function repository(root: string, name: string): string {
  const directory = join(root, name);
  mkdirSync(directory);
  git(directory, 'init', '--quiet');
  git(directory, 'config', 'user.email', 'tests@thoth-mem.local');
  git(directory, 'config', 'user.name', 'thoth-mem tests');
  writeFileSync(join(directory, 'tracked.txt'), 'fixture\n');
  git(directory, 'add', 'tracked.txt');
  git(directory, 'commit', '--quiet', '-m', 'fixture');
  return directory;
}

async function resolveInChild(directory: string): Promise<{ key: string }> {
  const moduleUrl = pathToFileURL(join(process.cwd(), 'src', 'integration', 'project-identity.ts')).href;
  const script = `const { resolveLocalProjectIdentity } = await import(${JSON.stringify(moduleUrl)}); process.stdout.write(JSON.stringify(resolveLocalProjectIdentity(${JSON.stringify(directory)})));`;
  const { stdout } = await execFileAsync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true,
  });
  return JSON.parse(stdout) as { key: string };
}

describe('local project identity', () => {
  it('publishes exactly one complete marker during concurrent first use', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-project-race-'));
    try {
      const directory = repository(root, 'repository');
      const identities = await Promise.all(Array.from({ length: 8 }, () => resolveInChild(directory)));
      expect(new Set(identities.map((identity) => identity.key))).toHaveLength(1);

      const commonDirectory = git(directory, 'rev-parse', '--path-format=absolute', '--git-common-dir');
      const marker = readFileSync(join(commonDirectory, PROJECT_ID_MARKER), 'utf8');
      expect(marker).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\n$/u);
      expect(identities[0]?.key).toBe(`git:${marker.slice(0, -1)}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('ignores crash-left temporary candidates and leaves them untouched', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-project-crash-left-'));
    try {
      const directory = repository(root, 'repository');
      const commonDirectory = git(directory, 'rev-parse', '--path-format=absolute', '--git-common-dir');
      const staleCandidate = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const staleTemporary = join(commonDirectory, `${PROJECT_ID_MARKER}.crashed.tmp`);
      writeFileSync(staleTemporary, `${staleCandidate}\n`);

      const identity = resolveLocalProjectIdentity(directory);
      expect(identity.key).not.toBe(`git:${staleCandidate}`);
      expect(readFileSync(staleTemporary, 'utf8')).toBe(`${staleCandidate}\n`);
      expect(readFileSync(join(commonDirectory, PROJECT_ID_MARKER), 'utf8')).toBe(`${identity.key.slice(4)}\n`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rereads the complete winner when publication loses an EEXIST race', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-project-loser-'));
    try {
      const directory = repository(root, 'repository');
      const commonDirectory = git(directory, 'rev-parse', '--path-format=absolute', '--git-common-dir');
      const winnerUuid = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      const winnerCandidate = join(commonDirectory, 'winner-candidate');
      writeFileSync(winnerCandidate, `${winnerUuid}\n`);

      const identity = resolveLocalProjectIdentity(directory, {
        link: (temporaryPath, markerPath) => {
          linkSync(winnerCandidate, markerPath);
          linkSync(temporaryPath, markerPath);
        },
      });

      expect(identity.key).toBe(`git:${winnerUuid}`);
      expect(readFileSync(join(commonDirectory, PROJECT_ID_MARKER), 'utf8')).toBe(`${winnerUuid}\n`);
      expect(readdirSync(commonDirectory).filter((name) => name.startsWith(`${PROJECT_ID_MARKER}.`) && name.endsWith('.tmp'))).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('publishes one Git identity shared by worktrees and preserved by a repository move', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-project-id-'));
    try {
      const main = repository(root, 'main repo');
      const worktree = join(root, 'linked worktree');
      git(main, 'worktree', 'add', '--quiet', '-b', 'linked-test', worktree);

      const first = resolveLocalProjectIdentity(main);
      const linked = resolveLocalProjectIdentity(worktree);
      expect(first.key).toMatch(/^git:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
      expect(linked).toMatchObject({ key: first.key, name: basename(main), aliases: first.aliases });
      expect(first.aliases).toEqual(expect.arrayContaining([
        `path:${main.replaceAll('\\', '/')}`,
        `path:${worktree.replaceAll('\\', '/')}`,
      ]));

      const commonDirectory = git(main, 'rev-parse', '--path-format=absolute', '--git-common-dir');
      const marker = join(commonDirectory, PROJECT_ID_MARKER);
      expect(readFileSync(marker, 'utf8')).toBe(`${first.key.slice(4)}\n`);
      expect(existsSync(`${marker}.tmp`)).toBe(false);

      const moved = join(root, 'renamed main');
      renameSync(main, moved);
      expect(resolveLocalProjectIdentity(moved).key).toBe(first.key);

      const destination = join(root, 'different parent');
      mkdirSync(destination);
      const relocated = join(destination, 'relocated repository');
      renameSync(moved, relocated);
      expect(resolveLocalProjectIdentity(relocated).key).toBe(first.key);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps independent clones local and fails closed for malformed marker state', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-project-clones-'));
    try {
      const source = repository(root, 'source');
      const clone = join(root, 'clone');
      execFileSync('git', ['clone', '--quiet', source, clone]);
      const sourceIdentity = resolveLocalProjectIdentity(source);
      const cloneIdentity = resolveLocalProjectIdentity(clone);
      expect(cloneIdentity.key).not.toBe(sourceIdentity.key);

      const commonDirectory = git(source, 'rev-parse', '--path-format=absolute', '--git-common-dir');
      writeFileSync(join(commonDirectory, PROJECT_ID_MARKER), 'not-a-uuid\n');
      expect(() => resolveLocalProjectIdentity(source)).toThrow(/project identity marker/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed when atomic marker publication is unavailable', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-project-unavailable-'));
    try {
      const directory = repository(root, 'repository');
      const unavailableLink = (): never => {
        throw Object.assign(new Error('publication unavailable'), { code: 'EPERM' });
      };

      expect(() => resolveLocalProjectIdentity(directory, { link: unavailableLink })).toThrow(/cannot be published atomically/i);
      const commonDirectory = git(directory, 'rev-parse', '--path-format=absolute', '--git-common-dir');
      expect(existsSync(join(commonDirectory, PROJECT_ID_MARKER))).toBe(false);
      expect(readdirSync(commonDirectory).filter((name) => name.startsWith(`${PROJECT_ID_MARKER}.`) && name.endsWith('.tmp'))).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a marker reached through a symbolic link', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-project-symlink-'));
    try {
      const directory = repository(root, 'repository');
      const commonDirectory = git(directory, 'rev-parse', '--path-format=absolute', '--git-common-dir');
      const target = join(commonDirectory, 'identity-target');
      writeFileSync(target, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb\n');
      symlinkSync(target, join(commonDirectory, PROJECT_ID_MARKER), 'file');

      expect(() => resolveLocalProjectIdentity(directory)).toThrow(/marker is unsafe/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses an exact normalized path only for a verified non-Git workspace', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-non-git-'));
    try {
      expect(resolveLocalProjectIdentity(root)).toEqual({
        key: `path:${root.replaceAll('\\', '/')}`,
        name: basename(root),
        aliases: [],
        rootHint: root,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
