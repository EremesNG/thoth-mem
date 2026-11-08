import { createHash } from 'node:crypto';

import { sanitizePrivateContent } from '../../memory-core/privacy.js';

const IDENTITY_SCHEMA = 'thoth-mem.opencode.identity.v2';
const MAX_IDENTITY_CODE_POINTS = 128;
const MAX_IDENTITY_PARENT_DEPTH = 16;

type SessionLookup = (sessionID: string) => Promise<unknown>;
export type RootSessionResolution = { rootSessionID: string } | { reason: string };

export function isBoundedIdentifier(value: unknown): value is string {
  return typeof value === 'string'
    && Array.from(value).length > 0
    && Array.from(value).length <= MAX_IDENTITY_CODE_POINTS
    && /^[a-z0-9][a-z0-9._-]*$/iu.test(value);
}

/** The host adapter supplies a lookup returning the session itself, not a V1 envelope. */
export async function resolveRootSession(callerSessionID: string, getSession: SessionLookup): Promise<RootSessionResolution> {
  if (!isBoundedIdentifier(callerSessionID)) return { reason: 'invalid_caller_session' };
  const visited = new Set<string>();
  let sessionID = callerSessionID;
  for (let depth = 0; depth <= MAX_IDENTITY_PARENT_DEPTH; depth += 1) {
    if (visited.has(sessionID)) return { reason: 'parent_cycle' };
    visited.add(sessionID);
    let value: unknown;
    try { value = await getSession(sessionID); } catch { return { reason: 'session_lookup_failed' }; }
    if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string') return { reason: 'session_not_found' };
    if (value.id !== sessionID) return { reason: 'session_id_mismatch' };
    if (!('parentID' in value) || value.parentID === undefined) return { rootSessionID: sessionID };
    if (!isBoundedIdentifier(value.parentID)) return { reason: 'parent_id_invalid' };
    sessionID = value.parentID;
  }
  return { reason: 'parent_depth_exceeded' };
}

function degradedIdentity(reason: string): string {
  return JSON.stringify({ schema: IDENTITY_SCHEMA, status: 'degraded', reason, authorization: 'none' });
}

/** Pure identity result builder; local identity resolution and host lookup are injected. */
export async function buildIdentityResult(
  callerSessionID: string,
  getSession: SessionLookup,
  getProject: () => { key: string; name: string },
): Promise<string> {
  const resolution = await resolveRootSession(callerSessionID, getSession);
  if ('reason' in resolution) return degradedIdentity(resolution.reason);
  let project: { key: string; name: string };
  try { project = getProject(); } catch { return degradedIdentity('project_unavailable'); }
  const callerIsRoot = resolution.rootSessionID === callerSessionID;
  return JSON.stringify({
    schema: IDENTITY_SCHEMA, status: 'verified', root_session_id: resolution.rootSessionID,
    caller_session_id: callerSessionID, caller_role: callerIsRoot ? 'root' : 'delegated',
    project_key: project.key, project_name_hint: project.name,
    authorization: callerIsRoot ? 'root_lifecycle' : 'none',
  });
}

export function sanitizeLifecycleContent(parts: readonly { type: string; text?: string; synthetic?: boolean; ignored?: boolean }[]): string {
  return sanitizePrivateContent(parts
    .filter((part) => part.type === 'text' && !part.synthetic && !part.ignored)
    .map((part) => part.text ?? '')
    .join('\n').trim());
}

export function stableLifecycleEventKey(parts: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
