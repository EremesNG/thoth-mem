import { createHash } from 'node:crypto';

import type { MemoryKind, MemoryOutcome } from '../contracts.js';
import { SQLITE_SCHEMA_REVISION } from '../sqlite/migrations.js';

export const IMPORT_PLAN_SCHEMA = 'thoth-mem.import.plan.v3' as const;
export const IMPORT_REPORT_SCHEMA = 'thoth-mem.import.report.v3' as const;
export const IMPORT_MAPPING_SCHEMA = 'thoth-mem.import.mapping.v1' as const;

export type LegacyEntity = 'session' | 'prompt' | 'session_summary' | 'observation_version' | 'observation';
export type ProjectDisposition = 'mapped' | 'isolated' | 'quarantined';
export type ProjectBasis = 'explicit' | 'exact_identity' | 'exact_path_alias' | 'isolated_legacy' | 'placeholder_identity' | 'ambiguous_identity' | 'project_conflict';
export type RowDisposition = 'imported' | 'linked' | 'skipped' | 'quarantined';
export type RowReason = 'imported' | 'deleted' | 'placeholder_identity' | 'ambiguous_identity' | 'project_conflict' | 'privacy_malformed' | 'empty_after_filter' | 'unsupported_kind' | 'exact_existing';
export type ImportFailureCode = 'SOURCE_CHANGED' | 'TARGET_CHANGED' | 'PLAN_INVALID' | 'PLAN_STALE' | 'MAPPING_INVALID' | 'TARGET_LOCKED' | 'BACKUP_FAILED' | 'IMPORT_FAILED' | 'RECONCILIATION_FAILED' | 'INTEGRITY_FAILED' | 'PUBLICATION_FAILED';

export interface FileFingerprint { main: string; wal: string | null; shm: string | null }
export interface EntityDispositionCounts { imported: number; linked: number; skipped: number; quarantined: number }
export interface SchemaObjectInventory { name: string; type: 'table' | 'view' | 'index' | 'trigger'; category: 'authoritative' | 'derived' | 'shadow' | 'unsupported'; virtual: boolean }
export interface ProjectMapping {
  sourceProjectHash: string;
  sourceProject: string;
  disposition: ProjectDisposition;
  basis: ProjectBasis;
  destinationSelector: string | null;
  resolvedProjectId: string | null;
}

export interface ImportPlan {
  schema: typeof IMPORT_PLAN_SCHEMA;
  version: 3;
  planHash: string;
  createdAt: string;
  source: {
    path: string;
    schema: 'legacy-v1';
    logicalFingerprint: string;
    fileFingerprint: FileFingerprint;
    authoritativeInventory: Record<LegacyEntity, number>;
    ignoredSchemaObjects: SchemaObjectInventory[];
  };
  target: {
    path: string;
    absent: boolean;
    schemaRevision: number | null;
    logicalFingerprint: string;
    fileFingerprint: FileFingerprint | null;
    baselineManifestHash: string;
  };
  policy: {
    importer: 'reconcile-v3'; projectResolution: 'exact-explicit-v1'; privacy: 'legacy-private-v1'; taxonomy: 'legacy-taxonomy-bugfix-v1'; temporal: 'legacy-history-v1'; dedup: 'exact-canonical-v1'; policyHash: string;
  };
  projectMappings: ProjectMapping[];
  mappingHash: string;
  plannedDispositions: Record<LegacyEntity, EntityDispositionCounts>;
  reasonCounts: Record<string, number>;
  integrityExpectations: { targetRevision: typeof SQLITE_SCHEMA_REVISION; baselinePreservationHash: string; receiptCount: number; requireFtsEquality: true; requireProvenance: true };
}

export interface MappingManifest {
  schema: typeof IMPORT_MAPPING_SCHEMA;
  version: 1;
  mappings: Array<{ sourceProject: string; targetSelector: string }>;
}

