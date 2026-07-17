// @ts-check

import {
  cp,
  mkdtemp,
  mkdir,
  lstat,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
} from 'node:fs/promises';
import {
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
  win32,
} from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
    import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(SCRIPT_DIRECTORY, '..');
const INVENTORY_PATH = 'integrations/inventory.json';
const HARNESSES = new Set(['opencode', 'codex', 'claude']);
const NPM_PACK_TIMEOUT_MS = 30_000;
const PACKED_RUNTIME_TIMEOUT_MS = 30_000;
    const EXTERNAL_RUNTIME_PACKAGES = Object.freeze([
      'better-sqlite3',
      'sqlite-vec',
      'onnxruntime-common',
      'onnxruntime-node',
    ]);
    const PACKAGE_NAME_PATTERN = new RegExp('^(?:@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*$', 'i');

    export function createStrictSubprocessEnvironment(workspace) {
      const home = join(workspace, 'home');
      const windowsEnvironment = process.platform === 'win32'
        ? {
            PATHEXT: process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD',
            SystemRoot: process.env.SystemRoot ?? process.env.WINDIR ?? 'C:\\Windows',
            WINDIR: process.env.WINDIR ?? process.env.SystemRoot ?? 'C:\\Windows',
            ComSpec: process.env.ComSpec ?? join(process.env.SystemRoot ?? process.env.WINDIR ?? 'C:\\Windows', 'System32', 'cmd.exe'),
          }
        : {};
      return {
        PATH: dirname(process.execPath),
        ...windowsEnvironment,
        HOME: home,
        USERPROFILE: home,
        XDG_CACHE_HOME: join(workspace, 'cache'),
        npm_config_cache: join(workspace, 'npm-cache'),
        npm_config_offline: 'true',
        npm_config_ignore_scripts: 'true',
        npm_config_audit: 'false',
        npm_config_fund: 'false',
        npm_config_update_notifier: 'false',
        npm_config_userconfig: join(workspace, 'npmrc'),
        npm_config_globalconfig: join(workspace, 'global-npmrc'),
      };
    }

    function packageTarget(nodeModules, packageName) {
      if (!PACKAGE_NAME_PATTERN.test(packageName)) {
        throw new Error('Runtime dependency has an unsafe package name: "' + packageName + '".');
      }
      return join(nodeModules, ...packageName.split('/'));
    }

    async function readPackageManifest(packageRoot, label) {
      let parsed;
      try {
        parsed = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
      } catch (error) {
        throw new Error(label + ' package manifest is not readable.', { cause: error });
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof parsed.name !== 'string') {
        throw new Error(label + ' package manifest is invalid.');
      }
      return parsed;
    }

    async function resolvePackageRoot(packageName, fromRoot, sourceNodeModules) {
      let resolvedEntry;
      try {
        resolvedEntry = createRequire(join(fromRoot, 'package.json')).resolve(packageName);
      } catch (error) {
        throw new Error('Unable to resolve runtime dependency "' + packageName + '" from its isolated source package.', { cause: error });
      }

      let candidate = dirname(resolvedEntry);
      while (isWithin(sourceNodeModules, candidate)) {
        try {
          const manifest = await readPackageManifest(candidate, 'Runtime dependency "' + packageName + '"');
          if (manifest.name === packageName) return candidate;
        } catch (error) {
          if (!(error instanceof Error)
            || (!error.message.includes('not readable') && !error.message.includes('is invalid'))) throw error;
        }
        const parent = dirname(candidate);
        if (parent === candidate) break;
        candidate = parent;
      }
      throw new Error('Resolved runtime dependency "' + packageName + '" escapes the installed node_modules tree.');
    }

    async function assertTemporaryTreeContained(root, label) {
      const realRoot = await realpath(root);
      const visit = async (path) => {
        const realPath = await realpath(path);
        if (!isWithin(realRoot, realPath)) {
          throw new Error(label + ' real path escapes its temporary workspace: "' + path + '".');
        }
        const details = await lstat(path);
        if (details.isSymbolicLink() || !details.isDirectory()) return;
        const entries = await readdir(path);
        await Promise.all(entries.map((entry) => visit(join(path, entry))));
      };
      await visit(root);
    }

    async function materializeExternalDependencyHost(rootDir, host) {
      const sourceNodeModules = join(rootDir, 'node_modules');
      const realSourceNodeModules = await realpath(sourceNodeModules);
      const hostNodeModules = join(host, 'node_modules');
      await mkdir(hostNodeModules, { recursive: true });
      const pending = EXTERNAL_RUNTIME_PACKAGES.map((name) => ({ name, sourceParent: rootDir, targetParent: hostNodeModules, optional: false }));
      const copied = new Set();

      while (pending.length > 0) {
        const dependency = pending.pop();
        if (!dependency) continue;
        const target = packageTarget(dependency.targetParent, dependency.name);
        let source;
        try {
          source = await resolvePackageRoot(dependency.name, dependency.sourceParent, realSourceNodeModules);
        } catch (error) {
          if (dependency.optional || dependency.sourceParent !== rootDir) continue;
          throw error;
        }
        const identity = JSON.stringify([source, target]);
        if (copied.has(identity)) continue;
        copied.add(identity);

        await mkdir(dirname(target), { recursive: true });
        await cp(source, target, { recursive: true, dereference: true, force: false, errorOnExist: false });
        const manifest = await readPackageManifest(target, 'Materialized runtime dependency "' + dependency.name + '"');
        for (const name of Object.keys(manifest.dependencies ?? {})) {
          pending.push({ name, sourceParent: source, targetParent: join(target, 'node_modules'), optional: false });
        }
        for (const name of Object.keys(manifest.optionalDependencies ?? {})) {
          pending.push({ name, sourceParent: source, targetParent: join(target, 'node_modules'), optional: true });
        }
      }

      await assertTemporaryTreeContained(host, 'Packed runtime dependency host');
    }

    function nativeTarCommand() {
      return process.platform === 'win32'
        ? join(process.env.SystemRoot ?? process.env.WINDIR ?? 'C:\\Windows', 'System32', 'tar.exe')
        : 'tar';
    }

