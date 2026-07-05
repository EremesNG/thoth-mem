import { Store } from '../store/index.js';
import { trimToBudget } from '../utils/content.js';

interface ProjectGraphOptions {
  topicKey?: string;
  relation?: string;
  limit?: number;
  maxChars?: number;
  includeSuperseded?: boolean;
}

type ProjectHealth = ReturnType<Store['getOperationalHealth']>;

function formatCommunitySummaryLines(store: Store, project: string): string[] {
  if (!store.config.communitySummaries.readPath.enabled) {
    return [];
  }

  const result = store.getCommunitySummariesForRetrieval({
    project,
    limit: store.config.communitySummaries.maxRetrievalCommunities,
    maxChars: Math.min(store.config.communitySummaries.summaryMaxChars, 600),
  });

  if ((result.state !== 'fresh' && result.state !== 'degraded') || result.candidates.length === 0) {
    return [];
  }

  return [
    '## Community Summaries',
    '',
    ...result.candidates.map((community) => [
      `- community=${community.community_id}`,
      `freshness=${result.state}`,
      `coverage=obs:${community.source_observation_ids.length} triples:${community.triple_count}`,
      `entities=${community.entity_count}`,
      `degraded=${community.degraded ? 'yes' : 'no'}`,
      `summary="${community.summary_text.replace(/\s+/g, ' ').slice(0, 240)}"`,
    ].join(' | ')),
  ];
}

export function formatProjectSummary(
  store: Store,
  project: string,
  limit: number = 10,
  maxOutputChars?: number,
): string {
  const header = [
    `## Project Summary: ${project}`,
    '',
  ].join('\n');
  const budget = maxOutputChars ?? store.config.maxContextChars;
  const contextBudget = budget === 0 ? 0 : Math.max(1, budget - header.length - 1);
  const communityLines = formatCommunitySummaryLines(store, project);
  const summary = [
    header,
    ...(communityLines.length > 0 ? [...communityLines, ''] : []),
    store.getContext({ project, limit, maxOutputChars: contextBudget }),
  ].join('\n');

  return budget === 0 ? summary : trimToBudget(summary, budget);
}

export function formatProjectGraph(store: Store, project: string, options: ProjectGraphOptions = {}): string {
  const limit = options.limit ?? 100;
  const maxChars = options.maxChars ?? 6000;
  const facts = store
    .getObservationFacts({ project, topic_key: options.topicKey, include_superseded: options.includeSuperseded })
    .filter((fact) => !options.relation || fact.relation === options.relation);
  const limitedFacts = facts.slice(0, limit);
  const factLines = limitedFacts.map((fact) => `- ${fact.subject} -- ${fact.relation} --> ${fact.object}`);
  const maintenanceLines = store.config.maintenance.readPath.enabled
    ? formatMaintenanceEvidenceLines(store, Array.from(new Set(limitedFacts.map((fact) => fact.observation_id))))
    : [];
  const filterParts = [
    options.topicKey ? `topic_key=${options.topicKey}` : null,
    options.relation ? `relation=${options.relation}` : null,
  ].filter((part): part is string => part !== null);

  const headerLines = [
    `## Knowledge Graph Ledger: ${project}`,
    '',
    filterParts.length > 0 ? `Filters: ${filterParts.join(', ')}` : null,
    `Showing ${limitedFacts.length} of ${facts.length} fact(s).`,
    '',
  ].filter((line): line is string => line !== null);

  if (facts.length === 0) {
    return [...headerLines, 'No KG/ledger facts found.'].join('\n');
  }

  const omittedByLimit = facts.length - limitedFacts.length;
  const omittedLine = omittedByLimit > 0
    ? `Omitted ${omittedByLimit} fact(s). Narrow with relation, topic_key, or a lower limit.`
    : null;
  const fullLines = [
    ...headerLines,
    ...factLines,
    ...(maintenanceLines.length > 0 ? ['', 'Maintenance evidence:', ...maintenanceLines] : []),
    omittedLine,
  ].filter((line): line is string => line !== null);
  const fullText = fullLines.join('\n');

  if (fullText.length <= maxChars) {
    return fullText;
  }

  const truncationLine = 'Output truncated by max_chars. Narrow with relation, topic_key, or a lower limit.';
  const truncatedLines = [...headerLines];

  for (const line of factLines) {
    const candidate = [...truncatedLines, line, truncationLine].join('\n');

    if (candidate.length > maxChars) {
      break;
    }

    truncatedLines.push(line);
  }

  let truncatedText = [...truncatedLines, truncationLine].join('\n');

  if (truncatedText.length > maxChars) {
    truncatedText = truncatedText.slice(0, maxChars);
  }

  return truncatedText;
}

