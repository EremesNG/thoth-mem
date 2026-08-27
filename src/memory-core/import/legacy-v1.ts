import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import Database from 'better-sqlite3';

import type { MemoryKind } from '../contracts.js';
import { MemoryService } from '../service.js';

export interface LegacyImportReport {
  schema: 'thoth-mem.import';
  reportVersion: 2; sourceSchemaVersion: 'legacy-v1' | 'unknown'; targetSchemaVersion: 4; startedAt: string; finishedAt: string; committed: boolean;
  sourcePath: string; targetPath: string; sourceHash: string; sourceUnchanged: boolean;
  imported: { sessions: number; prompts: number; observations: number };
  skipped: number; quarantined: number; failed: number;
  dispositions: Record<'sessions' | 'prompts' | 'observations', { imported: number; skipped: number; quarantined: number; failed: number }>;
  dispositionReasons: string[];
  ignoredDerived: { tables: string[]; rows: number; byCategory: Record<'graph' | 'vector' | 'operational' | 'other', number> };
  integrity: { foreignKeys: boolean; fts: boolean };
  errors: Array<{ code: 'SOURCE_TARGET_ALIAS' | 'SOURCE_MISSING' | 'TARGET_NOT_EMPTY' | 'UNSUPPORTED_SCHEMA' | 'MAPPING_FAILED' | 'SOURCE_CHANGED' | 'IMPORT_FAILED'; message: string }>;
}

export class LegacyImportFailure extends Error { constructor(readonly report: LegacyImportReport, message: string) { super(message); this.name = 'LegacyImportFailure'; } }

interface ImportOptions { sourcePath: string; targetPath: string }
interface TableRow { name: string }

