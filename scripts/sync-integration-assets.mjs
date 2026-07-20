// @ts-check

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  getInventoryAsset,
  loadIntegrationInventory,
  validateDisposableHarnessMatrix,
  resolveContainedPath,
} from './verify-integration-package.mjs';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(SCRIPT_DIRECTORY, '..');
const SKILL_REFERENCES = Object.freeze([
  { file: 'codex.md', role: 'skill-reference-codex' },
  { file: 'claude-code.md', role: 'skill-reference-claude-code' },
  { file: 'opencode.md', role: 'skill-reference-opencode' },
]);

function packagePath(root, path) {
  return relative(root, path).split(sep).join('/');
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is not readable JSON.`, { cause: error });
  }
}

async function writeIfChanged(path, content, changedPaths, root) {
  const current = await readFile(path);
  const next = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (current.equals(next)) {
    return;
  }
  await writeFile(path, next);
  changedPaths.push(packagePath(root, path));
}

export async function syncIntegrationAssets(options = {}) {
  const root = resolve(options.rootDir ?? DEFAULT_ROOT);
  const packageManifestPath = (await resolveContainedPath(root, 'package.json', 'package.json', { kind: 'file' })).targetPath;
  const packageManifest = await readJson(packageManifestPath, 'package.json');
  if (typeof packageManifest.version !== 'string' || packageManifest.version.length === 0) {
    throw new Error('package.json version must be a non-empty string.');
  }
  const changedPaths = [];
  const inventory = await loadIntegrationInventory(root);
  validateDisposableHarnessMatrix(inventory);
  const versionedAssets = [
    getInventoryAsset(inventory, 'codex', 'plugin'),
    getInventoryAsset(inventory, 'claude', 'marketplace'),
    getInventoryAsset(inventory, 'claude', 'plugin'),
  ];

  for (const asset of versionedAssets) {
    const manifestPath = asset.path;
    const path = (await resolveContainedPath(root, manifestPath, manifestPath, { kind: 'file' })).targetPath;
    const manifest = await readJson(path, manifestPath);
    let currentVersion;
    if (asset.harness === 'claude' && asset.role === 'marketplace') {
      if (!Array.isArray(manifest.plugins) || manifest.plugins.length !== 1) {
        throw new Error('Claude marketplace must declare exactly one plugin before version synchronization.');
      }
      currentVersion = manifest.plugins[0].version;
      manifest.plugins[0].version = packageManifest.version;
    } else {
      currentVersion = manifest.version;
      manifest.version = packageManifest.version;
    }
    if (currentVersion === packageManifest.version) {
      continue;
    }
    await writeIfChanged(path, `${JSON.stringify(manifest, null, 2)}\n`, changedPaths, root);
  }

  const canonicalRunnerPath = (await resolveContainedPath(
    root,
    getInventoryAsset(inventory, 'opencode', 'runner').path,
    'canonical hook runner',
    { kind: 'file' },
  )).targetPath;
  const canonicalRunner = await readFile(canonicalRunnerPath);
  const sharedRunnerPath = getInventoryAsset(inventory, 'shared', 'runner').path;
  const sharedRunner = (await resolveContainedPath(root, sharedRunnerPath, sharedRunnerPath, { kind: 'file' })).targetPath;
  await writeIfChanged(sharedRunner, canonicalRunner, changedPaths, root);

  const canonicalSkillPath = 'skills/thoth-mem/SKILL.md';
  const canonicalSkill = await readFile((await resolveContainedPath(
    root,
    canonicalSkillPath,
    'canonical thoth-mem skill',
    { kind: 'file' },
  )).targetPath);
  const sharedSkillPath = getInventoryAsset(inventory, 'shared', 'skill').path;
  const sharedSkill = (await resolveContainedPath(root, sharedSkillPath, sharedSkillPath, { kind: 'file' })).targetPath;
  await writeIfChanged(sharedSkill, canonicalSkill, changedPaths, root);

  for (const reference of SKILL_REFERENCES) {
    const canonicalReferencePath = `skills/thoth-mem/references/${reference.file}`;
    const canonicalReference = await readFile((await resolveContainedPath(
      root,
      canonicalReferencePath,
      `canonical thoth-mem ${reference.file} reference`,
      { kind: 'file' },
    )).targetPath);
    const sharedReferencePath = getInventoryAsset(inventory, 'shared', reference.role).path;
    const sharedReference = (await resolveContainedPath(
      root,
      sharedReferencePath,
      sharedReferencePath,
      { kind: 'file' },
    )).targetPath;
    await writeIfChanged(sharedReference, canonicalReference, changedPaths, root);
  }

  return { changedPaths };
}

async function main() {
  const result = await syncIntegrationAssets();
  const summary = result.changedPaths.length === 0
    ? 'Integration assets are already synchronized.'
    : `Synchronized ${result.changedPaths.length} integration asset(s): ${result.changedPaths.join(', ')}.`;
  process.stdout.write(`${summary}\n`);
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (entryPath === import.meta.url) {
  await main();
}
