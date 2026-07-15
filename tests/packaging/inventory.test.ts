import { createHash, randomUUID } from 'node:crypto';
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

interface InventoryEntry {
  harness: string;
  role: string;
  path: string;
}

interface InventoryDocument {
  schemaVersion: 1;
  assets: InventoryEntry[];
}

interface VerificationResult {
  assetCount: number;
  harnesses: string[];
}

interface VerifierModule {
  verifyIntegrationPackage(options?: {
    rootDir?: string;
    packageFiles?: readonly string[];
  }): Promise<VerificationResult>;
  verifyPackageFileList(
    packageFiles: readonly string[],
    inventory: InventoryDocument,
  ): void;
}

interface SyncModule {
  syncIntegrationAssets(options?: { rootDir?: string }): Promise<{
    changedPaths: string[];
  }>;
}

interface BuildModule {
  runBuild(options: {
    bundle: () => Promise<void>;
    verify: () => Promise<void>;
  }): Promise<void>;
}

interface PackageManifest {
  name: string;
  version: string;
  files: string[];
  scripts: Record<string, string>;
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const verifierPath = join(repositoryRoot, 'scripts', 'verify-integration-package.mjs');
const syncPath = join(repositoryRoot, 'scripts', 'sync-integration-assets.mjs');
const buildPath = join(repositoryRoot, 'scripts', 'build.mjs');
const inventoryPath = join(repositoryRoot, 'integrations', 'inventory.json');

async function importVerifier(): Promise<VerifierModule> {
  await expect(readFile(verifierPath, 'utf8')).resolves.toContain('verifyIntegrationPackage');
  return import(`${pathToFileURL(verifierPath).href}?test=${randomUUID()}`) as Promise<VerifierModule>;
}

async function importSync(): Promise<SyncModule> {
  await expect(readFile(syncPath, 'utf8')).resolves.toContain('syncIntegrationAssets');
  return import(`${pathToFileURL(syncPath).href}?test=${randomUUID()}`) as Promise<SyncModule>;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function createPackageFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'thoth inventory fixture '));
  await cp(join(repositoryRoot, 'integrations'), join(root, 'integrations'), { recursive: true });
  await mkdir(join(root, '.agents', 'plugins'), { recursive: true });
  await mkdir(join(root, '.claude-plugin'), { recursive: true });
  await cp(join(repositoryRoot, '.agents', 'plugins', 'marketplace.json'), join(root, '.agents', 'plugins', 'marketplace.json'));
  await cp(join(repositoryRoot, '.claude-plugin', 'marketplace.json'), join(root, '.claude-plugin', 'marketplace.json'));
  await cp(join(repositoryRoot, 'package.json'), join(root, 'package.json'));
  return root;
}

async function withPackageFixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = await createPackageFixture();
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function hashFiles(root: string, paths: readonly string[]): Promise<string> {
  const hash = createHash('sha256');
  for (const path of [...paths].sort()) {
    hash.update(path);
    hash.update(await readFile(join(root, path)));
  }
  return hash.digest('hex');
}

async function listTypeScriptModules(root: string): Promise<string[]> {
  const modules: string[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        modules.push(relative(repositoryRoot, path).replaceAll('\\', '/'));
      }
    }
  }

  await visit(root);
  return modules.sort();
}

