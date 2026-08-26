import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const writeJson = (path, value) => writeFileSync(resolve(root, path), `${JSON.stringify(value, null, 2)}\n`);
const hashFile = (path) => createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');
const packageManifest = readJson('package.json');
const version = packageManifest.version;

for (const path of ['plugin/.codex-plugin/plugin.json', 'plugin/.claude-plugin/plugin.json']) {
  const manifest = readJson(path);
  manifest.version = version;
  writeJson(path, manifest);
}

const marketplace = readJson('.claude-plugin/marketplace.json');
if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length !== 1) throw new Error('Claude marketplace must contain exactly one plugin.');
marketplace.plugins[0].version = version;
writeJson('.claude-plugin/marketplace.json', marketplace);

writeJson('plugin/runtime.json', { package: packageManifest.name, version });
const claudeMcp = readJson('plugin/.mcp.json');
claudeMcp.mcpServers['thoth-mem'] = { cwd: '.', command: 'node', args: ['./runners/public-runner.mjs', '--mcp'] };
writeJson('plugin/.mcp.json', claudeMcp);

for (const [source, destination] of [
  ['integrations/codex/skills/thoth-mem/references/codex.md', 'plugin/skills/thoth-mem/references/codex.md'],
  ['integrations/claude-code/skills/thoth-mem/references/claude-code.md', 'plugin/skills/thoth-mem/references/claude-code.md'],
]) copyFileSync(resolve(root, source), resolve(root, destination));

const inventory = readJson('integrations/inventory.json');
const lockedPaths = [
  ...Object.values(inventory.publicDistribution.marketplaces),
  ...inventory.publicDistribution.assets
    .filter((path) => path !== 'distribution-lock.json')
    .map((path) => `plugin/${path}`),
].sort();
writeJson('plugin/distribution-lock.json', {
  schemaVersion: 1,
  assets: Object.fromEntries(lockedPaths.map((path) => [path, hashFile(path)])),
});

process.stdout.write(`Synchronized public plugin distribution to ${packageManifest.name}@${version}.\n`);
