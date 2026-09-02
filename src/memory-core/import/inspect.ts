import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import Database from 'better-sqlite3';

import type { MemoryKind, MemoryOutcome } from '../contracts.js';
import { sanitizeLegacyImportContent } from '../privacy.js';
import { stableUuid } from '../sqlite/ledger.js';
import { SQLITE_SCHEMA_REVISION } from '../sqlite/migrations.js';
import {
  IMPORT_POLICY,
  type EntityDispositionCounts,
  type FileFingerprint,
  type ImportPlan,
  type LegacyEntity,
  type MappingManifest,
  type ProjectBasis,
  type ProjectDisposition,
  type ProjectMapping,
  type RowReason,
  type SchemaObjectInventory,
  canonicalJson,
  classifyLegacyMemory,
  hashCanonical,
  sealImportPlan,
  sha256,
} from './contracts.js';

const AUTHORITATIVE_TABLES = new Set(['sessions', 'user_prompts', 'observations', 'observation_versions']);
const PLACEHOLDER_IDENTITY = /^(?:unknown|none|unassigned|null|n\/a|-)$/iu;
const DERIVED_NAME = /(?:kg_|graph|triple|vector|embedding|fts|search|access|trace|telemetry|job|maintenance|projection)/iu;
const ENTITIES: LegacyEntity[] = ['session','prompt','session_summary','observation_version','observation'];

export interface LegacyDataset {
  sessions: Array<Record<string, unknown>>;
  prompts: Array<Record<string, unknown>>;
  observations: Array<Record<string, unknown>>;
  observationVersions: Array<Record<string, unknown>>;
}

interface ProjectResolution extends ProjectMapping { destinationKey: string | null; destinationName: string | null }

