import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { installPlugin } from '../../src/setup/install.js';
import { CANONICAL_PLUGIN_INVENTORY } from '../../src/integration/package-inventory.js';
import { MemoryService } from '../../src/memory-core/service.js';

describe('managed v2 plugin setup', () => {
  it('installs complete receipt-owned bundles without changing unrelated files', () => {
    for (const harness of ['opencode', 'codex', 'claude-code'] as const) {
      const root = mkdtempSync(join(tmpdir(), `thoth-setup-${harness}-`)); writeFileSync(join(root, 'user-skill.md'), 'owned by user');
      try {
        const receipt = installPlugin({ harness, targetRoot: root, packageRoot: process.cwd() });
        for (const asset of receipt.assets) expect(existsSync(join(root, 'thoth-mem', asset))).toBe(true);
        expect(readFileSync(join(root, 'user-skill.md'), 'utf8')).toBe('owned by user');
        expect(installPlugin({ harness, targetRoot: root, packageRoot: process.cwd() }).installedAt).toBe(receipt.installedAt);
      } finally { rmSync(root, { recursive: true, force: true }); }
    }
  });

  it('confines scope, detects owned drift, coexists across harness targets, and force-replaces only owned assets', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-setup-matrix-')); const openRoot = join(root, 'opencode'); const codexRoot = join(root, 'codex'); writeFileSync(join(root, 'outside.txt'), 'outside');
    try {
      installPlugin({ harness: 'opencode', targetRoot: openRoot, packageRoot: process.cwd() }); installPlugin({ harness: 'codex', targetRoot: codexRoot, packageRoot: process.cwd() });
      const drifted = join(openRoot, 'thoth-mem', 'mcp.json'); writeFileSync(drifted, 'drift');
      expect(() => installPlugin({ harness: 'opencode', targetRoot: openRoot, packageRoot: process.cwd() })).toThrow(/drift/i);
      installPlugin({ harness: 'opencode', targetRoot: openRoot, packageRoot: process.cwd(), force: true });
      expect(readFileSync(drifted, 'utf8')).toContain('mcpServers'); expect(existsSync(join(codexRoot, 'thoth-mem', 'mcp.json'))).toBe(true); expect(readFileSync(join(root, 'outside.txt'), 'utf8')).toBe('outside');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('restores the prior managed bundle when forced activation fails', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-setup-rollback-v2-'));
    try {
      const first = installPlugin({ harness: 'codex', targetRoot: root, packageRoot: process.cwd() }); const manifest = join(root, 'thoth-mem', 'manifest.json'); const before = readFileSync(manifest, 'utf8');
      expect(() => installPlugin({ harness: 'codex', targetRoot: root, packageRoot: process.cwd(), force: true, beforeActivate: () => { throw new Error('simulated activation failure'); } })).toThrow(/simulated/);
      expect(readFileSync(manifest, 'utf8')).toBe(before); expect(JSON.parse(readFileSync(join(root, 'thoth-mem', '.thoth-mem-managed-v2.json'), 'utf8')).installedAt).toBe(first.installedAt);
      expect(existsSync(join(root, '.thoth-mem-staging-'))).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('runs the copied Codex bundle through its managed package runtime path', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-setup-installed-runner-'));
    try {
      const receipt = installPlugin({ harness: 'codex', targetRoot: root, packageRoot: process.cwd() });
      expect(receipt.runtimeEntry).toBe(join(process.cwd(), 'dist', 'index.js'));
      const event = { hook_event_name: 'SessionStart', session_id: 'root', transcript_path: null, cwd: process.cwd(), source: 'startup' };
      const result = spawnSync(process.execPath, [join(root, 'thoth-mem', 'runner.mjs')], { input: JSON.stringify(event), encoding: 'utf8', env: { ...process.env, THOTH_MEM_DATA_DIR: join(root, 'data') }, windowsHide: true });
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({});
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('routes Codex hook storage through the host-specific override or PLUGIN_DATA', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-codex-plugin-data-'));
    try {
      installPlugin({ harness: 'codex', targetRoot: root, packageRoot: process.cwd() });
      const pluginRoot = join(root, 'thoth-mem'); const runtime = join(root, 'assert-runtime.mjs');
      writeFileSync(runtime, `
if (process.env.THOTH_MEM_DATA_DIR !== process.env.EXPECTED_DATA_DIR) {
  process.stderr.write('Codex data directory was not routed to the runtime.');
  process.exit(1);
}
process.stdout.write(JSON.stringify({ schema: 'thoth-mem.lifecycle.v2', data: { outcome: 'confirmed', capability: {} } }));
`);
      const receiptPath = join(pluginRoot, '.thoth-mem-managed-v2.json'); const receipt = JSON.parse(readFileSync(receiptPath, 'utf8')) as Record<string, unknown>;
      writeFileSync(receiptPath, JSON.stringify({ ...receipt, runtimeEntry: runtime }));
      const event = { hook_event_name: 'SessionStart', session_id: 'root', transcript_path: null, cwd: process.cwd(), source: 'startup' };
      const run = (environment: NodeJS.ProcessEnv) => spawnSync(process.execPath, [join(pluginRoot, 'runner.mjs')], { input: JSON.stringify(event), encoding: 'utf8', env: environment, windowsHide: true });
      const base = { ...process.env }; delete base.THOTH_MEM_DATA_DIR;
      const override = join(root, 'codex override'); const overridden = run({ ...base, PLUGIN_DATA: join(root, 'plugin data'), THOTH_MEM_CODEX_DATA_DIR: override, EXPECTED_DATA_DIR: override });
      expect(overridden.status, overridden.stderr).toBe(0);
      const pluginData = join(root, 'plugin data'); const fallback = { ...base, PLUGIN_DATA: pluginData, EXPECTED_DATA_DIR: pluginData }; delete fallback.THOTH_MEM_CODEX_DATA_DIR;
      const hostDefault = run(fallback);
      expect(hostDefault.status, hostDefault.stderr).toBe(0);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('installs a current Codex plugin contract and emits only host-shaped hook output', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth codex plugin contract '));
    try {
      const receipt = installPlugin({ harness: 'codex', targetRoot: root, packageRoot: process.cwd() });
      const pluginRoot = join(root, 'thoth-mem'); const data = join(root, 'data'); mkdirSync(data, { recursive: true });
      expect(receipt.assets).toEqual(CANONICAL_PLUGIN_INVENTORY.codex);
      expect(Object.keys(receipt.hashes)).toEqual(receipt.assets);
      const cwd = process.cwd(); const normalized = cwd.replaceAll('\\', '/').replace(/\/$/, '');
      const service = new MemoryService({ databasePath: join(data, 'memory-v2.sqlite') });
      service.save({ project: { key: `path:${normalized}`, name: normalized.split('/').at(-1) ?? normalized }, evidence: { kind: 'explicit_save', content: 'Canary recovery evidence.' }, memory: { kind: 'decision', title: 'Canary recovery decision', content: 'Use the unique canary startup decision.' } });
      service.close();

      const run = (payload: Record<string, unknown>) => spawnSync(process.execPath, [join(pluginRoot, 'runner.mjs')], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, THOTH_MEM_DATA_DIR: data }, windowsHide: true });
      const common = { session_id: 'root', transcript_path: null, cwd };
      const startup = run({ ...common, hook_event_name: 'SessionStart', source: 'startup' });
      expect(startup.status, startup.stderr).toBe(0);
      expect(JSON.parse(startup.stdout)).toMatchObject({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: expect.stringContaining('unique canary startup decision') } });
      expect(startup.stdout).not.toContain('thoth-mem.lifecycle.v2');
      const prompt = run({ ...common, hook_event_name: 'UserPromptSubmit', turn_id: 'turn-1', prompt: 'Remember this.' });
      expect(prompt.status, prompt.stderr).toBe(0);
      expect(JSON.parse(prompt.stdout)).toEqual({});
      const sessionEnd = run({ ...common, hook_event_name: 'SessionEnd', reason: 'other' });
      expect(sessionEnd.status, sessionEnd.stderr).toBe(0);
      expect(JSON.parse(sessionEnd.stdout)).toEqual({});

      const manifest = JSON.parse(readFileSync(join(pluginRoot, '.codex-plugin', 'plugin.json'), 'utf8')) as { version: string; hooks: string; mcpServers: string; skills: string };
      expect(manifest).toMatchObject({ version: '0.4.13', hooks: './hooks/hooks.json', mcpServers: './mcp.json', skills: './skills/' });
      for (const reference of [manifest.hooks, manifest.mcpServers, manifest.skills]) expect(existsSync(join(pluginRoot, reference))).toBe(true);
      const hookManifest = JSON.parse(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8')) as { hooks: Record<string, Array<{ hooks: Array<{ type: string; command: string; timeout: number }> }>> };
      expect(Object.keys(hookManifest.hooks)).toEqual(['SessionStart', 'UserPromptSubmit', 'PreCompact', 'PostCompact', 'SessionEnd']);
      for (const groups of Object.values(hookManifest.hooks)) for (const group of groups) for (const handler of group.hooks) {
        expect(handler).toMatchObject({ type: 'command' });
        expect(handler.command).toContain('${PLUGIN_ROOT}/runner.mjs');
      }
      expect(hookManifest.hooks.SessionEnd[0].hooks[0].timeout).toBeLessThanOrEqual(3);
      const mcp = JSON.parse(readFileSync(join(pluginRoot, 'mcp.json'), 'utf8')) as Record<string, unknown> & { thoth_mem?: { command: string; args: string[]; cwd: string }; mcp_servers?: unknown; mcpServers?: unknown };
      expect(mcp.mcpServers).toBeUndefined();
      expect(mcp.mcp_servers).toBeUndefined();
      expect(Object.keys(mcp)).toEqual(['thoth_mem']);
      expect(mcp.thoth_mem).toEqual({ command: 'node', args: ['runner.mjs', '--mcp'], cwd: '.' });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