const REQUIRED_ROLES = Object.freeze({
  opencode: Object.freeze(['plugin', 'instruction', 'runner']),
  codex: Object.freeze(['marketplace', 'plugin', 'mcp', 'hooks', 'runner', 'skill']),
  claude: Object.freeze(['marketplace', 'plugin', 'mcp', 'hooks', 'runner', 'skill']),
});
const DISCOVERY_ANCHORS = Object.freeze([
  { harness: 'opencode', role: 'plugin', path: 'integrations/opencode/plugin.mjs' },
  { harness: 'codex', role: 'marketplace', path: '.agents/plugins/marketplace.json' },
  { harness: 'claude', role: 'marketplace', path: '.claude-plugin/marketplace.json' },
]);

function packagePath(root, absolutePath) {
  return relative(root, absolutePath).split(sep).join('/');
}

function isWithin(root, target) {
  const pathFromRoot = relative(root, target);
  return pathFromRoot === '' || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..' && !isAbsolute(pathFromRoot));
}

export async function resolveContainedPath(rootDir, declaredPath, label, options = {}) {
  if (typeof declaredPath !== 'string' || declaredPath.length === 0 || declaredPath.includes('\0')) {
    throw new Error(`${label} has an unsafe empty or NUL-containing path.`);
  }
  if (posix.isAbsolute(declaredPath) || win32.isAbsolute(declaredPath) || declaredPath.startsWith('\\')) {
    throw new Error(`${label} declares an absolute path: "${declaredPath}".`);
  }
  if (declaredPath.includes('\\')) {
    throw new Error(`${label} has an unsafe non-canonical backslash path: "${declaredPath}".`);
  }
  const segments = declaredPath.split('/');
  if (options.requireCanonical && posix.normalize(declaredPath) !== declaredPath) {
    throw new Error(`${label} has a non-canonical path: "${declaredPath}".`);
  }
  if (segments.includes('..') && !options.allowContainedTraversal) {
    throw new Error(`${label} contains lexical traversal: "${declaredPath}".`);
  }

  const root = resolve(rootDir);
  const boundaryRoot = resolve(options.boundaryRoot ?? root);
  const target = resolve(root, declaredPath);
  if (!isWithin(boundaryRoot, target)) {
    throw new Error(`${label} lexical path escapes its root: "${declaredPath}".`);
  }

  let realRoot;
  let realTarget;
  try {
    [realRoot, realTarget] = await Promise.all([realpath(boundaryRoot), realpath(target)]);
  } catch (error) {
    throw new Error(`${label} target is missing: "${declaredPath}".`, { cause: error });
  }
  if (!isWithin(realRoot, realTarget)) {
    throw new Error(`${label} real path escapes its root: "${declaredPath}".`);
  }

  const targetStats = await stat(realTarget);
  if (options.kind === 'file' && !targetStats.isFile()) {
    throw new Error(`${label} target is not a file: "${declaredPath}".`);
  }
  if (options.kind === 'directory' && !targetStats.isDirectory()) {
    throw new Error(`${label} target is not a directory: "${declaredPath}".`);
  }
  return { targetPath: target, realTargetPath: realTarget };
}

function describeOwner(path) {
  if (path.startsWith('integrations/codex/') || path === '.agents/plugins/marketplace.json') {
    return 'codex';
  }
  if (path.startsWith('integrations/claude-code/') || path === '.claude-plugin/marketplace.json') {
    return 'claude';
  }
  return 'opencode';
}

async function collectFiles(root) {
  const files = [];

  async function visit(path) {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(path, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else {
        files.push(packagePath(root, entryPath));
      }
    }
  }

  await visit(join(root, 'integrations'));
  files.push('.agents/plugins/marketplace.json', '.claude-plugin/marketplace.json');
  return files.filter((path) => path !== INVENTORY_PATH).sort();
}

