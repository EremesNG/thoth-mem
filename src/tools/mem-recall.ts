import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";
import type { EmbeddingProviderAdapter } from "../retrieval/providers.js";
import type { HydeGenerator } from "../retrieval/hyde.js";
import { OBSERVATION_TYPES } from "../store/types.js";
import { sanitizeRetrievedContext } from "../utils/context-safety.js";

const MAX_CONTEXT_CHARS = 6000;

type RecallHit = Awaited<ReturnType<Store['hybridRetrieve']>>['results'][number];

function recallHeader(hit: RecallHit, index: number): string {
  const primary = hit.evidence.primary;
  const source = primary.source ?? 'unknown';
  return `${index + 1}. [${primary.lane}/${source}] obs:${hit.observation.id} "${hit.observation.title}" score:${hit.score.toFixed(3)}`;
}

function formatRecallHit(hit: RecallHit, index: number): string {
  return recallHeader(hit, index);
}

function trimToBudget(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 32)).trimEnd()}\n[truncated for recall budget]`;
}

function formatRecallContextHits(hits: RecallHit[]): string[] {
  let remaining = MAX_CONTEXT_CHARS;
  const lines: string[] = [];

  for (const [index, hit] of hits.entries()) {
    if (remaining <= 0) {
      break;
    }

    const primary = hit.evidence.primary;
    const graphEvidence = hit.evidence.byLane.kg ?? [];
    const metadata = [
      recallHeader(hit, index),
      `<retrieved_context observation_id="${hit.observation.id}" lane="${primary.lane}" source="${primary.source ?? 'unknown'}">`,
      `project=${hit.observation.project ?? 'none'} type=${hit.observation.type} topic_key=${hit.observation.topic_key ?? 'none'}`,
      graphEvidence.length > 0 ? `graph_enrichment=${graphEvidence.length}` : null,
    ];
    const graphLines = graphEvidence.slice(0, 3).map((candidate) => `graph: ${sanitizeRetrievedContext(candidate.text)}`);
    const metadataCost = metadata.filter((line): line is string => line !== null).join('\n').length
      + graphLines.join('\n').length
      + '</retrieved_context>'.length
      + 2;
    const primaryContent = sanitizeRetrievedContext(primary.text || hit.observation.content);
    const promotedParentContent = hit.evidence.promotedParent?.text
      ? sanitizeRetrievedContext(hit.evidence.promotedParent.text)
      : null;
    const content = primary.lane === 'sentence' && promotedParentContent
      ? [
          `primary_sentence: ${primaryContent}`,
          `surrounding_parent_chunk: ${promotedParentContent}`,
        ].join('\n')
      : (promotedParentContent || primaryContent);
    const budgetedContent = trimToBudget(content, Math.max(0, remaining - metadataCost));

    lines.push([
      ...metadata.filter((line): line is string => line !== null),
      budgetedContent,
      ...graphLines,
      '</retrieved_context>',
    ].join('\n'));

    remaining -= metadataCost + budgetedContent.length;
  }

  return lines;
}

export function registerMemRecall(
  server: McpServer,
  store: Store,
  options: { embeddingProvider?: EmbeddingProviderAdapter | null; hydeGenerator?: HydeGenerator | null } = {},
): void {
  server.tool(
    "mem_recall",
    "Primary retrieval tool. Runs fused hybrid recall across sentence vectors, chunk vectors, keyword FTS, and knowledge-graph enrichment.",
    {
      query: z.string().min(1).describe("Recall/search query"),
      project: z.string().optional().describe("Optional project filter"),
      session_id: z.string().optional().describe("Optional session filter"),
      scope: z.enum(['project', 'personal'] as const).optional().describe("Optional scope filter"),
      topic_key: z.string().optional().describe("Optional exact topic_key filter"),
      type: z.enum(OBSERVATION_TYPES).optional().describe("Optional observation type filter"),
      time_from: z.string().optional().describe("Optional inclusive created_at lower bound"),
      time_to: z.string().optional().describe("Optional inclusive created_at upper bound"),
      limit: z.number().min(1).max(20).optional().describe("Maximum evidence items (default: 5)"),
      mode: z.enum(['compact', 'context'] as const).optional().describe("compact returns evidence lines; context includes retrieved text"),
      hyde: z.boolean().optional().describe("Request HyDE query expansion when configured"),
      debug: z.boolean().optional().describe("Include retrieval defaults and semantic input sources"),
    },
    async ({ query, project, session_id, scope, topic_key, type, time_from, time_to, limit, mode = 'compact', hyde, debug }) => {
      try {
        const retrieval = await store.hybridRetrieve({
          query,
          project,
          session_id,
          scope,
          topic_key,
          type,
          time_from,
          time_to,
          limit: limit ?? 5,
          hyde: hyde === undefined ? undefined : { enabled: hyde },
          embeddingProvider: options.embeddingProvider,
          hydeGenerator: options.hydeGenerator,
        });

        const hits = retrieval.results.slice(0, limit ?? 5);
        const evidenceLines = mode === 'context'
          ? formatRecallContextHits(hits)
          : hits.map((hit, index) => formatRecallHit(hit, index));
        const laneCounts = hits.reduce<Record<string, number>>((acc, hit) => {
          const lane = hit.evidence.primary.lane;
          acc[lane] = (acc[lane] ?? 0) + 1;
          return acc;
        }, {});
        const graphEnrichmentCount = hits.filter((hit) => (hit.evidence.byLane.kg?.length ?? 0) > 0).length;

        const text = [
          `Recall query: ${query}`,
          project ? `project: ${project}` : null,
          session_id ? `session_id: ${session_id}` : null,
          scope ? `scope: ${scope}` : null,
          topic_key ? `topic_key: ${topic_key}` : null,
          type ? `type: ${type}` : null,
          time_from ? `time_from: ${time_from}` : null,
          time_to ? `time_to: ${time_to}` : null,
          `pending: ${retrieval.pending ? 'yes' : 'no'}`,
          `degraded_fallback: ${retrieval.degradedFallback.length > 0 ? retrieval.degradedFallback.join(', ') : 'none'}`,
          `evidence_lanes: ${Object.keys(laneCounts).length > 0 ? Object.entries(laneCounts).map(([laneName, count]) => `${laneName}:${count}`).join(', ') : 'none'}`,
          `graph_enrichment: ${graphEnrichmentCount}`,
          debug ? `lane_order: ${retrieval.laneOrder.join(' > ')}` : null,
          debug ? `semantic_inputs: ${retrieval.semanticInputs.map((input) => input.source).join(', ') || 'none'}` : null,
          'evidence:',
          ...(evidenceLines.length > 0 ? evidenceLines : ['none']),
        ].filter((line): line is string => line !== null).join('\n');

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error recalling memory: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    },
  );
}
