import type Database from 'better-sqlite3';

import { SESSION_SUMMARY_LIMITS, type SessionSummaryClaimInput, type SessionSummaryClaimKind, type SessionSummaryInput, type SessionSummaryKind } from './contracts.js';
import { sanitizePrivateContent } from './privacy.js';
import { canonicalizeSessionSummary } from './session-summaries.js';
import { hydrateMemoryRows, sessionEvidence } from './sqlite/ledger.js';

type ParsedClaim = Omit<SessionSummaryClaimInput, 'supportIds'>;

const HEADING_KINDS: ReadonlyArray<readonly [RegExp, SessionSummaryClaimKind]> = [
  [/\bnext steps?\b/iu, 'next_action'],
  [/\b(?:modified files|files modified|changed files)\b/iu, 'changed_surface'],
  [/\b(?:in progress|pending|current work)\b/iu, 'pending'],
  [/\b(?:blocked|blockers?)\b/iu, 'blocker'],
  [/\bdecisions?\b/iu, 'decision'],
  [/\b(?:done|completed|accomplished)\b/iu, 'completed'],
  [/\b(?:goals?|requests?|intent|objectives?)\b/iu, 'objective'],
];

function boundedContent(value: string, maximum: number = SESSION_SUMMARY_LIMITS.maxClaimCodePoints): string {
  return Array.from(sanitizePrivateContent(value).normalize('NFC').trim()).slice(0, maximum).join('');
}

function parsedClaim(kind: SessionSummaryClaimKind, body: string): ParsedClaim | null {
  const content = boundedContent(body);
  const withoutMarkers = content.replace(/^\s*(?:[-*+]\s+)?(?:\[[ xX]\]\s*)?/gmu, '').replace(/[*_]/gu, '').trim();
  if (!content || /^(?:\(?none\)?[.!]?\s*)+$/iu.test(withoutMarkers)) return null;
  return { kind, content };
}

