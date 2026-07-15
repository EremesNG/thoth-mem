// @ts-check

import {
  readFile,
  readdir,
  realpath,
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
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(SCRIPT_DIRECTORY, '..');
const INVENTORY_PATH = 'integrations/inventory.json';
const HARNESSES = new Set(['opencode', 'codex', 'claude']);

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

export async function verifyIntegrationPackage(options = {}) {
  const rootDir = resolve(options.rootDir ?? DEFAULT_ROOT);
  const inventory = await loadIntegrationInventory(rootDir);
  await validateInventoryPaths(rootDir, inventory);
  validateRequiredRoles(inventory);
  validateDiscoveryAnchors(inventory);
  await validateRuntimeDeclarations(rootDir, inventory);
  await validateNoExtraRuntimeAssets(rootDir, inventory);
  if (options.packageFiles) {
    verifyPackageFileList(options.packageFiles, inventory);
  }
  return {
    assetCount: inventory.assets.length,
    harnesses: [...new Set(inventory.assets.map((asset) => asset.harness))].sort(),
  };
}

async function main() {
  const result = await verifyIntegrationPackage();
  process.stdout.write(
    `Verified ${result.assetCount} native integration assets for ${result.harnesses.join(', ')}.\n`,
  );
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (entryPath === import.meta.url) {
  await main();
}
