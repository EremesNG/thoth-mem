import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, parse } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { ThothConfig } from '../config.js';
import type { DegradedIdentityEntry, IdentityMetadata, IdentityResolution, IdentitySource } from './types.js';

export function normalizeExplicitString(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function isPlaceholderProject(value: string | null | undefined): boolean {
  const normalized = normalizeExplicitString(value);
  return normalized === undefined || normalized === 'unknown';
}

export function isManualFallbackSessionId(value: string | null | undefined): boolean {
  const normalized = normalizeExplicitString(value);
  return normalized !== undefined && normalized.startsWith('manual-save-');
}

export function fallbackManualSessionId(project: string | null | undefined): string {
  return `manual-save-${normalizeExplicitString(project) ?? 'unknown'}`;
}

function stripGitSuffix(value: string): string {
  return value.replace(/\.git$/i, '');
}

function tokenFromRemote(value: string): string {
  const trimmed = stripGitSuffix(value.trim());
  const slashParts = trimmed.split(/[\\/]/).filter(Boolean);
  const lastSlash = slashParts.at(-1);
  if (lastSlash && !lastSlash.includes('@')) {
    return lastSlash;
  }

  const scpMatch = trimmed.match(/:([^:]+)$/);
  if (scpMatch) {
    return basename(scpMatch[1]);
  }

  return trimmed;
}

export function normalizeIdentityToken(value: string | null | undefined): string | undefined {
  const trimmed = normalizeExplicitString(value);
  if (!trimmed) {
    return undefined;
  }

  const source = trimmed.includes('://') || trimmed.endsWith('.git') || /^[^/]+@[^:]+:.+/.test(trimmed)
    ? tokenFromRemote(trimmed)
    : trimmed;
  const withoutScopeMarker = source.replace(/^@/, '');
  const normalized = withoutScopeMarker
    .toLowerCase()
    .replace(/[\\/:\s]+/g, '-')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/[-_.]{2,}/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 80)
    .replace(/^[-_.]+|[-_.]+$/g, '');

  return normalized || undefined;
}

