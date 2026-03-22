import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { normalizeForHash } from './sanitize.js';

export function computeHash(content: string): string {
  const normalized = normalizeForHash(content);
  return createHash('sha256').update(normalized).digest('hex');
}

export function checkDuplicate(
  db: Database.Database,
  hash: string,
  project: string | null,
  scope: string,
  type: string,
  title: string,
  windowMinutes: number
): { isDuplicate: boolean; existingId?: number } {
  const row = db
    .prepare(
      "SELECT id FROM observations WHERE normalized_hash = ? AND (project IS ? OR (project IS NULL AND ? IS NULL)) AND scope = ? AND type = ? AND title = ? AND deleted_at IS NULL AND created_at > datetime('now', ? || ' minutes') ORDER BY created_at DESC LIMIT 1"
    )
    .get(hash, project, project, scope, type, title, `-${windowMinutes}`) as { id: number } | undefined;

  if (row) {
    return { isDuplicate: true, existingId: row.id };
  }

  return { isDuplicate: false };
}

export function incrementDuplicate(db: Database.Database, observationId: number): void {
  db.prepare(
    'UPDATE observations SET duplicate_count = duplicate_count + 1, last_seen_at = datetime(\'now\') WHERE id = ?'
  ).run(observationId);
}
