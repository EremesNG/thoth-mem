import type Database from 'better-sqlite3';

import { SESSION_SUMMARY_LIMITS, type SessionSummaryClaimInput, type SessionSummaryClaimKind, type SessionSummaryInput } from './contracts.js';
import { sanitizePrivateContent } from './privacy.js';
import { canonicalizeSessionSummary } from './session-summaries.js';
import { hydrateMemoryRows, sessionEvidence } from './sqlite/ledger.js';

type ParsedClaim = Omit<SessionSummaryClaimInput, 'supportIds'>;

const MAX_DERIVED_CLAIM_CODE_POINTS = 300;
const MIN_SUBSTANTIVE_PROMPT_CODE_POINTS = 40;
const COMPACTION_CURRENT_STATE_KINDS = new Set<SessionSummaryClaimKind>(['objective', 'next_action', 'pending', 'blocker']);

const HEADING_KINDS: ReadonlyArray<readonly [RegExp, SessionSummaryClaimKind]> = [
  [/\bnext steps?\b/iu, 'next_action'],
  [/\b(?:modified files|files modified|changed files)\b/iu, 'changed_surface'],
  [/\b(?:in progress|pending|current work)\b/iu, 'pending'],
  [/\b(?:blocked|blockers?)\b/iu, 'blocker'],
  [/\bdecisions?\b/iu, 'decision'],
  [/\b(?:done|completed|accomplished)\b/iu, 'completed'],
  [/\b(?:goals?|requests?|intent|objectives?)\b/iu, 'objective'],
];

function boundedContent(value: string): string {
  return Array.from(sanitizePrivateContent(value).normalize('NFC').trim()).slice(0, MAX_DERIVED_CLAIM_CODE_POINTS).join('');
}

function memoryClaimContent(title: string, content: string, handoff = false): string {
  const lines = sanitizePrivateContent(content).split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const label = handoff ? /^First pending action:\s*(.+)$/iu : /^Result:\s*(.+)$/iu;
  const primary = lines.map((line) => label.exec(line)?.[1]).find(Boolean) ?? lines[0];
  return primary ? boundedContent(`${title}: ${primary}`) : '';
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
  const modifiedFiles = new Set<string>();
  const addFiles = (lines: string[]): void => {
    for (const line of lines) {
      const path = line.trim().replace(/^(?:[-*+]|\d+[.)])\s+/u, '').replace(/^`(.+)`$/u, '$1').normalize('NFC').trim();
      if (parsedClaim('changed_surface', path)) modifiedFiles.add(path);
    }
  };
  let kind: SessionSummaryClaimKind | undefined;
  let body: string[] = [];
  let objectiveSeen = false;
  const flush = (): void => {
    if (kind === 'changed_surface') addFiles(body);
    else {
      const claim = kind ? parsedClaim(kind, body.join('\n')) : null;
      if (claim) claims.push(claim);
    }
    body = [];
  };
  let fence: string | undefined;
  let fileBlock: string | undefined;
  for (const line of sanitizePrivateContent(value).split(/\r?\n/u)) {
    if (fileBlock) {
      if (line.trim() === `</${fileBlock}>`) {
        if (fileBlock === 'modified-files') addFiles(body);
        body = [];
        fileBlock = undefined;
      } else body.push(line);
      continue;
    }
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
    // Pi can repeat these exact XML blocks after its split-turn context.
    const tag = /^<(read-files|modified-files)>[ \t]*$/u.exec(line)?.[1];
    if (tag) {
      flush();
      kind = undefined;
      fileBlock = tag;
      continue;
    }
    const heading = /^\s{0,3}#+\s+(.+?)(?:\s+#+)?\s*$/u.exec(line);
    if (heading) {
      flush();
      kind = HEADING_KINDS.find(([pattern]) => pattern.test(heading[1]!))?.[1];
      if (kind === 'objective') {
        if (objectiveSeen) kind = undefined;
        objectiveSeen = true;
      }
    } else {
      body.push(line);
    }
  }
  flush();
  const changedSurface = parsedClaim('changed_surface', [...modifiedFiles].join('\n'));
  if (changedSurface) claims.push(changedSurface);
  return claims;
}