export function formatProjectHealth(store: Store, project?: string, maxChars: number = 4000): string {
  const health: ProjectHealth = store.getOperationalHealth({ project });
  const jobs = health.jobs;
  const coverage = health.coverage;
  const lines = [
    '## Operational Health',
    project ? `Project: ${project}` : 'Project: all',
    '',
    `- overall: ${health.status}`,
    `- legacy_drift: ${health.legacy_drift.status}`,
    `- graph_source: ${health.visualization.graph_source}`,
    health.legacy_drift.missing_table ? `- legacy_detail: missing table ${health.legacy_drift.missing_table}` : `- legacy_detail: ${health.legacy_drift.message}`,
    '',
    '## Semantic',
    `- state: ${health.semantic.state}`,
    `- runtime: pending=${health.semantic.pending ? 'yes' : 'no'} stale=${health.semantic.stale ? 'yes' : 'no'} degraded=${health.semantic.degraded ? 'yes' : 'no'}`,
    health.semantic.degradedReason ? `- degraded_reason: ${health.semantic.degradedReason}` : null,
    `- lanes: ${health.semantic.lanes.map((lane) => `${lane.lane}:${lane.degraded ? 'degraded' : lane.stale ? 'stale' : lane.pending ? 'pending' : 'ready'}`).join(', ') || 'none'}`,
    '',
    '## Visualization / KG',
    `- semantic_state: ${health.visualization.semantic_state}`,
    `- kg_available: ${health.visualization.kg_available ? 'yes' : 'no'}`,
    `- pending_jobs: ${health.visualization.pending_jobs}`,
    '',
    '## Jobs',
    `- total: ${jobs.total}`,
    `- pending: ${jobs.pending}`,
    `- running: ${jobs.running}`,
    `- failed: ${jobs.failed}`,
    `- queue_lag_ms: ${jobs.queue_lag_ms ?? 'none'}`,
    `- by_kind: ${jobs.by_kind.map((job) => `${job.kind}=p${job.pending}/r${job.running}/f${job.failed}`).join(', ') || 'none'}`,
    '',
    '## Coverage',
    `- observations: ${coverage.observations}`,
    `- chunks: ${coverage.chunk_vectors}/${coverage.chunks} vectors (${coverage.chunk_coverage})`,
    `- sentences: ${coverage.sentence_vectors}/${coverage.sentences} vectors (${coverage.sentence_coverage})`,
    '',
    '## Recent Errors',
    ...(health.recent_errors.length > 0
      ? health.recent_errors.map((error) => `- ${error.kind}/${error.state} ${error.job_key}: ${error.last_error ?? 'unknown error'}`)
      : ['- none']),
  ].filter((line): line is string => line !== null);
  const text = lines.join('\n');

  return maxChars === 0 ? text : trimToBudget(text, maxChars);
}

function formatMaintenanceEvidenceLines(store: Store, observationIds: number[]): string[] {
  return store.getMaintenanceEvidenceForObservations(observationIds).flatMap((entry) => {
    const lines: string[] = [];
    if (entry.consolidation) {
      lines.push([
        `- obs:${entry.observationId} consolidation`,
        `cluster=${entry.consolidation.clusterKey}`,
        `canonical=obs:${entry.consolidation.canonicalId}`,
        `sources=${entry.consolidation.memberIds.map((id) => `obs:${id}`).join(',')}`,
        `reason=${entry.consolidation.reasonClass}`,
      ].join(' | '));
    }
    if (entry.reflection) {
      lines.push([
        `- obs:${entry.observationId} reflection`,
        `sources=${entry.reflection.sourceIds.map((id) => `obs:${id}`).join(',')}`,
        `reason=${entry.reflection.reasonClass}`,
      ].join(' | '));
    }
    if (entry.decay) {
      lines.push([
        `- obs:${entry.observationId} decay state=${entry.decay.state}`,
        `score=${entry.decay.scoreMultiplier}`,
        `reason=${entry.decay.reasonClass}`,
      ].join(' | '));
    }
    return lines;
  });
}

export function formatTopicKeyList(store: Store, project?: string): string {
  const topics = store.listTopicKeys(project);
  const lines = topics.map((topic) => [
    `- **${topic.topic_key}**`,
    `project=${topic.project ?? 'unknown'}`,
    `type=${topic.type}`,
    `observations=${topic.observation_count}`,
    `updated=${topic.updated_at}`,
    `latest="${topic.title}"`,
  ].join(' | '));

  return [
    project ? `## Topic Keys: ${project}` : '## Topic Keys',
    '',
    lines.length > 0 ? lines.join('\n') : 'No topic keys found.',
  ].join('\n');
}

export function formatTopicKeyContext(
  store: Store,
  project: string,
  topicKey: string,
  maxChars: number = 6000,
  limit: number = 10
): string {
  const context = store.searchObservationsFormatted({
    query: topicKey,
    project,
    topic_key_exact: topicKey,
    mode: 'context',
    max_chars: maxChars,
    limit,
  });

  return [
    `## Topic Key: ${topicKey}`,
    `Project: ${project}`,
    '',
    context,
  ].join('\n');
}
