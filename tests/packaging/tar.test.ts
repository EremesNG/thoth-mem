import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { expect, it } from 'vitest';

import { packTarball } from '../../scripts/npm-pack.mjs';

const installedTar = process.platform === 'win32'
  ? spawnSync('where.exe', ['tar'], { encoding: 'utf8', windowsHide: true }).stdout?.trim().split(/\r?\n/u).filter(Boolean) ?? []
  : [];
const commands = installedTar.length ? [...new Set(installedTar)] : ['tar'];

it.each(commands)('creates a readable dependency archive with spaces and absolute paths using %s', (command) => {
  const root = mkdtempSync(join(tmpdir(), 'thoth tar regression '));
  try {
    const stage = join(root, 'staged dependency');
    mkdirSync(join(stage, 'package'), { recursive: true });
    writeFileSync(join(stage, 'package', 'payload.txt'), 'exact dependency bytes\n');
    const tarball = join(root, 'dependency archive.tgz');

    packTarball(stage, tarball, command);

    const extracted = spawnSync(command, ['-xOzf', basename(tarball), 'package/payload.txt'], { cwd: root, encoding: 'utf8', windowsHide: true });
    expect(extracted.status, extracted.stderr).toBe(0);
    expect(extracted.stdout).toBe('exact dependency bytes\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