function sha256(path: string): string { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
function projectKey(value: unknown): { key: string; name: string } | null { if (typeof value !== 'string' || !value.trim() || /^(unknown|none|unassigned|null)$/i.test(value.trim())) return null; return { key: `legacy:${value.trim()}`, name: value.trim() }; }
function memoryKind(value: unknown): MemoryKind { const text = String(value); if (['decision','architecture','discovery','failure','handoff','preference'].includes(text)) return text as MemoryKind; if (text === 'config' || text === 'learning') return 'convention'; if (text === 'session_summary') return 'handoff'; return 'discovery'; }
function errorCode(message: string): LegacyImportReport['errors'][number]['code'] { if (/distinct paths/i.test(message)) return 'SOURCE_TARGET_ALIAS'; if (/does not exist/i.test(message)) return 'SOURCE_MISSING'; if (/empty or absent/i.test(message)) return 'TARGET_NOT_EMPTY'; if (/unsupported legacy schema/i.test(message)) return 'UNSUPPORTED_SCHEMA'; if (/source changed/i.test(message)) return 'SOURCE_CHANGED'; if (/privacy filtering|promoted memory|stable root|verified project/i.test(message)) return 'MAPPING_FAILED'; return 'IMPORT_FAILED'; }
function disposition() { return { imported: 0, skipped: 0, quarantined: 0, failed: 0 }; }

export function importLegacyV1(options: ImportOptions): LegacyImportReport {
  const sourcePath = resolve(options.sourcePath); const targetPath = resolve(options.targetPath);
  const sourceExists = existsSync(sourcePath); const sourceHash = sourceExists ? sha256(sourcePath) : ''; const deterministicTime = sourceExists ? statSync(sourcePath).mtime.toISOString() : new Date(0).toISOString(); let source: Database.Database | null = null; let service: MemoryService | null = null; const targetExisted = existsSync(targetPath); const stagingPath = join(dirname(targetPath), `.${basename(targetPath)}.importing-${randomUUID()}`); let activeType: keyof LegacyImportReport['dispositions'] | null = null;
  const report: LegacyImportReport = { schema: 'thoth-mem.import', reportVersion: 2, sourceSchemaVersion: 'unknown', targetSchemaVersion: 4, startedAt: deterministicTime, finishedAt: deterministicTime, committed: false, sourcePath, targetPath, sourceHash, sourceUnchanged: false, imported: { sessions: 0, prompts: 0, observations: 0 }, skipped: 0, quarantined: 0, failed: 0, dispositions: { sessions: disposition(), prompts: disposition(), observations: disposition() }, dispositionReasons: [], ignoredDerived: { tables: [], rows: 0, byCategory: { graph: 0, vector: 0, operational: 0, other: 0 } }, integrity: { foreignKeys: false, fts: false }, errors: [] };
  try {
    if (sourcePath.toLocaleLowerCase() === targetPath.toLocaleLowerCase()) throw new Error('Legacy source and current target must be distinct paths');
    if (!sourceExists) throw new Error('Legacy source does not exist');
    if (targetExisted && statSync(targetPath).size > 0) throw new Error('Current target must be empty or absent');
    source = new Database(sourcePath, { readonly: true, fileMustExist: true }); source.pragma('query_only = ON');
    const tables = (source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as TableRow[]).map((row) => row.name);
    for (const required of ['sessions','user_prompts','observations']) if (!tables.includes(required)) throw new Error(`Unsupported legacy schema: missing ${required}`);
    report.sourceSchemaVersion = 'legacy-v1';
    service = new MemoryService({ databasePath: stagingPath });
    const sessionProjects = new Map<string, { key: string; name: string }>();
    activeType = 'sessions';
    for (const row of source.prepare('SELECT id,project,started_at FROM sessions ORDER BY id').all() as Array<Record<string, unknown>>) {
      const project = projectKey(row.project); if (!project) { report.quarantined++; report.dispositions.sessions.quarantined++; report.dispositionReasons.push(`sessions:${String(row.id)}:placeholder_identity`); continue; }
      service.lifecycle({ operation: 'enroll', harness: 'import', project, rootSessionKey: String(row.id), eventKey: `legacy:session:${row.id}` }); sessionProjects.set(String(row.id), project); report.imported.sessions++; report.dispositions.sessions.imported++;
    }
    activeType = 'prompts';
    for (const row of source.prepare('SELECT id,session_id,content,project,created_at FROM user_prompts ORDER BY id').all() as Array<Record<string, unknown>>) {
      const project = projectKey(row.project) ?? sessionProjects.get(String(row.session_id)); if (!project) { report.quarantined++; report.dispositions.prompts.quarantined++; report.dispositionReasons.push(`user_prompts:${String(row.id)}:placeholder_identity`); continue; }
      service.save({ project, session: { rootSessionKey: String(row.session_id), harness: 'import' }, eventKey: `legacy-prompt:${row.id}`, evidence: { kind: 'legacy_prompt', content: String(row.content), sourceRef: `user_prompts:${row.id}`, capturedAt: String(row.created_at) } }); report.imported.prompts++; report.dispositions.prompts.imported++;
    }
    activeType = 'observations';
    for (const row of source.prepare('SELECT id,session_id,type,title,content,project,topic_key,created_at,deleted_at FROM observations ORDER BY id').all() as Array<Record<string, unknown>>) {
      if (row.deleted_at !== null) { report.skipped++; report.dispositions.observations.skipped++; report.dispositionReasons.push(`observations:${String(row.id)}:deleted`); continue; }
      const project = projectKey(row.project) ?? sessionProjects.get(String(row.session_id)); if (!project) { report.quarantined++; report.dispositions.observations.quarantined++; report.dispositionReasons.push(`observations:${String(row.id)}:placeholder_identity`); continue; }
      service.save({ project, session: { rootSessionKey: String(row.session_id), harness: 'import' }, eventKey: `legacy-observation:${row.id}`, evidence: { kind: 'legacy_observation', content: String(row.content), sourceRef: `observations:${row.id}`, capturedAt: String(row.created_at) }, memory: { kind: memoryKind(row.type), title: String(row.title), content: String(row.content), topicKey: typeof row.topic_key === 'string' ? row.topic_key : null } }); report.imported.observations++; report.dispositions.observations.imported++;
    }
    activeType = null;
    const authoritative = new Set(['sessions','user_prompts','observations']); report.ignoredDerived.tables = tables.filter((table) => !authoritative.has(table));
    for (const table of report.ignoredDerived.tables) { if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) continue; const rows = Number((source.prepare(`SELECT count(*) AS count FROM "${table}"`).get() as { count: number }).count); report.ignoredDerived.rows += rows; const category = /kg|graph|triple/i.test(table) ? 'graph' : /vector|embedding/i.test(table) ? 'vector' : /trace|job|telemetry/i.test(table) ? 'operational' : 'other'; report.ignoredDerived.byCategory[category] += rows; }
    service.close(); service = null; source.close(); source = null;
    const target = new Database(stagingPath, { readonly: true }); report.integrity.foreignKeys = (target.pragma('foreign_key_check') as unknown[]).length === 0; const counts = target.prepare('SELECT (SELECT count(*) FROM memories) AS memories,(SELECT count(*) FROM memory_fts) AS fts').get() as { memories: number; fts: number }; report.integrity.fts = counts.memories === counts.fts; target.close();
    report.sourceUnchanged = sha256(sourcePath) === sourceHash; if (!report.sourceUnchanged) throw new Error('Legacy source changed during import');
    if (targetExisted) rmSync(targetPath, { force: true }); renameSync(stagingPath, targetPath); report.committed = true; report.dispositionReasons.sort(); report.ignoredDerived.tables.sort();
    return report;
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 300); report.failed++; if (activeType) report.dispositions[activeType].failed++; report.errors.push({ code: errorCode(message), message }); report.dispositionReasons.sort(); report.sourceUnchanged = sourceExists && sha256(sourcePath) === sourceHash;
    try { service?.close(); } catch {} try { source?.close(); } catch {}
    if (existsSync(stagingPath)) rmSync(stagingPath, { force: true });
    throw new LegacyImportFailure(report, message);
  }
}
