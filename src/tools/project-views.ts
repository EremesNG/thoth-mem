import { Store } from '../store/index.js';
import { trimToBudget } from '../utils/content.js';

interface ProjectGraphOptions {
  topicKey?: string;
  relation?: string;
  limit?: number;
  maxChars?: number;
  includeSuperseded?: boolean;
}

interface GraphNavigationOptions {
  topicKey?: string;
  relation?: string;
  limit?: number;
  maxChars?: number;
}

interface NeighborhoodNavigationOptions extends GraphNavigationOptions {
  focusNodeId: string;
  continuation?: string;
}

interface LineageNavigationOptions extends GraphNavigationOptions {
  observationId?: number;
  continuation?: string;
}

interface SupersededNavigationOptions extends GraphNavigationOptions {
  observationId?: number;
}

type ProjectHealth = ReturnType<Store['getOperationalHealth']>;

function graphLimit(limit: number | undefined, fallback = 100): number {
  return Math.min(Math.max(limit ?? fallback, 1), 500);
}

function graphBudget(maxChars: number | undefined, fallback = 6000): number {
  return maxChars ?? fallback;
}

function trimGraphText(text: string, maxChars: number, hint: string): string {
  if (text.length <= maxChars) {
    return text;
  }

  const marker = `\n${hint}`;
  const sliceLength = Math.max(0, maxChars - marker.length);
  return `${text.slice(0, sliceLength)}${marker}`.slice(0, maxChars);
}

function factLine(fact: ReturnType<Store['getObservationFacts']>[number], tag?: string): string {
  const metadata = [
    `obs:${fact.observation_id}`,
    `type=${fact.type}`,
    fact.topic_key ? `topic=${fact.topic_key}` : null,
    `created=${fact.created_at}`,
    tag,
  ].filter((part): part is string => Boolean(part));

  return `- ${fact.subject} -- ${fact.relation} --> ${fact.object} | ${metadata.join(' | ')}`;
}

function preview(text: string, length = 180): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, length);
}

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
  const limit = graphLimit(options.limit);
  const maxChars = graphBudget(options.maxChars);
  const facts = store
    .getObservationFacts({ project, topic_key: options.topicKey, include_superseded: options.includeSuperseded })
    .filter((fact) => !options.relation || fact.relation === options.relation);
  const limitedFacts = facts.slice(0, limit);
  const factLines = limitedFacts.map((fact) => factLine(fact));
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
    ? `Omitted ${omittedByLimit} fact(s). continuation=frontier:${limitedFacts.length}. Narrow with relation, topic_key, or a lower limit.`
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

export function formatProjectNeighborhoodNavigation(
  store: Store,
  project: string,
  options: NeighborhoodNavigationOptions,
): string {
  const limit = graphLimit(options.limit, 25);
  const maxChars = graphBudget(options.maxChars, 6000);
  const context = store.getObservatoryContext({
    project,
    topic_key: options.topicKey,
    relation: options.relation,
  });
  const frontier = store.getObservatoryMapFrontier({
    context_token: context.context_token,
    focus_node_id: options.focusNodeId,
    max_nodes: limit,
    max_edges: Math.max(limit * 2, 1),
    continuation: options.continuation,
  });
  const nodeLines = frontier.nodes.map((node) => [
    `- node=${node.id}`,
    `kind=${node.kind}`,
    `label="${preview(node.label, 120)}"`,
  ].join(' | '));
  const edgeLines = frontier.edges.map((edge) => [
    `- edge=${edge.id}`,
    `${edge.source_id} -- ${edge.relation} --> ${edge.target_id}`,
    `kind=${edge.kind}`,
  ].join(' | '));
  const state = frontier.frontier_state;
  const lines = [
    `## Graph Neighborhood: ${project}`,
    '',
    `Focus: focus_node_id=${options.focusNodeId}`,
    `Filters: ${[
      options.topicKey ? `topic_key=${options.topicKey}` : null,
      options.relation ? `relation=${options.relation}` : null,
    ].filter(Boolean).join(', ') || 'none'}`,
    `Bounds: limit=${limit}, max_chars=${maxChars}`,
    `Frontier: added=${state.added_node_ids.length} already_visible=${state.already_visible_node_ids.length} exhausted=${state.exhausted ? 'yes' : 'no'} continuation=${state.continuation ?? 'none'} reason=${state.reason ?? 'ok'}`,
    `Added nodes: ${state.added_node_ids.join(', ') || 'none'}`,
    `Already visible nodes: ${state.already_visible_node_ids.join(', ') || 'none'}`,
    '',
    'Nodes:',
    ...(nodeLines.length > 0 ? nodeLines : ['- none']),
    '',
    'Edge evidence:',
    ...(edgeLines.length > 0 ? edgeLines : ['- none']),
  ];

  return trimGraphText(lines.join('\n'), maxChars, 'Output truncated by max_chars. Continue with returned continuation or reduce limit.');
}

