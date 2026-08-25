import { createHash } from 'node:crypto';

import type Database from 'better-sqlite3';

import type { EvidenceRecord, MemoryRecord, ProjectIdentityInput, SessionIdentityInput } from '../contracts.js';

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

export function evidenceFromRow(row: Record<string, unknown>): EvidenceRecord {
  return { id: String(row.id), projectId: String(row.project_id), sessionId: row.session_id === null ? null : String(row.session_id), kind: row.kind as EvidenceRecord['kind'], content: String(row.content), contentHash: String(row.content_hash), sourceRef: row.source_ref === null ? null : String(row.source_ref), capturedAt: String(row.captured_at), metadata: JSON.parse(String(row.metadata_json)) as Record<string, unknown> };
}

export function memoryFromRow(database: Database.Database, row: Record<string, unknown>): MemoryRecord {
  const evidenceIds = (database.prepare('SELECT evidence_id FROM memory_evidence WHERE memory_id=? ORDER BY evidence_id').all(row.id) as Array<{ evidence_id: string }>).map((item) => item.evidence_id);
  return { id: String(row.id), projectId: String(row.project_id), topicKey: row.topic_key === null ? null : String(row.topic_key), kind: row.kind as MemoryRecord['kind'], title: String(row.title), content: String(row.content), outcome: row.outcome as MemoryRecord['outcome'], status: row.status as MemoryRecord['status'], validFrom: String(row.valid_from), invalidAt: row.invalid_at === null ? null : String(row.invalid_at), supersedesId: row.supersedes_id === null ? null : String(row.supersedes_id), createdAt: String(row.created_at), evidenceIds };
}