export function deriveSessionSummary(database: Database.Database, sessionId: string, watermark: number): SessionSummaryInput | null {
  const evidence = sessionEvidence(database, sessionId, watermark);
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const claims: SessionSummaryClaimInput[] = [];
  // Substance counts source code points after whitespace collapse; claim rendering applies NFC.
  const prompts = evidence.filter((item) => item.kind === 'root_prompt').map((item) => ({ ...item, content: item.content.replace(/\s+/gu, ' ').trim() }));
  const substantive = prompts.filter((item) => Array.from(item.content).length >= MIN_SUBSTANTIVE_PROMPT_CODE_POINTS);
  const first = substantive[0] ?? prompts[0];
  const latest = first && substantive.slice().reverse().find((item) => item.content.normalize('NFC') !== first.content.normalize('NFC'));
  const objectives = first ? (latest ? [first, latest] : [first]) : [];
  for (const prompt of objectives) {
    const content = boundedContent(prompt.content);
    if (content) claims.push({ kind: 'objective', content, supportIds: [prompt.id] });
  }

  const memoryClaims: SessionSummaryClaimInput[] = [];
  const rows = database.prepare(`
    SELECT DISTINCT m.* FROM memories m JOIN memory_evidence me ON me.memory_id=m.id
    JOIN session_events se ON se.evidence_id=me.evidence_id
    WHERE se.session_id=? AND se.sequence<=?
      AND (m.status='current' OR (m.kind='handoff' AND m.status='superseded'))
    ORDER BY m.created_at DESC,m.id
  `).all(sessionId, watermark) as Array<Record<string, unknown>>;
  const memories = hydrateMemoryRows(database, rows).records;
  for (const memory of memories.values()) {
    const supportIds = memory.evidenceIds.filter((id) => evidenceById.has(id));
    const content = memoryClaimContent(memory.title, memory.content, memory.kind === 'handoff');
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
      const closureContent = memoryClaimContent(closure.title, closure.content);
      const closureSupports = closure.evidenceIds.filter((id) => evidenceById.has(id));
      if (closureContent && closureSupports.length > 0) memoryClaims.push({ kind: 'completed', content: closureContent, supportIds: [...new Set([...closureSupports, ...supportIds])] });
      continue;
    }
    const claimKind = ['discovery', 'project_structure', 'failure'].includes(memory.kind)
      ? 'completed' : memory.kind === 'handoff' ? 'next_action' : 'decision';
    memoryClaims.push({ kind: claimKind, content, ...(memory.kind === 'failure' ? { outcome: 'failed' as const } : {}), supportIds });
  }

  for (const checkpoint of evidence.slice().reverse()) {
    if (checkpoint.kind !== 'checkpoint' || checkpoint.metadata.source !== 'host_compaction') continue;
    const parsed = parseHostCompactionClaims(checkpoint.content);
    if (parsed.length === 0) continue;
    // Inspect all qualifying supports before support/claim caps and canonical size fitting.
    const staleCurrentState = substantive.some((prompt) => prompt.event.sequence > checkpoint.event.sequence)
      || memoryClaims.some((claim) => claim.supportIds.some((id) => evidenceById.get(id)!.event.sequence > checkpoint.event.sequence));
    for (const claim of parsed) {
      if (staleCurrentState && COMPACTION_CURRENT_STATE_KINDS.has(claim.kind)) continue;
      claims.push({ ...claim, supportIds: [checkpoint.id] });
    }
    break;
  }
  claims.push(...memoryClaims.map((claim) => ({ ...claim, supportIds: claim.supportIds.slice(0, SESSION_SUMMARY_LIMITS.maxSupportsPerClaim) })));
  return buildDerivedSessionSummary(watermark, claims);
}

/** Retain objectives and actionable continuity before decisions and completed detail. */
export function buildDerivedSessionSummary(watermark: number, candidates: SessionSummaryClaimInput[]): SessionSummaryInput | null {
  if (candidates.length === 0) return null;
  const priority: Record<SessionSummaryClaimKind, number> = { objective: 0, next_action: 1, blocker: 2, pending: 3, decision: 4, completed: 5, changed_surface: 6, verification: 7 };
  const unique = new Map<string, SessionSummaryClaimInput>();
  for (const candidate of candidates) {
    const key = JSON.stringify([candidate.kind, candidate.content]);
    const existing = unique.get(key);
    unique.set(key, {
      ...candidate,
      // A collapsed failure must not lose its failed outcome to an unlabeled claim.
      ...(existing?.outcome === 'failed' ? { outcome: 'failed' as const } : {}),
      supportIds: [...new Set([...(existing?.supportIds ?? []), ...candidate.supportIds])].sort().slice(0, SESSION_SUMMARY_LIMITS.maxSupportsPerClaim),
    });
  }
  const claims = [...unique.values()].sort((left, right) => priority[left.kind] - priority[right.kind]).slice(0, SESSION_SUMMARY_LIMITS.maxClaims);
  const input: SessionSummaryInput = {
    coverage: { fromSequence: 1, toSequence: watermark },
    generator: { kind: 'harness', name: 'thoth-mem.session-evidence.v3' }, claims,
  };
  // Measure the validator's real canonical envelope, including JSON escaping and UTF-16.
  const one = canonicalizeSessionSummary({ ...input, claims: [claims[0]!] });
  const envelopeUnits = one.canonicalJson.length - JSON.stringify(one.input.claims).length;
  while (envelopeUnits + JSON.stringify(claims).length > SESSION_SUMMARY_LIMITS.maxCanonicalUtf16Units) claims.pop();
  return canonicalizeSessionSummary(input).input;
}
