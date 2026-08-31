import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRepositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function defaultCachebuster() {
  return new Date().toISOString().replace(/[-:.]/gu, '');
}

export function syncCodexLocalPlugin({
  repositoryRoot = defaultRepositoryRoot,
  homeDirectory = homedir(),
  cachebuster = defaultCachebuster(),
} = {}) {
  const checkout = resolve(repositoryRoot);
  const pluginSource = join(checkout, 'plugin');
  const runtimeEntry = join(checkout, 'dist', 'index.js');
  const packageManifest = readJson(join(checkout, 'package.json'));
  if (packageManifest.name !== 'thoth-mem' || typeof packageManifest.version !== 'string' || !/^\d+\.\d+\.\d+$/u.test(packageManifest.version)) {
    throw new Error('The checkout package identity is invalid.');
  }
  if (!existsSync(pluginSource) || !statSync(pluginSource).isDirectory()) throw new Error('The checkout plugin directory is missing.');
  if (!existsSync(runtimeEntry) || !statSync(runtimeEntry).isFile()) throw new Error('Build thoth-mem before syncing the local plugin.');
  if (typeof cachebuster !== 'string' || !/^[0-9A-Za-z-]+$/u.test(cachebuster)) throw new Error('The local plugin cachebuster is invalid.');

  const pluginTarget = resolve(homeDirectory, 'plugins', 'thoth-mem');
  mkdirSync(dirname(pluginTarget), { recursive: true });
  rmSync(pluginTarget, { recursive: true, force: true });
  cpSync(pluginSource, pluginTarget, { recursive: true });

  const version = `${packageManifest.version}+codex.local-${cachebuster}`;
  for (const relativePath of ['.codex-plugin/plugin.json', '.claude-plugin/plugin.json']) {
    const manifestPath = join(pluginTarget, relativePath);
    const manifest = readJson(manifestPath);
    manifest.version = version;
    writeJson(manifestPath, manifest);
  }
  writeJson(join(pluginTarget, 'runtime.json'), {
    package: packageManifest.name,
    version: packageManifest.version,
    entry: runtimeEntry,
  });
  writeJson(join(pluginTarget, '.mcp.json'), {
    mcpServers: {
      'thoth-mem': {
        cwd: checkout,
        command: process.execPath,
        args: [runtimeEntry, 'mcp', '--no-http'],
      },
    },
  });

  return { pluginTarget, runtimeEntry, version };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = syncCodexLocalPlugin();
    process.stdout.write(`Synced ${result.version} to ${result.pluginTarget}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
