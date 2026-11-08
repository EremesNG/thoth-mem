import { createHash } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';

import { parse as parseJsonc } from 'jsonc-parser';
import { packTarball, parseNpmPackRecord, resolveNpmCli } from './npm-pack.mjs';
import { piInstallationSnapshot } from './pi-installation-snapshot.mjs';

const repository = resolve(import.meta.dirname, '..');
const scratch = mkdtempSync(join(tmpdir(), 'thoth-packed-native-'));
const npmCli = resolveNpmCli();

function run(command, args, options = {}) {
  if (process.env.THOTH_MEM_PACKED_TRACE) process.stderr.write(`packed command: ${command} ${args.join(' ')}\n`);
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, timeout: 120_000, ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.error?.message ?? ''}\n${result.stderr ?? result.stdout}`);
  return result;
}

function json(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runPi(args, options = {}) {
  if (process.platform === 'win32') return run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'pi', ...args], options);
  return run('pi', args, options);
}

function isolatedEnvironment(name) {
  const root = join(scratch, 'homes', name);
  return {
    root,
    env: {
      ...process.env,
      OPENCODE_CONFIG_DIR: join(root, 'opencode'),
      HOME: root, USERPROFILE: root,
      XDG_CONFIG_HOME: join(root, 'config'),
      XDG_DATA_HOME: join(root, 'data'), XDG_CACHE_HOME: join(root, 'cache'),
      PATH: `${join(scratch, 'host-bin')}${delimiter}${process.env.PATH ?? ''}`,
      THOTH_MEM_DATA_DIR: '',
    },
  };
}

function assertRealPiUnchanged(root, before) {
  const after = piInstallationSnapshot(root);
  const changed = [...new Set([...Object.keys(before.files), ...Object.keys(after.files)])].filter((path) => before.files[path] !== after.files[path]);
  assert(before.digest === after.digest, `Packed Pi smoke observed real-home changes: ${changed.join(', ')}`);
}

function isolatedPiEnvironment(name) {
  const root = join(scratch, 'pi', name);
  const home = join(root, 'home');
  const agent = join(root, 'agent');
  const sessions = join(root, 'sessions');
  const data = join(root, 'data');
  const npm = join(root, 'npm');
  for (const path of [home, agent, sessions, data, npm]) mkdirSync(path, { recursive: true });
  return {
    root, agent, sessions, data,
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      XDG_CONFIG_HOME: join(home, '.config'),
      APPDATA: join(home, 'AppData', 'Roaming'),
      LOCALAPPDATA: join(home, 'AppData', 'Local'),
      PI_CODING_AGENT_DIR: agent,
      PI_CODING_AGENT_SESSION_DIR: sessions,
      PI_OFFLINE: '1',
      PI_TELEMETRY: '0',
      THOTH_MEM_DATA_DIR: data,
      npm_config_cache: join(npm, 'cache'),
      npm_config_userconfig: join(npm, 'npmrc'),
      npm_config_registry: 'http://127.0.0.1:9/',
    },
  };
}

function findInstalledPackage(from, name) {
  let directory = from;
  while (true) {
    const candidate = join(directory, 'node_modules', ...name.split('/'));
    if (existsSync(candidate)) return realpathSync(candidate);
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Installed runtime dependency is missing: ${name}`);
    directory = parent;
  }
}

