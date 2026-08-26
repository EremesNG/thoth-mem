import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repository = process.cwd();
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const codexValidator = join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'skills', '.system', 'plugin-creator', 'scripts', 'validate_plugin.py');
const codexCommand = process.platform === 'win32' ? 'codex.exe' : 'codex';
const codexAvailable = spawnSync(codexCommand, ['--version'], { encoding: 'utf8', windowsHide: true }).status === 0;

describe('public plugin marketplace distribution', () => {
  it('keeps one Skill body across all hosts while preserving host-specific identity references', () => {
    const canonical = readFileSync(join(repository, 'plugin', 'skills', 'thoth-mem', 'SKILL.md'), 'utf8');
    for (const harness of ['opencode', 'codex', 'claude-code']) {
      expect(readFileSync(join(repository, 'integrations', harness, 'skills', 'thoth-mem', 'SKILL.md'), 'utf8')).toBe(canonical);
    }

    const references = {
      opencode: join(repository, 'integrations', 'opencode', 'skills', 'thoth-mem', 'references', 'opencode.md'),
      codex: join(repository, 'integrations', 'codex', 'skills', 'thoth-mem', 'references', 'codex.md'),
      claude: join(repository, 'integrations', 'claude-code', 'skills', 'thoth-mem', 'references', 'claude-code.md'),
    };
    for (const path of Object.values(references)) expect(existsSync(path), path).toBe(true);
    expect(existsSync(join(repository, 'plugin', 'skills', 'thoth-mem', 'references', 'opencode.md'))).toBe(false);
    expect(readFileSync(join(repository, 'plugin', 'skills', 'thoth-mem', 'references', 'codex.md'), 'utf8')).toBe(readFileSync(references.codex, 'utf8'));
    expect(readFileSync(join(repository, 'plugin', 'skills', 'thoth-mem', 'references', 'claude-code.md'), 'utf8')).toBe(readFileSync(references.claude, 'utf8'));
  });

  it.runIf(existsSync(codexValidator))('passes the installed Codex plugin ingestion validator', () => {
    const result = spawnSync('python', [codexValidator, join(repository, 'plugin')], {
      cwd: repository,
      encoding: 'utf8',
      windowsHide: true,
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });

  it.runIf(codexAvailable)('installs the repository marketplace through an isolated Codex manager', () => {
    const codexHome = mkdtempSync(join(tmpdir(), 'thoth-codex-marketplace-'));
    const options = {
      cwd: repository,
      encoding: 'utf8' as const,
      env: { ...process.env, CODEX_HOME: codexHome },
      windowsHide: true,
    };
    try {
      const marketplace = spawnSync(codexCommand, ['plugin', 'marketplace', 'add', repository, '--json'], options);
      expect(marketplace.status, `${marketplace.stdout}\n${marketplace.stderr}`).toBe(0);
      const installation = spawnSync(codexCommand, ['plugin', 'add', 'thoth-mem@thoth-mem', '--json'], options);
      expect(installation.status, `${installation.stdout}\n${installation.stderr}`).toBe(0);
      const installedPath = (JSON.parse(installation.stdout) as { installedPath: string }).installedPath;
      expect(resolve(installedPath).startsWith(resolve(codexHome))).toBe(true);
      expect(readJson(join(installedPath, '.codex-plugin', 'plugin.json'))).toEqual(readJson(join(repository, 'plugin', '.codex-plugin', 'plugin.json')));
      if (existsSync(codexValidator)) {
        const validation = spawnSync('python', [codexValidator, installedPath], options);
        expect(validation.status, `${validation.stdout}\n${validation.stderr}`).toBe(0);
      }
    } finally {
      rmSync(codexHome, { recursive: true, force: true });
    }
  }, 30_000);

  it('exposes one contained Codex plugin with current hooks, MCP, and Skill paths', () => {
    const marketplace = readJson<{
      name: string;
      plugins: Array<{ name: string; source: { source: string; path: string } }>;
    }>(join(repository, '.agents', 'plugins', 'marketplace.json'));

    expect(marketplace.name).toBe('thoth-mem');
    expect(marketplace.plugins).toHaveLength(1);
    expect(marketplace.plugins[0]).toMatchObject({
      name: 'thoth-mem',
      source: { source: 'local', path: './plugin' },
    });

    const pluginRoot = resolve(repository, marketplace.plugins[0]!.source.path);
    expect(pluginRoot.startsWith(`${repository}\\`) || pluginRoot.startsWith(`${repository}/`)).toBe(true);
    const manifest = readJson<{
      name: string;
      version: string;
      mcpServers: string;
      skills: string;
      interface: { displayName: string; category: string };
    }>(join(pluginRoot, '.codex-plugin', 'plugin.json'));
    expect(manifest).toMatchObject({
      name: 'thoth-mem',
      version: '0.4.13',
      mcpServers: './.mcp.json',
      skills: './skills/',
      interface: { displayName: 'thoth-mem Persistent Memory', category: 'Productivity' },
    });
    expect(manifest).not.toHaveProperty('hooks');
    expect(manifest).not.toHaveProperty('displayName');
    expect(manifest).not.toHaveProperty('category');
    for (const component of ['./hooks/hooks.json', manifest.mcpServers, manifest.skills]) {
      expect(existsSync(resolve(pluginRoot, component)), component).toBe(true);
    }

    const hooks = readJson<{ hooks: Record<string, Array<{ hooks: Array<{ type: string; command: string }> }>> }>(resolve(pluginRoot, './hooks/hooks.json'));
    expect(Object.keys(hooks.hooks)).toEqual(['SessionStart', 'UserPromptSubmit', 'PreCompact', 'PostCompact', 'SessionEnd']);
    for (const groups of Object.values(hooks.hooks)) for (const group of groups) for (const hook of group.hooks) {
      expect(hook.type).toBe('command');
      expect(hook.command).toContain('${PLUGIN_ROOT}/runners/public-runner.mjs');
    }

    const mcp = readJson<{ mcpServers: Record<string, { cwd: string; command: string; args: string[] }> }>(resolve(pluginRoot, manifest.mcpServers));
    expect(Object.keys(mcp.mcpServers)).toEqual(['thoth-mem']);
    expect(mcp.mcpServers['thoth-mem']).toEqual({
      cwd: '.',
      command: 'node',
      args: ['./runners/public-runner.mjs', '--mcp'],
    });
  });

  it('exposes the same contained plugin through a strict Claude marketplace contract', () => {
    const marketplace = readJson<{
      name: string;
      plugins: Array<{ name: string; version: string; source: string }>;
    }>(join(repository, '.claude-plugin', 'marketplace.json'));
    expect(marketplace.name).toBe('thoth-mem');
    expect(marketplace.plugins).toEqual([
      expect.objectContaining({ name: 'thoth-mem', version: '0.4.13', source: './plugin' }),
    ]);

    const pluginRoot = resolve(repository, marketplace.plugins[0]!.source);
    const manifest = readJson<{
      name: string;
      version: string;
      hooks: string;
      mcpServers: string;
      skills: string;
    }>(join(pluginRoot, '.claude-plugin', 'plugin.json'));
    expect(manifest).toMatchObject({
      name: 'thoth-mem',
      version: '0.4.13',
      hooks: './hooks/claude-hooks.json',
      mcpServers: './.mcp.json',
      skills: './skills/',
    });
    for (const component of [manifest.hooks, manifest.mcpServers, manifest.skills]) {
      expect(existsSync(resolve(pluginRoot, component)), component).toBe(true);
    }

    const hooks = readJson<{ hooks: Record<string, Array<{ hooks: Array<{ type: string; command: string }> }>> }>(resolve(pluginRoot, manifest.hooks));
    expect(Object.keys(hooks.hooks)).toEqual(['SessionStart', 'UserPromptSubmit', 'PreCompact', 'SessionEnd']);
    for (const groups of Object.values(hooks.hooks)) for (const group of groups) for (const hook of group.hooks) {
      expect(hook.type).toBe('command');
      expect(hook.command).toContain('${CLAUDE_PLUGIN_ROOT}/runners/public-runner.mjs');
    }

    const mcp = readJson<{ mcpServers: Record<string, { cwd: string; command: string; args: string[] }> }>(resolve(pluginRoot, manifest.mcpServers));
    expect(mcp.mcpServers['thoth-mem']).toEqual({
      cwd: '.',
      command: 'node',
      args: ['./runners/public-runner.mjs', '--mcp'],
    });
  });
});
