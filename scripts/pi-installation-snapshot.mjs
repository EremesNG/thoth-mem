import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';

// Pi's package manager owns settings.json plus npm/ and git/ installs;
// resource loading uses extensions/, skills/, prompts/ and themes/. Include
// package-manager inputs and thoth-mem config/receipts as isolation sentinels.
const installationPaths = [
  'settings.json', 'settings.jsonc',
  'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'yarn.lock', '.npmrc',
  'npm', 'node_modules', 'packages', 'git',
  'extensions', 'skills', 'prompts', 'themes',
  'config/thoth-mem', '.thoth-mem',
];

export function piInstallationSnapshot(root) {
  const files = {};
  const hash = createHash('sha256');
  const visit = (name) => {
    const path = join(root, name);
    const stat = lstatSync(path);
    const kind = stat.isDirectory() ? 'd' : stat.isSymbolicLink() ? 'l' : 'f';
    hash.update(`${kind}:${name}\0`);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path).sort()) visit(`${name}/${entry}`);
    } else if (stat.isFile() || stat.isSymbolicLink()) {
      const bytes = stat.isSymbolicLink() ? Buffer.from(readlinkSync(path)) : readFileSync(path);
      hash.update(bytes);
      files[name] = createHash('sha256').update(bytes).digest('hex');
    }
  };
  // Other live Pi projects continuously write sessions/, state/ and provider
  // runtime config. Guard installation-owned surfaces only, not the whole home.
  for (const name of installationPaths) if (existsSync(join(root, name))) visit(name);
  return { digest: hash.digest('hex'), files };
}
