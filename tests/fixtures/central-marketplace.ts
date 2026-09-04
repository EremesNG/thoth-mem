import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface FixturePlugin {
  name: 'thoth-agents' | 'thoth-mem';
  version: string;
  repository: string;
  ref: string;
}

const registry = {
  schemaVersion: 1,
  marketplace: { name: 'thoth-plugins', displayName: 'Thoth Plugins' },
  plugins: [
    {
      name: 'thoth-agents',
      version: '0.3.11',
      repository: 'https://github.com/EremesNG/thoth-agents.git',
      ref: 'v0.3.11',
    },
    {
      name: 'thoth-mem',
      version: '0.4.13',
      repository: 'https://github.com/EremesNG/thoth-mem.git',
      ref: 'v0.4.13',
    },
  ] satisfies FixturePlugin[],
};

function descriptors(plugins: FixturePlugin[]) {
  return {
    codex: {
      name: 'thoth-plugins',
      plugins: plugins.map((plugin) => ({
        name: plugin.name,
        source: { source: 'git-subdir', url: plugin.repository, path: './plugin', ref: plugin.ref },
      })),
    },
    claude: {
      name: 'thoth-plugins',
      plugins: plugins.map((plugin) => ({
        name: plugin.name,
        version: plugin.version,
        source: { source: 'git-subdir', url: plugin.repository, path: 'plugin', ref: plugin.ref },
      })),
    },
  };
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

const catalogModule = `
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\\n');
}

function rendered(plugins) {
  return {
    codex: {
      name: 'thoth-plugins',
      plugins: plugins.map((plugin) => ({
        name: plugin.name,
        source: { source: 'git-subdir', url: plugin.repository, path: './plugin', ref: plugin.ref },
      })),
    },
    claude: {
      name: 'thoth-plugins',
      plugins: plugins.map((plugin) => ({
        name: plugin.name,
        version: plugin.version,
        source: { source: 'git-subdir', url: plugin.repository, path: 'plugin', ref: plugin.ref },
      })),
    },
  };
}

export function readRegistry(root) {
  return readJson(join(root, 'catalog', 'plugins.json'));
}

export function validateCatalogFiles(root) {
  const current = readRegistry(root);
  const names = current.plugins.map((plugin) => plugin.name);
  if (JSON.stringify(names) !== JSON.stringify(['thoth-agents', 'thoth-mem'])) {
    throw new Error('plugins must contain thoth-agents and thoth-mem exactly once');
  }
  for (const plugin of current.plugins) {
    if (plugin.ref !== 'v' + plugin.version) throw new Error(plugin.name + ' version/ref drift');
  }
  const expected = rendered(current.plugins);
  if (JSON.stringify(readJson(join(root, '.agents', 'plugins', 'marketplace.json'))) !== JSON.stringify(expected.codex)) {
    throw new Error('Codex marketplace descriptor is not synchronized');
  }
  if (JSON.stringify(readJson(join(root, '.claude-plugin', 'marketplace.json'))) !== JSON.stringify(expected.claude)) {
    throw new Error('Claude marketplace descriptor is not synchronized');
  }
  return current;
}

export function updateCatalogPlugin(root, name, version, repository) {
  const current = readRegistry(root);
  const selected = current.plugins.find((plugin) => plugin.name === name);
  if (!selected) throw new Error('Unknown plugin ' + name);
  selected.version = version;
  selected.ref = 'v' + version;
  if (repository) selected.repository = repository;
  const next = rendered(current.plugins);
  writeJson(join(root, 'catalog', 'plugins.json'), current);
  writeJson(join(root, '.agents', 'plugins', 'marketplace.json'), next.codex);
  writeJson(join(root, '.claude-plugin', 'marketplace.json'), next.claude);
  return current;
}
`;

const updateScript = `
import { updateCatalogPlugin } from './catalog.mjs';

function argument(name, required = true) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (required && (!value || value.startsWith('--'))) throw new Error('Missing required argument ' + name);
  return value;
}

const pluginName = argument('--plugin');
const version = argument('--version');
const repository = argument('--source-repository', false);
const updated = updateCatalogPlugin(process.cwd(), pluginName, version, repository);
console.log('Updated ' + pluginName + ' to ' + version + ' in ' + updated.plugins.length + ' marketplace entries.');
`;

const validateScript = `
import { validateCatalogFiles } from './catalog.mjs';
validateCatalogFiles(process.cwd());
console.log('Validated the registry and both marketplace descriptors.');
`;

const catalogTest = `
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCatalogFiles } from '../scripts/catalog.mjs';

test('keeps both independently pinned plugins synchronized', () => {
  const current = validateCatalogFiles(process.cwd());
  assert.deepEqual(current.plugins.map((plugin) => plugin.name), ['thoth-agents', 'thoth-mem']);
});
`;

export function seedCentralMarketplaceFixture(root: string): void {
  for (const directory of ['catalog', join('.agents', 'plugins'), '.claude-plugin', 'scripts', 'tests']) {
    mkdirSync(join(root, directory), { recursive: true });
  }

  const rendered = descriptors(registry.plugins);
  writeJson(join(root, 'catalog', 'plugins.json'), registry);
  writeJson(join(root, '.agents', 'plugins', 'marketplace.json'), rendered.codex);
  writeJson(join(root, '.claude-plugin', 'marketplace.json'), rendered.claude);
  writeFileSync(join(root, 'scripts', 'catalog.mjs'), catalogModule);
  writeFileSync(join(root, 'scripts', 'update-plugin.mjs'), updateScript);
  writeFileSync(join(root, 'scripts', 'validate.mjs'), validateScript);
  writeFileSync(join(root, 'tests', 'catalog.test.mjs'), catalogTest);
}
