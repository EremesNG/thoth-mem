import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { parse } from 'jsonc-parser';
import { afterEach, describe, expect, test } from 'vitest';

import { setupOpenCode } from '../../src/setup/opencode.js';

const temporaryRoots: string[] = [];
const packageVersion = (JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
) as { version: string }).version;

function temporaryRoot(name: string): string {
  const root = join(tmpdir(), `thoth-mem-${name}-${process.pid}-${temporaryRoots.length}`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  temporaryRoots.push(root);
  return root;
}

function fixture(root: string) {
  const homeDir = join(root, 'home');
  const configDir = join(root, 'opencode config');
  const dataDir = join(root, 'shared data');
  const packageRoot = resolve(process.cwd());
  return {
    homeDir,
    configDir,
    dataDir,
    packageRoot,
    env: { OPENCODE_CONFIG_DIR: configDir } as NodeJS.ProcessEnv,
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('native OpenCode setup', () => {
  test('plans exact public provenance without writing any state', () => {
    const state = fixture(temporaryRoot('plan'));
    const result = setupOpenCode({ ...state, mode: 'public', planOnly: true });

    expect(result.changed).toBe(false);
    expect(result.status).toBe('planned');
    expect(result.plugin).toBe(`thoth-mem@${packageVersion}`);
    expect(result.actions).toEqual([
      expect.stringContaining('plugin'),
      expect.stringContaining('Skill'),
      expect.stringContaining('provider'),
      expect.stringContaining('restart'),
    ]);
    expect(existsSync(state.configDir)).toBe(false);
    expect(existsSync(join(state.homeDir, '.config', 'thoth-mem', 'config.json'))).toBe(false);
  });

  test('converges public JSONC, provider data, and the one owned global Skill idempotently', () => {
    const state = fixture(temporaryRoot('public'));
    mkdirSync(state.configDir, { recursive: true });
    const configPath = join(state.configDir, 'opencode.jsonc');
    writeFileSync(configPath, '{\n  // keep this user comment\n  "plugin": ["other-plugin@7", "thoth-mem@0.1.0", "thoth-mem@9.9.9",],\n  "mcp": { "user-server": { "type": "remote", "url": "https://example.test" } },\n  "skills": { "paths": ["C:/user/skills"] },\n}\n');

    const first = setupOpenCode({ ...state, mode: 'public' });
    expect(first.status).toBe('complete');
    expect(first.changed).toBe(true);
    const configAfterFirst = readFileSync(configPath, 'utf8');
    const parsed = parse(configAfterFirst) as Record<string, unknown>;
    expect(parsed.plugin).toEqual(['other-plugin@7', `thoth-mem@${packageVersion}`]);
    expect(parsed.mcp).toEqual({ 'user-server': { type: 'remote', url: 'https://example.test' } });
    expect(parsed.skills).toEqual({ paths: ['C:/user/skills'] });
    expect(configAfterFirst).toContain('// keep this user comment');
    expect(existsSync(join(state.configDir, 'skills', 'thoth-mem', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(state.configDir, '.thoth-mem'))).toBe(true);
    expect(existsSync(join(state.configDir, 'plugins', 'thoth-mem.js'))).toBe(false);

    const providerPath = join(state.homeDir, '.config', 'thoth-mem', 'config.json');
    expect(JSON.parse(readFileSync(providerPath, 'utf8'))).toMatchObject({ version: 2, dataDir: resolve(state.dataDir) });
    const receiptBefore = readFileSync(first.receiptPath!, 'utf8');
    const skillBefore = readFileSync(join(state.configDir, 'skills', 'thoth-mem', 'SKILL.md'), 'utf8');

    const second = setupOpenCode({ ...state, mode: 'public' });
    expect(second).toMatchObject({ status: 'complete', changed: false });
    expect(readFileSync(configPath, 'utf8')).toBe(configAfterFirst);
    expect(readFileSync(first.receiptPath!, 'utf8')).toBe(receiptBefore);
    expect(readFileSync(join(state.configDir, 'skills', 'thoth-mem', 'SKILL.md'), 'utf8')).toBe(skillBefore);
  });

  test('repairs duplicate provenance to one canonical local file URL without host MCP or skill path mutation', () => {
    const state = fixture(temporaryRoot('local'));
    const configPath = join(state.configDir, 'opencode.json');
    mkdirSync(state.configDir, { recursive: true });
    writeFileSync(configPath, `${JSON.stringify({ plugin: ['thoth-mem@0.4.13', 'file:///old/thoth-mem/dist/opencode.js', 'similar-thoth-mem@1'], mcp: { keep: true }, skills: { paths: ['keep'] } }, null, 2)}\n`);

    const result = setupOpenCode({ ...state, mode: 'local' });
    const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    expect(result.plugin).toBe(pathToFileURL(join(state.packageRoot, 'dist', 'opencode.js')).href);
    expect(parsed.plugin).toEqual(['similar-thoth-mem@1', result.plugin]);
    expect(parsed.mcp).toEqual({ keep: true });
    expect(parsed.skills).toEqual({ paths: ['keep'] });
  });

  test('rejects malformed JSONC before any owned mutation', () => {
    const state = fixture(temporaryRoot('malformed'));
    mkdirSync(state.configDir, { recursive: true });
    const configPath = join(state.configDir, 'opencode.jsonc');
    writeFileSync(configPath, '{ "plugin": [ }');

    expect(() => setupOpenCode({ ...state, mode: 'public' })).toThrow(/OpenCode configuration is invalid/u);
    expect(readFileSync(configPath, 'utf8')).toBe('{ "plugin": [ }');
    expect(existsSync(join(state.configDir, 'skills', 'thoth-mem'))).toBe(false);
    expect(existsSync(join(state.configDir, '.thoth-mem'))).toBe(false);
  });

  test('restores only owned plugin, Skill, and provider state after a handled failure', () => {
    const state = fixture(temporaryRoot('rollback'));
    mkdirSync(join(state.configDir, 'skills', 'thoth-mem'), { recursive: true });
    mkdirSync(join(state.configDir, 'skills', 'user-skill'), { recursive: true });
    writeFileSync(join(state.configDir, 'skills', 'thoth-mem', 'SKILL.md'), 'prior owned skill\n');
    writeFileSync(join(state.configDir, 'skills', 'user-skill', 'SKILL.md'), 'user skill\n');
    const configPath = join(state.configDir, 'opencode.jsonc');
    writeFileSync(configPath, '{\n  // preserved\n  "plugin": ["other", "thoth-mem@0.3.0"],\n  "theme": "user"\n}\n');
    const providerPath = join(state.homeDir, '.config', 'thoth-mem', 'config.json');
    mkdirSync(join(state.homeDir, '.config', 'thoth-mem'), { recursive: true });
    writeFileSync(providerPath, '{\n  "version": 2,\n  "recall": { "compactChars": 500 }\n}\n');

    expect(() => setupOpenCode({ ...state, mode: 'public', failAfter: 'skill' })).toThrow(/Injected setup failure/u);
    expect(parse(readFileSync(configPath, 'utf8'))).toMatchObject({ plugin: ['other', 'thoth-mem@0.3.0'], theme: 'user' });
    expect(readFileSync(configPath, 'utf8')).toContain('// preserved');
    expect(readFileSync(join(state.configDir, 'skills', 'thoth-mem', 'SKILL.md'), 'utf8')).toBe('prior owned skill\n');
    expect(readFileSync(join(state.configDir, 'skills', 'user-skill', 'SKILL.md'), 'utf8')).toBe('user skill\n');
    expect(JSON.parse(readFileSync(providerPath, 'utf8'))).toEqual({ version: 2, recall: { compactChars: 500 } });
    expect(existsSync(join(state.configDir, '.thoth-mem', 'opencode.in-progress.json'))).toBe(false);
  });

  test('reconciles an interrupted config update before retrying from the owned baseline', () => {
    const state = fixture(temporaryRoot('interrupted'));
    mkdirSync(state.configDir, { recursive: true });
    const configPath = join(state.configDir, 'opencode.jsonc');
    writeFileSync(configPath, '{\n  // keep\n  "plugin": ["other", "thoth-mem@0.3.0"]\n}\n');

    expect(() => setupOpenCode({ ...state, mode: 'local', interruptAfter: 'config' })).toThrow(/Simulated OpenCode setup interruption/u);
    expect(existsSync(join(state.configDir, '.thoth-mem', 'opencode.in-progress.json'))).toBe(true);
    const resumed = setupOpenCode({ ...state, mode: 'local' });
    expect(resumed).toMatchObject({ status: 'complete', changed: true, recovered: true });
    expect(parse(readFileSync(configPath, 'utf8')).plugin).toEqual(['other', pathToFileURL(join(state.packageRoot, 'dist', 'opencode.js')).href]);
  });

  test('replaces only a linked or extra-file owned Skill tree without touching its target or sibling Skills', () => {
    const state = fixture(temporaryRoot('linked-skill'));
    const external = join(state.homeDir, 'external-skill');
    const destination = join(state.configDir, 'skills', 'thoth-mem');
    const sibling = join(state.configDir, 'skills', 'user-skill');
    mkdirSync(external, { recursive: true });
    mkdirSync(sibling, { recursive: true });
    writeFileSync(join(external, 'sentinel.txt'), 'external\n');
    writeFileSync(join(sibling, 'SKILL.md'), 'sibling\n');
    symlinkSync(external, destination, 'junction');

    const result = setupOpenCode({ ...state, mode: 'local' });
    expect(result.status).toBe('complete');
    expect(lstatSync(destination).isSymbolicLink()).toBe(false);
    expect(existsSync(join(destination, 'SKILL.md'))).toBe(true);
    expect(readFileSync(join(external, 'sentinel.txt'), 'utf8')).toBe('external\n');
    expect(readFileSync(join(sibling, 'SKILL.md'), 'utf8')).toBe('sibling\n');

    writeFileSync(join(destination, 'extra.txt'), 'drift\n');
    const repaired = setupOpenCode({ ...state, mode: 'local' });
    expect(repaired.changed).toBe(true);
    expect(existsSync(join(destination, 'extra.txt'))).toBe(false);
    expect(readFileSync(join(sibling, 'SKILL.md'), 'utf8')).toBe('sibling\n');
  });
});
