import { createHash } from 'node:crypto';
import type { MaintenanceConfig } from '../config.js';
import type {
  MaintenanceConsolidationCandidate,
  MaintenanceCounts,
  MaintenanceDecayCandidate,
  MaintenanceInput,
  MaintenanceReflectionCandidate,
  MaintenanceRunPreview,
  MaintenanceScope,
  MaintenanceSourceRef,
  Observation,
} from './types.js';

export interface MaintenancePlanningRecord {
  id: number;
  type: Observation['type'];
  title: string;
  content: string;
  project: string | null;
  scope: Observation['scope'];
  topic_key: string | null;
  normalized_hash: string | null;
  duplicate_count: number;
  created_at: string;
  updated_at: string;
  tool_name: string | null;
}

export interface MaintenancePlanInput {
  records: MaintenancePlanningRecord[];
  config: MaintenanceConfig;
  input?: MaintenanceInput;
  now?: Date;
}

export interface MaintenancePlan extends MaintenanceRunPreview {
  run_key: string;
}

export function normalizeMaintenanceScope(scope: MaintenanceScope | undefined): MaintenanceScope {
  return scope ?? { all: true };
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function sourceRef(record: MaintenancePlanningRecord): MaintenanceSourceRef {
  return { kind: 'observation', id: record.id };
}

function canonicalByChronology(records: MaintenancePlanningRecord[]): MaintenancePlanningRecord {
  return [...records].sort((a, b) => (
    b.updated_at.localeCompare(a.updated_at) || b.created_at.localeCompare(a.created_at) || a.id - b.id
  ))[0];
}

function groupBy<T>(items: T[], keyFor: (item: T) => string | null): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const key = keyFor(item);
    if (!key) {
      continue;
    }

    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return groups;
}

function buildConsolidations(
  records: MaintenancePlanningRecord[],
  config: MaintenanceConfig,
): MaintenanceConsolidationCandidate[] {
  if (!config.enabled || !config.consolidation.enabled) {
    return [];
  }

  const candidates: MaintenanceConsolidationCandidate[] = [];
  const groups = groupBy(records, (record) => {
    if (!record.normalized_hash) {
      return null;
    }
    return [
      'hash',
      record.normalized_hash,
      record.project ?? '',
      record.scope,
      record.type,
    ].join(':');
  });

  for (const [groupKey, group] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (group.length <= config.consolidation.exactHashThreshold) {
      continue;
    }

    const canonical = canonicalByChronology(group);
    const members = [...group].sort((a, b) => a.id - b.id);
    const memberRefs = members.map(sourceRef);
    const clusterKey = `consolidation:${hashJson({ groupKey, ids: members.map((record) => record.id) })}`;

    candidates.push({
      cluster_key: clusterKey,
      canonical: sourceRef(canonical),
      members: memberRefs,
      reason_class: 'exact-hash',
      review_required: false,
      signal: {
        hash: canonical.normalized_hash,
        project: canonical.project,
        scope: canonical.scope,
        type: canonical.type,
        member_count: members.length,
      },
    });
  }

  return candidates;
}

function reflectionGroupKey(record: MaintenancePlanningRecord): string {
  if (record.topic_key) {
    return `topic:${record.project ?? ''}:${record.scope}:${record.topic_key}`;
  }

  return `type:${record.project ?? ''}:${record.scope}:${record.type}`;
}

function buildReflectionContent(records: MaintenancePlanningRecord[], budget: number): string {
  const titles = records.map((record) => record.title).join('; ');
  const content = [
    `**What**: Maintenance reflection synthesized ${records.length} related source memories.`,
    `**Why**: The source set shares a deterministic project/topic/type grouping.`,
    `**Learned**: ${titles}`,
  ].join('\n');

  return content.length <= budget ? content : `${content.slice(0, Math.max(0, budget - 15)).trimEnd()}\n[truncated]`;
}