describe('canonical inventory', () => {
  it('documentation and codemap inventory follows native assets and transition boundaries', async () => {
    const inventory = await readJson<InventoryDocument>(inventoryPath);
    const [readme, rootCodemap, sourceCodemap, integrationModules, setupModules] = await Promise.all([
      readFile(join(repositoryRoot, 'README.md'), 'utf8'),
      readFile(join(repositoryRoot, 'codemap.md'), 'utf8'),
      readFile(join(repositoryRoot, 'src', 'codemap.md'), 'utf8'),
      listTypeScriptModules(join(repositoryRoot, 'src', 'integration')),
      listTypeScriptModules(join(repositoryRoot, 'src', 'setup')),
    ]);
    const repositoryDocumentation = `${readme}\n${rootCodemap}\n${sourceCodemap}`;

    for (const asset of inventory.assets) {
      expect(repositoryDocumentation, `missing documented native asset ${asset.path}`)
        .toContain(`\`${asset.path}\``);
    }
    for (const modulePath of [...integrationModules, ...setupModules]) {
      expect(sourceCodemap, `missing documented source module ${modulePath}`)
        .toContain(`\`${modulePath}\``);
    }
    for (const releaseModule of [
      'integrations/inventory.json',
      'scripts/sync-integration-assets.mjs',
      'scripts/verify-integration-package.mjs',
      'scripts/build.mjs',
    ]) {
      expect(rootCodemap, `missing documented release module ${releaseModule}`)
        .toContain(`\`${releaseModule}\``);
    }

    expect(readme).toContain('## Transitioning to native harness integration');
    expect(readme).toContain('### Manual MCP fallback');
    expect(readme).toContain('claude plugin marketplace add EremesNG/thoth-mem');
    expect(readme).toContain('claude plugin install thoth-mem');
    expect(readme).toMatch(/native setup is opt-in/i);
    expect(readme).toMatch(/global scope.*project scope/is);
    expect(readme).toMatch(/Engram.*thoth-agents.*other memory integration/is);
    expect(readme).toMatch(/warning only.*does not edit, disable, remove, or write to external repositories/is);

    const commandBlocks = readme.match(/```(?:bash|powershell)?\n[\s\S]*?```/g) ?? [];
    expect(commandBlocks.filter((block) => /Engram|thoth-agents/i.test(block))).toEqual([]);
  });

  it('canonical inventory owns the complete 15-asset topology exactly once', async () => {
    const verifier = await importVerifier();
    const inventory = await readJson<InventoryDocument>(inventoryPath);

    expect(inventory).toMatchObject({ schemaVersion: 1 });
    expect(inventory.assets).toHaveLength(15);
    expect(new Set(inventory.assets.map((asset) => asset.path)).size).toBe(15);
    expect(new Set(inventory.assets.map((asset) => asset.harness))).toEqual(
      new Set(['opencode', 'codex', 'claude']),
    );
    for (const asset of inventory.assets) {
      expect(asset).toEqual({
        harness: expect.stringMatching(/^(opencode|codex|claude)$/),
        role: expect.any(String),
        path: expect.any(String),
      });
      expect(asset.role).not.toBe('');
      expect(asset.path).not.toBe('');
    }

    await expect(verifier.verifyIntegrationPackage({ rootDir: repositoryRoot })).resolves.toEqual({
      assetCount: 15,
      harnesses: ['claude', 'codex', 'opencode'],
    });
  });

  it('canonical inventory rejects a flat Codex MCP descriptor', async () => {
    const verifier = await importVerifier();

    await withPackageFixture(async (root) => {
      const path = join(root, 'integrations', 'codex', '.mcp.json');
      await writeJson(path, {
        'thoth-mem': { command: 'thoth-mem', args: ['mcp', '--no-http'] },
      });

      await expect(verifier.verifyIntegrationPackage({ rootDir: root }))
        .rejects.toThrow(/mcpServers/i);
    });
  });

  it('canonical inventory rejects invalid owners, duplicates, missing declarations, and extra runtime assets', async () => {
    const verifier = await importVerifier();

    await withPackageFixture(async (root) => {
      const path = join(root, 'integrations', 'inventory.json');
      const inventory = await readJson<InventoryDocument>(path);
      inventory.assets[0] = { ...inventory.assets[0], harness: 'claude-code' };
      await writeJson(path, inventory);
      await expect(verifier.verifyIntegrationPackage({ rootDir: root }))
        .rejects.toThrow(/invalid harness.*claude-code/i);
    });

    await withPackageFixture(async (root) => {
      const path = join(root, 'integrations', 'inventory.json');
      const inventory = await readJson<InventoryDocument>(path);
      inventory.assets.push({ ...inventory.assets[0] });
      await writeJson(path, inventory);
      await expect(verifier.verifyIntegrationPackage({ rootDir: root }))
        .rejects.toThrow(/duplicate inventory path/i);
    });

    await withPackageFixture(async (root) => {
      const path = join(root, 'integrations', 'inventory.json');
      const inventory = await readJson<InventoryDocument>(path);
      const removed = inventory.assets.find((asset) => asset.harness === 'claude' && asset.role === 'skill');
      expect(removed).toBeDefined();
      inventory.assets = inventory.assets.filter((asset) => asset !== removed);
      await writeJson(path, inventory);
      await expect(verifier.verifyIntegrationPackage({ rootDir: root }))
        .rejects.toThrow(/claude.*skill.*missing from inventory/i);
    });

    await withPackageFixture(async (root) => {
      const hooksPath = join(root, 'integrations', 'codex', 'hooks', 'alternate.json');
      await writeJson(hooksPath, { hooks: {} });
      const pluginPath = join(root, 'integrations', 'codex', '.codex-plugin', 'plugin.json');
      const plugin = await readJson<Record<string, unknown>>(pluginPath);
      plugin.hooks = './hooks/alternate.json';
      await writeJson(pluginPath, plugin);
      await expect(verifier.verifyIntegrationPackage({ rootDir: root }))
        .rejects.toThrow(/codex.*undeclared runtime asset.*alternate\.json/i);
    });

    await withPackageFixture(async (root) => {
      const extraPath = join(root, 'integrations', 'codex', 'runners', 'extra-runner.mjs');
      await writeFile(extraPath, 'export {};\n', 'utf8');
      await expect(verifier.verifyIntegrationPackage({ rootDir: root }))
        .rejects.toThrow(/codex.*extra required runtime asset.*extra-runner\.mjs/i);
    });

    await withPackageFixture(async (root) => {
      const original = join(root, '.agents', 'plugins', 'marketplace.json');
      const relocated = join(root, 'integrations', 'codex', 'marketplace.json');
      await rename(original, relocated);
      const path = join(root, 'integrations', 'inventory.json');
      const inventory = await readJson<InventoryDocument>(path);
      const marketplace = inventory.assets.find(
        (asset) => asset.harness === 'codex' && asset.role === 'marketplace',
      );
      expect(marketplace).toBeDefined();
      marketplace!.path = 'integrations/codex/marketplace.json';
      await writeJson(path, inventory);
      await expect(verifier.verifyIntegrationPackage({ rootDir: root }))
        .rejects.toThrow(/codex marketplace.*discovery anchor/i);
    });
  });

  it('canonical inventory is the single path authority for relocatable declared assets', async () => {
    const verifier = await importVerifier();

    await withPackageFixture(async (root) => {
      const originalHooks = join(root, 'integrations', 'codex', 'hooks', 'hooks.json');
      const relocatedHooks = join(root, 'integrations', 'codex', 'lifecycle', 'hooks.json');
      await mkdir(dirname(relocatedHooks), { recursive: true });
      await rename(originalHooks, relocatedHooks);

      const pluginPath = join(root, 'integrations', 'codex', '.codex-plugin', 'plugin.json');
      const plugin = await readJson<Record<string, unknown>>(pluginPath);
      plugin.hooks = './lifecycle/hooks.json';
      await writeJson(pluginPath, plugin);

      const path = join(root, 'integrations', 'inventory.json');
      const inventory = await readJson<InventoryDocument>(path);
      const hooks = inventory.assets.find((asset) => asset.harness === 'codex' && asset.role === 'hooks');
      expect(hooks).toBeDefined();
      hooks!.path = 'integrations/codex/lifecycle/hooks.json';
      await writeJson(path, inventory);

      await expect(verifier.verifyIntegrationPackage({ rootDir: root })).resolves.toMatchObject({
        assetCount: 15,
      });
    });
  });
});

