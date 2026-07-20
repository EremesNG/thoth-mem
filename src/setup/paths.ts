import { homedir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SetupRequest } from './types.js';

export interface SetupRoots {
  homeDir: string;
  cwd: string;
  packageRoot: string;
  xdgConfigHome?: string;
  codexHome?: string;
}

export interface SetupPaths {
  targetRoot: string;
  configPath: string;
  configCandidates: string[];
  assetPath: string;
  pluginEntryPath: string;
  metadataPath: string;
  sourceAssetsPath: string;
  sourceSharedPath: string | null;
  sourceSkillPath: string | null;
}

function requireAbsolutePath(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || !isAbsolute(trimmed)) {
    throw new Error(`${label} must be an absolute path`);
  }
  return resolve(trimmed);
}

function packageRootFromModule(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  return basename(moduleDirectory) === 'setup'
    ? resolve(moduleDirectory, '..', '..')
    : resolve(moduleDirectory, '..');
}

export function getDefaultSetupRoots(): SetupRoots {
  return {
    homeDir: homedir(),
    cwd: process.cwd(),
    packageRoot: packageRootFromModule(),
    ...(process.env.XDG_CONFIG_HOME
      ? { xdgConfigHome: process.env.XDG_CONFIG_HOME }
      : {}),
    ...(process.env.CODEX_HOME ? { codexHome: process.env.CODEX_HOME } : {}),
  };
}

function resolveProjectRoot(request: SetupRequest, cwd: string): string {
  const projectPath = request.projectPath?.trim();
  if (!projectPath) {
    throw new Error('Project setup requires an explicit project path');
  }
  return isAbsolute(projectPath)
    ? resolve(projectPath)
    : resolve(cwd, projectPath);
}

function resolveSourceAssetsPath(
  harness: SetupRequest['harness'],
  packageRoot: string,
): string {
  if (harness === 'claude') {
    return join(packageRoot, '.claude-plugin');
  }
  if (harness === 'codex') {
    return join(packageRoot, 'plugin');
  }
  return join(packageRoot, 'integrations', harness);
}

export function resolveSetupPaths(
  request: SetupRequest,
  roots: SetupRoots,
): SetupPaths {
  const homeDir = requireAbsolutePath(roots.homeDir, 'Setup home directory');
  const cwd = requireAbsolutePath(roots.cwd, 'Setup working directory');
  const packageRoot = requireAbsolutePath(roots.packageRoot, 'Setup package root');

  let targetRoot: string;
  let configPath: string;
  let configCandidates: string[];
  let assetPath: string;
  let pluginEntryPath: string;

  if (request.scope === 'project') {
    const projectRoot = resolveProjectRoot(request, cwd);
    if (request.harness === 'opencode') {
      targetRoot = projectRoot;
      configPath = join(projectRoot, 'opencode.json');
      configCandidates = [configPath, join(projectRoot, 'opencode.jsonc')];
      assetPath = join(projectRoot, '.opencode', 'plugins', '.thoth-mem');
      pluginEntryPath = join(projectRoot, '.opencode', 'plugins', 'thoth-mem.js');
    } else {
      targetRoot = request.harness === 'claude'
        ? join(projectRoot, '.claude')
        : join(projectRoot, '.codex');
      configPath = request.harness === 'claude'
        ? join(targetRoot, 'settings.json')
        : join(targetRoot, 'config.toml');
      configCandidates = [configPath];
      assetPath = join(targetRoot, 'plugins', 'thoth-mem');
      pluginEntryPath = assetPath;
    }
  } else {
    if (request.projectPath !== undefined) {
      throw new Error('Global setup cannot include a project path');
    }

    if (request.harness === 'opencode') {
      const configHome = roots.xdgConfigHome
        ? requireAbsolutePath(roots.xdgConfigHome, 'XDG config home')
        : join(homeDir, '.config');
      targetRoot = join(configHome, 'opencode');
      configPath = join(targetRoot, 'opencode.json');
      configCandidates = [configPath, join(targetRoot, 'opencode.jsonc')];
      assetPath = join(targetRoot, 'plugins', '.thoth-mem');
      pluginEntryPath = join(targetRoot, 'plugins', 'thoth-mem.js');
    } else {
      targetRoot = request.harness === 'claude'
        ? join(homeDir, '.claude')
        : roots.codexHome
          ? requireAbsolutePath(roots.codexHome, 'Codex home')
          : join(homeDir, '.codex');
      configPath = request.harness === 'claude'
        ? join(targetRoot, 'settings.json')
        : join(targetRoot, 'config.toml');
      configCandidates = [configPath];
      assetPath = join(targetRoot, 'plugins', 'thoth-mem');
      pluginEntryPath = assetPath;
    }
  }

  return {
    targetRoot,
    configPath,
    configCandidates,
    assetPath,
    pluginEntryPath,
    metadataPath: join(assetPath, '.thoth-mem-managed.json'),
    sourceAssetsPath: resolveSourceAssetsPath(request.harness, packageRoot),
    sourceSharedPath: request.harness === 'opencode'
      ? join(packageRoot, 'integrations', 'shared')
      : null,
    sourceSkillPath: request.harness === 'opencode'
      ? join(packageRoot, 'plugin', 'skills', 'thoth-mem')
      : null,
  };
}
