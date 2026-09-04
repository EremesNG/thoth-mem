import { createHash } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';

import { parse as parseJsonc } from 'jsonc-parser';
import { parseNpmPackRecord, resolveNpmCli } from './npm-pack.mjs';

const repository = resolve(import.meta.dirname, '..');
const scratch = mkdtempSync(join(tmpdir(), 'thoth-packed-native-'));
const npmCli = resolveNpmCli();

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

function runPi(args, options = {}) {
  if (process.platform === 'win32') return run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'pi', ...args], options);
  return run(process.env.PI_BINARY ?? 'pi', args, options);
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

function treeDigest(root) {
  if (!existsSync(root)) return 'missing';
  const hash = createHash('sha256');
  const visit = (path, relative = '') => {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = join(path, entry.name);
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      hash.update(`${entry.isDirectory() ? 'd' : 'f'}:${name}\0`);
      if (entry.isDirectory()) visit(child, name);
      else if (entry.isFile()) hash.update(readFileSync(child));
    }
  };
  visit(root);
  return hash.digest('hex');
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

function materializeRuntimeClosure(packageRoot, artifactsRoot) {
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
    cpSync(directory, stagedPackage, { recursive: true, filter: (source) => basename(source) !== 'node_modules' });
    const tarball = join(artifactsRoot, `${manifest.name.replaceAll('@', '').replaceAll('/', '-')}-${manifest.version}.tgz`);
    try { run('tar', ['-czf', tarball, '-C', stage, 'package']); }
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
  writeFileSync(join(scratch, 'package.json'), `${JSON.stringify({ private: true, allowScripts: { 'better-sqlite3': true, 'msgpackr-extract': true } }, null, 2)}\n`);
  run(process.execPath, [npmCli, 'install', '--no-audit', '--no-fund', tarball], { cwd: scratch });
  const packageRoot = join(scratch, 'node_modules', 'thoth-mem');
  const cli = join(packageRoot, 'dist', 'index.js');
  const nativeMain = join(packageRoot, 'dist', 'opencode.js');
  const manifest = json(join(packageRoot, 'package.json'));
  assert(manifest.main === 'dist/opencode.js', 'Packed package main is not the native OpenCode entry.');
  assert(manifest.bin?.['thoth-mem'] === 'dist/index.js', 'Packed package bin is not the standalone CLI/MCP entry.');
  const nativeSource = readFileSync(nativeMain, 'utf8');
  assert(!nativeSource.includes('better-sqlite3') && !nativeSource.includes('class MemoryService'), 'Packed Bun entry contains the Node-native persistence graph.');

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

  const help = run(process.execPath, [cli, '--help'], { cwd: tmpdir() });
  assert(help.stdout.includes('setup <opencode|codex|claude|pi>') && !help.stdout.includes(`setup-v${2}`), 'Packed CLI exposes the wrong setup contract.');

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

  const nativeProject = join(scratch, 'project with spaces');
  mkdirSync(nativeProject, { recursive: true });
  const nativeSmokePath = join(scratch, 'native-open-code-smoke.mjs');
  writeFileSync(nativeSmokePath, `
const pluginModule = await import(${JSON.stringify(pathToFileURL(nativeMain).href)});
if (typeof pluginModule.default !== 'function') throw new Error('missing default Plugin export');
if (Object.keys(pluginModule).join(',') !== 'default') throw new Error('native entry exports non-plugin runtime values');
const hooks = await pluginModule.default({ directory: ${JSON.stringify(nativeProject)} });
if (Object.keys(hooks.tool ?? {}).join(',') !== 'thoth_mem_root_identity') throw new Error('missing native OpenCode identity tool');
const resolvedConfig = { skills: { paths: ['user-path'] }, mcp: { user: { type: 'remote', url: 'https://example.test' } } };
await hooks.config(resolvedConfig);
if (JSON.stringify(resolvedConfig.skills.paths) !== '["user-path"]') throw new Error('changed user skill paths');
if (resolvedConfig.mcp['thoth-mem'].command[0] !== 'node' || resolvedConfig.mcp['thoth-mem'].command[1] !== ${JSON.stringify(cli)}) throw new Error('wrong package-relative MCP entry');
await hooks.event({ event: { type: 'session.created', properties: { info: { id: 'packed-root', directory: ${JSON.stringify(nativeProject)} } } } });
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

  const piVersion = runPi(['--version'], { cwd: tmpdir() }).stdout.trim();
  assert(piVersion === '0.84.4', `Packed Pi smoke requires 0.84.4, received ${piVersion}.`);
  const realPiHome = join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.pi', 'agent');
  const realPiBefore = treeDigest(realPiHome);
  const piLocal = isolatedPiEnvironment('local');
  const localPiSetup = jsonOutput(run(process.execPath, [cli, 'setup', 'pi', '--json', '--local-package-root', packageRoot, '--data-dir', piLocal.data], { cwd: nativeProject, env: { ...piLocal.env, PATH: `${process.platform === 'win32' ? 'C:\\nvm4w\\nodejs;' : ''}${process.env.PATH ?? ''}` } }));
  assert(localPiSetup.status === 'complete' && localPiSetup.changed === true && localPiSetup.source === packageRoot, 'Packed local Pi setup did not install the explicit candidate.');
  const localPiRepeat = jsonOutput(run(process.execPath, [cli, 'setup', 'pi', '--json', '--local-package-root', packageRoot, '--data-dir', piLocal.data], { cwd: nativeProject, env: { ...piLocal.env, PATH: `${process.platform === 'win32' ? 'C:\\nvm4w\\nodejs;' : ''}${process.env.PATH ?? ''}` } }));
  assert(localPiRepeat.changed === false, 'Repeated packed local Pi setup was not a no-op.');
  const piList = runPi(['list', '--no-approve'], { cwd: nativeProject, env: piLocal.env }).stdout;
  assert(piList.includes(packageRoot), 'Pi list omitted the explicit local candidate source.');
  assert(existsSync(join(packageRoot, 'dist', 'pi.js')) && existsSync(join(packageRoot, 'integrations', 'pi', 'skills', 'thoth-mem', 'SKILL.md')), 'Packed Pi resources are missing.');
  const piLoad = runPi(['--list-models', '--offline', '--no-approve'], { cwd: nativeProject, env: piLocal.env });
  assert(piLoad.status === 0, 'Pi 0.84.4 did not load the installed extension and Skill.');
  const piSmokePath = join(scratch, 'native-pi-smoke.mjs');
  writeFileSync(piSmokePath, `
const extension = (await import(${JSON.stringify(pathToFileURL(join(packageRoot, 'dist', 'pi.js')).href)})).default;
const tools = []; const handlers = new Map();
extension({ registerTool: (tool) => tools.push(tool), on: (name, handler) => handlers.set(name, handler) });
if (tools.map((tool) => tool.name).join(',') !== 'mem_save,mem_recall,mem_context,mem_get,mem_project,mem_session') throw new Error('wrong Pi tool catalog');
const context = { cwd: ${JSON.stringify(nativeProject)}, sessionManager: { getSessionId: () => 'packed-pi-root', getLeafId: () => 'packed-pi-leaf' }, ui: { notify: () => undefined } };
await Promise.all([handlers.get('session_start')({ reason: 'startup' }, context), tools[2].execute('context', { project_key: 'path:${nativeProject.replaceAll('\\', '/').toLowerCase()}' })]);
await handlers.get('input')({ text: 'Packed Pi root input.', source: 'rpc' }, context);
const transformed = await handlers.get('context')({ messages: [] }, context);
if (!Array.isArray(transformed.messages) || transformed.messages.filter((message) => message.customType === 'thoth-mem-recovery').length > 1) throw new Error('invalid Pi recovery context');
await handlers.get('session_before_compact')({ reason: 'manual', preparation: { firstKeptEntryId: 'entry-1' } }, context);
await handlers.get('session_compact_failed')({ reason: 'manual' }, context);
await handlers.get('agent_settled')({}, context);
for (const tool of tools) { const result = await tool.execute('packed-call', {}); if (!Array.isArray(result.content)) throw new Error('invalid Pi tool result'); }
await handlers.get('session_shutdown')({ reason: 'quit', targetSessionFile: 'packed.jsonl' }, context);
process.stdout.write('native-pi-ok');
`);
  const nativePi = run(process.execPath, [piSmokePath], { cwd: nativeProject, env: piLocal.env });
  assert(nativePi.stdout === 'native-pi-ok', 'Packed native Pi tools/lifecycle smoke failed.');
  assert(treeDigest(realPiHome) === realPiBefore, 'Packed Pi smoke mutated the real Pi home.');

  const piPublic = isolatedPiEnvironment('public');
  piPublic.env.npm_config_registry = registry.url;
  piPublic.env.NPM_CONFIG_REGISTRY = registry.url;
  piPublic.env.HTTP_PROXY = 'http://127.0.0.1:9';
  piPublic.env.HTTPS_PROXY = 'http://127.0.0.1:9';
  piPublic.env.ALL_PROXY = 'http://127.0.0.1:9';
  piPublic.env.NO_PROXY = '127.0.0.1,localhost';
  writeFileSync(piPublic.env.npm_config_userconfig, `registry=${registry.url}\ncache=${join(piPublic.root, 'npm', 'cache').replaceAll('\\', '/')}\noffline=false\n`);
  const publicPiSetup = jsonOutput(run(process.execPath, [cli, 'setup', 'pi', '--json', '--data-dir', piPublic.data], { cwd: nativeProject, env: { ...piPublic.env, PATH: `${process.platform === 'win32' ? 'C:\\nvm4w\\nodejs;' : ''}${process.env.PATH ?? ''}` } }));
  assert(publicPiSetup.status === 'complete' && publicPiSetup.source === `npm:thoth-mem@${manifest.version}`, 'Hermetic public Pi setup did not install the exact candidate source.');
  const publicPiRepeat = jsonOutput(run(process.execPath, [cli, 'setup', 'pi', '--json', '--data-dir', piPublic.data], { cwd: nativeProject, env: { ...piPublic.env, PATH: `${process.platform === 'win32' ? 'C:\\nvm4w\\nodejs;' : ''}${process.env.PATH ?? ''}` } }));
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
  const requests = readFileSync(registry.logPath, 'utf8').trim().split(/\r?\n/u).filter(Boolean);
  assert(requests.length > 0 && requests.every((request) => request.startsWith('/')), 'Registry request log is invalid.');
  assert(treeDigest(realPiHome) === realPiBefore, 'Hermetic public Pi smoke mutated the real Pi home.');

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
  for (const harness of ['codex', 'claude']) {
    const runner = run(process.execPath, [join(installedPlugin, 'runners', 'public-runner.mjs'), '--harness', harness], {
      cwd: tmpdir(),
      input: JSON.stringify({ hook_event_name: 'SessionStart', session_id: `${harness}-root`, event_id: `packed-${harness}-start`, cwd: join(scratch, 'project with spaces'), source: 'startup' }),
      env: { ...process.env, THOTH_MEM_PUBLIC_NPX_COMMAND: npxShim, THOTH_MEM_DATA_DIR: managerData },
    });
    const hostOutput = JSON.parse(runner.stdout);
    assert(hostOutput.hookSpecificOutput?.additionalContext?.startsWith(`<!-- thoth-mem:recovery:start -->\nthoth-mem verified identity: root_session_id=${harness}-root; project_key=path:`) && hostOutput.hookSpecificOutput.additionalContext.includes('; project_name=project with spaces'), `Packed ${harness} runner omitted verified identity.`);
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
  assert(compactOutput?.startsWith('<!-- thoth-mem:recovery:start -->\nthoth-mem verified identity: root_session_id=claude-root; project_key=path:') && compactOutput.includes('; project_name=project with spaces'), 'Packed Claude compact recovery omitted verified identity.');
      assert(compactOutput.includes('Keep packed Claude compact recovery.'), 'Packed Claude compact recovery omitted the pre-compaction checkpoint.');
      assert(compactOutput.includes('(summary:') && !compactOutput.includes('(memory:'), 'Packed Claude compact recovery did not isolate the supported summary.');
    }
  }

  process.stdout.write('Packed smoke passed for opencode, codex, claude-code, pi.\n');
  process.stdout.write('Activated lifecycle fixtures for opencode, codex, claude-code, pi.\n');
  process.stdout.write('Verified Pi 0.84.4 local candidate with disposable home and unchanged real Pi home.\n');
  process.stdout.write('Verified hermetic public Pi candidate and complete runtime closure.\n');
  process.stdout.write('Verified exact public Pi list and full installed runtime graph.\n');
  process.stdout.write('Verified SHA-256, SHA-512 integrity, and SHA-1 shasum ledger fields.\n');
} finally {
  if (registryProcess && registryProcess.exitCode === null) {
    registryProcess.kill();
    await Promise.race([once(registryProcess, 'exit'), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  }
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