function findPackageName(cwd: string | undefined): string | undefined {
  if (!cwd) {
    return undefined;
  }

  let current = cwd;
  for (let i = 0; i < 8; i += 1) {
    const packagePath = `${current}/package.json`;
    if (existsSync(packagePath)) {
      try {
        const parsed = JSON.parse(readFileSync(packagePath, 'utf8')) as { name?: unknown };
        if (typeof parsed.name === 'string') {
          return normalizeIdentityToken(parsed.name);
        }
      } catch {
        return undefined;
      }
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return undefined;
}

function findGitIdentity(cwd: string | undefined): string | undefined {
  if (!cwd) {
    return undefined;
  }

  try {
    const remote = execFileSync('git', ['-C', cwd, 'config', '--get', 'remote.origin.url'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const fromRemote = normalizeIdentityToken(remote);
    if (fromRemote) {
      return fromRemote;
    }
  } catch {
    // Git metadata is optional.
  }

  try {
    const root = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return normalizeIdentityToken(basename(root.trim()));
  } catch {
    return undefined;
  }
}

function resolveProject(input: {
  project?: string | null;
  config?: Pick<ThothConfig, 'project'> | { project?: { default?: string | null } };
  cwd?: string | null;
  source?: IdentitySource;
  degraded: DegradedIdentityEntry[];
}): { project: string | null; sessionProject: string; source: IdentitySource } {
  const explicitProject = normalizeExplicitString(input.project);
  if (explicitProject) {
    return { project: explicitProject, sessionProject: explicitProject, source: 'explicit' };
  }

  if (input.project !== undefined && input.project !== null) {
    addDegraded(input.degraded, {
      field: 'project',
      reason: 'blank',
      source: input.source ?? 'fallback',
      value: null,
      fallback_value: null,
    });
  }

  if (input.source === 'legacy' || input.source === 'import') {
    return { project: null, sessionProject: 'unknown', source: 'fallback' };
  }

  const configProject = normalizeExplicitString(input.config?.project?.default);
  if (configProject) {
    return { project: configProject, sessionProject: configProject, source: 'config' };
  }

  const cwd = normalizeExplicitString(input.cwd) ?? normalizeExplicitString(process.cwd());
  const cwdProject = cwd ? normalizeIdentityToken(basename(cwd)) : undefined;
  if (cwdProject) {
    return { project: cwdProject, sessionProject: cwdProject, source: 'cwd' };
  }

  const gitProject = findGitIdentity(cwd);
  if (gitProject) {
    return { project: gitProject, sessionProject: gitProject, source: 'git' };
  }

  const packageProject = findPackageName(cwd);
  if (packageProject) {
    return { project: packageProject, sessionProject: packageProject, source: 'package' };
  }

  addDegraded(input.degraded, {
    field: 'project',
    reason: 'compatibility-default',
    source: input.source ?? 'fallback',
    value: null,
    fallback_value: 'unknown',
  });
  return { project: null, sessionProject: 'unknown', source: 'fallback' };
}

function addDegraded(
  degraded: DegradedIdentityEntry[],
  entry: DegradedIdentityEntry,
): void {
  degraded.push(entry);
}

export function resolveSaveIdentity(input: {
  session_id?: string | null;
  project?: string | null;
  requireSessionProject?: boolean;
  config?: Pick<ThothConfig, 'project'> | { project?: { default?: string | null } };
  cwd?: string | null;
  source?: DegradedIdentityEntry['source'];
}): IdentityResolution {
  const source = input.source ?? 'fallback';
  const explicitSessionId = normalizeExplicitString(input.session_id);
  const degraded: DegradedIdentityEntry[] = [];
  const projectResolution = resolveProject({
    project: input.project,
    config: input.config,
    cwd: input.cwd,
    source,
    degraded,
  });

  const sessionId = explicitSessionId ?? fallbackManualSessionId(projectResolution.sessionProject);
  const sessionProject = input.requireSessionProject ? projectResolution.sessionProject : projectResolution.project ?? 'unknown';
  const sessionSource: IdentityResolution['session_source'] = explicitSessionId
    ? isManualFallbackSessionId(explicitSessionId) ? 'placeholder' : 'explicit'
    : 'fallback';

  if (!explicitSessionId) {
    addDegraded(degraded, {
      field: 'session_id',
      reason: input.session_id === undefined || input.session_id === null ? 'missing' : 'blank',
      source,
      value: null,
      fallback_value: sessionId,
    });
  } else if (isManualFallbackSessionId(explicitSessionId)) {
    addDegraded(degraded, {
      field: 'session_id',
      reason: 'placeholder',
      source,
      value: explicitSessionId,
      fallback_value: explicitSessionId,
    });
  }

  if (input.requireSessionProject && projectResolution.project === null) {
    addDegraded(degraded, {
      field: 'project',
      reason: input.project !== undefined && input.project !== null ? 'blank' : 'schema-required',
      source,
      value: null,
      fallback_value: sessionProject,
    });
  } else if (input.requireSessionProject && projectResolution.project === 'unknown') {
    addDegraded(degraded, {
      field: 'project',
      reason: 'placeholder',
      source,
      value: projectResolution.project,
      fallback_value: sessionProject,
    });
  }

  return {
    session_id: sessionId,
    project: projectResolution.project,
    session_project: sessionProject,
    project_id: projectResolution.sessionProject,
    project_source: projectResolution.source,
    session_source: sessionSource,
    degraded,
  };
}

export function mergeIdentityMetadata(...entries: Array<IdentityMetadata | undefined>): IdentityMetadata | undefined {
  const degraded = new Map<string, DegradedIdentityEntry>();
  let synthesizedSessionId: string | undefined;
  let synthesizedProject: string | undefined;

  for (const metadata of entries) {
    if (!metadata) {
      continue;
    }

    synthesizedSessionId ??= metadata.synthesized_session_id;
    synthesizedProject ??= metadata.synthesized_project;

    for (const entry of metadata.degraded) {
      degraded.set(JSON.stringify(entry), entry);
    }
  }

  if (degraded.size === 0) {
    return undefined;
  }

  return {
    degraded: [...degraded.values()],
    ...(synthesizedSessionId ? { synthesized_session_id: synthesizedSessionId } : {}),
    ...(synthesizedProject ? { synthesized_project: synthesizedProject } : {}),
  };
}

export function metadataFromResolution(resolution: IdentityResolution): IdentityMetadata | undefined {
  if (resolution.degraded.length === 0) {
    return undefined;
  }

  return {
    degraded: resolution.degraded,
    ...(resolution.degraded.some((entry) => entry.field === 'session_id')
      ? { synthesized_session_id: resolution.session_id }
      : {}),
    ...(resolution.degraded.some((entry) => entry.field === 'project')
      ? { synthesized_project: resolution.session_project }
      : {}),
  };
}

export function formatIdentityWarning(metadata: IdentityMetadata | undefined): string {
  if (!metadata || metadata.degraded.length === 0) {
    return '';
  }

  const parts = metadata.degraded.map((entry) => (
    `${entry.field} ${entry.reason} -> ${entry.fallback_value ?? entry.value ?? 'null'}`
  ));

  return `Identity fallback: ${parts.join('; ')}.`;
}