export function formatProjectLineageNavigation(
  store: Store,
  project: string,
  options: LineageNavigationOptions = {},
): string {
  const limit = graphLimit(options.limit, 25);
  const maxChars = graphBudget(options.maxChars, 6000);
  const focusedObservation = options.observationId ? store.getObservation(options.observationId) : null;
  const focusedEvent = focusedObservation
    && focusedObservation.project === project
    && (!options.topicKey || focusedObservation.topic_key === options.topicKey)
    ? focusedObservation
    : null;
  const context = options.observationId ? null : store.getObservatoryContext({ project, topic_key: options.topicKey });
  const timeline = context
    ? store.getObservatoryTimeline({
      context_token: context.context_token,
      limit,
      continuation: options.continuation,
    })
    : null;
  const filteredEvents = focusedEvent ? [focusedEvent] : timeline?.events ?? [];
  const continuation = timeline?.continuation ?? null;
  const eventLines = filteredEvents.map((event) => [
    `- obs:${event.id}`,
    `title="${event.title}"`,
    `type=${event.type}`,
    `topic=${event.topic_key ?? 'none'}`,
    `session=${event.session_id}`,
    `created=${event.created_at}`,
    `preview="${preview(event.content)}"`,
  ].join(' | '));
  const lines = [
    `## Graph Lineage: ${project}`,
    '',
    `Filters: ${[
      options.topicKey ? `topic_key=${options.topicKey}` : null,
      options.observationId ? `observation_id=${options.observationId}` : null,
    ].filter(Boolean).join(', ') || 'none'}`,
    `Bounds: limit=${limit}, max_chars=${maxChars}`,
    `Continuation: ${continuation ?? 'none'}`,
    '',
    ...(eventLines.length > 0 ? eventLines : ['No lineage events found.']),
  ];

  return trimGraphText(lines.join('\n'), maxChars, 'Output truncated by max_chars. Continue with returned continuation or reduce limit.');
}

export function formatProjectSupersededNavigation(
  store: Store,
  project: string,
  options: SupersededNavigationOptions = {},
): string {
  const limit = graphLimit(options.limit);
  const maxChars = graphBudget(options.maxChars, 6000);
  const facts = store
    .getObservationFacts({
      project,
      topic_key: options.topicKey,
      observation_id: options.observationId,
      include_superseded: true,
    })
    .filter((fact) => !options.relation || fact.relation === options.relation);
  const supersededFacts = facts.filter((fact) => fact.superseded === true);
  const orderedFacts = [
    ...supersededFacts,
    ...facts.filter((fact) => fact.superseded !== true),
  ].slice(0, limit);
  const lines = [
    `## Superseded Graph History: ${project}`,
    '',
    `Filters: ${[
      options.topicKey ? `topic_key=${options.topicKey}` : null,
      options.observationId ? `observation_id=${options.observationId}` : null,
      options.relation ? `relation=${options.relation}` : null,
    ].filter(Boolean).join(', ') || 'none'}`,
    `Showing ${orderedFacts.length} of ${facts.length} history/current fact(s). superseded=${supersededFacts.length}`,
    '',
    ...(orderedFacts.length > 0
      ? orderedFacts.map((fact) => factLine(fact, fact.superseded ? '[SUPERSEDED]' : '[CURRENT]'))
      : ['No superseded facts found.']),
    supersededFacts.length === 0 ? 'No superseded facts found.' : null,
    facts.length > orderedFacts.length ? `Omitted ${facts.length - orderedFacts.length} fact(s). continuation=frontier:${orderedFacts.length}.` : null,
  ].filter((line): line is string => line !== null);

  return trimGraphText(lines.join('\n'), maxChars, 'Output truncated by max_chars. Narrow with observation_id, topic_key, relation, or limit.');
}