function materializeRuntimeClosure(packageRoot, artifactsRoot, withoutBindings = false) {
  mkdirSync(artifactsRoot, { recursive: true });
  const lockText = readFileSync(join(repository, 'pnpm-lock.yaml'), 'utf8');
  const queue = Object.keys(json(join(packageRoot, 'package.json')).dependencies ?? {}).map((name) => ({ name, from: packageRoot }));
  const seen = new Set();
  const entries = [];
  while (queue.length) {
    const { name, from } = queue.shift();
    const directory = findInstalledPackage(from, name);
    const manifest = json(join(directory, 'package.json'));
    const identity = `${manifest.name}@${manifest.version}`;
    if (manifest.name !== name || typeof manifest.version !== 'string') throw new Error(`Installed dependency identity mismatch for ${name}`);
    if (seen.has(identity)) continue;
    seen.add(identity);
    const escaped = identity.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    if (!new RegExp(`\\n  ['"]?${escaped}['"]?:`, 'u').test(lockText)) throw new Error(`Frozen lockfile does not contain ${identity}`);
    const stage = join(artifactsRoot, `.stage-${entries.length}`);
    const stagedPackage = join(stage, 'package');
    cpSync(directory, stagedPackage, { recursive: true, filter: (source) => basename(source) !== 'node_modules' && (!withoutBindings || !source.endsWith('.node')) });
    const tarball = join(artifactsRoot, `${manifest.name.replaceAll('@', '').replaceAll('/', '-')}-${manifest.version}.tgz`);
    try { packTarball(stage, tarball); }
    catch (error) { throw new Error(`Failed to pack frozen dependency ${identity}`, { cause: error }); }
    finally { rmSync(stage, { recursive: true, force: true }); }
    const bytes = readFileSync(tarball);
    entries.push({ name, version: manifest.version, manifest, tarball, sha256: createHash('sha256').update(bytes).digest('hex'), integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`, shasum: createHash('sha1').update(bytes).digest('hex') });
    for (const dependency of Object.keys(manifest.dependencies ?? {})) queue.push({ name: dependency, from: directory });
    for (const dependency of Object.keys(manifest.optionalDependencies ?? {})) {
      try { findInstalledPackage(directory, dependency); queue.push({ name: dependency, from: directory }); } catch { /* platform-excluded optional dependency */ }
    }
  }
  return entries;
}

function collectInstalledRuntimeClosure(packageRoot) {
  const rootManifest = json(join(packageRoot, 'package.json'));
  const queue = Object.keys(rootManifest.dependencies ?? {}).map((name) => ({ name, from: packageRoot, parent: `${rootManifest.name}@${rootManifest.version}` }));
  const identities = new Set();
  const edges = [];
  while (queue.length) {
    const { name, from, parent } = queue.shift();
    const directory = findInstalledPackage(from, name);
    const manifest = json(join(directory, 'package.json'));
    if (manifest.name !== name || typeof manifest.version !== 'string') throw new Error(`Installed dependency identity mismatch for ${name}`);
    const identity = `${manifest.name}@${manifest.version}`;
    edges.push(`${parent}->${identity}`);
    if (identities.has(identity)) continue;
    identities.add(identity);
    for (const dependency of Object.keys(manifest.dependencies ?? {})) queue.push({ name: dependency, from: directory, parent: identity });
    for (const dependency of Object.keys(manifest.optionalDependencies ?? {})) {
      try { findInstalledPackage(directory, dependency); queue.push({ name: dependency, from: directory, parent: identity }); } catch { /* platform-excluded optional dependency */ }
    }
  }
  return { identities, edges };
}

async function startRegistry(entries, root) {
  const ledgerPath = join(root, 'registry-ledger.json');
  const logPath = join(root, 'registry-requests.log');
  writeFileSync(ledgerPath, `${JSON.stringify(entries, null, 2)}\n`);
  const serverPath = join(root, 'registry-server.mjs');
  writeFileSync(serverPath, `
import { createServer } from 'node:http';
import { appendFileSync, createReadStream, readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
const entries = JSON.parse(readFileSync(process.argv[2], 'utf8')); const log = process.argv[3];
const byName = new Map(); for (const entry of entries) byName.set(entry.name, [...(byName.get(entry.name) ?? []), entry]);
const byTarball = new Map(entries.map((entry) => [basename(entry.tarball), entry]));
const server = createServer((request, response) => {
  appendFileSync(log, (request.url ?? '') + '\\n');
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const tarball = byTarball.get(decodeURIComponent(url.pathname.split('/').at(-1) ?? ''));
  if (tarball) { response.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': statSync(tarball.tarball).size }); createReadStream(tarball.tarball).pipe(response); return; }
  const name = decodeURIComponent(url.pathname.slice(1)); const found = byName.get(name);
  if (!found) { response.writeHead(404, { 'content-type': 'application/json' }); response.end(JSON.stringify({ error: 'not_found' })); return; }
  const versions = Object.fromEntries(found.map((entry) => { const tarballUrl = 'http://127.0.0.1:' + server.address().port + '/' + encodeURIComponent(entry.name) + '/-/' + basename(entry.tarball); return [entry.version, { ...entry.manifest, dist: { tarball: tarballUrl, integrity: entry.integrity, shasum: entry.shasum } }]; }));
  response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ name, 'dist-tags': { latest: found.at(-1).version }, versions }));
});
server.listen(0, '127.0.0.1', () => process.stdout.write(String(server.address().port) + '\\n'));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
`);
  const child = spawn(process.execPath, [serverPath, ledgerPath, logPath], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const [chunk] = await once(child.stdout, 'data');
  const port = Number(String(chunk).trim());
  if (!Number.isInteger(port) || port <= 0) throw new Error('Loopback registry did not report a valid port.');
  return { child, ledgerPath, logPath, url: `http://127.0.0.1:${port}/` };
}

function validateClosureLedger(entries) {
  const identities = new Set();
  for (const entry of entries) {
    const identity = `${entry.name}@${entry.version}`;
    if (identities.has(identity)) throw new Error(`Duplicate closure entry: ${identity}`);
    identities.add(identity);
    const bytes = readFileSync(entry.tarball);
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256) || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error(`Closure SHA-256 mismatch: ${identity}`);
    if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(entry.integrity) || `sha512-${createHash('sha512').update(bytes).digest('base64')}` !== entry.integrity) throw new Error(`Closure SHA-512 integrity mismatch: ${identity}`);
    if (!/^[a-f0-9]{40}$/u.test(entry.shasum) || createHash('sha1').update(bytes).digest('hex') !== entry.shasum) throw new Error(`Closure SHA-1 shasum mismatch: ${identity}`);
  }
  for (const entry of entries) for (const name of Object.keys(entry.manifest.dependencies ?? {})) {
    if (!entries.some((candidate) => candidate.name === name)) throw new Error(`Closure graph is incomplete: ${entry.name} -> ${name}`);
  }
  return true;
}

