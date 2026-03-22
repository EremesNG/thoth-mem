import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";
import { formatObservationMarkdown } from "../utils/content.js";

export function registerMemGetObservation(server: McpServer, store: Store): void {
  server.tool(
    "mem_get_observation",
    `Get the full content of a specific observation by ID. Use when you need the complete, untruncated content of an observation found via mem_search or mem_context.

Supports paginated retrieval for large observations:
- offset: character position to start from (default: 0)
- max_length: maximum characters to return (default: 50000)

If the content exceeds max_length, the response includes pagination metadata with the next offset to use.`,
    {
      id: z.number().describe("The observation ID to retrieve"),
      offset: z.number().min(0).optional().describe("Character offset for large content (default: 0)"),
      max_length: z.number().min(100).optional().describe("Max characters to return (default: 50000)"),
    },
    async ({ id, offset = 0, max_length = 50000 }) => {
      try {
        const observation = store.getObservation(id);

        if (!observation) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: `Observation with ID ${id} not found.` }],
          };
        }

        const fullContent = observation.content;
        const totalLength = fullContent.length;

        if (totalLength <= max_length && offset === 0) {
          return {
            content: [{ type: "text" as const, text: formatObservationMarkdown(observation) }],
          };
        }

        const slice = fullContent.substring(offset, offset + max_length);
        const returnedTo = offset + slice.length;
        const hasMore = returnedTo < totalLength;

        let header = `### [${observation.type}] ${observation.title} (ID: ${observation.id})\n`;
        header += `**Project:** ${observation.project || 'none'} | **Scope:** ${observation.scope} | **Created:** ${observation.created_at}\n`;
        if (observation.topic_key) {
          header += `**Topic:** ${observation.topic_key} | `;
        }
        header += `**Revisions:** ${observation.revision_count} | **Duplicates:** ${observation.duplicate_count}\n\n`;
        header += `**Content pagination:** Showing characters ${offset}-${returnedTo} of ${totalLength}\n`;
        if (hasMore) {
          header += `Call mem_get_observation with offset=${returnedTo} to get more.\n`;
        }
        header += `\n${slice}`;

        return { content: [{ type: "text" as const, text: header }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error retrieving observation: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}