function parseInventory(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Integration inventory must be a JSON object.');
  }
  const inventory = value;
  if (inventory.schemaVersion !== 1 || !Array.isArray(inventory.assets)) {
    throw new Error('Integration inventory requires schemaVersion 1 and an assets array.');
  }

  const paths = new Set();
  const owners = new Set();
  for (const [index, asset] of inventory.assets.entries()) {
    if (!asset || typeof asset !== 'object' || Array.isArray(asset)) {
      throw new Error(`Inventory entry ${index} must be an object.`);
    }
    const keys = Object.keys(asset).sort();
    if (keys.join(',') !== 'harness,path,role') {
      throw new Error(`Inventory entry ${index} must contain exactly harness, role, and path.`);
    }
    if (!HARNESSES.has(asset.harness)) {
      throw new Error(`Invalid harness "${String(asset.harness)}" at inventory entry ${index}.`);
    }
    if (typeof asset.role !== 'string' || asset.role.length === 0) {
      throw new Error(`Inventory entry ${index} has an invalid role.`);
    }
    if (typeof asset.path !== 'string' || asset.path.length === 0) {
      throw new Error(`Inventory entry ${index} has an invalid path.`);
    }
    if (paths.has(asset.path)) {
      throw new Error(`Duplicate inventory path "${asset.path}".`);
    }
    paths.add(asset.path);
    const owner = `${asset.harness}:${asset.role}`;
    if (owners.has(owner)) {
      throw new Error(`Duplicate inventory owner/role "${owner}".`);
    }
    owners.add(owner);
  }
  return inventory;
}

async function validateInventoryPaths(root, inventory) {
  for (const [index, asset] of inventory.assets.entries()) {
    await resolveContainedPath(
      root,
      asset.path,
      `Inventory ${asset.harness}/${asset.role} entry ${index}`,
      { kind: 'file', requireCanonical: true },
    );
  }
}

export function getDisposableHarnessMatrix(inventory) {
  return [...new Set(inventory.assets.map((asset) => asset.harness))].sort();
}

export function validateDisposableHarnessMatrix(inventory) {
  const harnesses = getDisposableHarnessMatrix(inventory);
  if (harnesses.length !== HARNESSES.size || harnesses.some((harness) => !HARNESSES.has(harness))) {
    throw new Error('Integration inventory does not declare the supported disposable harness set.');
  }
}

function validateRequiredRoles(inventory) {
  for (const [harness, roles] of Object.entries(REQUIRED_ROLES)) {
    for (const role of roles) {
      if (!inventory.assets.some((asset) => asset.harness === harness && asset.role === role)) {
        throw new Error(`${harness} ${role} is missing from inventory.`);
      }
    }
  }
  for (const asset of inventory.assets) {
    if (!REQUIRED_ROLES[asset.harness].includes(asset.role)) {
      throw new Error(`${asset.harness} inventory declares unexpected role "${asset.role}".`);
    }
  }
}

export function getInventoryAsset(inventory, harness, role) {
  const asset = inventory.assets.find((candidate) => candidate.harness === harness && candidate.role === role);
  if (!asset) {
    throw new Error(`${harness} ${role} is missing from inventory.`);
  }
  return asset;
}

function validateDiscoveryAnchors(inventory) {
  for (const anchor of DISCOVERY_ANCHORS) {
    const asset = getInventoryAsset(inventory, anchor.harness, anchor.role);
    if (asset.path !== anchor.path) {
      throw new Error(
        `${anchor.harness} ${anchor.role} must remain at discovery anchor "${anchor.path}".`,
      );
    }
  }
}