let registryProcess;
try {
  const packed = run(process.execPath, [npmCli, 'pack', '--json', '--ignore-scripts', '--pack-destination', scratch], { cwd: repository });
  const tarball = join(scratch, parseNpmPackRecord(packed.stdout).filename);
  const manifest = json(join(repository, 'package.json'));
  const closureRoot = join(scratch, 'registry-artifacts');
  const runtimeClosure = materializeRuntimeClosure(repository, closureRoot);
  const candidateBytes = readFileSync(tarball);
  const candidateEntry = { name: manifest.name, version: manifest.version, manifest, tarball, sha256: createHash('sha256').update(candidateBytes).digest('hex'), integrity: `sha512-${createHash('sha512').update(candidateBytes).digest('base64')}`, shasum: createHash('sha1').update(candidateBytes).digest('hex') };
  const closureLedger = [candidateEntry, ...runtimeClosure];
  assert(validateClosureLedger(closureLedger), 'Candidate runtime closure is invalid.');
  try { validateClosureLedger(closureLedger.map((entry, index) => index === 0 ? { ...entry, sha256: '0'.repeat(64) } : entry)); throw new Error('hash mismatch fixture was accepted'); } catch (error) { assert(String(error).includes('SHA-256 mismatch'), 'Unexpected SHA-256 mismatch diagnostic.'); }
  try { validateClosureLedger(closureLedger.map((entry, index) => index === 0 ? { ...entry, integrity: 'sha512-invalid' } : entry)); throw new Error('integrity mismatch fixture was accepted'); } catch (error) { assert(String(error).includes('SHA-512 integrity mismatch'), 'Unexpected SHA-512 integrity mismatch diagnostic.'); }
  try { validateClosureLedger(closureLedger.map((entry, index) => index === 0 ? { ...entry, shasum: '0'.repeat(40) } : entry)); throw new Error('shasum mismatch fixture was accepted'); } catch (error) { assert(String(error).includes('SHA-1 shasum mismatch'), 'Unexpected SHA-1 shasum mismatch diagnostic.'); }
  const firstDependency = Object.keys(candidateEntry.manifest.dependencies)[0];
  try { validateClosureLedger(closureLedger.filter((entry) => entry.name !== firstDependency)); throw new Error('graph mismatch fixture was accepted'); } catch (error) { assert(String(error).includes('incomplete'), 'Unexpected graph mismatch diagnostic.'); }
  const registry = await startRegistry(closureLedger, scratch);
  registryProcess = registry.child;

  const installRoot = joinDirectory(scratch, 'installed');
  writeFileSync(join(installRoot, 'package.json'), `${JSON.stringify({ private: true, allowScripts: { 'better-sqlite3': true, 'msgpackr-extract': true } }, null, 2)}\n`);
  run(process.execPath, [npmCli, 'install', '--no-audit', '--no-fund', tarball], { cwd: installRoot, env: loopbackEnvironment(isolatedPiEnvironment('packed-install').env, registry.url) });
  const packageRoot = join(installRoot, 'node_modules', 'thoth-mem');
  const cli = join(packageRoot, 'dist', 'index.js');
  const nativeMain = join(packageRoot, 'dist', 'opencode.js');
  assert(JSON.stringify(json(join(packageRoot, 'package.json'))) === JSON.stringify(manifest), 'Installed candidate manifest drifted.');
  assert(manifest.main === 'dist/opencode.js', 'Packed package main is not the native OpenCode entry.');
  assert(manifest.bin?.['thoth-mem'] === 'dist/index.js', 'Packed package bin is not the standalone CLI/MCP entry.');
  const nativeSource = readFileSync(nativeMain, 'utf8');
  assert(!/(?:from\s*|import\s*\(|require\s*\()\s*["'](?:better-sqlite3|@opencode(?:-ai)?\/)/u.test(nativeSource) && !nativeSource.includes('class MemoryService'), 'Packed Bun entry imports a host SDK or Node-native persistence graph.');

  const help = run(process.execPath, [cli, '--help'], { cwd: tmpdir() });
  assert(help.stdout.includes('setup <opencode|codex|claude|pi>') && !help.stdout.includes(`setup-v${2}`), 'Packed CLI exposes the wrong setup contract.');

  createOpenCodeShim();
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
  assert(localSetup.status === 'complete' && localSetup.plugin === packageRoot, 'Packed local OpenCode setup did not converge canonical directory provenance.');
  const localConfig = jsoncPlugins(readFileSync(localSetup.configPath, 'utf8'));
  assert(localConfig.length === 1 && localConfig[0] === localSetup.plugin, 'Packed local OpenCode configuration contains duplicate activation.');
  assert(!existsSync(join(localHome.env.OPENCODE_CONFIG_DIR, 'skills', 'thoth-mem')), 'Packed OpenCode setup copied the Skill.');
  assert(jsoncPlugins(publicConfigBefore)[0] === `thoth-mem@${manifest.version}`, 'Public setup did not use V2 plugins.');

  const nativeProject = join(scratch, 'project with spaces');
  mkdirSync(nativeProject, { recursive: true });
  const nativeSmokePath = join(repository, 'scripts', 'packed-opencode-context.mjs');
  const nativeSmoke = run(process.env.BUN_BINARY ?? 'bun', [nativeSmokePath, nativeMain, nativeProject], { cwd: tmpdir(), env: { ...isolatedEnvironment('native-hooks').env, THOTH_MEM_DATA_DIR: join(scratch, 'native hook data') }, timeout: 30_000 });
  assert(nativeSmoke.stdout === 'native-opencode-v2-ok', 'Packed native OpenCode V2 smoke failed.');

  // Model OpenCode's scripts-disabled npm cache with pristine (unbuilt) native dependencies.
  // The runtime registry keeps the frozen Node builds, so npx needs no public egress.
  const unbuiltClosure = materializeRuntimeClosure(repository, join(scratch, 'unbuilt-artifacts'), true);
  const installRegistry = await startRegistry([candidateEntry, ...unbuiltClosure], joinDirectory(scratch, 'unbuilt-registry'));
  const disabled = isolatedPiEnvironment('opencode-scripts-disabled');
  const disabledEnv = loopbackEnvironment(disabled.env, installRegistry.url);
  try {
    writeFileSync(join(disabled.root, 'package.json'), JSON.stringify({ private: true }));
    run(process.execPath, [npmCli, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--omit=peer', tarball], { cwd: disabled.root, env: disabledEnv, timeout: 60_000 });
  } finally {
    installRegistry.child.kill();
    await once(installRegistry.child, 'exit');
  }
  const disabledPackage = join(disabled.root, 'node_modules', 'thoth-mem');
  const sqlite = findInstalledPackage(disabledPackage, 'better-sqlite3');
  assert(!existsSync(join(sqlite, 'build', 'Release', 'better_sqlite3.node')), 'Scripts-disabled install unexpectedly has a SQLite binding.');
  assert(!existsSync(join(disabledEnv.XDG_CONFIG_HOME, 'thoth-mem', 'config.json')), 'Scripts-disabled lane has a configured local runtime.');
  const fallbackEnv = loopbackEnvironment({ ...disabled.env, npm_config_cache: join(disabled.root, 'runtime-npm-cache') }, registry.url);
  delete fallbackEnv.THOTH_MEM_PUBLIC_NPX_COMMAND;
  // Isolated real platform npx (npx.cmd through cross-spawn on Windows), never a fake runtime.
  const fallback = run(process.env.BUN_BINARY ?? 'bun', [nativeSmokePath, join(disabledPackage, 'dist', 'opencode.js'), nativeProject], { cwd: nativeProject, env: fallbackEnv, timeout: 150_000 });
  assert(fallback.stdout === 'native-opencode-v2-ok', 'Scripts-disabled OpenCode exact-version npx runtime failed.');
  assert(existsSync(join(disabled.data, 'memory.sqlite')), 'OpenCode npx runtime did not persist lifecycle evidence.');
  assert(!existsSync(join(sqlite, 'build', 'Release', 'better_sqlite3.node')), 'npx modified the host plugin dependency.');
  // A separate Node verifier releases the native DLL on exit (Windows cannot
  // remove an addon loaded by this long-lived packaging process).
  run(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    const Database = createRequire(${JSON.stringify(join(packageRoot, 'package.json'))})('better-sqlite3');
    const database = new Database(${JSON.stringify(join(disabled.data, 'memory.sqlite'))}, { readonly: true });
    try {
      const operations = database.prepare("SELECT operation FROM lifecycle_receipts WHERE harness='opencode' AND root_session_key='packed-root' ORDER BY operation").all().map(({ operation }) => operation);
      for (const operation of ['capture_root', 'checkpoint_pre_compact', 'guide_post_compact', 'recover', 'finalize']) assert.ok(operations.includes(operation), 'Missing persisted ' + operation);
      assert.equal(operations.filter((operation) => operation === 'finalize').length, 1);
    } finally { database.close(); }
  `]);
  const fallbackRequests = readFileSync(registry.logPath, 'utf8');
  assert(fallbackRequests.includes('/thoth-mem') && fallbackRequests.includes(basename(tarball)), 'npx did not request the candidate from the loopback registry.');
  process.stdout.write(`Verified OpenCode V2 scripts-disabled install: binding absent, exact-version candidate npx (${process.platform === 'win32' ? 'npx.cmd' : 'npx'}), MCP init, native tool, root lifecycle, recovery and cleanup.\n`);

  const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'thoth-packed-smoke', version: '1.0.0' } } };
  const initialized = { jsonrpc: '2.0', method: 'notifications/initialized' };
  const listTools = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} };
  const mcp = run(process.execPath, [cli, 'mcp', '--no-http'], { cwd: tmpdir(), env: localHome.env, input: `${JSON.stringify(initialize)}\n${JSON.stringify(initialized)}\n${JSON.stringify(listTools)}\n` });
  const messages = mcp.stdout.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
  const toolResult = messages.find((message) => message.id === 2);
  assert(toolResult?.result?.tools?.length === 6, `Packed MCP exposed ${toolResult?.result?.tools?.length ?? 0} tools instead of six.`);
  assert(existsSync(join(localData, 'memory.sqlite')), 'Packed MCP did not use the persisted provider data directory.');

  const piVersion = runPi(['--version'], { cwd: tmpdir() }).stdout.trim();
  assert(/^\d+\.\d+\.\d+$/u.test(piVersion), `Packed Pi smoke received malformed version output: ${piVersion}.`);
  const realPiHome = join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.pi', 'agent');
  const realPiBefore = piInstallationSnapshot(realPiHome);
  const piLocal = isolatedPiEnvironment('local');
  const localPiSetup = jsonOutput(run(process.execPath, [cli, 'setup', 'pi', '--json', '--local-package-root', packageRoot, '--data-dir', piLocal.data], { cwd: nativeProject, env: piLocal.env }));
  assert(localPiSetup.piVersion === piVersion, 'Packed local Pi setup used a different host version.');
  assert(localPiSetup.status === 'complete' && localPiSetup.changed === true && localPiSetup.source === packageRoot, 'Packed local Pi setup did not install the explicit candidate.');
  const localPiRepeat = jsonOutput(run(process.execPath, [cli, 'setup', 'pi', '--json', '--local-package-root', packageRoot, '--data-dir', piLocal.data], { cwd: nativeProject, env: piLocal.env }));
  assert(localPiRepeat.changed === false, 'Repeated packed local Pi setup was not a no-op.');
  const piList = runPi(['list', '--no-approve'], { cwd: nativeProject, env: piLocal.env }).stdout;
  assert(piList.includes(packageRoot), 'Pi list omitted the explicit local candidate source.');
  assert(existsSync(join(packageRoot, 'dist', 'pi.js')) && existsSync(join(packageRoot, 'integrations', 'pi', 'skills', 'thoth-mem', 'SKILL.md')), 'Packed Pi resources are missing.');
  const piLoad = runPi(['--list-models', '--offline', '--no-approve'], { cwd: nativeProject, env: piLocal.env });
  assert(piLoad.status === 0, `Pi ${piVersion} did not load the installed extension and Skill.`);
  const piSmokePath = join(scratch, 'native-pi-smoke.mjs');
  writeFileSync(piSmokePath, `
import assert from 'node:assert/strict';
const extension = (await import(${JSON.stringify(pathToFileURL(join(packageRoot, 'dist', 'pi.js')).href)})).default;
const tools = []; const handlers = new Map();
extension({ registerTool: (tool) => tools.push(tool), on: (name, handler) => handlers.set(name, handler) });
if (tools.map((tool) => tool.name).join(',') !== 'mem_save,mem_recall,mem_context,mem_get,mem_project') throw new Error('wrong Pi tool catalog');
const plainTheme = { fg: (_color, text) => text, bold: (text) => text };
if (tools.some((tool) => tool.renderShell !== 'self' || !tool.renderCall(tool.name === 'mem_save' ? { memory: { kind: 'decision', title: 'Packed' } } : {}, plainTheme, { state: {} }).render(60)[0].includes(tool.name))) throw new Error('missing framed Pi tool rendering');
const context = { cwd: ${JSON.stringify(nativeProject)}, sessionManager: { getSessionId: () => 'packed-pi-root', getLeafId: () => 'packed-pi-leaf', getBranch: () => [] }, ui: { notify: () => undefined } };
await Promise.all([handlers.get('session_start')({ reason: 'startup' }, context), tools[2].execute('context', { project_key: 'path:${nativeProject.replaceAll('\\', '/').toLowerCase()}' })]);
await handlers.get('input')({ text: 'Packed Pi root input.', source: 'rpc' }, context);
if (handlers.has('context')) throw new Error('Pi recovery must not inject per-LLM-call context messages');
const sections = Object.freeze({ other: 'keep', thoth_mem_recovery: 'untouched' });
const startEvent = { prompt: 'Packed Pi root input.', systemPrompt: 'stable-prefix', systemPromptOptions: { sections } };
const assertRecoveryMessage = (result) => {
  assert.equal(typeof result?.message?.content, 'string');
  assert.deepEqual(result, { message: { customType: 'thoth-mem-recovery', content: result.message.content, display: false } });
  assert.ok(result.message.content.includes('root_session_id=packed-pi-root'));
  assert.deepEqual(sections, { other: 'keep', thoth_mem_recovery: 'untouched' });
  assert.equal(startEvent.systemPrompt, 'stable-prefix');
};
assertRecoveryMessage(await handlers.get('before_agent_start')(startEvent, context));
assert.equal(await handlers.get('before_agent_start')(startEvent, context), undefined);
await handlers.get('session_before_compact')({ reason: 'manual', preparation: { firstKeptEntryId: 'entry-1' } }, context);
await handlers.get('session_compact_failed')({ reason: 'manual' }, context);
assert.equal(await handlers.get('before_agent_start')(startEvent, context), undefined);
await handlers.get('session_compact')({ reason: 'manual', compactionEntry: { id: 'packed-compaction', summary: 'Packed Pi lifecycle checkpoint.' } }, context);
assertRecoveryMessage(await handlers.get('before_agent_start')(startEvent, context));
assert.equal(await handlers.get('before_agent_start')(startEvent, context), undefined);
assert.deepEqual(sections, { other: 'keep', thoth_mem_recovery: 'untouched' });
await handlers.get('agent_settled')({}, context);
for (const tool of tools) await assert.rejects(tool.execute('packed-call', {}), Error);
await handlers.get('session_shutdown')({ reason: 'quit', targetSessionFile: 'packed.jsonl' }, context);
process.stdout.write('native-pi-ok');
`);
  const nativePi = run(process.execPath, [piSmokePath], { cwd: nativeProject, env: piLocal.env, timeout: 30_000 });
  assert(nativePi.stdout === 'native-pi-ok', 'Packed native Pi tools/lifecycle smoke failed.');
  assertRealPiUnchanged(realPiHome, realPiBefore);

  const piPublic = isolatedPiEnvironment('public');
  // The frozen closure already includes native builds; install hooks would fetch outside the loopback registry.
  piPublic.env.npm_config_ignore_scripts = 'true';
  piPublic.env.npm_config_registry = registry.url;
  piPublic.env.NPM_CONFIG_REGISTRY = registry.url;
  // This lane must reach its isolated loopback registry even when the caller is offline.
  piPublic.env.npm_config_offline = 'false';
  piPublic.env.NPM_CONFIG_OFFLINE = 'false';
  piPublic.env.HTTP_PROXY = 'http://127.0.0.1:9';
  piPublic.env.HTTPS_PROXY = 'http://127.0.0.1:9';
  piPublic.env.ALL_PROXY = 'http://127.0.0.1:9';
  piPublic.env.NO_PROXY = '127.0.0.1,localhost';
  writeFileSync(piPublic.env.npm_config_userconfig, `registry=${registry.url}\ncache=${join(piPublic.root, 'npm', 'cache').replaceAll('\\', '/')}\noffline=false\n`);
  const publicPiSetup = jsonOutput(run(process.execPath, [cli, 'setup', 'pi', '--json', '--data-dir', piPublic.data], { cwd: nativeProject, env: piPublic.env }));
  assert(publicPiSetup.piVersion === piVersion, 'Packed public Pi setup used a different host version.');
  assert(publicPiSetup.status === 'complete' && publicPiSetup.source === `npm:thoth-mem@${manifest.version}`, 'Hermetic public Pi setup did not install the exact candidate source.');
  const publicPiRepeat = jsonOutput(run(process.execPath, [cli, 'setup', 'pi', '--json', '--data-dir', piPublic.data], { cwd: nativeProject, env: piPublic.env }));
  assert(publicPiRepeat.changed === false, 'Repeated hermetic public Pi setup was not a no-op.');
  const publicInstalled = publicPiSetup.receiptPath ? json(publicPiSetup.receiptPath).installedPath : null;
  assert(publicInstalled && statSync(publicInstalled).isDirectory(), 'Hermetic public Pi receipt omitted its installed candidate.');
  const publicPiList = runPi(['list', '--no-approve'], { cwd: nativeProject, env: piPublic.env }).stdout.replaceAll('\r\n', '\n').split('\n').filter(Boolean);
  assert(JSON.stringify(publicPiList) === JSON.stringify(['User packages:', `  npm:thoth-mem@${manifest.version}`, `    ${publicInstalled}`]), 'Hermetic public Pi list did not contain exactly the candidate source and installed path.');
  const publicManifest = json(join(publicInstalled, 'package.json'));
  assert(publicManifest.name === manifest.name && publicManifest.version === manifest.version && JSON.stringify(publicManifest.pi) === JSON.stringify(manifest.pi), 'Hermetic public Pi installed manifest drifted from the candidate.');
  assert(existsSync(join(publicInstalled, 'dist', 'pi.js')) && existsSync(join(publicInstalled, 'integrations', 'pi', 'skills', 'thoth-mem', 'SKILL.md')), 'Hermetic public Pi resources are missing.');
  runPi(['--list-models', '--offline', '--no-approve'], { cwd: nativeProject, env: piPublic.env });
  assert(createHash('sha256').update(candidateBytes).digest('hex') === candidateEntry.sha256, 'Candidate ledger hash drifted.');
  const installedGraph = collectInstalledRuntimeClosure(publicInstalled);
  const expectedRuntimeIdentities = [...new Set(runtimeClosure.map((entry) => `${entry.name}@${entry.version}`))].sort();
  const installedRuntimeIdentities = [...installedGraph.identities].sort();
  assert(JSON.stringify(installedRuntimeIdentities) === JSON.stringify(expectedRuntimeIdentities), `Installed runtime closure drifted from the ledger: expected ${expectedRuntimeIdentities.length}, received ${installedRuntimeIdentities.length}.`);
  assert(installedGraph.edges.length >= installedGraph.identities.size, 'Installed runtime graph did not resolve every dependency edge.');
  const publicPiMcp = run(process.execPath, [join(publicInstalled, 'dist', 'index.js'), 'mcp', '--no-http'], {
    cwd: nativeProject,
    env: piPublic.env,
    input: `${JSON.stringify(initialize)}\n${JSON.stringify(initialized)}\n${JSON.stringify(listTools)}\n`,
  });
  const publicPiMessages = publicPiMcp.stdout.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
  assert(publicPiMessages.find((message) => message.id === 2)?.result?.tools?.length === 6, 'Hermetic public Pi MCP did not expose exactly six tools.');
  assert(existsSync(join(piPublic.data, 'memory.sqlite')), 'Hermetic public Pi MCP did not open its native SQLite database.');
  const requests = readFileSync(registry.logPath, 'utf8').trim().split(/\r?\n/u).filter(Boolean);
  assert(requests.length > 0 && requests.every((request) => request.startsWith('/')), 'Registry request log is invalid.');
  assertRealPiUnchanged(realPiHome, realPiBefore);

  const publicPluginRoot = join(packageRoot, 'plugin');
  for (const path of [
    '.codex-plugin/plugin.json',
    '.claude-plugin/plugin.json',
    '.mcp.json',
    'hooks/hooks.json',
    'hooks/codex-hooks.json',
    'skills/thoth-mem/SKILL.md',
    'runners/public-runner.mjs',
  ]) assert(existsSync(join(publicPluginRoot, path)), `Packed native manager bundle is missing ${path}.`);
  assert(!existsSync(join(packageRoot, '.agents', 'plugins', 'marketplace.json')), 'Packed package still owns a Codex marketplace.');
  assert(!existsSync(join(packageRoot, '.claude-plugin', 'marketplace.json')), 'Packed package still owns a Claude marketplace.');
  assert(existsSync(join(publicPluginRoot, 'skills', 'thoth-mem', 'SKILL.md')), 'Packed plugin does not contain its Skill.');

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
  const managerEnv = { ...isolatedEnvironment('managers').env, THOTH_MEM_PUBLIC_NPX_COMMAND: npxShim, THOTH_MEM_DATA_DIR: managerData };
  for (const harness of ['codex', 'claude']) {
    const runner = run(process.execPath, [join(installedPlugin, 'runners', 'public-runner.mjs'), '--harness', harness], {
      cwd: tmpdir(),
      input: JSON.stringify({ hook_event_name: 'SessionStart', session_id: `${harness}-root`, event_id: `packed-${harness}-start`, cwd: join(scratch, 'project with spaces'), source: 'startup' }),
      env: managerEnv,
    });
    const hostOutput = JSON.parse(runner.stdout);
    assert(hostOutput.hookSpecificOutput?.additionalContext?.startsWith(`<!-- thoth-mem:recovery:start -->\nthoth-mem verified identity: root_session_id=${harness}-root; project_key=path:`) && hostOutput.hookSpecificOutput.additionalContext.includes('; project_name=project with spaces'), `Packed ${harness} runner omitted verified identity.`);
    if (harness === 'claude') {
      const support = jsonOutput(run(process.execPath, [cli, 'lifecycle', '--harness', 'claude', '--data-dir', managerData], {
        cwd: tmpdir(),
        input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 'claude-root', event_id: 'packed-claude-support', cwd: join(scratch, 'project with spaces'), prompt: 'Keep packed Claude compact recovery.' }),
        env: managerEnv,
      }));
      assert(support.data?.evidenceId && support.data?.event?.sequence === 1, 'Packed Claude support evidence was not ordered.');
      run(process.execPath, [join(installedPlugin, 'runners', 'public-runner.mjs'), '--harness', harness], {
        cwd: tmpdir(),
        input: JSON.stringify({
          hook_event_name: 'PreCompact', session_id: 'claude-root', event_id: 'packed-claude-pre-compact', cwd: join(scratch, 'project with spaces'),
          content: 'Non-empty packed Claude checkpoint content.',
          thoth_mem_summary: {
            coverage: { fromSequence: 1, toSequence: 1 },
            generator: { kind: 'harness', name: 'packed-smoke' },
            claims: [
              { kind: 'objective', content: 'Keep packed Claude compact recovery.', supportIds: [support.data.evidenceId] },
              { kind: 'next_action', content: 'Continue from the packed supported summary.', supportIds: [support.data.evidenceId] },
            ],
          },
        }),
        env: managerEnv,
      });
      const compactRunner = run(process.execPath, [join(installedPlugin, 'runners', 'public-runner.mjs'), '--harness', harness], {
        cwd: tmpdir(),
        input: JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'claude-root', event_id: 'packed-claude-compact-start', cwd: join(scratch, 'project with spaces'), source: 'compact' }),
        env: managerEnv,
      });
      const compactOutput = JSON.parse(compactRunner.stdout).hookSpecificOutput?.additionalContext;
  assert(compactOutput?.startsWith('<!-- thoth-mem:recovery:start -->\nthoth-mem verified identity: root_session_id=claude-root; project_key=path:') && compactOutput.includes('; project_name=project with spaces'), 'Packed Claude compact recovery omitted verified identity.');
      assert(!compactOutput.includes('(summary:'), 'Packed Claude compact recovery showed the session its own summary.');
      const nextRunner = run(process.execPath, [join(installedPlugin, 'runners', 'public-runner.mjs'), '--harness', harness], {
        cwd: tmpdir(),
        input: JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'claude-next', event_id: 'packed-claude-next-start', cwd: join(scratch, 'project with spaces'), source: 'startup' }),
        env: managerEnv,
      });
      const nextOutput = JSON.parse(nextRunner.stdout).hookSpecificOutput?.additionalContext;
      assert(nextOutput?.includes('root_session_id=claude-next;'), 'Packed Claude next-session recovery omitted verified identity.');
      assert(nextOutput.includes('(summary:') && nextOutput.includes('Keep packed Claude compact recovery.'), 'Packed Claude next-session recovery omitted the previous session summary.');
    }
  }

  process.stdout.write('Packed smoke passed for opencode, codex, claude-code, pi.\n');
  process.stdout.write('Activated lifecycle fixtures for opencode, codex, claude-code, pi.\n');
  process.stdout.write(`Verified Pi ${piVersion} local candidate with disposable home and unchanged real Pi home.\n`);
  process.stdout.write('Verified hermetic public Pi candidate and complete runtime closure.\n');
  process.stdout.write('Verified exact public Pi list and full installed runtime graph.\n');
  process.stdout.write('Verified SHA-256, SHA-512 integrity, and SHA-1 shasum ledger fields.\n');
} finally {
  if (registryProcess && registryProcess.exitCode === null) {
    registryProcess.kill();
    await Promise.race([once(registryProcess, 'exit'), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  }
  // Windows can briefly retain npm/native-addon handles after child exit.
  rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

function jsonOutput(result) {
  return JSON.parse(result.stdout);
}

function jsoncPlugins(text) {
  return parseJsonc(text).plugins ?? [];
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

function joinDirectory(...parts) {
  const path = join(...parts); mkdirSync(path, { recursive: true }); return path;
}

function createOpenCodeShim() {
  const bin = joinDirectory(scratch, 'host-bin');
  if (process.platform === 'win32') writeFileSync(join(bin, 'opencode.cmd'), '@echo off\r\necho 2.2.6\r\n');
  else { const path = join(bin, 'opencode'); writeFileSync(path, '#!/bin/sh\nprintf "2.2.6\\n"\n'); chmodSync(path, 0o755); }
}
function loopbackEnvironment(env, registry) {
  return { ...env, npm_config_ignore_scripts: 'true', npm_config_legacy_peer_deps: 'true', npm_config_registry: registry, NPM_CONFIG_REGISTRY: registry,
    npm_config_offline: 'false', NPM_CONFIG_OFFLINE: 'false',
    HTTP_PROXY: 'http://127.0.0.1:9', HTTPS_PROXY: 'http://127.0.0.1:9', ALL_PROXY: 'http://127.0.0.1:9',
    http_proxy: 'http://127.0.0.1:9', https_proxy: 'http://127.0.0.1:9', all_proxy: 'http://127.0.0.1:9',
    NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' };
}
