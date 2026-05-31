import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";

export function registerMemRecall(server: McpServer, store: Store): void {
  server.tool(
    "mem_recall",
    "Agent-oriented fused recall. Returns concise lane/source evidence with pending/degraded metadata.",
    {
      query: z.string().min(1).describe("Recall query"),
      project: z.string().optional().describe("Optional project filter"),
      limit: z.number().min(1).max(10).optional().describe("Maximum evidence items (default: 5)"),
    },
    async ({ query, project, limit }) => {
      try {
        const retrieval = await store.hybridRetrieve({
          query,
          project,
          limit: limit ?? 5,
        });

        const evidenceLines = retrieval.results.slice(0, limit ?? 5).map((hit, index) => {
          const primary = hit.evidence.primary;
          const source = primary.source ?? 'unknown';
          return `${index + 1}. [${primary.lane}/${source}] obs:${hit.observation.id} "${hit.observation.title}" score:${hit.score.toFixed(3)}`;
        });

        const text = [
          `Recall query: ${query}`,
          `pending: ${retrieval.pending ? 'yes' : 'no'}`,
          `degraded_fallback: ${retrieval.degradedFallback.length > 0 ? retrieval.degradedFallback.join(', ') : 'none'}`,
          'evidence:',
          ...(evidenceLines.length > 0 ? evidenceLines : ['none']),
        ].join('\n');

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error recalling memory: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}
