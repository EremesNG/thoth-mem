import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";
import { OBSERVATION_TYPES } from "../store/types.js";

export function registerMemSearch(server: McpServer, store: Store): void {
  server.tool(
    "mem_search",
    `Search persistent memory for past observations using full-text search or exact topic-key lookup.

Returns compact results by default (IDs + titles). Use the 3-layer pattern:
1. mem_search → scan compact index
2. mem_timeline → context around promising results
3. mem_get_observation → full content for selected IDs

Tips:
- Use specific keywords for better results
- Filter by type to narrow results
- Use mode="preview" for snippets when needed
- Use mode="context" for agent-ready delimited context with a character budget
- Use topic_key_exact to bypass FTS and match exact topic keys`,
    {
      query: z.string().describe("Search query — natural language or keywords"),
      type: z.enum(OBSERVATION_TYPES).optional().describe("Filter by observation type"),
      project: z.string().optional().describe("Filter by project name"),
      session_id: z.string().optional().describe('Filter to a specific session'),
      scope: z.enum(['project', 'personal'] as const).optional().describe("Filter by scope"),
      limit: z.number().min(1).max(20).optional().describe("Max results (default: 10, max: 20)"),
      mode: z.enum(['compact', 'preview', 'context']).optional().describe("Search result format: compact (default), preview (snippets), or context (delimited agent-ready output)"),
      max_chars: z.number().min(200).max(20000).optional().describe('Maximum characters for mode="context" output (default: 4000)'),
      topic_key_exact: z.string().optional().describe("Exact topic key match (bypasses FTS)"),
      hybrid_status: z.enum(['off', 'auto', 'on']).optional().describe('Add additive hybrid retrieval status metadata. Default: off'),
    },
    async ({ query, type, project, session_id, scope, limit, mode, max_chars, topic_key_exact, hybrid_status }) => {
      try {
        const markdown = store.searchObservationsFormatted({ query, type, project, session_id, scope, limit, mode, max_chars, topic_key_exact });
        const statusMode = hybrid_status ?? 'off';

        const isLegacyNoResultsText = markdown.trim() === 'No memories found.';
        let hybridSection = '';
        if (statusMode !== 'off') {
          const retrieval = await store.hybridRetrieve({
            query,
            limit: limit ?? 10,
            project,
          });
          const laneCounts = retrieval.results.reduce<Record<string, number>>((acc, hit) => {
            const lane = hit.evidence.primary.lane;
            acc[lane] = (acc[lane] ?? 0) + 1;
            return acc;
          }, {});
          const shouldAppend = statusMode === 'on'
            || retrieval.pending
            || retrieval.degradedFallback.length > 0;

          if (shouldAppend && !isLegacyNoResultsText) {
            hybridSection = [
              '',
              '---',
              'Hybrid status:',
              `- pending: ${retrieval.pending ? 'yes' : 'no'}`,
              `- degraded_fallback: ${retrieval.degradedFallback.length > 0 ? retrieval.degradedFallback.join(', ') : 'none'}`,
              `- evidence_lanes: ${Object.keys(laneCounts).length > 0 ? Object.entries(laneCounts).map(([lane, count]) => `${lane}:${count}`).join(', ') : 'none'}`,
            ].join('\n');
          }
        }

        if (markdown.trim() === '') {
          return {
            content: [{ type: "text" as const, text: `No observations found matching '${query}'. Try different keywords or broader search terms.` }],
          };
        }

        return { content: [{ type: "text" as const, text: `${markdown}${hybridSection}` }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error searching: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}
