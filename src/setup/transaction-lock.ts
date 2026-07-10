import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rm,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import type { SetupHarness, SetupScope } from './types.js';

export type SetupTargetLockResult =
  | { ok: true; release: () => Promise<void> }
  | { ok: false; reason: 'busy' | 'unavailable' };

interface LockRecord {
  pid: number;
  nonce: string;
}

export async function acquireSetupTargetLock(
  dataDir: string,
  harness: SetupHarness,
  scope: SetupScope,
  target: string,
): Promise<SetupTargetLockResult> {
  let canonicalTarget: string;
  try {
    canonicalTarget = await canonicalizeSetupTarget(target);
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  const lockDirectory = join(dataDir, 'setup', 'locks');
  const lockName = createHash('sha256')
    .update(JSON.stringify({ harness, scope, target: canonicalTarget }))
    .digest('hex');
  const lockPath = join(lockDirectory, `${lockName}.lock`);
  const nonce = randomUUID();

  try {
    await mkdir(lockDirectory, { recursive: true });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(lockPath, 'wx', 0o600);
      try {
        await handle.writeFile(`${JSON.stringify({ pid: process.pid, nonce })}\n`, 'utf8');
        await handle.chmod(0o600);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await syncDirectoryBestEffort(lockDirectory);
      return {
        ok: true,
        release: async () => {
          try {
            const current = parseLockRecord(await readFile(lockPath, 'utf8'));
            if (current?.nonce === nonce) {
              await rm(lockPath, { force: true });
              await syncDirectoryBestEffort(lockDirectory);
            }
          } catch {
            // A missing or replaced lock is not owned by this operation.
          }
        },
      };
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        return { ok: false, reason: 'unavailable' };
      }
      if (attempt === 0 && await removeStaleLock(lockPath)) {
        continue;
      }
      return { ok: false, reason: 'busy' };
    }
  }
  return { ok: false, reason: 'busy' };
}

export async function canonicalizeSetupTarget(target: string): Promise<string> {
  return resolveFromNearestExistingAncestor(target);
}

async function removeStaleLock(lockPath: string): Promise<boolean> {
  try {
    const details = await lstat(lockPath);
    if (!details.isFile() || details.isSymbolicLink() || details.size > 1024) {
      return false;
    }
    const record = parseLockRecord(await readFile(lockPath, 'utf8'));
    if (!record || isProcessAlive(record.pid)) {
      return false;
    }
    await rm(lockPath, { force: true });
    await syncDirectoryBestEffort(dirname(lockPath));
    return true;
  } catch {
    return false;
  }
}

function parseLockRecord(text: string): LockRecord | null {
  try {
    const parsed = JSON.parse(text) as Partial<LockRecord>;
    return Number.isSafeInteger(parsed.pid)
      && (parsed.pid ?? 0) > 0
      && typeof parsed.nonce === 'string'
      && parsed.nonce.length > 0
      ? { pid: parsed.pid!, nonce: parsed.nonce }
      : null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = error instanceof Error && 'code' in error
      ? (error as NodeJS.ErrnoException).code
      : undefined;
    return code !== 'ESRCH';
  }
}

async function resolveFromNearestExistingAncestor(path: string): Promise<string> {
  let current = resolve(path);
  const missingSegments: string[] = [];
  while (true) {
    try {
      return resolve(await realpath(current), ...missingSegments.reverse());
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

function isAlreadyExistsError(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && (error as NodeJS.ErrnoException).code === 'EEXIST';
}