describe('version and path integrity', () => {
  it('version and path integrity synchronizes exact manifest versions and canonical runner copies idempotently', async () => {
    const sync = await importSync();
    const verifier = await importVerifier();

    await withPackageFixture(async (root) => {
      const synchronizedPaths = [
        'integrations/codex/.codex-plugin/plugin.json',
        '.claude-plugin/marketplace.json',
        'integrations/claude-code/.claude-plugin/plugin.json',
        'integrations/codex/runners/hook-runner.mjs',
        'integrations/claude-code/runners/hook-runner.mjs',
      ];
      const initialHash = await hashFiles(root, synchronizedPaths);
      await sync.syncIntegrationAssets({ rootDir: root });
      expect(await hashFiles(root, synchronizedPaths)).toBe(initialHash);
      const packageManifest = await readJson<PackageManifest>(join(root, 'package.json'));
      const codexPluginPath = join(root, 'integrations', 'codex', '.codex-plugin', 'plugin.json');
      const codexPlugin = await readJson<Record<string, unknown>>(codexPluginPath);
      codexPlugin.version = '0.0.0-stale';
      codexPlugin.preserved = { unrelated: true };
      await writeJson(codexPluginPath, codexPlugin);
      await writeFile(join(root, 'integrations', 'codex', 'runners', 'hook-runner.mjs'), 'stale\n', 'utf8');

      await sync.syncIntegrationAssets({ rootDir: root });
      const synchronizedPlugin = await readJson<Record<string, unknown>>(codexPluginPath);
      expect(synchronizedPlugin.version).toBe(packageManifest.version);
      expect(synchronizedPlugin.preserved).toEqual({ unrelated: true });
      const canonicalRunner = await readFile(join(root, 'integrations', 'shared', 'hook-runner.mjs'));
      expect(await readFile(join(root, 'integrations', 'codex', 'runners', 'hook-runner.mjs')))
        .toEqual(canonicalRunner);
      expect(await readFile(join(root, 'integrations', 'claude-code', 'runners', 'hook-runner.mjs')))
        .toEqual(canonicalRunner);
      const synchronizedHash = await hashFiles(root, synchronizedPaths);
      await sync.syncIntegrationAssets({ rootDir: root });
      expect(await hashFiles(root, synchronizedPaths)).toBe(synchronizedHash);
      await verifier.verifyIntegrationPackage({ rootDir: root });
    });
  });

  it('version and path integrity rejects stale, range, and mismatched plugin identities', async () => {
    const verifier = await importVerifier();
    const packageManifest = await readJson<PackageManifest>(join(repositoryRoot, 'package.json'));

    for (const version of ['0.0.0', `^${packageManifest.version}`]) {
      await withPackageFixture(async (root) => {
        const path = join(root, 'integrations', 'claude-code', '.claude-plugin', 'plugin.json');
        const manifest = await readJson<Record<string, unknown>>(path);
        manifest.version = version;
        await writeJson(path, manifest);
        await expect(verifier.verifyIntegrationPackage({ rootDir: root }))
          .rejects.toThrow(/version.*claude.*package/i);
      });
    }

    await withPackageFixture(async (root) => {
      const path = join(root, 'integrations', 'codex', '.codex-plugin', 'plugin.json');
      const manifest = await readJson<Record<string, unknown>>(path);
      manifest.name = 'not-thoth-mem';
      await writeJson(path, manifest);
      await expect(verifier.verifyIntegrationPackage({ rootDir: root }))
        .rejects.toThrow(/plugin identity.*not-thoth-mem/i);
    });
  });

  it('version and path integrity rejects absolute, traversal, missing, and link-escaping declarations before use', async () => {
    const verifier = await importVerifier();
    const unsafePaths = [
      '/outside/integrations/codex',
      'C:\\outside\\integrations\\codex',
      '../outside/integrations/codex',
      '..\\outside\\integrations\\codex',
      './integrations/missing-codex',
    ];

    for (const unsafePath of unsafePaths) {
      await withPackageFixture(async (root) => {
        const path = join(root, '.agents', 'plugins', 'marketplace.json');
        const marketplace = await readJson<{
          plugins: Array<{ source: { path: string } }>;
        }>(path);
        marketplace.plugins[0].source.path = unsafePath;
        await writeJson(path, marketplace);
        await expect(verifier.verifyIntegrationPackage({ rootDir: root }))
          .rejects.toThrow(/unsafe|absolute|traversal|missing/i);
      });
    }

    for (const unsafePath of unsafePaths.slice(0, 4)) {
      await withPackageFixture(async (root) => {
        const path = join(root, 'integrations', 'inventory.json');
        const inventory = await readJson<InventoryDocument>(path);
        inventory.assets[0].path = unsafePath;
        await writeJson(path, inventory);
        await expect(verifier.verifyIntegrationPackage({ rootDir: root }))
          .rejects.toThrow(/inventory.*unsafe|inventory.*absolute|inventory.*traversal/i);
      });
    }

    for (const nonCanonicalPath of [
      'integrations/./opencode/plugin.mjs',
      'integrations//opencode/plugin.mjs',
    ]) {
      await withPackageFixture(async (root) => {
        const path = join(root, 'integrations', 'inventory.json');
        const inventory = await readJson<InventoryDocument>(path);
        inventory.assets[0].path = nonCanonicalPath;
        await writeJson(path, inventory);
        await expect(verifier.verifyIntegrationPackage({ rootDir: root }))
          .rejects.toThrow(/inventory.*non-canonical/i);
      });
    }

    await withPackageFixture(async (root) => {
      const outside = await mkdtemp(join(tmpdir(), 'thoth inventory outside '));
      const link = join(root, 'integrations', 'codex-link');
      try {
        await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
        const path = join(root, '.agents', 'plugins', 'marketplace.json');
        const marketplace = await readJson<{
          plugins: Array<{ source: { path: string } }>;
        }>(path);
        marketplace.plugins[0].source.path = './integrations/codex-link';
        await writeJson(path, marketplace);
        await expect(verifier.verifyIntegrationPackage({ rootDir: root }))
          .rejects.toThrow(/real path.*escapes/i);
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });
  });
});

describe('package publication allowlist', () => {
  it('package publication allowlist contains every native asset in the script-disabled dry-run tarball list', async () => {
    const verifier = await importVerifier();
    const manifest = await readJson<PackageManifest>(join(repositoryRoot, 'package.json'));
    expect(manifest.files).toEqual(expect.arrayContaining([
      'integrations',
      '.agents/plugins/marketplace.json',
      '.claude-plugin/marketplace.json',
    ]));
    expect(manifest.scripts).toMatchObject({
      'integration:sync': 'node scripts/sync-integration-assets.mjs',
      'integration:verify': 'node scripts/verify-integration-package.mjs',
    });

    const packOptions = {
      cwd: repositoryRoot,
      encoding: 'utf8' as const,
      maxBuffer: 10 * 1024 * 1024,
    };
    const packed = process.platform === 'win32'
      ? spawnSync('npm pack --dry-run --ignore-scripts --json', {
          ...packOptions,
          shell: true,
        })
      : spawnSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], {
          ...packOptions,
          shell: false,
        });
    expect(packed.status, packed.error?.message ?? packed.stderr).toBe(0);
    const report = JSON.parse(packed.stdout) as Array<{
      files: Array<{ path: string }>;
    }>;
    const packageFiles = report[0].files.map((file) => file.path);
    const inventory = await readJson<InventoryDocument>(inventoryPath);
    expect(() => verifier.verifyPackageFileList(packageFiles, inventory)).not.toThrow();
    expect(packageFiles).toContain('integrations/inventory.json');
    expect(() => verifier.verifyPackageFileList(
      [...packageFiles, packageFiles[0]],
      inventory,
    )).toThrow(/duplicate package file/i);
    expect(() => verifier.verifyPackageFileList(
      [...packageFiles, 'integrations/codex/extra-runtime.mjs'],
      inventory,
    )).toThrow(/extra required runtime asset/i);
  });
});

