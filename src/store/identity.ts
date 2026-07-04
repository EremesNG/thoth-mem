import type { DegradedIdentityEntry, IdentityMetadata, IdentityResolution } from './types.js';

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
  source?: DegradedIdentityEntry['source'];
}): IdentityResolution {
  const source = input.source ?? 'fallback';
  const explicitSessionId = normalizeExplicitString(input.session_id);
  const explicitProject = normalizeExplicitString(input.project);
  const degraded: DegradedIdentityEntry[] = [];

  const sessionId = explicitSessionId ?? fallbackManualSessionId(explicitProject);
  const sessionProject = explicitProject && !isPlaceholderProject(explicitProject)
    ? explicitProject
    : 'unknown';

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

  if (input.requireSessionProject && !explicitProject) {
    addDegraded(degraded, {
      field: 'project',
      reason: explicitProject === undefined && input.project !== undefined && input.project !== null ? 'blank' : 'schema-required',
      source,
      value: null,
      fallback_value: sessionProject,
    });
  } else if (input.requireSessionProject && explicitProject === 'unknown') {
    addDegraded(degraded, {
      field: 'project',
      reason: 'placeholder',
      source,
      value: explicitProject,
      fallback_value: sessionProject,
    });
  }

  return {
    session_id: sessionId,
    project: explicitProject ?? null,
    session_project: sessionProject,
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