export function formatProjectCommunityNavigation(
  store: Store,
  project: string,
  options: GraphNavigationOptions = {},
): string {
  const limit = graphLimit(options.limit, 10);
  const maxChars = graphBudget(options.maxChars, 6000);
  const state = store.getCommunitySummaryState({ project });
  const summaries = store.getCommunitySummariesForRetrieval({
    project,
    limit,
    maxChars: Math.min(maxChars, 600),
  });
  const summaryLines = summaries.candidates.map((community) => [
    `- community=${community.community_id}`,
    `level=${community.level}`,
    `state=${summaries.state}`,
    `coverage=obs:${community.source_observation_count} triples:${community.triple_count} entities:${community.entity_count}`,
    `sources=${community.source_observation_ids.map((id) => `obs:${id}`).join(',') || 'none'}`,
    `confidence=${community.confidence}`,
    `degraded=${community.degraded ? 'yes' : 'no'}`,
    `summary="${preview(community.summary_text, 240)}"`,
  ].join(' | '));
  const lines = [
    `## Graph Community Inspection: ${project}`,
    '',
    `State: state=${state.state} degraded=${state.degraded ? 'yes' : 'no'} run_id=${state.run_id ?? 'none'} committed_run_id=${state.latest_committed_run_id ?? 'none'} updated=${state.updated_at ?? 'none'}`,
    `Coverage: communities=${state.communities_count} entities=${state.entities_count} triples=${state.triples_count} source_observations=${state.source_observations_count}`,
    `Freshness: graph_signature=${state.graph_signature ?? 'none'} current_graph_signature=${state.current_graph_signature ?? 'none'}`,
    `Degraded reasons: ${state.degraded_reasons.join(', ') || 'none'}`,
    `Bounds: limit=${limit}, max_chars=${maxChars}`,
    '',
    ...(summaryLines.length > 0 ? summaryLines : ['No committed community summaries found.']),
  ];

  return trimGraphText(lines.join('\n'), maxChars, 'Output truncated by max_chars. Reduce limit for more compact inspection.');
}

export function formatProjectHealth(store: Store, project?: string, maxChars: number = 4000): string {
  const health: ProjectHealth = store.getOperationalHealth({ project });
  const jobs = health.jobs;
  const coverage = health.coverage;
  const community = health.community;
  const telemetry = store.getOperationTraceTelemetry({ project });
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
    '## Community Summaries',
    `- state: ${community.state}`,
    `- latest_job_status: ${community.latest_job_status}`,
    `- run_id: ${community.run_id ?? 'none'}`,
    `- latest_committed_run_id: ${community.latest_committed_run_id ?? 'none'}`,
    `- freshness_basis: ${community.freshness_basis}`,
    `- graph_signature: ${community.graph_signature ?? 'none'}`,
    `- current_graph_signature: ${community.current_graph_signature ?? 'none'}`,
    `- coverage: communities=${community.coverage.communities} entities=${community.coverage.entities} triples=${community.coverage.triples} source_observations=${community.coverage.source_observations}`,
    `- degraded_reasons: ${community.degraded_reasons.join(', ') || 'none'}`,
    community.error ? `- error: ${community.error}` : null,
    community.updated_at ? `- updated_at: ${community.updated_at}` : null,
    '',
    '## Trace Telemetry',
    `- token_basis: ${telemetry.token_basis}`,
    `- mem_get: avoided=${telemetry.mem_get_avoided_count} escalated=${telemetry.mem_get_escalated_count} pending=${telemetry.mem_get_pending_count} window_minutes=${telemetry.correlation_window_minutes}`,
    `- average_payload_chars_by_tool: ${Object.entries(telemetry.average_payload_chars_by_tool)
      .map(([tool, values]) => `${tool}=returned:${values.returned_chars}/request:${values.request_chars}/response:${values.response_chars}`)
      .join(', ') || 'none'}`,
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