describe('build release verification', () => {
  it('build release verification always runs the read-only verifier after bundling', async () => {
    const source = await readFile(buildPath, 'utf8');
    expect(source).toContain('export async function runBuild');
    const build = await import(`${pathToFileURL(buildPath).href}?test=${randomUUID()}`) as BuildModule;
    const order: string[] = [];

    await build.runBuild({
      bundle: async () => {
        order.push('bundle');
      },
      verify: async () => {
        order.push('verify');
      },
    });

    expect(order).toEqual(['bundle', 'verify']);
  });

  it('build release verification rejects stale fixtures without mutating their source assets', async () => {
    const verifier = await importVerifier();

    await withPackageFixture(async (root) => {
      const inventory = await readJson<InventoryDocument>(join(root, 'integrations', 'inventory.json'));
      const trackedPaths = [
        'package.json',
        '.agents/plugins/marketplace.json',
        '.claude-plugin/marketplace.json',
        'integrations/inventory.json',
        ...inventory.assets.map((asset) => asset.path),
      ];
      const pluginPath = join(root, 'integrations', 'codex', '.codex-plugin', 'plugin.json');
      const plugin = await readJson<Record<string, unknown>>(pluginPath);
      plugin.version = 'stale';
      await writeJson(pluginPath, plugin);
      const before = await hashFiles(root, trackedPaths);

      await expect(verifier.verifyIntegrationPackage({ rootDir: root }))
        .rejects.toThrow(/version/i);
      expect(await hashFiles(root, trackedPaths)).toBe(before);
    });
  });
});