export interface ImportReport {
  schema: typeof IMPORT_REPORT_SCHEMA;
  version: 3;
  importId: string | null;
  planHash: string;
  committed: boolean;
  duplicate: boolean;
  startedAt: string;
  finishedAt: string;
  fingerprints: {
    source: string;
    targetBase: string;
    backup: string | null;
    candidate: string | null;
    published: string | null;
  };
  artifacts: { backupPath: string | null; recoveryBundlePath: string | null; recoveryBundleFingerprint: string | null; candidateCleaned: boolean };
  dispositions: Record<LegacyEntity, EntityDispositionCounts>;
  reasonCounts: Record<string, number>;
  receipts: { imports: number; projects: number; rows: number; importId: string | null };
  rowDelta: { projects: number; sessions: number; evidence: number; memories: number; memoryEvidence: number; fts: number; receipts: number };
  integrity: { schemaRevision: boolean; baselinePreserved: boolean; receiptClosure: boolean; temporalLineage: boolean; provenance: boolean; foreignKeys: boolean; sqlite: boolean; fts: boolean; sourceUnchanged: boolean; targetBaseUnchanged: boolean };
  failure: { code: ImportFailureCode; message: string; priorTargetRestored: boolean } | null;
}

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, sortCanonical(child)]));
  }
  return typeof value === 'string' ? value.normalize('NFC') : value;
}

