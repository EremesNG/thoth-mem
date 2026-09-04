import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.env.THOTH_MEM_VERIFY_ROOT ?? resolve(import.meta.dirname, '..')); const inventory = JSON.parse(readFileSync(resolve(root, 'integrations/inventory.json'), 'utf8'));
const errors = [];
const expectedHarnesses = ['claude-code', 'codex', 'opencode', 'pi'];
if (JSON.stringify(Object.keys(inventory.harnesses ?? {}).sort()) !== JSON.stringify(expectedHarnesses)) errors.push('stale-inventory:harnesses');
for (const [harness, assets] of Object.entries(inventory.harnesses)) for (const asset of assets) { const path = resolve(root, 'integrations', harness, asset); if (!existsSync(path)) errors.push(`${harness}:${asset}`); }
for (const asset of inventory.publicDistribution?.assets ?? []) if (!existsSync(resolve(root, 'plugin', asset))) errors.push(`public-plugin:${asset}`);
const packageManifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
if (JSON.stringify(packageManifest.pi) !== JSON.stringify({ extensions: ['./dist/pi.js'], skills: ['./integrations/pi/skills/thoth-mem'] })) errors.push('stale-pi-manifest:resources');
if (!packageManifest.keywords?.includes('pi-package')) errors.push('stale-pi-manifest:keyword');
if (packageManifest.peerDependencies?.['@earendil-works/pi-coding-agent'] !== '*' || packageManifest.peerDependencies?.typebox !== '*') errors.push('stale-pi-manifest:peers');
if (packageManifest.devDependencies?.['@earendil-works/pi-coding-agent'] !== '0.84.4' || packageManifest.devDependencies?.typebox !== '1.3.7') errors.push('stale-pi-manifest:tested-versions');
const piEntry = resolve(root, 'dist/pi.js');
if (!existsSync(piEntry)) errors.push('missing-pi-entry:dist/pi.js');
else {
  const source = readFileSync(piEntry, 'utf8');
  if (/better-sqlite3|class MemoryService|sqlite\/migrations/iu.test(source)) errors.push('stale-pi-entry:embedded-runtime');
}
const canonicalSkill = resolve(root, 'plugin/skills/thoth-mem/SKILL.md');
const piSkill = resolve(root, 'integrations/pi/skills/thoth-mem/SKILL.md');
const canonicalReview = resolve(root, 'plugin/skills/thoth-mem/references/observation-review.md');
const piReview = resolve(root, 'integrations/pi/skills/thoth-mem/references/observation-review.md');
if (!existsSync(piSkill) || !readFileSync(piSkill).equals(readFileSync(canonicalSkill))) errors.push('stale-pi-skill:SKILL.md');
if (!existsSync(piReview) || !readFileSync(piReview).equals(readFileSync(canonicalReview))) errors.push('stale-pi-skill:observation-review.md');
const versioned = [
  ['plugin/runtime.json', JSON.parse(readFileSync(resolve(root, 'plugin/runtime.json'), 'utf8')).version],
  ['plugin/.codex-plugin/plugin.json', JSON.parse(readFileSync(resolve(root, 'plugin/.codex-plugin/plugin.json'), 'utf8')).version],
  ['plugin/.claude-plugin/plugin.json', JSON.parse(readFileSync(resolve(root, 'plugin/.claude-plugin/plugin.json'), 'utf8')).version],
];
for (const [path, version] of versioned) if (version !== packageManifest.version) errors.push(`stale-version:${path}:${version ?? 'missing'}`);
const publicMcp = JSON.parse(readFileSync(resolve(root, 'plugin/.mcp.json'), 'utf8')).mcpServers?.['thoth-mem'];
if (publicMcp?.cwd !== '.' || publicMcp?.command !== 'node' || JSON.stringify(publicMcp?.args) !== JSON.stringify(['./runners/public-runner.mjs', '--mcp'])) {
  errors.push('stale-runtime:plugin/.mcp.json');
}
const lock = JSON.parse(readFileSync(resolve(root, 'plugin/distribution-lock.json'), 'utf8'));
const expectedLockedPaths = [
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
if (errors.length) { process.stderr.write(`Missing or stale integration assets:\n${errors.join('\n')}\n`); process.exitCode = 1; } else process.stdout.write('Verified local and public OpenCode, Codex, Claude Code, and Pi plugin inventories.\n');
