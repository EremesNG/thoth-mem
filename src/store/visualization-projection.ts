import type { ObservationType, VizEdge, VizNode } from './types.js';
import { deriveVisualizationEdgeId, VisualizationIdentityRegistry } from './visualization-identity.js';
import { stripPrivateTags } from '../utils/privacy.js';
import { truncateForPreview } from '../utils/content.js';

export interface RawVisualizationRow {
  observation_id: number;
  session_id: string;
  title: string;
  type: ObservationType;
  project: string | null;
  topic_key: string | null;
  content: string;
  relation: string;
  object: string;
}

export interface RawVisualizationProjectionInput {
  project?: string;
  session_id?: string;
  topic_key?: string;
  maxEdges?: number;
}

export interface RawVisualizationProjection {
  nodes: VizNode[];
  edges: VizEdge[];
}

function safeText(value: string | null | undefined): string {
  return stripPrivateTags(value ?? '').trim();
}

function computeSeedPoint(seed: string): { x: number; y: number } {
  let hashA = 2166136261;
  let hashB = 16777619;
  for (let index = 0; index < seed.length; index += 1) {
    const code = seed.charCodeAt(index);
    hashA ^= code;
    hashA = Math.imul(hashA, 16777619);
    hashB ^= code + index;
    hashB = Math.imul(hashB, 2246822519);
  }
  return {
    x: ((hashA >>> 0) % 2000) / 1000 - 1,
    y: ((hashB >>> 0) % 2000) / 1000 - 1,
  };
}

function baseNode(
  id: string,
  kind: VizNode['kind'],
  label: string,
  snippet: string,
  row: RawVisualizationRow,
  seed: string,
): VizNode {
  const point = computeSeedPoint(seed);
  return {
    id,
    kind,
    label,
    snippet,
    project: row.project === null ? null : safeText(row.project),
    session_id: safeText(row.session_id),
    topic_key: row.topic_key === null ? null : safeText(row.topic_key),
    type: kind === 'observation' ? row.type : null,
    seed_x: point.x,
    seed_y: point.y,
  };
}

export function buildRawVisualizationProjection(
  rows: RawVisualizationRow[],
  input: RawVisualizationProjectionInput,
): RawVisualizationProjection {
  const identities = new VisualizationIdentityRegistry();
  const nodes = new Map<string, VizNode>();
  const edges = new Map<string, VizEdge>();
  const maxEdges = input.maxEdges ?? Number.POSITIVE_INFINITY;

  const addEdge = (sourceId: string, relation: string, targetId: string, kind: NonNullable<VizEdge['kind']>, summary: string) => {
    if (edges.size >= maxEdges) return;
    const id = deriveVisualizationEdgeId(sourceId, relation, targetId);
    if (edges.has(id)) return;
    edges.set(id, {
      id,
      source_id: sourceId,
      target_id: targetId,
      relation,
      kind,
      label: relation,
      summary,
    });
  };

  for (const row of rows) {
    if (edges.size >= maxEdges) break;
    const sourceId = `obs:${row.observation_id}`;
    if (!nodes.has(sourceId)) {
      const label = safeText(row.title);
      const snippet = truncateForPreview(safeText(row.content), 140);
      nodes.set(sourceId, baseNode(
        sourceId,
        'observation',
        label,
        snippet,
        row,
        `${row.observation_id}|${row.project ?? ''}|${row.session_id}|${input.project ?? ''}|${input.session_id ?? ''}|${input.topic_key ?? ''}`,
      ));
    }

    const sessionId = identities.register('session', row.session_id);
    if (!nodes.has(sessionId)) {
      const label = safeText(row.session_id);
      nodes.set(sessionId, baseNode(sessionId, 'session', label, `Session ${label}`, row, sessionId));
    }
    addEdge(sourceId, 'IN_SESSION', sessionId, 'metadata', 'Observation belongs to session');

    let projectId: string | null = null;
    if (row.project) {
      projectId = identities.register('project', row.project);
      if (!nodes.has(projectId)) {
        const label = safeText(row.project);
        nodes.set(projectId, baseNode(projectId, 'project', label, `Project ${label}`, row, projectId));
      }
      addEdge(sourceId, 'IN_PROJECT', projectId, 'metadata', 'Observation belongs to project');
    }

    let topicId: string | null = null;
    if (row.topic_key) {
      topicId = identities.register('topic', row.topic_key);
      if (!nodes.has(topicId)) {
        const label = safeText(row.topic_key);
        nodes.set(topicId, baseNode(topicId, 'topic', label, `Topic ${label}`, row, topicId));
      }
      addEdge(sourceId, 'HAS_TOPIC_KEY', topicId, 'metadata', 'Observation belongs to topic');
    }

    if (row.relation === 'IN_PROJECT' && projectId) continue;
    if (row.relation === 'HAS_TOPIC_KEY' && topicId) continue;
    if (row.relation === 'IN_SESSION') continue;

    const targetId = identities.register('ref', `${row.relation}\0${row.object}`);
    if (!nodes.has(targetId)) {
      const label = truncateForPreview(safeText(row.object), 80);
      nodes.set(targetId, baseNode(targetId, 'fact', label, truncateForPreview(safeText(row.object), 120), row, targetId));
    }
    addEdge(
      sourceId,
      row.relation,
      targetId,
      row.relation === 'HAS_TYPE' ? 'metadata' : 'fact',
      truncateForPreview(safeText(row.object), 180),
    );
  }

  const connectedIds = new Set<string>();
  for (const edge of edges.values()) {
    connectedIds.add(edge.source_id);
    connectedIds.add(edge.target_id);
  }
  return {
    nodes: [...nodes.values()].filter((node) => connectedIds.has(node.id)),
    edges: [...edges.values()],
  };
}
