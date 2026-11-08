import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { piInstallationSnapshot } from '../../scripts/pi-installation-snapshot.mjs';

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'thoth-pi-installation-'));
  roots.push(root);
  return root;
}
function put(root: string, path: string, content = 'initial') {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('real Pi installation non-mutation snapshot', () => {
  it.each([
    'settings.json', 'settings.jsonc', 'package.json', 'package-lock.json',
    'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'yarn.lock', '.npmrc',
    'npm/node_modules/thoth-mem/package.json', 'node_modules/thoth-mem/package.json',
    'packages/memory/package.json', 'git/memory/package.json',
    'extensions/memory.ts', 'skills/memory/SKILL.md', 'prompts/memory.md', 'themes/memory.json',
    'config/thoth-mem/config.json', 'config/thoth-mem/receipts/pi.json', '.thoth-mem/receipt.json',
  ])('detects installation-owned creation, modification and removal: %s', (path) => {
    const root = fixture();
    const before = piInstallationSnapshot(root);
    put(root, path);
    const installed = piInstallationSnapshot(root);
    expect(installed.digest).not.toBe(before.digest);
    expect(installed.files[path]).toBeTruthy();
    put(root, path, 'modified');
    expect(piInstallationSnapshot(root).digest).not.toBe(installed.digest);
    rmSync(join(root, path));
    expect(piInstallationSnapshot(root).digest).not.toBe(installed.digest);
  });

  it('ignores concurrent agent runtime state, including new runtime directories', () => {
    const root = fixture();
    put(root, 'settings.json');
    const before = piInstallationSnapshot(root);
    for (const path of ['sessions/root/session.jsonl', 'state/workspace-history/repo.git/index', 'config/pi-multi-codex/usage.json', 'config/provider/runtime.json']) {
      put(root, path);
      expect(piInstallationSnapshot(root)).toEqual(before);
      put(root, path, 'runtime update');
      expect(piInstallationSnapshot(root)).toEqual(before);
    }
  });

  it('detects empty installation directories without treating an absent runtime home as an install', () => {
    const root = fixture();
    const before = piInstallationSnapshot(root);
    expect(piInstallationSnapshot(join(root, 'absent'))).toEqual(before);
    mkdirSync(join(root, 'extensions'));
    expect(piInstallationSnapshot(root).digest).not.toBe(before.digest);
  });
});
