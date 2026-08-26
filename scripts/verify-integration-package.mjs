import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.env.THOTH_MEM_VERIFY_ROOT ?? resolve(import.meta.dirname, '..')); const inventory = JSON.parse(readFileSync(resolve(root, 'integrations/inventory.json'), 'utf8'));
const errors = [];
for (const [harness, assets] of Object.entries(inventory.harnesses)) for (const asset of assets) { const path = resolve(root, 'integrations', harness, asset); if (!existsSync(path)) errors.push(`${harness}:${asset}`); }
for (const [harness, path] of Object.entries(inventory.publicDistribution?.marketplaces ?? {})) if (!existsSync(resolve(root, path))) errors.push(`public-marketplace:${harness}:${path}`);
for (const asset of inventory.publicDistribution?.assets ?? []) if (!existsSync(resolve(root, 'plugin', asset))) errors.push(`public-plugin:${asset}`);
const packageManifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const versioned = [
  ['plugin/runtime.json', JSON.parse(readFileSync(resolve(root, 'plugin/runtime.json'), 'utf8')).version],
  ['plugin/.codex-plugin/plugin.json', JSON.parse(readFileSync(resolve(root, 'plugin/.codex-plugin/plugin.json'), 'utf8')).version],
  ['plugin/.claude-plugin/plugin.json', JSON.parse(readFileSync(resolve(root, 'plugin/.claude-plugin/plugin.json'), 'utf8')).version],
  ['.claude-plugin/marketplace.json', JSON.parse(readFileSync(resolve(root, '.claude-plugin/marketplace.json'), 'utf8')).plugins?.[0]?.version],
];
for (const [path, version] of versioned) if (version !== packageManifest.version) errors.push(`stale-version:${path}:${version ?? 'missing'}`);
const publicMcp = JSON.parse(readFileSync(resolve(root, 'plugin/.mcp.json'), 'utf8')).mcpServers?.['thoth-mem'];
if (publicMcp?.cwd !== '.' || publicMcp?.command !== 'node' || JSON.stringify(publicMcp?.args) !== JSON.stringify(['./runners/public-runner.mjs', '--mcp'])) {
  errors.push('stale-runtime:plugin/.mcp.json');
}
const lock = JSON.parse(readFileSync(resolve(root, 'plugin/distribution-lock.json'), 'utf8'));
const expectedLockedPaths = [
  ...Object.values(inventory.publicDistribution.marketplaces),
  ...inventory.publicDistribution.assets
    .filter((path) => path !== 'distribution-lock.json')
    .map((path) => `plugin/${path}`),
].sort();
const lockedPaths = Object.keys(lock.assets ?? {}).sort();
if (lock.schemaVersion !== 1 || JSON.stringify(lockedPaths) !== JSON.stringify(expectedLockedPaths)) errors.push('stale-public-lock:asset-list');
for (const path of expectedLockedPaths) {
  if (!existsSync(resolve(root, path))) continue;
  const hash = createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');
  if (lock.assets?.[path] !== hash) errors.push(`stale-public-asset:${path}`);
}
if (errors.length) { process.stderr.write(`Missing or stale integration assets:\n${errors.join('\n')}\n`); process.exitCode = 1; } else process.stdout.write('Verified local and public Codex, Claude Code, and OpenCode plugin inventories.\n');