function buildReflections(
  records: MaintenancePlanningRecord[],
  config: MaintenanceConfig,
): MaintenanceReflectionCandidate[] {
  if (!config.enabled || !config.reflection.enabled) {
    return [];
  }

  const eligible = records.filter((record) => record.tool_name !== 'maintenance-reflection');
  const groups = groupBy(eligible, reflectionGroupKey);
  const reflections: MaintenanceReflectionCandidate[] = [];

  for (const [groupKey, group] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (group.length < config.reflection.minSourceCount) {
      continue;
    }

    const sources = [...group]
      .sort((a, b) => a.id - b.id)
      .slice(0, config.reflection.maxSourceCount);
    const sourceIds = sources.map((record) => record.id);
    const sourceSetHash = hashJson({ groupKey, sourceIds });
    const first = sources[0];

    reflections.push({
      source_set_hash: sourceSetHash,
      topic_key: `maintenance/reflection/${sourceSetHash.slice(0, 16)}`,
      title: `Maintenance reflection: ${first.project ?? 'unknown'} ${first.topic_key ?? first.type}`,
      content: buildReflectionContent(sources, config.reflection.contentBudgetChars),
      sources: sources.map(sourceRef),
      reason_class: first.topic_key ? 'topic-cluster' : 'type-cluster',
      existing_observation_id: null,
    });
  }

  return reflections;
}

function daysBetween(now: Date, timestamp: string): number {
  const then = new Date(timestamp);
  if (Number.isNaN(then.getTime())) {
    return 0;
  }

  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / 86_400_000));
}

function buildDecays(
  records: MaintenancePlanningRecord[],
  config: MaintenanceConfig,
  now: Date,
): MaintenanceDecayCandidate[] {
  if (!config.enabled || !config.decay.enabled) {
    return [];
  }

  const lowValueTypes = new Set(config.decay.lowValueTypes);
  const decays: MaintenanceDecayCandidate[] = [];

  for (const record of [...records].sort((a, b) => a.id - b.id)) {
    const ageDays = daysBetween(now, record.updated_at || record.created_at);
    const reasons: string[] = [];

    if (ageDays >= config.decay.staleAfterDays) {
      reasons.push('stale-age');
    }
    if (record.duplicate_count >= config.decay.redundantDuplicateCount) {
      reasons.push('redundant-duplicates');
    }
    if (lowValueTypes.has(record.type)) {
      reasons.push('low-value-type');
    }

    if (reasons.length === 0) {
      continue;
    }

    decays.push({
      source: sourceRef(record),
      score: config.decay.scoreMultiplier,
      state: config.decay.defaultState,
      reason_class: reasons.join('+'),
      policy: {
        stale_after_days: config.decay.staleAfterDays,
        redundant_duplicate_count: config.decay.redundantDuplicateCount,
        low_value_types: config.decay.lowValueTypes,
        observed_age_days: ageDays,
        observed_duplicate_count: record.duplicate_count,
        observed_type: record.type,
      },
    });
  }

  return decays;
}

function buildCounts(
  records: MaintenancePlanningRecord[],
  consolidations: MaintenanceConsolidationCandidate[],
  reflections: MaintenanceReflectionCandidate[],
  decays: MaintenanceDecayCandidate[],
): MaintenanceCounts {
  return {
    records_scanned: records.length,
    consolidation_candidates: consolidations.length,
    reflection_candidates: reflections.length,
    decay_candidates: decays.length,
    review_required: consolidations.filter((candidate) => candidate.review_required).length,
  };
}

export function planMaintenance(input: MaintenancePlanInput): MaintenancePlan {
  const scope = normalizeMaintenanceScope(input.input?.scope);
  const sortedRecords = [...input.records].sort((a, b) => a.id - b.id);
  const consolidations = buildConsolidations(sortedRecords, input.config);
  const reflections = buildReflections(sortedRecords, input.config);
  const decays = buildDecays(sortedRecords, input.config, input.now ?? new Date());
  const counts = buildCounts(sortedRecords, consolidations, reflections, decays);
  const degraded = input.config.reflection.modelAssisted
    ? ['model-reflection-unavailable-deterministic-fallback-used']
    : [];
  const run_key = `maintenance:${hashJson({
    scope,
    config: input.config,
    records: sortedRecords.map((record) => ({
      id: record.id,
      hash: record.normalized_hash,
      duplicate_count: record.duplicate_count,
      updated_at: record.updated_at,
    })),
    counts,
  })}`;

  return {
    run_key,
    dry_run: true,
    scope,
    counts,
    consolidations,
    reflections,
    decays,
    degraded,
  };
}