async function validateNoExtraRuntimeAssets(root, inventory) {
  const inventoryPaths = new Set(inventory.assets.map((asset) => asset.path));
  for (const path of await collectFiles(root)) {
    if (!inventoryPaths.has(path)) {
      throw new Error(`${describeOwner(path)} extra required runtime asset "${path}" is absent from inventory.`);
    }
  }
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is not readable JSON.`, { cause: error });
  }
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function assertPluginIdentity(value, label) {
  if (value !== 'thoth-mem') {
    throw new Error(`Plugin identity mismatch in ${label}: expected "thoth-mem", received "${String(value)}".`);
  }
}

function assertExactVersion(value, packageVersion, label) {
  if (value !== packageVersion) {
    throw new Error(
      `Version mismatch in ${label}: "${String(value)}" does not equal package version "${packageVersion}".`,
    );
  }
}

function inventoryByPath(inventory) {
  return new Map(inventory.assets.map((asset) => [asset.path, asset]));
}

function assertDeclaredAsset(root, inventory, targetPath, harness, role) {
  const relativePath = packagePath(root, targetPath);
  const asset = inventoryByPath(inventory).get(relativePath);
  if (!asset) {
    throw new Error(`${harness} undeclared runtime asset "${relativePath}" (${role}).`);
  }
  if (asset.harness !== harness || asset.role !== role) {
    throw new Error(
      `${harness} runtime asset ownership mismatch for "${relativePath}": expected role ${role}.`,
    );
  }
}

async function resolveDeclaredAsset(
  root,
  declarationRoot,
  declaredPath,
  inventory,
  harness,
  role,
  label,
  options = {},
) {
  const resolved = await resolveContainedPath(declarationRoot, declaredPath, label, {
    kind: 'file',
    ...options,
  });
  assertDeclaredAsset(root, inventory, resolved.targetPath, harness, role);
  return resolved.targetPath;
}

async function validateHookManifest(root, pluginRoot, hooks, inventory, harness, rootVariable) {
  const hookGroups = requireObject(requireObject(hooks, `${harness} hooks`).hooks, `${harness} hooks.hooks`);
  const marker = `\${${rootVariable}}/`;
  for (const groups of Object.values(hookGroups)) {
    if (!Array.isArray(groups)) {
      throw new Error(`${harness} hook groups must be arrays.`);
    }
    for (const group of groups) {
      const commands = requireObject(group, `${harness} hook group`).hooks;
      if (!Array.isArray(commands)) {
        throw new Error(`${harness} hook commands must be arrays.`);
      }
      for (const commandEntry of commands) {
        const command = requireString(
          requireObject(commandEntry, `${harness} hook command`).command,
          `${harness} hook command`,
        );
        const markerIndex = command.indexOf(marker);
        if (markerIndex < 0) {
          throw new Error(`${harness} hook command does not use its plugin root.`);
        }
        const suffix = command.slice(markerIndex + marker.length);
        const runnerPath = suffix.split(/["\s]/, 1)[0];
        await resolveDeclaredAsset(
          root,
          pluginRoot,
          runnerPath,
          inventory,
          harness,
          'runner',
          `${harness} hook runner`,
        );
        if (!command.includes(`--harness ${harness}`)) {
          throw new Error(`${harness} hook command declares a mismatched harness identity.`);
        }
      }
    }
  }
}

async function validateOpenCodeDeclarations(root, inventory) {
  const pluginPath = join(root, getInventoryAsset(inventory, 'opencode', 'plugin').path);
  const source = await readFile(pluginPath, 'utf8');
  const declarations = [
    ...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g),
    ...source.matchAll(/new\s+URL\(\s*['"]([^'"]+)['"]/g),
  ].map((match) => match[1]).filter((path) => path.startsWith('.'));

  for (const declaredPath of declarations) {
    const role = declaredPath.endsWith('.md') ? 'instruction' : 'runner';
    await resolveDeclaredAsset(
      root,
      dirname(pluginPath),
      declaredPath,
      inventory,
      'opencode',
      role,
      `opencode ${role} declaration`,
      { boundaryRoot: root, allowContainedTraversal: true },
    );
  }
}

async function validateRuntimeDeclarations(root, inventory) {
  const packageManifest = requireObject(await readJson(join(root, 'package.json'), 'package.json'), 'package.json');
  assertPluginIdentity(packageManifest.name, 'package.json');
  const packageVersion = requireString(packageManifest.version, 'package.json version');

  const codexMarketplaceAsset = getInventoryAsset(inventory, 'codex', 'marketplace');
  const claudeMarketplaceAsset = getInventoryAsset(inventory, 'claude', 'marketplace');

  const codexMarketplace = requireObject(
    await readJson(join(root, codexMarketplaceAsset.path), 'Codex marketplace'),
    'Codex marketplace',
  );
  assertPluginIdentity(codexMarketplace.name, 'Codex marketplace');
  if (!Array.isArray(codexMarketplace.plugins) || codexMarketplace.plugins.length !== 1) {
    throw new Error('Codex marketplace must declare exactly one plugin.');
  }
  const codexMarketplacePlugin = requireObject(codexMarketplace.plugins[0], 'Codex marketplace plugin');
  assertPluginIdentity(codexMarketplacePlugin.name, 'Codex marketplace plugin');
  const codexSource = requireObject(codexMarketplacePlugin.source, 'Codex marketplace source');
  const codexRoot = (await resolveContainedPath(
    root,
    requireString(codexSource.path, 'Codex marketplace source path'),
    'Codex marketplace source',
    { kind: 'directory' },
  )).targetPath;

  const claudeMarketplace = requireObject(
    await readJson(join(root, claudeMarketplaceAsset.path), 'Claude marketplace'),
    'Claude marketplace',
  );
  assertPluginIdentity(claudeMarketplace.name, 'Claude marketplace');
  if (!Array.isArray(claudeMarketplace.plugins) || claudeMarketplace.plugins.length !== 1) {
    throw new Error('Claude marketplace must declare exactly one plugin.');
  }
  const claudeMarketplacePlugin = requireObject(claudeMarketplace.plugins[0], 'Claude marketplace plugin');
  assertPluginIdentity(claudeMarketplacePlugin.name, 'Claude marketplace plugin');
  assertExactVersion(claudeMarketplacePlugin.version, packageVersion, 'Claude marketplace plugin');
  const claudeRoot = (await resolveContainedPath(
    root,
    requireString(claudeMarketplacePlugin.source, 'Claude marketplace source'),
    'Claude marketplace source',
    { kind: 'directory' },
  )).targetPath;

  const codexPluginPath = join(codexRoot, '.codex-plugin', 'plugin.json');
  const codexPlugin = requireObject(await readJson(codexPluginPath, 'Codex plugin'), 'Codex plugin');
  assertPluginIdentity(codexPlugin.name, 'Codex plugin');
  assertExactVersion(codexPlugin.version, packageVersion, 'Codex plugin');
  assertDeclaredAsset(root, inventory, codexPluginPath, 'codex', 'plugin');

  const claudePluginPath = join(claudeRoot, '.claude-plugin', 'plugin.json');
  const claudePlugin = requireObject(await readJson(claudePluginPath, 'Claude plugin'), 'Claude plugin');
  assertPluginIdentity(claudePlugin.name, 'Claude plugin');
  assertExactVersion(claudePlugin.version, packageVersion, 'Claude plugin');
  assertDeclaredAsset(root, inventory, claudePluginPath, 'claude', 'plugin');

  const codexHooksPath = await resolveDeclaredAsset(
    root,
    codexRoot,
    requireString(codexPlugin.hooks, 'Codex plugin hooks path'),
    inventory,
    'codex',
    'hooks',
    'Codex plugin hooks',
  );
  const codexMcpPath = await resolveDeclaredAsset(
    root,
    codexRoot,
    requireString(codexPlugin.mcpServers, 'Codex plugin MCP path'),
    inventory,
    'codex',
    'mcp',
    'Codex plugin MCP',
  );
  const codexSkills = await resolveContainedPath(
    codexRoot,
    requireString(codexPlugin.skills, 'Codex plugin skills path'),
    'Codex plugin skills',
    { kind: 'directory' },
  );
  assertDeclaredAsset(
    root,
    inventory,
    join(codexSkills.targetPath, 'thoth-mem', 'SKILL.md'),
    'codex',
    'skill',
  );

  const codexMcp = requireObject(await readJson(codexMcpPath, 'Codex MCP'), 'Codex MCP');
  const codexServers = requireObject(codexMcp.mcpServers, 'Codex MCP mcpServers');
  if (Object.keys(codexServers).length !== 1) {
    throw new Error('Codex MCP mcpServers must declare exactly one server.');
  }
  assertPluginIdentity(Object.keys(codexServers)[0], 'Codex MCP server');
  const codexServer = requireObject(codexServers['thoth-mem'], 'Codex MCP server');
  if (codexServer.command !== 'thoth-mem') {
    throw new Error('Codex MCP server command must be "thoth-mem".');
  }
  if (
    !Array.isArray(codexServer.args)
    || codexServer.args.length !== 2
    || codexServer.args[0] !== 'mcp'
    || codexServer.args[1] !== '--no-http'
  ) {
    throw new Error('Codex MCP server args must be ["mcp", "--no-http"].');
  }

  for (const [relativePath, role] of [
    ['.mcp.json', 'mcp'],
    ['hooks/hooks.json', 'hooks'],
    ['skills/thoth-mem/SKILL.md', 'skill'],
  ]) {
    await resolveDeclaredAsset(
      root,
      claudeRoot,
      relativePath,
      inventory,
      'claude',
      role,
      `Claude ${role}`,
    );
  }
  const claudeMcpPath = join(claudeRoot, '.mcp.json');
  const claudeMcp = requireObject(await readJson(claudeMcpPath, 'Claude MCP'), 'Claude MCP');
  const claudeServers = requireObject(claudeMcp.mcpServers, 'Claude MCP servers');
  if (Object.keys(claudeServers).length !== 1) {
    throw new Error('Claude MCP descriptor must declare exactly one server.');
  }
  assertPluginIdentity(Object.keys(claudeServers)[0], 'Claude MCP server');

  const codexHooks = await readJson(codexHooksPath, 'Codex hooks');
  const claudeHooksPath = join(claudeRoot, 'hooks', 'hooks.json');
  const claudeHooks = await readJson(claudeHooksPath, 'Claude hooks');
  await validateHookManifest(root, codexRoot, codexHooks, inventory, 'codex', 'PLUGIN_ROOT');
  await validateHookManifest(root, claudeRoot, claudeHooks, inventory, 'claude', 'CLAUDE_PLUGIN_ROOT');
  await validateOpenCodeDeclarations(root, inventory);
}

export async function loadIntegrationInventory(rootDir = DEFAULT_ROOT) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(join(rootDir, INVENTORY_PATH), 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read integration inventory at "${INVENTORY_PATH}".`, { cause: error });
  }
  return parseInventory(parsed);
}

