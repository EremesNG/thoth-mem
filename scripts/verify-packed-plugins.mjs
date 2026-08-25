import { chmodSync, cpSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

import Database from 'better-sqlite3';

import { MemoryService } from '../dist/index.js';

const repository = resolve(import.meta.dirname, '..'); const scratch = mkdtempSync(join(tmpdir(), 'thoth-packed-v2-'));
try {
  const npmCommand = 'npm'; const windowsShell = process.platform === 'win32';
  const packed = spawnSync(npmCommand, ['pack', '--json', '--ignore-scripts', '--pack-destination', scratch], { cwd: repository, encoding: 'utf8', shell: windowsShell, windowsHide: true });
  if (packed.status !== 0) throw new Error(packed.error?.message || packed.stderr || packed.stdout);
  const tarball = join(scratch, JSON.parse(packed.stdout)[0].filename);
  const install = spawnSync(npmCommand, ['install', '--no-audit', '--no-fund', tarball], { cwd: scratch, encoding: 'utf8', shell: windowsShell, windowsHide: true }); if (install.status !== 0) throw new Error(install.error?.message || install.stderr || install.stdout);
  const packageRoot = join(scratch, 'node_modules', 'thoth-mem'); const inventory = JSON.parse(readFileSync(join(packageRoot, 'integrations', 'inventory.json'), 'utf8'));
  const cold = spawnSync(process.execPath, [join(packageRoot, 'dist', 'index.js'), '--help'], { encoding: 'utf8', env: { ...process.env, THOTH_MEM_DATA_DIR: join(scratch, 'data') }, windowsHide: true });
  if (cold.status !== 0 || !cold.stdout.includes('import-v2')) throw new Error(`Packed cold start failed: ${cold.stderr}`);
  const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'thoth-packed-smoke', version: '1.0.0' } } };
  const mcpData = join(scratch, 'data', 'mcp');
  const mcp = spawnSync(process.execPath, [join(packageRoot, 'dist', 'index.js'), 'mcp', '--no-http', '--data-dir', mcpData], { input: `${JSON.stringify(initialize)}\n`, encoding: 'utf8', windowsHide: true });
  if (mcp.status !== 0 || !mcp.stdout.includes('"serverInfo"')) throw new Error(`Packed MCP handshake with explicit data directory failed: ${mcp.stderr || mcp.stdout}`);
  const nativePayload = (harness, operation, eventKey, root = 'fixture-root') => {
    if (harness === 'opencode') {
      const events = { enroll: 'session.created', recover: 'session.resumed', prompt: 'chat.message', pre: 'experimental.session.compacting', post: 'experimental.session.compacted', finalize: 'session.deleted', unsupported: 'unknown.event' }; const event = events[operation];
      return { event, eventId: eventKey, project: { key: `fixture:${harness}`, name: harness, directory: `C:/fixture/${harness}` }, properties: { info: { id: root, directory: `C:/fixture/${harness}` }, ...(operation === 'prompt' ? { message: { role: 'user', sessionID: root, content: 'Verified root prompt.' } } : {}), ...(operation === 'pre' ? { summary: 'Resume from the verified checkpoint.' } : {}) } };
    }
    if (harness === 'codex') {
      const events = { enroll: 'SessionStart', recover: 'SessionStart', clear: 'SessionStart', compact: 'SessionStart', prompt: 'UserPromptSubmit', pre: 'PreCompact', post: 'PostCompact', finalize: 'SessionEnd', unsupported: 'Unknown' }; const hookEvent = events[operation];
      const sources = { enroll: 'startup', recover: 'resume', clear: 'clear', compact: 'compact' };
      const payload = { hook_event_name: hookEvent, session_id: root, cwd: 'C:/fixture/codex', ...(sources[operation] ? { source: sources[operation] } : {}), ...(['prompt', 'pre', 'post'].includes(operation) ? { turn_id: eventKey } : {}), ...(operation === 'prompt' ? { prompt: 'Verified root prompt.' } : {}), ...(operation === 'pre' ? { trigger: 'manual' } : {}), ...(operation === 'finalize' ? { reason: 'other' } : {}) };
      if ('event_id' in payload || payload.hook_event_name === 'Stop') throw new Error('Packed Codex fixture is not an official host payload');
      return payload;
    }
    const events = { enroll: 'SessionStart', recover: 'SessionStart', prompt: 'UserPromptSubmit', pre: 'PreCompact', post: 'PostCompact', finalize: 'SessionEnd', unsupported: 'Unknown' };
    return { hook_event_name: events[operation], session_id: root, cwd: `C:/fixture/${harness}`, event_id: eventKey, ...(operation === 'recover' ? { source: 'resume' } : {}), ...(operation === 'prompt' ? { prompt: 'Verified root prompt.' } : {}), ...(operation === 'pre' ? { summary: 'Resume from the verified checkpoint.' } : {}) };
  };
  for (const [harness, assets] of Object.entries(inventory.harnesses)) {
    const home = join(scratch, 'homes', harness); const setup = spawnSync(process.execPath, [join(packageRoot, 'dist', 'index.js'), 'setup-v2', '--harness', harness, '--target', home], { encoding: 'utf8', windowsHide: true });
    if (setup.status !== 0) throw new Error(`Packed ${harness} managed setup failed: ${setup.stderr}`);
    for (const asset of assets) if (!existsSync(join(home, 'thoth-mem', asset))) throw new Error(`Packed ${harness} asset missing: ${asset}`);
    if (harness === 'codex') {
      const mcp = JSON.parse(readFileSync(join(home, 'thoth-mem', 'mcp.json'), 'utf8'));
      if ('mcpServers' in mcp || 'mcp_servers' in mcp) throw new Error('Packed Codex MCP configuration used a wrapped server map');
      if (Object.keys(mcp).join(',') !== 'thoth_mem') throw new Error('Packed Codex MCP configuration did not contain the exact direct server map');
      const server = mcp.thoth_mem;
      if (server?.command !== 'node' || JSON.stringify(server.args) !== JSON.stringify(['runner.mjs', '--mcp']) || server.cwd !== '.') throw new Error('Packed Codex MCP configuration was not loader-compatible');
    }
    const runner = join(home, 'thoth-mem', 'runner.mjs'); const data = join(scratch, 'data', harness);
    const run = (operation, eventKey, root) => { const execution = spawnSync(process.execPath, [runner], { input: `${JSON.stringify(nativePayload(harness, operation, eventKey, root))}\n`, encoding: 'utf8', env: { ...process.env, THOTH_MEM_DATA_DIR: data }, windowsHide: true }); if (execution.status !== 0) throw new Error(`Packed ${harness} ${operation} failed: ${execution.stderr}`); return JSON.parse(execution.stdout); };
    if (harness === 'codex') {
      const early = run('post', 'early-turn', 'early-root'); if (Object.keys(early).length !== 0) throw new Error('Packed Codex early hook leaked internal output');
      const enroll = run('enroll', 'startup'); const prompt = run('prompt', 'turn-prompt'); const retry = run('prompt', 'turn-prompt'); const pre = run('pre', 'turn-compact'); const post = run('post', 'turn-compact');
      const service = new MemoryService({ databasePath: join(data, 'memory-v2.sqlite') });
      try { service.save({ project: { key: 'path:C:/fixture/codex', name: 'codex' }, eventKey: 'packed:codex:recovery', evidence: { kind: 'explicit_save', content: 'Resume from the verified checkpoint.' }, memory: { kind: 'handoff', title: 'Packed recovery decision', content: 'Resume from the verified checkpoint.', topicKey: 'packed/codex/recovery' } }); } finally { service.close(); }
      const recover = run('recover', 'resume'); const clear = run('clear', 'clear'); const compact = run('compact', 'compact'); const finalize = run('finalize', 'other');
      if ([enroll, prompt, retry, pre, post, finalize].some((result) => Object.keys(result).length !== 0)) throw new Error('Packed Codex hook output was not host-native');
      for (const contextResult of [recover, clear, compact]) { const context = contextResult.hookSpecificOutput; if (context?.hookEventName !== 'SessionStart' || !context.additionalContext?.includes('Resume from the verified checkpoint.')) throw new Error('Packed Codex recovery did not inject bounded SessionStart context'); }
      const database = new Database(join(data, 'memory-v2.sqlite'), { readonly: true, fileMustExist: true });
      try {
        const rootReceipts = database.prepare('SELECT operation,outcome,count(*) AS count FROM lifecycle_receipts WHERE harness=? AND root_session_key=? GROUP BY operation,outcome ORDER BY operation').all('codex', 'fixture-root');
        if (rootReceipts.some((receipt) => receipt.outcome !== 'confirmed') || rootReceipts.reduce((sum, receipt) => sum + Number(receipt.count), 0) !== 8) throw new Error('Packed Codex lifecycle receipts were not confirmed and idempotent');
        const earlyReceipt = database.prepare('SELECT outcome FROM lifecycle_receipts WHERE harness=? AND root_session_key=?').get('codex', 'early-root');
        if (earlyReceipt?.outcome !== 'degraded') throw new Error('Packed Codex degraded receipt was not persisted truthfully');
      } finally { database.close(); }
      const unsupported = spawnSync(process.execPath, [runner], { input: JSON.stringify(nativePayload(harness, 'unsupported', 'unsupported')), encoding: 'utf8', env: { ...process.env, THOTH_MEM_DATA_DIR: data }, windowsHide: true });
      if (unsupported.status === 0 || unsupported.stderr.length > 600 || !/unsupported/i.test(unsupported.stderr)) throw new Error('Packed Codex unsupported path was not bounded');
      continue;
    }
    const early = run('post', `${harness}:early`, 'early-root'); if (early.data?.outcome !== 'degraded' || early.data?.capability?.contextDelivered !== false) throw new Error(`Packed ${harness} degraded capability was untruthful`);
    const enroll = run('enroll', `${harness}:enroll`); const prompt = run('prompt', `${harness}:prompt`); const retry = run('prompt', `${harness}:prompt`); const pre = run('pre', `${harness}:pre`); const post = run('post', `${harness}:post`); const recover = run('recover', `${harness}:recover`); const finalize = run('finalize', `${harness}:finalize`);
    if ([enroll,prompt,pre,post,recover,finalize].some((result) => result.schema !== 'thoth-mem.lifecycle.v2' || result.data?.outcome !== 'confirmed')) throw new Error(`Packed ${harness} lifecycle was not confirmed`);
    if (retry.data?.duplicate !== true) throw new Error(`Packed ${harness} retry was not idempotent`);
    if (!post.data?.recovery?.sources?.includes(pre.data?.evidenceId) || recover.data?.recovery?.items?.length < 1) throw new Error(`Packed ${harness} recovery did not deliver checkpoint evidence`);
    if (post.data?.capability?.contextDelivered !== true || post.data?.capability?.modelConsumed !== false) throw new Error(`Packed ${harness} capability truth was invalid`);
    const unsupported = spawnSync(process.execPath, [runner], { input: JSON.stringify(nativePayload(harness, 'unsupported', `${harness}:unsupported`)), encoding: 'utf8', env: { ...process.env, THOTH_MEM_DATA_DIR: data }, windowsHide: true });
    if (unsupported.status === 0 || unsupported.stderr.length > 600 || !/unsupported/i.test(unsupported.stderr)) throw new Error(`Packed ${harness} unsupported path was not bounded`);
  }
  const codexMarketplace = JSON.parse(readFileSync(join(packageRoot, '.agents', 'plugins', 'marketplace.json'), 'utf8'));
  const claudeMarketplace = JSON.parse(readFileSync(join(packageRoot, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const codexPublicRoot = resolve(packageRoot, codexMarketplace.plugins?.[0]?.source?.path ?? 'missing');
  const claudePublicRoot = resolve(packageRoot, claudeMarketplace.plugins?.[0]?.source ?? 'missing');
  if (codexPublicRoot !== claudePublicRoot || codexPublicRoot !== join(packageRoot, 'plugin')) throw new Error('Packed marketplaces did not resolve one shared public plugin root');
  const publicPluginRoot = codexPublicRoot;
  for (const path of ['.codex-plugin/plugin.json', '.claude-plugin/plugin.json', 'runners/public-runner.mjs', 'runtime.json']) {
    if (!existsSync(join(publicPluginRoot, path))) throw new Error(`Packed public plugin asset missing: ${path}`);
  }
  const isWithin = (parent, child) => {
    const path = relative(parent, child);
    return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
  };
  const publicInstallRoots = {};
  for (const harness of ['codex', 'claude-code']) {
    const installedRoot = join(scratch, 'public-homes', harness, 'plugin-cache', `thoth-mem@${JSON.parse(readFileSync(join(publicPluginRoot, 'runtime.json'), 'utf8')).version}`);
    cpSync(publicPluginRoot, installedRoot, { recursive: true });
    if (isWithin(packageRoot, installedRoot) || !isWithin(join(scratch, 'public-homes', harness), installedRoot)) throw new Error(`Packed public ${harness} install cache escaped its isolated home`);
    publicInstallRoots[harness] = installedRoot;
  }
  renameSync(publicPluginRoot, join(packageRoot, 'plugin-unavailable-during-installed-smoke'));
  const publicNpxRuntime = join(scratch, 'public-npx-runtime.mjs');
  writeFileSync(publicNpxRuntime, `
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
if (args[0] !== '--yes' || !/^thoth-mem@\\d+\\.\\d+\\.\\d+$/.test(args[1] ?? '')) process.exit(64);
const child = spawnSync(process.execPath, [process.env.THOTH_MEM_PACKED_RUNTIME, ...args.slice(2)], { stdio: 'inherit', env: process.env, windowsHide: true });
process.exit(child.status ?? 1);
`);
  let publicNpxCommand;
  if (process.platform === 'win32') {
    publicNpxCommand = join(scratch, 'public npx.cmd');
    writeFileSync(publicNpxCommand, `@echo off\r\n"${process.execPath}" "${publicNpxRuntime}" %*\r\n`);
  } else {
    publicNpxCommand = join(scratch, 'public npx');
    writeFileSync(publicNpxCommand, `#!/bin/sh\n"${process.execPath}" "${publicNpxRuntime}" "$@"\n`);
    chmodSync(publicNpxCommand, 0o755);
  }
  const publicEnvironment = {
    ...process.env,
    THOTH_MEM_PUBLIC_NPX_COMMAND: publicNpxCommand,
    THOTH_MEM_PACKED_RUNTIME: join(packageRoot, 'dist', 'index.js'),
    THOTH_MEM_DATA_DIR: join(scratch, 'data', 'public'),
  };
  for (const harness of ['codex', 'claude-code']) {
    const installedRoot = publicInstallRoots[harness];
    const runnerHarness = harness === 'codex' ? 'codex' : 'claude';
    const lifecycle = spawnSync(process.execPath, [join(installedRoot, 'runners', 'public-runner.mjs'), '--harness', runnerHarness], {
      cwd: scratch,
      input: JSON.stringify(nativePayload(harness, 'enroll', `public:${harness}:enroll`, `public-${harness}-root`)),
      encoding: 'utf8',
      env: publicEnvironment,
      windowsHide: true,
    });
    if (lifecycle.status !== 0 || typeof JSON.parse(lifecycle.stdout) !== 'object') throw new Error(`Packed public ${harness} lifecycle failed: ${lifecycle.stderr || lifecycle.stdout}`);
    const descriptor = JSON.parse(readFileSync(join(installedRoot, '.mcp.json'), 'utf8')).mcpServers['thoth-mem'];
    const handshake = spawnSync(process.execPath, [publicNpxRuntime, ...descriptor.args], {
      input: `${JSON.stringify(initialize)}\n`,
      encoding: 'utf8',
      env: publicEnvironment,
      windowsHide: true,
    });
    if (handshake.status !== 0 || !handshake.stdout.includes('"serverInfo"')) throw new Error(`Packed public ${harness} MCP handshake failed: ${handshake.stderr || handshake.stdout}`);
  }
  process.stdout.write(`Packed smoke passed for ${Object.keys(inventory.harnesses).join(', ')}.\n`);
  process.stdout.write(`Activated lifecycle fixtures for ${Object.keys(inventory.harnesses).join(', ')}.\n`);
  process.stdout.write('Public marketplace smoke passed for codex, claude-code.\n');
  process.stdout.write('Installed public plugin roots were isolated from the unpacked npm package.\n');
} finally { rmSync(scratch, { recursive: true, force: true }); }
