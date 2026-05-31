import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";
import type { EmbeddingProviderAdapter } from "../retrieval/providers.js";
import type { HydeGenerator } from "../retrieval/hyde.js";

function formatRecallHit(hit: Awaited<ReturnType<Store['hybridRetrieve']>>['results'][number], index: number, mode: 'compact' | 'context'): string {
  const primary = hit.evidence.primary;
  const source = primary.source ?? 'unknown';
  const header = `${index + 1}. [${primary.lane}/${source}] obs:${hit.observation.id} "${hit.observation.title}" score:${hit.score.toFixed(3)}`;

  if (mode === 'compact') {
    return header;
  }

  const content = hit.evidence.promotedParent?.text || primary.text || hit.observation.content;
  return [
    header,
    `project=${hit.observation.project ?? 'none'} type=${hit.observation.type} topic_key=${hit.observation.topic_key ?? 'none'}`,
    content,
  ].join('\n');
}

export function registerMemRecall(
  server: McpServer,
  store: Store,
  options: { embeddingProvider?: EmbeddingProviderAdapter | null; hydeGenerator?: HydeGenerator | null } = {},
): void {
  server.tool(
    "mem_recall",
    "Primary retrieval tool. Runs fused hybrid recall across sentence vectors, chunk vectors, keyword FTS, and knowledge-graph evidence.",
    {
      query: z.string().min(1).describe("Recall/search query"),
      project: z.string().optional().describe("Optional project filter"),
      limit: z.number().min(1).max(20).optional().describe("Maximum evidence items (default: 5)"),
      mode: z.enum(['compact', 'context'] as const).optional().describe("compact returns evidence lines; context includes retrieved text"),
      hyde: z.boolean().optional().describe("Request HyDE query expansion when configured"),
      debug: z.boolean().optional().describe("Include retrieval defaults and semantic input sources"),
    },
    async ({ query, project, limit, mode = 'compact', hyde, debug }) => {
      try {
        const retrieval = await store.hybridRetrieve({
          query,
          project,
          limit: limit ?? 5,
          hyde: hyde === undefined ? undefined : { enabled: hyde },
          embeddingProvider: options.embeddingProvider,
          hydeGenerator: options.hydeGenerator,
        });

        const hits = retrieval.results.slice(0, limit ?? 5);
        const evidenceLines = hits.map((hit, index) => formatRecallHit(hit, index, mode));
        const laneCounts = hits.reduce<Record<string, number>>((acc, hit) => {
          const lane = hit.evidence.primary.lane;
          acc[lane] = (acc[lane] ?? 0) + 1;
          return acc;
        }, {});

        const text = [
          `Recall query: ${query}`,
          project ? `project: ${project}` : null,
          `pending: ${retrieval.pending ? 'yes' : 'no'}`,
          `degraded_fallback: ${retrieval.degradedFallback.length > 0 ? retrieval.degradedFallback.join(', ') : 'none'}`,
          `evidence_lanes: ${Object.keys(laneCounts).length > 0 ? Object.entries(laneCounts).map(([laneName, count]) => `${laneName}:${count}`).join(', ') : 'none'}`,
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