function normalizePackageFile(path) {
  if (typeof path !== 'string' || path.length === 0 || path.includes('\0')) {
    throw new Error('Package file list contains an invalid path.');
  }
  const withoutPrefix = path.startsWith('package/') ? path.slice('package/'.length) : path;
  if (
    posix.isAbsolute(withoutPrefix)
    || win32.isAbsolute(withoutPrefix)
    || withoutPrefix.includes('\\')
    || withoutPrefix.split('/').includes('..')
  ) {
    throw new Error(`Package file list contains an unsafe path: "${path}".`);
  }
  return withoutPrefix;
}

export function verifyPackageFileList(packageFiles, inventory) {
  const normalizedFiles = packageFiles.map(normalizePackageFile);
  const files = new Set(normalizedFiles);
  if (files.size !== normalizedFiles.length) {
    const duplicate = normalizedFiles.find((path, index) => normalizedFiles.indexOf(path) !== index);
    throw new Error(`Duplicate package file "${duplicate}".`);
  }
  if (!files.has(INVENTORY_PATH)) {
    throw new Error(`Tarball is missing canonical inventory "${INVENTORY_PATH}".`);
  }
  for (const asset of inventory.assets) {
    if (!files.has(asset.path)) {
      throw new Error(`Tarball is missing ${asset.harness} ${asset.role} asset "${asset.path}".`);
    }
  }
  const inventoryPaths = new Set(inventory.assets.map((asset) => asset.path));
  for (const path of files) {
    const isNativeAsset = path.startsWith('integrations/')
      || path === '.agents/plugins/marketplace.json'
      || path === '.claude-plugin/marketplace.json';
    if (isNativeAsset && path !== INVENTORY_PATH && !inventoryPaths.has(path)) {
      throw new Error(`${describeOwner(path)} extra required runtime asset "${path}" is absent from inventory.`);
    }
  }
}