export function canonicalJson(value: unknown): string { return JSON.stringify(sortCanonical(value)); }
export function sha256(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
export function hashCanonical(value: unknown): string { return sha256(canonicalJson(value)); }

export interface LegacyMemoryClassification {
  legacyKind: string;
  kind: MemoryKind;
  outcome: MemoryOutcome;
}

const LEGACY_MEMORY_TAXONOMY: Readonly<Record<string, Omit<LegacyMemoryClassification, 'legacyKind'>>> = {
  architecture: { kind: 'architecture', outcome: 'unknown' },
  bugfix: { kind: 'discovery', outcome: 'succeeded' },
  config: { kind: 'convention', outcome: 'unknown' },
  convention: { kind: 'convention', outcome: 'unknown' },
  decision: { kind: 'decision', outcome: 'unknown' },
  discovery: { kind: 'discovery', outcome: 'unknown' },
  failure: { kind: 'failure', outcome: 'unknown' },
  handoff: { kind: 'handoff', outcome: 'unknown' },
  learning: { kind: 'convention', outcome: 'unknown' },
  preference: { kind: 'preference', outcome: 'unknown' },
  project_structure: { kind: 'project_structure', outcome: 'unknown' },
  session_summary: { kind: 'handoff', outcome: 'unknown' },
};

export function classifyLegacyMemory(value: unknown): LegacyMemoryClassification | null {
  if (typeof value !== 'string') return null;
  const legacyKind = value.normalize('NFC').trim().toLocaleLowerCase();
  const classification = LEGACY_MEMORY_TAXONOMY[legacyKind];
  return classification ? { legacyKind, ...classification } : null;
}

export function legacyObservationVersion(row: Record<string, unknown>): number {
  return Math.max(1, Number(row.version_number) || 1);
}

const POLICY_WITHOUT_HASH = {
  importer: 'reconcile-v3', projectResolution: 'exact-explicit-v1', privacy: 'legacy-private-v1', taxonomy: 'legacy-taxonomy-bugfix-v1', temporal: 'legacy-history-v1', dedup: 'exact-canonical-v1',
} as const;
export const IMPORT_POLICY: ImportPlan['policy'] = { ...POLICY_WITHOUT_HASH, policyHash: hashCanonical(POLICY_WITHOUT_HASH) };

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} has unknown or missing fields`);
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function hashValue(value: unknown, label: string): string {
  const result = stringValue(value, label);
  if (!/^[0-9a-f]{64}$/u.test(result)) throw new Error(`${label} must be a SHA-256 hash`);
  return result;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error(`${label} is invalid`);
  return value as T;
}

function fileFingerprint(value: unknown, label: string): FileFingerprint {
  const fingerprint = record(value, label);
  exactKeys(fingerprint, ['main', 'wal', 'shm'], label);
  return {
    main: hashValue(fingerprint.main, `${label}.main`),
    wal: fingerprint.wal === null ? null : hashValue(fingerprint.wal, `${label}.wal`),
    shm: fingerprint.shm === null ? null : hashValue(fingerprint.shm, `${label}.shm`),
  };
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
  return value;
}

export function sealImportPlan(input: Omit<ImportPlan, 'planHash'>): ImportPlan {
  const mappings = [...input.projectMappings].sort((left, right) => left.sourceProjectHash.localeCompare(right.sourceProjectHash));
  const planWithoutHash = { ...input, projectMappings: mappings, mappingHash: hashCanonical(mappings) };
  return { ...planWithoutHash, planHash: hashCanonical(planWithoutHash) };
}

export function parseImportPlan(value: unknown): ImportPlan {
  const plan = record(value, 'plan');
  exactKeys(plan, ['schema','version','planHash','createdAt','source','target','policy','projectMappings','mappingHash','plannedDispositions','reasonCounts','integrityExpectations'], 'plan');
  if (plan.schema !== IMPORT_PLAN_SCHEMA || plan.version !== 3 || typeof plan.planHash !== 'string') throw new Error('Plan schema or version is invalid');
  const source = record(plan.source, 'plan.source');
  exactKeys(source, ['path','schema','logicalFingerprint','fileFingerprint','authoritativeInventory','ignoredSchemaObjects'], 'plan.source');
  const target = record(plan.target, 'plan.target');
  exactKeys(target, ['path','absent','schemaRevision','logicalFingerprint','fileFingerprint','baselineManifestHash'], 'plan.target');
  if (source.schema !== 'legacy-v1') throw new Error('Plan source schema is invalid');
  stringValue(source.path, 'plan.source.path');
  hashValue(source.logicalFingerprint, 'plan.source.logicalFingerprint');
  fileFingerprint(source.fileFingerprint, 'plan.source.fileFingerprint');
  const inventory = record(source.authoritativeInventory, 'plan.source.authoritativeInventory');
  exactKeys(inventory, ['session','prompt','session_summary','observation_version','observation'], 'plan.source.authoritativeInventory');
  for (const [entity, count] of Object.entries(inventory)) nonNegativeInteger(count, `plan.source.authoritativeInventory.${entity}`);
  if (!Array.isArray(source.ignoredSchemaObjects)) throw new Error('Plan ignored schema objects must be an array');
  for (const value of source.ignoredSchemaObjects) {
    const object = record(value, 'ignored schema object');
    exactKeys(object, ['name','type','category','virtual'], 'ignored schema object');
    stringValue(object.name, 'ignored schema object name');
    enumValue(object.type, ['table','view','index','trigger'] as const, 'ignored schema object type');
    enumValue(object.category, ['authoritative','derived','shadow','unsupported'] as const, 'ignored schema object category');
    if (typeof object.virtual !== 'boolean') throw new Error('Ignored schema object virtual flag is invalid');
  }
  stringValue(target.path, 'plan.target.path');
  if (typeof target.absent !== 'boolean') throw new Error('Plan target absent marker is invalid');
  if (target.schemaRevision !== null && (typeof target.schemaRevision !== 'number' || !Number.isInteger(target.schemaRevision) || target.schemaRevision < 1)) throw new Error('Plan target schema revision is invalid');
  hashValue(target.logicalFingerprint, 'plan.target.logicalFingerprint');
  if (target.fileFingerprint !== null) fileFingerprint(target.fileFingerprint, 'plan.target.fileFingerprint');
  hashValue(target.baselineManifestHash, 'plan.target.baselineManifestHash');
  if ((target.absent && (target.schemaRevision !== null || target.fileFingerprint !== null)) || (!target.absent && (target.schemaRevision === null || target.fileFingerprint === null))) throw new Error('Plan target absent marker is inconsistent');
  const policy = record(plan.policy, 'plan.policy');
  exactKeys(policy, ['importer','projectResolution','privacy','taxonomy','temporal','dedup','policyHash'], 'plan.policy');
  if (canonicalJson(policy) !== canonicalJson(IMPORT_POLICY)) throw new Error('Plan policy is unsupported');
  if (!Array.isArray(plan.projectMappings)) throw new Error('Plan project mappings must be an array');
  for (const value of plan.projectMappings) {
    const item = record(value, 'project mapping');
    exactKeys(item, ['sourceProjectHash','sourceProject','disposition','basis','destinationSelector','resolvedProjectId'], 'project mapping');
    hashValue(item.sourceProjectHash, 'project mapping source hash');
    stringValue(item.sourceProject, 'project mapping source project');
    enumValue(item.disposition, ['mapped','isolated','quarantined'] as const, 'project mapping disposition');
    enumValue(item.basis, ['explicit','exact_identity','exact_path_alias','isolated_legacy','placeholder_identity','ambiguous_identity','project_conflict'] as const, 'project mapping basis');
    if (item.destinationSelector !== null) stringValue(item.destinationSelector, 'project mapping destination selector');
    if (item.resolvedProjectId !== null) stringValue(item.resolvedProjectId, 'project mapping resolved project ID');
  }
  const dispositions = record(plan.plannedDispositions, 'plan.plannedDispositions');
  exactKeys(dispositions, ['session','prompt','session_summary','observation_version','observation'], 'plan.plannedDispositions');
  for (const [entity, value] of Object.entries(dispositions)) {
    const counts = record(value, `plan.plannedDispositions.${entity}`);
    exactKeys(counts, ['imported','linked','skipped','quarantined'], `plan.plannedDispositions.${entity}`);
    for (const [disposition, count] of Object.entries(counts)) nonNegativeInteger(count, `plan.plannedDispositions.${entity}.${disposition}`);
  }
  const reasons = record(plan.reasonCounts, 'plan.reasonCounts');
  for (const [reason, count] of Object.entries(reasons)) {
    enumValue(reason, ['imported','deleted','placeholder_identity','ambiguous_identity','project_conflict','privacy_malformed','empty_after_filter','unsupported_kind','exact_existing'] as const, 'plan reason');
    nonNegativeInteger(count, `plan.reasonCounts.${reason}`);
  }
  const integrity = record(plan.integrityExpectations, 'plan.integrityExpectations');
  exactKeys(integrity, ['targetRevision','baselinePreservationHash','receiptCount','requireFtsEquality','requireProvenance'], 'plan.integrityExpectations');
  if (integrity.targetRevision !== SQLITE_SCHEMA_REVISION) throw new Error('Plan target revision is unsupported');
  hashValue(integrity.baselinePreservationHash, 'plan baseline preservation hash');
  nonNegativeInteger(integrity.receiptCount, 'plan receipt count');
  if (integrity.requireFtsEquality !== true || integrity.requireProvenance !== true) throw new Error('Plan integrity requirements are invalid');
  const typed = plan as unknown as ImportPlan;
  const withoutHash = { ...typed } as Record<string, unknown>; delete withoutHash.planHash;
  if (typed.mappingHash !== hashCanonical(typed.projectMappings) || typed.planHash !== hashCanonical(withoutHash)) throw new Error('Plan hash is invalid');
  return typed;
}

export function parseMappingManifest(value: unknown): MappingManifest {
  const manifest = record(value, 'mapping manifest');
  exactKeys(manifest, ['schema','version','mappings'], 'mapping manifest');
  if (manifest.schema !== IMPORT_MAPPING_SCHEMA || manifest.version !== 1 || !Array.isArray(manifest.mappings)) throw new Error('Mapping manifest schema is invalid');
  const seen = new Set<string>();
  const mappings = manifest.mappings.map((entry) => {
    const item = record(entry, 'mapping'); exactKeys(item, ['sourceProject','targetSelector'], 'mapping');
    if (typeof item.sourceProject !== 'string' || typeof item.targetSelector !== 'string' || !item.sourceProject.trim() || !item.targetSelector.trim()) throw new Error('Mapping values must be non-empty strings');
    const sourceProject = item.sourceProject.normalize('NFC').trim();
    if (seen.has(sourceProject)) throw new Error('Mapping source project is duplicated');
    seen.add(sourceProject); return { sourceProject, targetSelector: item.targetSelector.normalize('NFC').trim() };
  });
  return { schema: IMPORT_MAPPING_SCHEMA, version: 1, mappings };
}
