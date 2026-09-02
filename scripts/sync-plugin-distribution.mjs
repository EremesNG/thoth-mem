import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const hashFile = (path) => createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');
const writeIfChanged = (path, content) => {
  const destination = resolve(root, path);
  if (!existsSync(destination) || readFileSync(destination, 'utf8') !== content) writeFileSync(destination, content);
};
const writeJson = (path, value) => writeIfChanged(path, `${JSON.stringify(value, null, 2)}\n`);
const copyIfChanged = (source, destination) => {
  const sourcePath = resolve(root, source);
  const destinationPath = resolve(root, destination);
  if (!existsSync(destinationPath) || !readFileSync(sourcePath).equals(readFileSync(destinationPath))) copyFileSync(sourcePath, destinationPath);
};
const packageManifest = readJson('package.json');
const version = packageManifest.version;

for (const path of ['plugin/.codex-plugin/plugin.json', 'plugin/.claude-plugin/plugin.json']) {
  const manifest = readJson(path);
  manifest.version = version;
  writeJson(path, manifest);
}

writeJson('plugin/runtime.json', { package: packageManifest.name, version });
const claudeMcp = readJson('plugin/.mcp.json');
claudeMcp.mcpServers['thoth-mem'] = { cwd: '.', command: 'node', args: ['./runners/public-runner.mjs', '--mcp'] };
writeJson('plugin/.mcp.json', claudeMcp);

for (const destination of [
  'integrations/opencode/skills/thoth-mem/SKILL.md',
  'integrations/codex/skills/thoth-mem/SKILL.md',
  'integrations/claude-code/skills/thoth-mem/SKILL.md',
]) copyIfChanged('plugin/skills/thoth-mem/SKILL.md', destination);

for (const destination of [
  'integrations/opencode/skills/thoth-mem/references/observation-review.md',
  'integrations/codex/skills/thoth-mem/references/observation-review.md',
  'integrations/claude-code/skills/thoth-mem/references/observation-review.md',
]) copyIfChanged('plugin/skills/thoth-mem/references/observation-review.md', destination);

for (const [source, destination] of [
  ['integrations/codex/skills/thoth-mem/references/codex.md', 'plugin/skills/thoth-mem/references/codex.md'],
  ['integrations/claude-code/skills/thoth-mem/references/claude-code.md', 'plugin/skills/thoth-mem/references/claude-code.md'],
]) copyIfChanged(source, destination);

const inventory = readJson('integrations/inventory.json');
const lockedPaths = [
  ...inventory.publicDistribution.assets
    .filter((path) => path !== 'distribution-lock.json')
    .map((path) => `plugin/${path}`),
].sort();
writeJson('plugin/distribution-lock.json', {
  schemaVersion: 1,
  assets: Object.fromEntries(lockedPaths.map((path) => [path, hashFile(path)])),
});

process.stdout.write(`Synchronized public plugin distribution to ${packageManifest.name}@${version}.\n`);