export async function verifyCurrentPackageFileList(options = {}) {
  const rootDir = resolve(options.rootDir ?? DEFAULT_ROOT);
  const workspace = await mkdtemp(join(tmpdir(), 'thoth-package-list-'));
  try {
    const packOptions = {
      cwd: rootDir,
      encoding: 'utf8',
      windowsHide: true,
      timeout: NPM_PACK_TIMEOUT_MS,
      env: createStrictSubprocessEnvironment(workspace),
    };
    const packed = process.platform === 'win32'
      ? spawnSync('npm pack --dry-run --ignore-scripts --json', { ...packOptions, shell: true })
      : spawnSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], { ...packOptions, shell: false });
    if (packed.error?.code === 'ETIMEDOUT') {
      throw new Error('npm pack --dry-run timed out after ' + NPM_PACK_TIMEOUT_MS + 'ms while listing package files.');
    }
    if (packed.status !== 0) {
      throw new Error('Unable to list current package files. ' + (packed.stderr || packed.error?.message || ''));
    }
    let report;
    try { report = JSON.parse(packed.stdout); } catch (error) {
      throw new Error('Current package file list is not readable JSON.', { cause: error });
    }
    if (!Array.isArray(report) || report.length !== 1 || !Array.isArray(report[0]?.files)) {
      throw new Error('Current package dry-run must report exactly one package file list.');
    }
    return report[0].files.map((file) => file?.path);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

function packedRuntimeRequest(harness) {
  const context = { project: 'packed-verifier', directory: '/packed-verifier' };
  if (harness === 'opencode') {
    return {
      protocolVersion: 1,
      operation: 'prepare_delivery',
      harness,
      capabilityEvidence: {
        payloadMappingId: 'opencode-session-payload-v1',
        assetExecutionMarker: 'opencode-activation-v1',
        eventMappingId: 'opencode-session-start-v1',
        deliveryChannel: 'opencode-protocol-output',
        deliveryMappingId: 'opencode-recovery-injection-v1',
        behaviorEvidenceMappingId: 'opencode-plugin-init-mutation-v1',
        mutableOutputChannel: 'system',
      },
      event: {
        type: 'experimental.chat.system.transform',
        id: 'packed-verifier-opencode',
        sequence: 1,
        input: { model: { providerID: 'packed', modelID: 'verifier' }, sessionID: 'packed-opencode-session' },
      },
      context,
    };
  }
  const isCodex = harness === 'codex';
  return {
    protocolVersion: 1,
    harness,
    capabilityEvidence: {
      payloadMappingId: isCodex ? 'codex-session-payload-v1' : 'claude-code-session-payload-v1',
      assetExecutionMarker: isCodex ? 'codex-activation-v1' : 'claude-code-activation-v1',
      eventMappingId: isCodex ? 'codex-session-start-v1' : 'claude-code-session-start-v1',
      deliveryChannel: 'runner-stdout',
      deliveryMappingId: isCodex ? 'codex-recovery-injection-v1' : 'claude-code-recovery-injection-v1',
      behaviorEvidenceMappingId: isCodex ? 'codex-command-hook-payload-v1' : 'claude-code-command-hook-payload-v1',
    },
    event: {
      hook: 'SessionStart',
      id: 'packed-verifier-' + harness,
      timestamp: '2026-01-01T00:00:00.000Z',
      payload: isCodex
        ? { session_id: 'packed-' + harness + '-session', transcript_path: null, cwd: '/packed-verifier', hook_event_name: 'SessionStart', model: 'packed', permission_mode: 'default', source: 'startup' }
        : { session_id: 'packed-' + harness + '-session', transcript_path: '/packed-verifier.jsonl', cwd: '/packed-verifier', hook_event_name: 'SessionStart', source: 'startup' },
    },
  };
}

function nativePayload(harness, hook, source) {
  const common = { session_id: 'packed-asset-' + harness, transcript_path: harness === 'codex' ? null : '/packed-asset.jsonl', cwd: '/packed-assets', hook_event_name: hook };
  if (hook === 'PreCompact') return harness === 'codex' ? { ...common, model: 'packed', turn_id: 'asset-turn', trigger: 'auto' } : { ...common, trigger: 'auto', custom_instructions: '' };
  return harness === 'codex' ? { ...common, model: 'packed', permission_mode: 'default', source } : { ...common, source };
}

