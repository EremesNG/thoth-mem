import { createHash } from 'node:crypto';

import type Database from 'better-sqlite3';

import type { EvidenceRecord, MemoryRecord, ProjectIdentityInput, SessionEventInput, SessionEventRecord, SessionIdentityInput } from '../contracts.js';

export function hashContent(value: string): string { return createHash('sha256').update(value.normalize('NFC')).digest('hex'); }
export function stableUuid(value: string): string { const hex = hashContent(value); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`; }
export function now(): string { return new Date().toISOString(); }

export function ensureProject(database: Database.Database, input: ProjectIdentityInput): string {
  const key = input.key.trim();
  if (!key || !input.name.trim()) throw new Error('Verified project identity is required');
  const found = database.prepare('SELECT id FROM projects WHERE identity_key=?').get(key) as { id: string } | undefined;
  if (found) return found.id;
  const id = stableUuid(`project:${key}`); const at = now();
  database.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run(id, key, input.name.trim(), input.rootHint ?? null, at, at);
  return id;
}

export function ensureSession(database: Database.Database, projectId: string, input: SessionIdentityInput): string {
  if (!input.rootSessionKey.trim()) throw new Error('Stable root session identity is required');
  const found = database.prepare('SELECT id FROM sessions WHERE project_id=? AND root_session_key=? AND harness=?').get(projectId, input.rootSessionKey, input.harness) as { id: string } | undefined;
  if (found) return found.id;
  const id = stableUuid(`session:${projectId}:${input.harness}:${input.rootSessionKey}`);
  database.prepare('INSERT INTO sessions(id,project_id,root_session_key,harness,state,started_at) VALUES(?,?,?,?,?,?)').run(id, projectId, input.rootSessionKey, input.harness, 'active', now());
  return id;
}

export function sessionEventFromRow(row: Record<string, unknown>): SessionEventRecord {
  return {
    evidenceId: String(row.evidence_id),
    sessionId: String(row.session_id),
    sequence: Number(row.sequence),
    actor: row.actor as SessionEventRecord['actor'],
    authority: row.authority as SessionEventRecord['authority'],
    retentionClass: row.retention_class as SessionEventRecord['retentionClass'],
    privacyClass: row.privacy_class as SessionEventRecord['privacyClass'],
  };
}

export function eventForEvidence(database: Database.Database, evidenceId: string): SessionEventRecord | null {
  const row = database.prepare('SELECT * FROM session_events WHERE evidence_id=?').get(evidenceId) as Record<string, unknown> | undefined;
  return row ? sessionEventFromRow(row) : null;
}

export function appendSessionEvent(database: Database.Database, sessionId: string, evidenceId: string, input: SessionEventInput): SessionEventRecord {
  const allocated = database.prepare('UPDATE sessions SET next_event_sequence=next_event_sequence+1 WHERE id=? RETURNING next_event_sequence').get(sessionId) as { next_event_sequence: number } | undefined;
  if (!allocated) throw new Error('Verified session is required for event allocation');
  database.prepare('INSERT INTO session_events(evidence_id,session_id,sequence,actor,authority,retention_class,privacy_class) VALUES(?,?,?,?,?,?,?)').run(
    evidenceId, sessionId, allocated.next_event_sequence, input.actor, input.authority, input.retentionClass, input.privacyClass,
  );
  return { evidenceId, sessionId, sequence: allocated.next_event_sequence, ...input };
}

export function evidenceFromRow(row: Record<string, unknown>): EvidenceRecord {
  return { id: String(row.id), projectId: String(row.project_id), sessionId: row.session_id === null ? null : String(row.session_id), kind: row.kind as EvidenceRecord['kind'], content: String(row.content), contentHash: String(row.content_hash), sourceRef: row.source_ref === null ? null : String(row.source_ref), capturedAt: String(row.captured_at), metadata: JSON.parse(String(row.metadata_json)) as Record<string, unknown> };
}

function memoryRecordFromRow(row: Record<string, unknown>, evidenceIds: string[]): MemoryRecord {
  return { id: String(row.id), projectId: String(row.project_id), topicKey: row.topic_key === null ? null : String(row.topic_key), kind: row.kind as MemoryRecord['kind'], title: String(row.title), content: String(row.content), outcome: row.outcome as MemoryRecord['outcome'], status: row.status as MemoryRecord['status'], validFrom: String(row.valid_from), invalidAt: row.invalid_at === null ? null : String(row.invalid_at), supersedesId: row.supersedes_id === null ? null : String(row.supersedes_id), createdAt: String(row.created_at), evidenceIds };
}

export interface HydratedMemories {
  records: Map<string, MemoryRecord>;
  evidenceChars: number;
  evidenceLinks: number;
}

export function hydrateMemoryRows(database: Database.Database, rows: Array<Record<string, unknown>>): HydratedMemories {
  const ids = [...new Set(rows.map((row) => String(row.id)))];
  if (ids.length === 0) return { records: new Map(), evidenceChars: 0, evidenceLinks: 0 };
  const placeholders = ids.map(() => '?').join(',');
  const evidenceRows = database.prepare(`SELECT me.memory_id,me.evidence_id,length(e.content) AS evidence_chars FROM memory_evidence me JOIN evidence e ON e.id=me.evidence_id WHERE me.memory_id IN (${placeholders}) ORDER BY me.memory_id,me.evidence_id`).all(...ids) as Array<{ memory_id: string; evidence_id: string; evidence_chars: number }>;
  const evidenceByMemory = new Map(ids.map((id) => [id, [] as string[]]));
  let evidenceChars = 0;
  for (const evidence of evidenceRows) {
    evidenceByMemory.get(evidence.memory_id)?.push(evidence.evidence_id);
    evidenceChars += Number(evidence.evidence_chars);
  }
  return {
    records: new Map(rows.map((row) => [String(row.id), memoryRecordFromRow(row, evidenceByMemory.get(String(row.id)) ?? [])])),
    evidenceChars,
    evidenceLinks: evidenceRows.length,
  };
}

export function memoryFromRow(database: Database.Database, row: Record<string, unknown>): MemoryRecord {
  const record = hydrateMemoryRows(database, [row]).records.get(String(row.id));
  if (!record) throw new Error('Memory row hydration failed');
  return record;
}
