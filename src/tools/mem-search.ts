import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";
import { OBSERVATION_TYPES } from "../store/types.js";
import { formatSearchResultMarkdown } from "../utils/content.js";

export function registerMemSearch(server: McpServer, store: Store): void {
  server.tool(
    "mem_search",
    `Search persistent memory for past observations using full-text search.

Searches across title, content, tool_name, type, and project fields.
Returns previews (300 chars). Call mem_get_observation with the ID for full content.

Tips:
- Use specific keywords for better results
- Filter by type to narrow results (e.g. type="bugfix")
- Filter by project to scope to a specific project`,
    {
      query: z.string().describe("Search query — natural language or keywords"),
      type: z.enum(OBSERVATION_TYPES).optional().describe("Filter by observation type"),
      project: z.string().optional().describe("Filter by project name"),
      scope: z.enum(['project', 'personal'] as const).optional().describe("Filter by scope"),
      limit: z.number().min(1).max(20).optional().describe("Max results (default: 10, max: 20)"),
    },
    async ({ query, type, project, scope, limit }) => {
      try {
        const results = store.searchObservations({ query, type, project, scope, limit });

        if (results.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No observations found matching '${query}'. Try different keywords or broader search terms.` }],
          };
        }

        const markdown = formatSearchResultMarkdown(results);
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