function requireNativeEnvelope(result, harness, phase) {
  if (result.error?.code === 'ETIMEDOUT') throw new Error('Packed ' + harness + ' ' + phase + ' asset probe timed out after ' + PACKED_RUNTIME_TIMEOUT_MS + 'ms.');
  if (result.status !== 0) throw new Error('Packed ' + harness + ' ' + phase + ' asset probe failed. ' + (result.stderr || result.error?.message || ''));
  return JSON.parse(result.stdout);
}

function verifyPackedNativeAssets(packageRoot, inventory, workspace, environment) {
  const opencodePlugin = join(packageRoot, getInventoryAsset(inventory, 'opencode', 'plugin').path);
  const opencodeProgram = "const m=await import(process.argv[1]);const logs=[];const p=await m.createOpenCodePlugin()({project:'packed-assets',directory:process.cwd(),client:{app:{log:async x=>logs.push(x)}}});const system=[];const context=[];await p['experimental.chat.system.transform']({model:{providerID:'packed',modelID:'asset'},sessionID:'packed-opencode'}, {system});await p['experimental.session.compacting']({sessionID:'packed-opencode'}, {context});process.stdout.write(JSON.stringify({system,context,logs}));";
  const opencode = spawnSync(process.execPath, ['--input-type=module', '--eval', opencodeProgram, pathToFileURL(opencodePlugin).href], { cwd: workspace, encoding: 'utf8', windowsHide: true, shell: false, timeout: PACKED_RUNTIME_TIMEOUT_MS, env: environment });
  if (opencode.error?.code === 'ETIMEDOUT') throw new Error('Packed OpenCode plugin probe timed out after ' + PACKED_RUNTIME_TIMEOUT_MS + 'ms.');
  if (opencode.status !== 0) throw new Error('Packed OpenCode plugin probe failed. ' + (opencode.stderr || opencode.error?.message || ''));
  const opencodeOutput = JSON.parse(opencode.stdout);
  if (!Array.isArray(opencodeOutput.system) || !Array.isArray(opencodeOutput.context) || opencodeOutput.system.length === 0 || opencodeOutput.context.length === 0 || JSON.stringify(opencodeOutput).includes('modelConsumption')) throw new Error('Packed OpenCode plugin did not emit verified startup and compact guidance safely.');

  for (const harness of getDisposableHarnessMatrix(inventory).filter((value) => value !== 'opencode')) {
    const runner = join(packageRoot, getInventoryAsset(inventory, harness, 'runner').path);
    const startup = requireNativeEnvelope(spawnSync(process.execPath, [runner, '--harness', harness, '--hook', 'SessionStart'], { cwd: workspace, input: JSON.stringify(nativePayload(harness, 'SessionStart', 'startup')), encoding: 'utf8', windowsHide: true, shell: false, timeout: PACKED_RUNTIME_TIMEOUT_MS, env: environment }), harness, 'startup');
    if (startup?.hookSpecificOutput?.hookEventName !== 'SessionStart' || typeof startup?.hookSpecificOutput?.additionalContext !== 'string' || Object.hasOwn(startup, 'modelConsumption')) throw new Error('Packed ' + harness + ' startup runner did not return the allowed native envelope.');
    const checkpoint = requireNativeEnvelope(spawnSync(process.execPath, [runner, '--harness', harness, '--hook', 'PreCompact'], { cwd: workspace, input: JSON.stringify(nativePayload(harness, 'PreCompact')), encoding: 'utf8', windowsHide: true, shell: false, timeout: PACKED_RUNTIME_TIMEOUT_MS, env: environment }), harness, 'PreCompact');
    if (Object.keys(checkpoint).length !== 0) throw new Error('Packed ' + harness + ' PreCompact runner must not emit recovery guidance before compact restart.');
    const compactStart = requireNativeEnvelope(spawnSync(process.execPath, [runner, '--harness', harness, '--hook', 'SessionStart'], { cwd: workspace, input: JSON.stringify(nativePayload(harness, 'SessionStart', 'compact')), encoding: 'utf8', windowsHide: true, shell: false, timeout: PACKED_RUNTIME_TIMEOUT_MS, env: environment }), harness, 'compact SessionStart');
    if (compactStart?.hookSpecificOutput?.hookEventName !== 'SessionStart' || typeof compactStart?.hookSpecificOutput?.additionalContext !== 'string' || Object.hasOwn(compactStart, 'modelConsumption')) throw new Error('Packed ' + harness + ' compact-start runner did not return the allowed native guidance envelope.');
  }
}