/** Host text is untrusted evidence, never a promoted memory. */
export function parseHostCompactionClaims(value: string): ParsedClaim[] {
  const claims: ParsedClaim[] = [];
  const modifiedFiles: string[] = [];
  // Pi appends these exact XML blocks after its Markdown summary (compaction/utils.js).
  const text = sanitizePrivateContent(value).replace(/^<(read-files|modified-files)>\r?\n([\s\S]*?)\r?\n<\/\1>[ \t]*$/gmu, (_block, tag: string, body: string) => {
    if (tag === 'modified-files') modifiedFiles.push(body);
    return '';
  });
  let kind: SessionSummaryClaimKind | undefined;
  let body: string[] = [];
  const flush = (): void => {
    const claim = kind ? parsedClaim(kind, body.join('\n')) : null;
    if (claim) claims.push(claim);
    body = [];
  };
  let fence: string | undefined;
  for (const line of text.split(/\r?\n/u)) {
    const delimiter = /^\s{0,3}(`{3,}|~{3,})/u.exec(line)?.[1];
    if (delimiter && !fence) fence = delimiter;
    else if (delimiter && fence && delimiter[0] === fence[0] && delimiter.length >= fence.length) {
      fence = undefined;
      body.push(line);
      continue;
    }
    if (fence) {
      body.push(line);
      continue;
    }
    const heading = /^\s{0,3}#+\s+(.+?)(?:\s+#+)?\s*$/u.exec(line);
    if (heading) {
      flush();
      kind = HEADING_KINDS.find(([pattern]) => pattern.test(heading[1]!))?.[1];
    } else {
      body.push(line);
    }
  }
  flush();
  for (const files of modifiedFiles) {
    const claim = parsedClaim('changed_surface', files);
    if (claim) claims.push(claim);
  }
  return claims;
}

export function deriveSessionSummary(database: Database.Database, sessionId: string, kind: SessionSummaryKind, watermark: number): SessionSummaryInput | null {
  const evidence = sessionEvidence(database, sessionId, watermark);
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const claims: SessionSummaryClaimInput[] = [];
  const prompts = evidence.filter((item) => item.kind === 'root_prompt');
  const first = prompts[0];
  const latest = first && prompts.slice().reverse().find((item) => item.content.normalize('NFC').trim() !== first.content.normalize('NFC').trim());
  const objectives = first ? (latest ? [first, latest] : [first]) : [];
  for (const prompt of objectives) {
    const content = boundedContent(prompt.content, 500);
    if (content) claims.push({ kind: 'objective', content, supportIds: [prompt.id] });
  }

  for (const checkpoint of evidence.slice().reverse()) {
    if (checkpoint.kind !== 'checkpoint' || checkpoint.metadata.source !== 'host_compaction') continue;
    const parsed = parseHostCompactionClaims(checkpoint.content);
    if (parsed.length === 0) continue;
    claims.push(...parsed.map((claim) => ({ ...claim, supportIds: [checkpoint.id] })));
    break;
  }

  const rows = database.prepare(`
    SELECT DISTINCT m.* FROM memories m JOIN memory_evidence me ON me.memory_id=m.id
    JOIN session_events se ON se.evidence_id=me.evidence_id
    WHERE se.session_id=? AND se.sequence<=?
      AND (m.status='current' OR (m.kind='handoff' AND m.status='superseded'))
    ORDER BY m.created_at DESC,m.id
  `).all(sessionId, watermark) as Array<Record<string, unknown>>;
  const memories = hydrateMemoryRows(database, rows).records;
  for (const memory of memories.values()) {
    const supportIds = memory.evidenceIds.filter((id) => evidenceById.has(id)).slice(0, SESSION_SUMMARY_LIMITS.maxSupportsPerClaim);
    const content = boundedContent(memory.content);
    if (!content || supportIds.length === 0) continue;
    if (memory.kind === 'handoff' && memory.status === 'superseded') {
      // A closure is a completed claim only when the closure itself has in-session support.
      const closureRow = database.prepare(`
        SELECT DISTINCT c.* FROM memories c JOIN memory_evidence me ON me.memory_id=c.id
        JOIN session_events se ON se.evidence_id=me.evidence_id
        WHERE c.supersedes_id=? AND c.topic_key=? AND c.kind<>'handoff'
          AND c.status IN ('current','superseded') AND se.session_id=? AND se.sequence<=?
        ORDER BY c.id LIMIT 1
      `).get(memory.id, memory.topicKey, sessionId, watermark) as Record<string, unknown> | undefined;
      if (!closureRow) continue;
      const closure = hydrateMemoryRows(database, [closureRow]).records.values().next().value!;
      const closureContent = boundedContent(closure.content);
      const closureSupports = closure.evidenceIds.filter((id) => evidenceById.has(id));
      if (closureContent && closureSupports.length > 0) claims.push({ kind: 'completed', content: closureContent, supportIds: [...new Set([...closureSupports, ...supportIds])].slice(0, SESSION_SUMMARY_LIMITS.maxSupportsPerClaim) });
      continue;
    }
    const claimKind = ['discovery', 'project_structure', 'failure'].includes(memory.kind)
      ? 'completed' : memory.kind === 'handoff' ? 'next_action' : 'decision';
    claims.push({ kind: claimKind, content, ...(memory.kind === 'failure' ? { outcome: 'failed' as const } : {}), supportIds });
  }
  return buildDerivedSessionSummary(kind, watermark, claims);
}

/** Retain objectives and actionable continuity before decisions and completed detail. */
export function buildDerivedSessionSummary(kind: SessionSummaryKind, watermark: number, candidates: SessionSummaryClaimInput[]): SessionSummaryInput | null {
  if (candidates.length === 0) return null;
  const priority: Record<SessionSummaryClaimKind, number> = { objective: 0, next_action: 1, blocker: 2, pending: 3, decision: 4, completed: 5, changed_surface: 6, verification: 7 };
  const claims = candidates.slice().sort((left, right) => priority[left.kind] - priority[right.kind]).slice(0, SESSION_SUMMARY_LIMITS.maxClaims);
  const input: SessionSummaryInput = {
    kind, coverage: { fromSequence: 1, toSequence: watermark },
    generator: { kind: 'harness', name: 'thoth-mem.session-evidence.v1' }, claims,
  };
  // Measure the validator's real canonical envelope, including JSON escaping and UTF-16.
  const one = canonicalizeSessionSummary({ ...input, claims: [claims[0]!] });
  const envelopeUnits = one.canonicalJson.length - JSON.stringify(one.input.claims).length;
  while (envelopeUnits + JSON.stringify(claims).length > SESSION_SUMMARY_LIMITS.maxCanonicalUtf16Units) claims.pop();
  return canonicalizeSessionSummary(input).input;
}