function quoteIdentifier(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function emptyCounts(): EntityDispositionCounts { return { imported: 0, linked: 0, skipped: 0, quarantined: 0 }; }
function normalizeIdentity(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFC').trim();
  return normalized && !PLACEHOLDER_IDENTITY.test(normalized) ? normalized : null;
}
function sourceProjectValue(row: Record<string, unknown>): string | null { return normalizeIdentity(row.project) ?? normalizeIdentity(row.directory); }
function rowKey(row: Record<string, unknown>): string { return String(row.id ?? row.observation_id ?? row.session_id ?? ''); }

export function fileFingerprint(path: string): FileFingerprint {
  const hash = (candidate: string): string | null => existsSync(candidate) ? sha256(readFileSync(candidate)) : null;
  const main = hash(path);
  if (!main) throw new Error(`Database does not exist: ${path}`);
  const walPath = `${path}-wal`;
  const wal = existsSync(walPath) && statSync(walPath).size > 0 ? hash(walPath) : null;
  return { main, wal, shm: null };
}

function databaseObjects(database: Database.Database): SchemaObjectInventory[] {
  const rows = database.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all() as Array<{ type: SchemaObjectInventory['type']; name: string; sql: string | null }>;
  const virtualNames = new Set(rows.filter((row) => /^CREATE\s+VIRTUAL\s+TABLE/iu.test(row.sql ?? '')).map((row) => row.name));
  return rows.map((row) => {
    const shadow = [...virtualNames].some((name) => row.name.startsWith(`${name}_`));
    const category = AUTHORITATIVE_TABLES.has(row.name) ? 'authoritative' : shadow ? 'shadow' : DERIVED_NAME.test(row.name) ? 'derived' : 'unsupported';
    return { name: row.name, type: row.type, category, virtual: virtualNames.has(row.name) };
  });
}

function tableRows(database: Database.Database, table: string): Array<Record<string, unknown>> {
  const columns = database.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{ name: string; pk: number }>;
  const order = columns.filter((column) => column.pk > 0).sort((left, right) => left.pk - right.pk).map((column) => quoteIdentifier(column.name));
  const orderSql = order.length ? ` ORDER BY ${order.join(',')}` : '';
  return database.prepare(`SELECT * FROM ${quoteIdentifier(table)}${orderSql}`).all() as Array<Record<string, unknown>>;
}

export function readLegacyDataset(database: Database.Database, objects = databaseObjects(database)): LegacyDataset {
  const tables = new Set(objects.filter((object) => object.type === 'table' && !object.virtual).map((object) => object.name));
  for (const required of ['sessions','user_prompts','observations']) if (!tables.has(required)) throw new Error(`Unsupported legacy schema: missing ${required}`);
  return {
    sessions: tableRows(database, 'sessions'),
    prompts: tableRows(database, 'user_prompts'),
    observations: tableRows(database, 'observations'),
    observationVersions: tables.has('observation_versions') ? tableRows(database, 'observation_versions') : [],
  };
}

function logicalSourceFingerprint(dataset: LegacyDataset): string {
  return hashCanonical({ sessions: dataset.sessions, prompts: dataset.prompts, observations: dataset.observations, observationVersions: dataset.observationVersions });
}

const TARGET_BASELINE_TABLES = ['projects','project_aliases','sessions','evidence','session_events','session_summaries','session_summary_claims','session_summary_claim_supports','observations','observation_facets','observation_supports','observation_reviews','observation_review_supports','observation_promotions','memories','memory_evidence','lifecycle_receipts','save_receipts','observation_receipts','projection_state','projection_source_mapping','projection_jobs','change_watermark'] as const;

export function currentBaselineManifest(database: Database.Database): Record<string, unknown[]> {
  const tables = new Set((database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((row) => row.name));
  return Object.fromEntries(TARGET_BASELINE_TABLES.filter((table) => tables.has(table)).map((table) => [table, tableRows(database, table)]));
}

export function currentLogicalFingerprint(database: Database.Database): string {
  return hashCanonical(currentBaselineManifest(database));
}

function currentProjectCandidates(database: Database.Database, selector: string): Array<{ id: string; key: string; name: string; basis: 'exact_identity' | 'exact_path_alias' }> {
  const candidates = database.prepare(`
    SELECT id,identity_key AS key,display_name AS name,'exact_identity' AS basis FROM projects WHERE identity_key=?
    UNION ALL
    SELECT p.id,p.identity_key,p.display_name,'exact_path_alias' FROM project_aliases a JOIN projects p ON p.id=a.project_id WHERE a.alias_key=?
    ORDER BY id,basis
  `).all(selector, selector) as Array<{ id: string; key: string; name: string; basis: 'exact_identity' | 'exact_path_alias' }>;
  return candidates.filter((candidate, index) => candidates.findIndex((other) => other.id === candidate.id) === index);
}

function sourceProjects(dataset: LegacyDataset): Map<string, Set<string>> {
  const projects = new Map<string, Set<string>>();
  const add = (value: unknown, path: unknown): void => {
    const rawProject = typeof value === 'string' ? value.normalize('NFC').trim() : '';
    const directory = normalizeIdentity(path);
    const sourceProject = rawProject || directory;
    if (!sourceProject) return;
    const aliases = projects.get(sourceProject) ?? new Set<string>();
    if (directory) aliases.add(directory.startsWith('path:') ? directory : `path:${directory}`);
    projects.set(sourceProject, aliases);
  };
  for (const row of [...dataset.sessions, ...dataset.prompts, ...dataset.observations, ...dataset.observationVersions]) add(row.project, row.directory);
  return projects;
}

function resolveProjects(dataset: LegacyDataset, target: Database.Database | null, mapping: MappingManifest | null): ProjectResolution[] {
  const explicit = new Map(mapping?.mappings.map((item) => [item.sourceProject, item.targetSelector]) ?? []);
  const projects = sourceProjects(dataset);
  for (const sourceProject of explicit.keys()) {
    if (!projects.has(sourceProject)) throw new Error(`Mapping source project is not present in the legacy source: ${sourceProject}`);
  }
  return [...projects].map(([sourceProject, pathAliases]): ProjectResolution => {
    const sourceProjectHash = sha256(sourceProject);
    if (!normalizeIdentity(sourceProject)) return { sourceProjectHash, sourceProject, disposition: 'quarantined', basis: 'placeholder_identity', destinationSelector: null, resolvedProjectId: null, destinationKey: null, destinationName: null };
    const explicitSelector = explicit.get(sourceProject);
    const selectors = explicitSelector ? [explicitSelector] : [sourceProject, ...pathAliases];
    const candidates = target ? selectors.flatMap((selector) => currentProjectCandidates(target, selector)) : [];
    const unique = candidates.filter((candidate, index) => candidates.findIndex((other) => other.id === candidate.id) === index);
    if (explicitSelector) {
      if (unique.length !== 1) return { sourceProjectHash, sourceProject, disposition: 'quarantined', basis: unique.length > 1 ? 'ambiguous_identity' : 'project_conflict', destinationSelector: explicitSelector, resolvedProjectId: null, destinationKey: null, destinationName: null };
      const found = unique[0]!; return { sourceProjectHash, sourceProject, disposition: 'mapped', basis: 'explicit', destinationSelector: explicitSelector, resolvedProjectId: found.id, destinationKey: found.key, destinationName: found.name };
    }
    if (unique.length === 1) {
      const found = unique[0]!; const basis: ProjectBasis = candidates.find((candidate) => candidate.id === found.id)?.basis ?? 'exact_identity';
      return { sourceProjectHash, sourceProject, disposition: 'mapped', basis, destinationSelector: selectors.find((selector) => currentProjectCandidates(target!, selector).some((candidate) => candidate.id === found.id)) ?? sourceProject, resolvedProjectId: found.id, destinationKey: found.key, destinationName: found.name };
    }
    if (unique.length > 1) return { sourceProjectHash, sourceProject, disposition: 'quarantined', basis: 'ambiguous_identity', destinationSelector: null, resolvedProjectId: null, destinationKey: null, destinationName: null };
    const key = `legacy:${sourceProject}`;
    return { sourceProjectHash, sourceProject, disposition: 'isolated', basis: 'isolated_legacy', destinationSelector: key, resolvedProjectId: stableUuid(`project:${key}`), destinationKey: key, destinationName: sourceProject };
  }).sort((left, right) => left.sourceProjectHash.localeCompare(right.sourceProjectHash));
}

function mappingForRow(row: Record<string, unknown>, mappings: ProjectResolution[], sessionMappings: Map<string, ProjectResolution | null>): { mapping: ProjectResolution | null; conflict: boolean } {
  const rowProject = sourceProjectValue(row);
  const direct = rowProject ? mappings.find((mapping) => mapping.sourceProject === rowProject) ?? null : null;
  const inherited = sessionMappings.get(String(row.session_id ?? row.id)) ?? null;
  return { mapping: direct ?? inherited, conflict: Boolean(direct && inherited && direct.sourceProjectHash !== inherited.sourceProjectHash) };
}

function dispositionForContent(values: unknown[], legacyType?: unknown): { disposition: 'imported' | 'quarantined'; reason: RowReason } {
  if (legacyType !== undefined && !classifyLegacyMemory(legacyType)) return { disposition: 'quarantined', reason: 'unsupported_kind' };
  for (const value of values) {
    const privacy = sanitizeLegacyImportContent(value);
    if (privacy.disposition === 'quarantined') return { disposition: 'quarantined', reason: privacy.reason };
  }
  return { disposition: 'imported', reason: 'imported' };
}

function exactExistingMemory(
  target: Database.Database | null,
  projectId: string,
  topicKey: string | null,
  kind: MemoryKind,
  outcome: MemoryOutcome,
  title: string,
  content: string,
): boolean {
  if (!target) return false;
  const rows = target.prepare(`SELECT title,content FROM memories WHERE project_id=? AND kind=? AND outcome=? AND status='current' AND ${topicKey === null ? 'topic_key IS NULL' : 'topic_key=?'}`).all(
    ...(topicKey === null ? [projectId, kind, outcome] : [projectId, kind, outcome, topicKey]),
  ) as Array<{ title: string; content: string }>;
  return rows.some((row) => row.title.normalize('NFC').trim() === title && row.content.normalize('NFC').trim() === content);
}

function plannedDispositions(dataset: LegacyDataset, mappings: ProjectResolution[], target: Database.Database | null): { dispositions: Record<LegacyEntity, EntityDispositionCounts>; reasons: Record<string, number> } {
  const dispositions = Object.fromEntries(ENTITIES.map((entity) => [entity, emptyCounts()])) as Record<LegacyEntity, EntityDispositionCounts>;
  const reasons: Record<string, number> = {};
  const count = (entity: LegacyEntity, disposition: keyof EntityDispositionCounts, reason: RowReason): void => { dispositions[entity][disposition]++; reasons[reason] = (reasons[reason] ?? 0) + 1; };
  const sessionMappings = new Map<string, ProjectResolution | null>();
  for (const row of dataset.sessions) {
    const project = sourceProjectValue(row); const mapping = project ? mappings.find((item) => item.sourceProject === project) ?? null : null; sessionMappings.set(String(row.id), mapping);
    if (!mapping || mapping.disposition === 'quarantined') count('session','quarantined',mapping?.basis as RowReason ?? 'placeholder_identity'); else count('session','imported','imported');
    if (typeof row.summary === 'string' && row.summary.trim()) {
      if (!mapping || mapping.disposition === 'quarantined') count('session_summary','quarantined',mapping?.basis as RowReason ?? 'placeholder_identity');
      else {
        const result = dispositionForContent([row.summary]);
        if (result.disposition === 'quarantined') count('session_summary', result.disposition, result.reason);
        else {
          const content = sanitizeLegacyImportContent(row.summary);
          const linked = content.disposition === 'accepted' && exactExistingMemory(target, mapping.resolvedProjectId!, null, 'handoff', 'unknown', 'Legacy session summary', content.value);
          count('session_summary', linked ? 'linked' : 'imported', linked ? 'exact_existing' : 'imported');
        }
      }
    }
  }
  const inspect = (entity: LegacyEntity, row: Record<string, unknown>, values: unknown[], legacyType?: unknown, parent?: Record<string, unknown>): void => {
    const resolved = mappingForRow(row, mappings, sessionMappings);
    if ((parent?.deleted_at ?? row.deleted_at) !== null && (parent?.deleted_at ?? row.deleted_at) !== undefined) { count(entity,'skipped','deleted'); return; }
    if (resolved.conflict) { count(entity,'quarantined','project_conflict'); return; }
    if (!resolved.mapping || resolved.mapping.disposition === 'quarantined') { count(entity,'quarantined',resolved.mapping?.basis as RowReason ?? 'placeholder_identity'); return; }
    const classification = classifyLegacyMemory(legacyType ?? (entity === 'observation' ? row.type : undefined));
    const result = dispositionForContent(values, legacyType ?? (entity === 'observation' ? row.type : undefined));
    if (result.disposition === 'quarantined' || entity === 'prompt' || !classification) { count(entity,result.disposition,result.reason); return; }
    const title = sanitizeLegacyImportContent(values[0]);
    const content = sanitizeLegacyImportContent(values[1]);
    const topic = typeof parent?.topic_key === 'string' ? parent.topic_key.normalize('NFC').trim() || null : typeof row.topic_key === 'string' ? row.topic_key.normalize('NFC').trim() || null : null;
    const linked = title.disposition === 'accepted' && content.disposition === 'accepted'
      && exactExistingMemory(target, resolved.mapping.resolvedProjectId!, topic, classification.kind, classification.outcome, title.value, content.value);
    count(entity, linked ? 'linked' : 'imported', linked ? 'exact_existing' : 'imported');
  };
  for (const row of dataset.prompts) inspect('prompt', row, [row.content]);
  const observations = new Map(dataset.observations.map((row) => [String(row.id), row]));
  for (const row of dataset.observationVersions) {
    const parent = observations.get(String(row.observation_id));
    const resolvedRow = parent && row.session_id === undefined ? { ...row, session_id: parent.session_id } : row;
    inspect('observation_version', resolvedRow, [row.title, row.content], parent?.type, parent);
  }
  for (const row of dataset.observations) inspect('observation', row, [row.title, row.content]);
  return { dispositions, reasons: Object.fromEntries(Object.entries(reasons).sort(([left],[right]) => left.localeCompare(right))) };
}

export interface PlanLegacyImportOptions { sourcePath: string; targetPath: string; mapping?: MappingManifest | null }

function samePhysicalFile(left: string, right: string): boolean {
  if (!existsSync(left) || !existsSync(right)) return false;
  const leftReal = realpathSync.native(left);
  const rightReal = realpathSync.native(right);
  if (leftReal.toLocaleLowerCase() === rightReal.toLocaleLowerCase()) return true;
  const leftStat = statSync(left, { bigint: true });
  const rightStat = statSync(right, { bigint: true });
  return leftStat.dev === rightStat.dev && leftStat.ino !== 0n && leftStat.ino === rightStat.ino;
}

export function planLegacyImport(options: PlanLegacyImportOptions): ImportPlan {
  const sourcePath = resolve(options.sourcePath); const targetPath = resolve(options.targetPath);
  if (sourcePath.toLocaleLowerCase() === targetPath.toLocaleLowerCase()) throw new Error('Legacy source and current target must be distinct paths');
  if (!existsSync(sourcePath)) throw new Error('Legacy source does not exist');
  if (samePhysicalFile(sourcePath, targetPath)) throw new Error('Legacy source and current target resolve to the same physical file');
  const sourceFilesBefore = fileFingerprint(sourcePath); const targetExists = existsSync(targetPath); const targetFilesBefore = targetExists ? fileFingerprint(targetPath) : null;
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true }); let target: Database.Database | null = null;
  try {
    source.pragma('query_only = ON');
    const objects = databaseObjects(source); const dataset = readLegacyDataset(source, objects); const sourceLogical = logicalSourceFingerprint(dataset);
    if (targetExists) {
      target = new Database(targetPath, { readonly: true, fileMustExist: true }); target.pragma('query_only = ON'); target.pragma('foreign_keys = ON');
      const version = target.prepare('SELECT max(version) AS version FROM schema_migrations').get() as { version: number | null };
      if (version.version !== SQLITE_SCHEMA_REVISION && version.version !== SQLITE_SCHEMA_REVISION - 1) throw new Error('Current target schema revision is unsupported');
    }
    const targetLogical = target ? currentLogicalFingerprint(target) : hashCanonical({ absent: true });
    const mappings = resolveProjects(dataset, target, options.mapping ?? null); const planned = plannedDispositions(dataset, mappings, target);
    const inventory: Record<LegacyEntity, number> = {
      session: dataset.sessions.length,
      prompt: dataset.prompts.length,
      session_summary: dataset.sessions.filter((row) => typeof row.summary === 'string' && row.summary.trim()).length,
      observation_version: dataset.observationVersions.length,
      observation: dataset.observations.length,
    };
    const plan = sealImportPlan({
      schema: 'thoth-mem.import.plan.v3', version: 3, createdAt: statSync(sourcePath).mtime.toISOString(),
      source: { path: sourcePath, schema: 'legacy-v1', logicalFingerprint: sourceLogical, fileFingerprint: sourceFilesBefore, authoritativeInventory: inventory, ignoredSchemaObjects: objects.filter((object) => object.category !== 'authoritative') },
      target: { path: targetPath, absent: !target, schemaRevision: target ? Number((target.prepare('SELECT max(version) AS version FROM schema_migrations').get() as { version: number }).version) : null, logicalFingerprint: targetLogical, fileFingerprint: targetFilesBefore, baselineManifestHash: targetLogical },
      policy: IMPORT_POLICY,
      projectMappings: mappings.map(({ destinationKey: _destinationKey, destinationName: _destinationName, ...mapping }) => mapping), mappingHash: '',
      plannedDispositions: planned.dispositions, reasonCounts: planned.reasons,
      integrityExpectations: { targetRevision: SQLITE_SCHEMA_REVISION, baselinePreservationHash: targetLogical, receiptCount: Object.values(inventory).reduce((sum, value) => sum + value, 0), requireFtsEquality: true, requireProvenance: true },
    });
    const sourceFilesAfter = fileFingerprint(sourcePath); const targetFilesAfter = target ? fileFingerprint(targetPath) : null;
    if (canonicalJson(sourceFilesAfter) !== canonicalJson(sourceFilesBefore) || logicalSourceFingerprint(readLegacyDataset(source, objects)) !== sourceLogical) throw new Error('Legacy source changed during planning');
    if (canonicalJson(targetFilesAfter) !== canonicalJson(targetFilesBefore) || (target && currentLogicalFingerprint(target) !== targetLogical)) throw new Error('Current target changed during planning');
    return plan;
  } finally { target?.close(); source.close(); }
}

export function inspectLegacyForApply(path: string): { dataset: LegacyDataset; logicalFingerprint: string; fileFingerprint: FileFingerprint } {
  const resolved = resolve(path); const files = fileFingerprint(resolved); const database = new Database(resolved, { readonly: true, fileMustExist: true });
  try { database.pragma('query_only = ON'); const objects = databaseObjects(database); const dataset = readLegacyDataset(database, objects); return { dataset, logicalFingerprint: logicalSourceFingerprint(dataset), fileFingerprint: files }; }
  finally { database.close(); }
}