export async function verifyPackedRuntimeBehavior(options = {}) {
  const rootDir = resolve(options.rootDir ?? DEFAULT_ROOT);
  const inventory = await loadIntegrationInventory(rootDir);
  const workspace = await mkdtemp(join(tmpdir(), 'thoth-packed-verify-'));
  try {
    const host = join(workspace, 'host');
    const archiveDir = join(workspace, 'archive');
    const extractDir = join(workspace, 'extract');
    const packageRoot = join(host, 'node_modules', 'thoth-mem');
    const environment = createStrictSubprocessEnvironment(workspace);
    environment.THOTH_MEM_BIN = join(packageRoot, 'dist', 'index.js');
    environment.THOTH_DATA_DIR = join(workspace, 'data');
    await Promise.all([mkdir(host), mkdir(archiveDir), mkdir(extractDir)]);
        await materializeExternalDependencyHost(rootDir, host);
        await assertTemporaryTreeContained(host, 'Packed runtime dependency host');

    const packed = process.platform === 'win32'
      ? spawnSync('npm pack --ignore-scripts --offline --json --pack-destination "' + archiveDir + '"', { cwd: rootDir, encoding: 'utf8', windowsHide: true, shell: true, timeout: NPM_PACK_TIMEOUT_MS, env: environment })
      : spawnSync('npm', ['pack', '--ignore-scripts', '--offline', '--json', '--pack-destination', archiveDir], { cwd: rootDir, encoding: 'utf8', windowsHide: true, shell: false, timeout: NPM_PACK_TIMEOUT_MS, env: environment });
    if (packed.error?.code === 'ETIMEDOUT') throw new Error('npm pack timed out after ' + NPM_PACK_TIMEOUT_MS + 'ms while preparing packed runtime verification.');
    if (packed.status !== 0) throw new Error('Unable to prepare packed runtime verification. ' + (packed.stderr || packed.error?.message || ''));
    const archive = join(archiveDir, JSON.parse(packed.stdout)?.[0]?.filename ?? '');
    const extracted = spawnSync(nativeTarCommand(), ['-xzf', archive, '-C', extractDir], { cwd: host, encoding: 'utf8', windowsHide: true, timeout: PACKED_RUNTIME_TIMEOUT_MS, shell: false, env: environment });
    if (extracted.error?.code === 'ETIMEDOUT') throw new Error('Packed runtime archive extraction timed out after ' + PACKED_RUNTIME_TIMEOUT_MS + 'ms.');
    if (extracted.status !== 0) throw new Error('Unable to extract packed runtime verification archive. ' + (extracted.stderr || extracted.error?.message || ''));
    await mkdir(dirname(packageRoot), { recursive: true });
    await cp(join(extractDir, 'package'), packageRoot, { recursive: true, dereference: true });

    await assertTemporaryTreeContained(host, 'Packed runtime host');
    const entryPath = environment.THOTH_MEM_BIN;

    for (const harness of getDisposableHarnessMatrix(inventory)) {
      const result = spawnSync(process.execPath, [entryPath, 'integration-event'], { cwd: workspace, input: JSON.stringify(packedRuntimeRequest(harness)), encoding: 'utf8', windowsHide: true, timeout: PACKED_RUNTIME_TIMEOUT_MS, shell: false, env: environment });
      if (result.error?.code === 'ETIMEDOUT') throw new Error('Packed ' + harness + ' runtime probe timed out after ' + PACKED_RUNTIME_TIMEOUT_MS + 'ms.');
      if (result.status !== 0) throw new Error('Packed ' + harness + ' runtime probe failed. ' + (result.stderr || result.error?.message || ''));
      const response = JSON.parse(result.stdout);
      if (!['confirmed', 'degraded'].includes(response.outcome) || !response.hostOutputDirective || response.deliveryState?.memoryConfirmation !== 'confirmed' || response.deliveryState?.modelConsumption !== 'unproven') throw new Error('Packed ' + harness + ' runtime probe did not preserve the required real-memory outcome boundary.');
      await stat(join(environment.THOTH_DATA_DIR, 'thoth.db'));
    }
    verifyPackedNativeAssets(packageRoot, inventory, workspace, environment);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export async function verifyIntegrationPackage(options = {}) {
  const rootDir = resolve(options.rootDir ?? DEFAULT_ROOT);
  const inventory = await loadIntegrationInventory(rootDir);
  await validateInventoryPaths(rootDir, inventory);
  validateDisposableHarnessMatrix(inventory);
  validateRequiredRoles(inventory);
  validateDiscoveryAnchors(inventory);
  await validateRuntimeDeclarations(rootDir, inventory);
  await validateNoExtraRuntimeAssets(rootDir, inventory);
  if (options.packageFiles) {
    verifyPackageFileList(options.packageFiles, inventory);
  }
  if (options.verifyPackedRuntime === true) {
    await verifyPackedRuntimeBehavior({ rootDir });
  }
  return {
    assetCount: inventory.assets.length,
    harnesses: [...new Set(inventory.assets.map((asset) => asset.harness))].sort(),
  };
}

async function main() {
  const packageFiles = await verifyCurrentPackageFileList();
  const result = await verifyIntegrationPackage({ packageFiles, verifyPackedRuntime: true });
  process.stdout.write(
    `Verified ${result.assetCount} native integration assets for ${result.harnesses.join(', ')}.\n`,
  );
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (entryPath === import.meta.url) {
  await main();
}
