import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import type { ProviderConfig } from '../config/runtime.js';

export interface McpRuntimeLaunch {
  command: string;
  args: string[];
  source: 'configured' | 'package' | 'npx';
  startupTimeoutMs: number;
}

export interface RuntimeResolverOptions {
  packageRoot: string;
  version: string;
  runtimeEntry?: string;
  provider?: Pick<ProviderConfig, 'runtimeEntry'> | null;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  localStartupTimeoutMs?: number;
  npxStartupTimeoutMs?: number;
  fs?: { isFile(path: string): boolean; readText(path: string): string };
  resolveBinding?: (packageRoot: string) => string;
}

const nativeFs = {
  isFile(path: string): boolean { try { return statSync(path).isFile(); } catch { return false; } },
  readText: (path: string): string => readFileSync(path, 'utf8'),
};

/** Invalid configured provenance is fatal, just as in public-runner.mjs; never silently fall back. */
export function resolveMcpRuntime(options: RuntimeResolverOptions): McpRuntimeLaunch {
  const fs = options.fs ?? nativeFs;
  const entry = options.runtimeEntry ?? options.provider?.runtimeEntry;
  if (entry !== undefined) {
    if (!isAbsolute(entry)) throw new Error('thoth-mem runtimeEntry must be an absolute path');
    if (!fs.isFile(entry)) throw new Error('thoth-mem runtimeEntry is not a regular file');
    let manifest: unknown;
    try { manifest = JSON.parse(fs.readText(join(dirname(dirname(entry)), 'package.json'))) as unknown; }
    catch { throw new Error('thoth-mem runtimeEntry package manifest is invalid'); }
    if (!manifest || typeof manifest !== 'object' || !('name' in manifest) || manifest.name !== 'thoth-mem'
      || !('version' in manifest) || manifest.version !== options.version) {
      throw new Error('thoth-mem runtimeEntry package identity does not match the plugin runtime');
    }
    return { command: 'node', args: [resolve(entry), 'mcp', '--no-http'], source: 'configured', startupTimeoutMs: options.localStartupTimeoutMs ?? 5_000 };
  }
  const packageEntry = resolve(options.packageRoot, 'dist/index.js');
  let bindingPresent = false;
  try {
    const binding = options.resolveBinding
      ? options.resolveBinding(options.packageRoot)
      : join(dirname(createRequire(join(resolve(options.packageRoot), 'package.json')).resolve('better-sqlite3/package.json')), 'build/Release/better_sqlite3.node');
    bindingPresent = fs.isFile(binding);
  } catch { /* An install without lifecycle scripts has no native binding. */ }
  if (fs.isFile(packageEntry) && bindingPresent) {
    return { command: 'node', args: [packageEntry, 'mcp', '--no-http'], source: 'package', startupTimeoutMs: options.localStartupTimeoutMs ?? 5_000 };
  }
  // StdioClientTransport uses cross-spawn, which performs the same cmd.exe
  // quoting/escaping as public-runner's windowsInvocation. Keep these args raw.
  const env = options.env ?? process.env;
  return {
    command: env.THOTH_MEM_PUBLIC_NPX_COMMAND ?? ((options.platform ?? process.platform) === 'win32' ? 'npx.cmd' : 'npx'),
    args: ['--yes', `thoth-mem@${options.version}`, 'mcp', '--no-http'],
    source: 'npx', startupTimeoutMs: options.npxStartupTimeoutMs ?? 120_000,
  };
}
