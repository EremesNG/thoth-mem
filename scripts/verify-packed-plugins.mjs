import { chmodSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

import { parse as parseJsonc } from 'jsonc-parser';

const repository = resolve(import.meta.dirname, '..');
const scratch = mkdtempSync(join(tmpdir(), 'thoth-packed-native-'));
const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`);
  return result;
}

function json(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isolatedEnvironment(name) {
  const root = join(scratch, 'homes', name);
  return {
    root,
    env: {
      ...process.env,
      OPENCODE_CONFIG_DIR: join(root, 'opencode'),
      XDG_CONFIG_HOME: join(root, 'config'),
      THOTH_MEM_DATA_DIR: '',
    },
  };
}

try {
  assert(existsSync(npmCli), `npm CLI was not found beside Node at ${npmCli}.`);
  const packed = run(process.execPath, [npmCli, 'pack', '--json', '--ignore-scripts', '--pack-destination', scratch], { cwd: repository });
  const tarball = join(scratch, JSON.parse(packed.stdout)[0].filename);
  run(process.execPath, [npmCli, 'install', '--no-audit', '--no-fund', tarball], { cwd: scratch });
  const packageRoot = join(scratch, 'node_modules', 'thoth-mem');
  const cli = join(packageRoot, 'dist', 'index.js');
  const nativeMain = join(packageRoot, 'dist', 'opencode.js');
  const manifest = json(join(packageRoot, 'package.json'));
  assert(manifest.main === 'dist/opencode.js', 'Packed package main is not the native OpenCode entry.');
  assert(manifest.bin?.['thoth-mem'] === 'dist/index.js', 'Packed package bin is not the standalone CLI/MCP entry.');
  const nativeSource = readFileSync(nativeMain, 'utf8');
  assert(!nativeSource.includes('better-sqlite3') && !nativeSource.includes('class MemoryService'), 'Packed Bun entry contains the Node-native persistence graph.');

  const help = run(process.execPath, [cli, '--help'], { cwd: tmpdir() });
  assert(help.stdout.includes('setup <opencode|codex|claude>') && !help.stdout.includes(`setup-v${2}`), 'Packed CLI exposes the wrong setup contract.');

  const publicHome = isolatedEnvironment('opencode-public');
  const publicData = join(publicHome.root, 'shared data');
  const publicSetup = jsonOutput(run(process.execPath, [cli, 'setup', 'opencode', '--json', '--data-dir', publicData], { cwd: tmpdir(), env: publicHome.env }));
  assert(publicSetup.status === 'complete' && publicSetup.plugin === `thoth-mem@${manifest.version}`, 'Packed public OpenCode setup did not converge exact npm provenance.');
  const publicConfigBefore = readFileSync(publicSetup.configPath, 'utf8');
  const publicReceiptBefore = readFileSync(publicSetup.receiptPath, 'utf8');
  const publicRepeat = jsonOutput(run(process.execPath, [cli, 'setup', 'opencode', '--json', '--data-dir', publicData], { cwd: tmpdir(), env: publicHome.env }));
  assert(publicRepeat.changed === false, 'Repeated packed public OpenCode setup was not a no-op.');
  assert(readFileSync(publicSetup.configPath, 'utf8') === publicConfigBefore && readFileSync(publicSetup.receiptPath, 'utf8') === publicReceiptBefore, 'Repeated packed public setup changed bytes.');

  const localHome = isolatedEnvironment('opencode-local');
  const localData = join(localHome.root, 'shared data');
  const localSetup = jsonOutput(run(process.execPath, [cli, 'setup', 'opencode', '--json', '--local-package-root', packageRoot, '--data-dir', localData], { cwd: tmpdir(), env: localHome.env }));
  assert(localSetup.status === 'complete' && localSetup.plugin === pathToFileURL(nativeMain).href, 'Packed local OpenCode setup did not converge canonical file provenance.');
  const localConfig = jsoncPlugins(readFileSync(localSetup.configPath, 'utf8'));
  assert(localConfig.length === 1 && localConfig[0] === localSetup.plugin, 'Packed local OpenCode configuration contains duplicate activation.');
  assert(existsSync(join(localHome.env.OPENCODE_CONFIG_DIR, 'skills', 'thoth-mem', 'SKILL.md')), 'Packed OpenCode Skill was not synchronized.');

  const nativeSmokePath = join(scratch, 'native-open-code-smoke.mjs');
  writeFileSync(nativeSmokePath, `
const pluginModule = await import(${JSON.stringify(pathToFileURL(nativeMain).href)});
if (typeof pluginModule.default !== 'function') throw new Error('missing default Plugin export');
if (Object.keys(pluginModule).join(',') !== 'default') throw new Error('native entry exports non-plugin runtime values');
const hooks = await pluginModule.default({ directory: ${JSON.stringify(join(scratch, 'project with spaces'))} });
if (Object.keys(hooks.tool ?? {}).join(',') !== 'thoth_mem_root_identity') throw new Error('missing native OpenCode identity tool');
const resolvedConfig = { skills: { paths: ['user-path'] }, mcp: { user: { type: 'remote', url: 'https://example.test' } } };
await hooks.config(resolvedConfig);
if (JSON.stringify(resolvedConfig.skills.paths) !== '["user-path"]') throw new Error('changed user skill paths');
if (resolvedConfig.mcp['thoth-mem'].command[0] !== 'node' || resolvedConfig.mcp['thoth-mem'].command[1] !== ${JSON.stringify(cli)}) throw new Error('wrong package-relative MCP entry');
await hooks.event({ event: { type: 'session.created', properties: { info: { id: 'packed-root', directory: ${JSON.stringify(join(scratch, 'project with spaces'))} } } } });
await hooks['experimental.session.compacting']({ sessionID: 'packed-root' }, { context: ['Packed lifecycle checkpoint.'], prompt: undefined });
await hooks.event({ event: { type: 'session.compacted', properties: { sessionID: 'packed-root' } } });
const transformed = { system: ['stable-prefix'] };
await hooks['experimental.chat.system.transform']({ sessionID: 'packed-root' }, transformed);
if (transformed.system[0] !== 'stable-prefix') throw new Error('changed stable system prefix');
const recovery = transformed.system.at(-1) ?? '';
if (!recovery.includes('root_session_id=packed-root')) throw new Error('missing verified OpenCode identity');
if (recovery.includes('Packed lifecycle checkpoint.') || recovery.includes('(memory:')) throw new Error('checkpoint-only OpenCode capture was promoted into recovery memory');
process.stdout.write('native-open-code-ok');
`);
  const nativeSmoke = run(process.env.BUN_BINARY ?? 'bun', [nativeSmokePath], { cwd: tmpdir(), env: { ...process.env, THOTH_MEM_DATA_DIR: join(scratch, 'native hook data') } });
  assert(nativeSmoke.stdout === 'native-open-code-ok', 'Packed native OpenCode hook smoke failed.');

  const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'thoth-packed-smoke', version: '1.0.0' } } };
  const initialized = { jsonrpc: '2.0', method: 'notifications/initialized' };
  const listTools = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} };
  const mcp = run(process.execPath, [cli, 'mcp', '--no-http'], { cwd: tmpdir(), env: localHome.env, input: `${JSON.stringify(initialize)}\n${JSON.stringify(initialized)}\n${JSON.stringify(listTools)}\n` });
  const messages = mcp.stdout.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
  const toolResult = messages.find((message) => message.id === 2);
  assert(toolResult?.result?.tools?.length === 6, `Packed MCP exposed ${toolResult?.result?.tools?.length ?? 0} tools instead of six.`);
  assert(existsSync(join(localData, 'memory.sqlite')), 'Packed MCP did not use the persisted provider data directory.');

  const publicPluginRoot = join(packageRoot, 'plugin');
  for (const path of [
    '.codex-plugin/plugin.json',
    '.claude-plugin/plugin.json',
    '.mcp.json',
    'hooks/hooks.json',
    'hooks/claude-hooks.json',
    'skills/thoth-mem/SKILL.md',
    'runners/public-runner.mjs',
  ]) assert(existsSync(join(publicPluginRoot, path)), `Packed native manager bundle is missing ${path}.`);
  assert(json(join(packageRoot, '.agents', 'plugins', 'marketplace.json')).name === 'thoth-mem', 'Packed Codex marketplace is invalid.');
  assert(json(join(packageRoot, '.claude-plugin', 'marketplace.json')).name === 'thoth-mem', 'Packed Claude marketplace is invalid.');

  const installedPlugin = join(scratch, 'installed plugin with spaces');
  cpSync(publicPluginRoot, installedPlugin, { recursive: true });
  const localProvider = json(localSetup.providerConfigPath);
  writeFileSync(localSetup.providerConfigPath, `${JSON.stringify({ ...localProvider, runtimeEntry: cli }, null, 2)}\n`);
  const managerMcp = run(process.execPath, [join(installedPlugin, 'runners', 'public-runner.mjs'), '--mcp'], {
    cwd: tmpdir(),
    input: `${JSON.stringify(initialize)}\n${JSON.stringify(initialized)}\n${JSON.stringify(listTools)}\n`,
    env: localHome.env,
  });
  const managerMessages = managerMcp.stdout.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
  const managerTools = managerMessages.find((message) => message.id === 2)?.result?.tools;
  assert(managerTools?.length === 6, `Packed manager runner exposed ${managerTools?.length ?? 0} tools instead of six.`);
  const npxShim = createNpxShim(scratch, cli);
  const managerData = join(scratch, 'manager data');
  for (const harness of ['codex', 'claude']) {
    const runner = run(process.execPath, [join(installedPlugin, 'runners', 'public-runner.mjs'), '--harness', harness], {
      cwd: tmpdir(),
      input: JSON.stringify({ hook_event_name: 'SessionStart', session_id: `${harness}-root`, event_id: `packed-${harness}-start`, cwd: join(scratch, 'project with spaces'), source: 'startup' }),
      env: { ...process.env, THOTH_MEM_PUBLIC_NPX_COMMAND: npxShim, THOTH_MEM_DATA_DIR: managerData },
    });
    const hostOutput = JSON.parse(runner.stdout);
    assert(hostOutput.hookSpecificOutput?.additionalContext?.startsWith(`<!-- thoth-mem:recovery:start -->\nthoth-mem verified identity: root_session_id=${harness}-root; project=project with spaces`), `Packed ${harness} runner omitted verified identity.`);
    if (harness === 'claude') {
      const support = jsonOutput(run(process.execPath, [cli, 'lifecycle', '--harness', 'claude', '--data-dir', managerData], {
        cwd: tmpdir(),
        input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 'claude-root', event_id: 'packed-claude-support', cwd: join(scratch, 'project with spaces'), prompt: 'Keep packed Claude compact recovery.' }),
      }));
      assert(support.data?.evidenceId && support.data?.event?.sequence === 1, 'Packed Claude support evidence was not ordered.');
      run(process.execPath, [join(installedPlugin, 'runners', 'public-runner.mjs'), '--harness', harness], {
        cwd: tmpdir(),
        input: JSON.stringify({
          hook_event_name: 'PreCompact', session_id: 'claude-root', event_id: 'packed-claude-pre-compact', cwd: join(scratch, 'project with spaces'),
          content: 'Non-empty packed Claude checkpoint content.',
          thoth_mem_summary: {
            kind: 'checkpoint',
            coverage: { fromSequence: 1, toSequence: 1 },
            generator: { kind: 'harness', name: 'packed-smoke' },
            claims: [
              { kind: 'objective', content: 'Keep packed Claude compact recovery.', supportIds: [support.data.evidenceId] },
              { kind: 'next_action', content: 'Continue from the packed supported summary.', supportIds: [support.data.evidenceId] },
            ],
          },
        }),
        env: { ...process.env, THOTH_MEM_PUBLIC_NPX_COMMAND: npxShim, THOTH_MEM_DATA_DIR: managerData },
      });
      const compactRunner = run(process.execPath, [join(installedPlugin, 'runners', 'public-runner.mjs'), '--harness', harness], {
        cwd: tmpdir(),
        input: JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'claude-root', event_id: 'packed-claude-compact-start', cwd: join(scratch, 'project with spaces'), source: 'compact' }),
        env: { ...process.env, THOTH_MEM_PUBLIC_NPX_COMMAND: npxShim, THOTH_MEM_DATA_DIR: managerData },
      });
      const compactOutput = JSON.parse(compactRunner.stdout).hookSpecificOutput?.additionalContext;
      assert(compactOutput?.startsWith('<!-- thoth-mem:recovery:start -->\nthoth-mem verified identity: root_session_id=claude-root; project=project with spaces\n\n'), 'Packed Claude compact recovery omitted verified identity.');
      assert(compactOutput.includes('Keep packed Claude compact recovery.'), 'Packed Claude compact recovery omitted the pre-compaction checkpoint.');
      assert(compactOutput.includes('(summary:') && !compactOutput.includes('(memory:'), 'Packed Claude compact recovery did not isolate the supported summary.');
    }
  }

  process.stdout.write('Packed smoke passed for opencode, codex, claude-code.\n');
  process.stdout.write('Activated lifecycle fixtures for opencode, codex, claude-code.\n');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

function jsonOutput(result) {
  return JSON.parse(result.stdout);
}

function jsoncPlugins(text) {
  return parseJsonc(text).plugin ?? [];
}

function createNpxShim(root, cli) {
  const runtime = join(root, 'packed-npx-runtime.mjs');
  writeFileSync(runtime, `
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
const lifecycle = args.indexOf('lifecycle');
const child = spawnSync(process.execPath, [${JSON.stringify(cli)}, ...args.slice(lifecycle)], { stdio: 'inherit', env: process.env, windowsHide: true });
process.exit(child.status ?? 1);
`);
  if (process.platform === 'win32') {
    const command = join(root, 'packed npx.cmd');
    writeFileSync(command, `@echo off\r\n"${process.execPath}" "${runtime}" %*\r\n`);
    return command;
  }
  const command = join(root, 'packed npx');
  writeFileSync(command, `#!/bin/sh\n"${process.execPath}" "${runtime}" "$@"\n`);
  chmodSync(command, 0o755);
  return command;
}
