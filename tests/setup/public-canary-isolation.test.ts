import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { setupOpenCode } from '../../src/setup/opencode.js';

describe('central catalog and local native setup isolation', () => {
  it('does not recreate package marketplaces while converging a local OpenCode home', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-native-isolation-'));
    const catalogs = ['.agents/plugins/marketplace.json', '.claude-plugin/marketplace.json'];
    expect(catalogs.every((path) => !existsSync(path))).toBe(true);
    try {
      const configDir = join(root, 'opencode');
      const sentinel = join(root, 'sibling-sentinel.txt');
      writeFileSync(sentinel, 'must remain unchanged\n');
      const result = setupOpenCode({
        mode: 'local',
        packageRoot: process.cwd(),
        homeDir: join(root, 'home'),
        env: { OPENCODE_CONFIG_DIR: configDir },
        dataDir: join(root, 'shared data'),
      });

      expect(result.status).toBe('complete');
      expect(result.plugin).toMatch(/^file:\/\//u);
      expect(catalogs.every((path) => !existsSync(path))).toBe(true);
      expect(readFileSync(sentinel, 'utf8')).toBe('must remain unchanged\n');
      expect(existsSync(join(configDir, '.thoth-mem'))).toBe(true);
      expect(existsSync(join(configDir, 'plugins', 'thoth-mem.js'))).toBe(false);
      expect(existsSync(join(configDir, 'thoth-mem'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
