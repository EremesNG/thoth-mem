import { createHash } from 'node:crypto';
import { basename } from 'node:path';

import { MEMORY_KIND_VALUES, SESSION_SUMMARY_KIND_VALUES, type ContextItem, type Harness, type LifecycleResult, type SummaryContextItem } from '../memory-core/contracts.js';
import { MAX_HOST_OUTPUT_CODE_POINTS, RECOVERY_TAG_END, RECOVERY_TAG_START, renderContinuation } from '../memory-core/continuation.js';
import { resolveLocalProjectIdentity } from './project-identity.js';

const MAX_IDENTITY_CODE_POINTS = 128;
const UNSAFE_IDENTITY_HEADER_CHARACTERS = /[;=\p{Cc}\p{Zl}\p{Zp}]/u;

function stableSessionId(projectId: string, harness: Harness, rootSessionKey: string): string {
  const hex = createHash('sha256').update(`session:${projectId}:${harness}:${rootSessionKey}`.normalize('NFC'), 'utf8').digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function boundedIdentifier(value: unknown): value is string {
  return typeof value === 'string' && Array.from(value).length > 0 && Array.from(value).length <= MAX_IDENTITY_CODE_POINTS && /^[a-z0-9][a-z0-9._-]*$/iu.test(value);
}

function safeProjectName(value: string): boolean {
  return Boolean(value && value === value.trim() && Array.from(value).length <= MAX_IDENTITY_CODE_POINTS && !UNSAFE_IDENTITY_HEADER_CHARACTERS.test(value));
}

function isSummaryItem(item: ContextItem): item is SummaryContextItem {
  return 'recordType' in item && item.recordType === 'summary';
}

export function isOwnedRecoveryBlock(value: string): boolean {
  return value.startsWith(`${RECOVERY_TAG_START}\n`) && value.endsWith(`\n${RECOVERY_TAG_END}`);
}

export function identityOnlyRecovery(rootSessionKey: string, directory: string): string | undefined {
  if (!boundedIdentifier(rootSessionKey)) return undefined;
  try {
    const project = resolveLocalProjectIdentity(directory);
    return renderContinuation({ rootSessionKey, projectKey: project.key, projectName: project.name || basename(directory), items: [] }).context;
  } catch { return undefined; }
}

export function verifiedRecovery(result: LifecycleResult | undefined, rootSessionKey: string, directory: string, harness?: Harness): string | undefined {
  const fallback = identityOnlyRecovery(rootSessionKey, directory);
  let localProject;
  try { localProject = resolveLocalProjectIdentity(directory); } catch { return fallback; }
  const recovery = result?.recovery;
  const expectedSessionId = result && harness ? stableSessionId(result.projectId, harness, rootSessionKey) : result?.sessionId;
  if (!fallback || !recovery || result.projectKey !== localProject.key || result.sessionId !== expectedSessionId || !safeProjectName(result.projectName)) return fallback;
  const context = recovery.context;
  const codePointLength = Array.from(context).length;
  const selectedIds = recovery.items.map((item) => item.id);
  const selectedSummaryIds = recovery.items.filter(isSummaryItem).map((item) => item.id);
  const selectedMemoryIds = recovery.items.filter((item) => !isSummaryItem(item)).map((item) => item.id);
  const identity = `thoth-mem verified identity: root_session_id=${rootSessionKey}; project_key=${result.projectKey}; project_name=${result.projectName}`;
  if (!isOwnedRecoveryBlock(context)
    || context.split(RECOVERY_TAG_START).length !== 2
    || context.split(RECOVERY_TAG_END).length !== 2
    || context.split('\n')[1] !== identity
    || codePointLength > MAX_HOST_OUTPUT_CODE_POINTS
    || recovery.rendering.maxCodePoints !== MAX_HOST_OUTPUT_CODE_POINTS
    || recovery.rendering.totalCodePoints !== codePointLength
    || selectedIds.length > 3
    || JSON.stringify(selectedIds) !== JSON.stringify(recovery.selectedRecordIds)
    || JSON.stringify(selectedSummaryIds) !== JSON.stringify(recovery.selectedSummaryIds)
    || JSON.stringify(selectedMemoryIds) !== JSON.stringify(recovery.selectedMemoryIds)
    || result.capability.contextDelivered !== (selectedIds.length > 0)
    || recovery.items.some((item) => isSummaryItem(item)
      ? !(SESSION_SUMMARY_KIND_VALUES as readonly string[]).includes(item.kind)
      : !(MEMORY_KIND_VALUES as readonly string[]).includes(item.kind))
    || recovery.items.some((item) => !context.includes(`(${isSummaryItem(item) ? 'summary' : 'memory'}:${item.id})`))
    || recovery.items.some((item) => isSummaryItem(item) ? context.includes(item.submissionEvidenceId) : item.evidenceIds.some((id) => context.includes(id)))) return fallback;
  return context;
}
