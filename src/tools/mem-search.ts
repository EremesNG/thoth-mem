import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";
import { OBSERVATION_TYPES } from "../store/types.js";

export function registerMemSearch(server: McpServer, store: Store): void {
  server.tool(
    "mem_search",
    `Search persistent memory for past observations using full-text search.

Returns compact results by default (IDs + titles). Use the 3-layer pattern:
1. mem_search → scan compact index
2. mem_timeline → context around promising results
3. mem_get_observation → full content for selected IDs

Tips:
- Use specific keywords for better results
- Filter by type to narrow results
- Use mode="preview" for snippets when needed`,
    {
      query: z.string().describe("Search query — natural language or keywords"),
      type: z.enum(OBSERVATION_TYPES).optional().describe("Filter by observation type"),
      project: z.string().optional().describe("Filter by project name"),
      session_id: z.string().optional().describe('Filter to a specific session'),
      scope: z.enum(['project', 'personal'] as const).optional().describe("Filter by scope"),
      limit: z.number().min(1).max(20).optional().describe("Max results (default: 10, max: 20)"),
      mode: z.enum(['compact', 'preview']).optional().describe("Search result format: compact (default, IDs+titles) or preview (with snippets)"),
    },
    async ({ query, type, project, session_id, scope, limit, mode }) => {
      try {
        const markdown = store.searchObservationsFormatted({ query, type, project, session_id, scope, limit, mode });

        if (markdown.trim() === '') {
          return {
            content: [{ type: "text" as const, text: `No observations found matching '${query}'. Try different keywords or broader search terms.` }],
          };
        }

        return { content: [{ type: "text" as const, text: markdown }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error searching: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}
