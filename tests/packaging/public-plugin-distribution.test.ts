import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repository = process.cwd();
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const codexValidator = join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'skills', '.system', 'plugin-creator', 'scripts', 'validate_plugin.py');

describe('public plugin distribution', () => {
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

    const review = readFileSync(join(repository, 'plugin', 'skills', 'thoth-mem', 'references', 'observation-review.md'), 'utf8');
    for (const harness of ['opencode', 'codex', 'claude-code']) {
      expect(readFileSync(join(repository, 'integrations', harness, 'skills', 'thoth-mem', 'references', 'observation-review.md'), 'utf8')).toBe(review);
    }
  });

  it.runIf(existsSync(codexValidator))('passes the installed Codex plugin ingestion validator', () => {
    const result = spawnSync('python', [codexValidator, join(repository, 'plugin')], {
      cwd: repository,
      encoding: 'utf8',
      windowsHide: true,
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });

  it('leaves marketplace ownership to the central catalog repository', () => {
    expect(existsSync(join(repository, '.agents', 'plugins', 'marketplace.json'))).toBe(false);
    expect(existsSync(join(repository, '.claude-plugin', 'marketplace.json'))).toBe(false);
  });

  it('exposes one contained Codex plugin with current hooks, MCP, and Skill paths', () => {
    const pluginRoot = resolve(repository, 'plugin');
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
    expect(join('cache', 'thoth-plugins', manifest.name, manifest.version, manifest.skills, manifest.name, 'SKILL.md').replaceAll('\\', '/')).toBe(
      'cache/thoth-plugins/thoth-mem/0.4.13/skills/thoth-mem/SKILL.md',
    );
    expect(existsSync(resolve(pluginRoot, manifest.skills, manifest.name, 'SKILL.md'))).toBe(true);
    for (const component of ['./hooks/hooks.json', manifest.mcpServers, manifest.skills]) {
      expect(existsSync(resolve(pluginRoot, component)), component).toBe(true);
    }

    const hooks = readJson<{ hooks: Record<string, Array<{ hooks: Array<{ type: string; command: string; timeout: number }> }>> }>(resolve(pluginRoot, './hooks/hooks.json'));
    expect(Object.keys(hooks.hooks)).toEqual(['SessionStart', 'UserPromptSubmit', 'PreCompact', 'PostCompact', 'SessionEnd']);
    expect(hooks.hooks.SessionEnd?.flatMap((group) => group.hooks).map((hook) => hook.timeout)).toEqual([3]);
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

  it('exposes the same contained plugin through a strict Claude plugin contract', () => {
    const pluginRoot = resolve(repository, 'plugin');
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
    expect(join('cache', 'thoth-plugins', manifest.name, manifest.version, manifest.skills, manifest.name, 'SKILL.md').replaceAll('\\', '/')).toBe(
      'cache/thoth-plugins/thoth-mem/0.4.13/skills/thoth-mem/SKILL.md',
    );
    expect(existsSync(resolve(pluginRoot, manifest.skills, manifest.name, 'SKILL.md'))).toBe(true);
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
