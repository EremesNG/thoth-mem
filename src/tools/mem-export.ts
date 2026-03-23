import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";

export function registerMemExport(server: McpServer, store: Store): void {
  server.tool(
    "mem_export",
    "Export memory data as JSON. Optionally filter by project. Returns structured JSON with sessions, observations, and prompts for backup or transfer.",
    {
      project: z.string().optional().describe("Filter export to a specific project"),
    },
    async ({ project }) => {
      try {
        const data = store.exportData(project);
        const json = JSON.stringify(data, null, 2);

        return {
          content: [{
            type: "text" as const,
            text: [
              `## Memory Export${project ? ` (project: ${project})` : ''}`,
              `- **Sessions:** ${data.sessions.length}`,
              `- **Observations:** ${data.observations.length}`,
              `- **Prompts:** ${data.prompts.length}`,
              '',
              '```json',
              json,
              '```',
            ].join('\n'),
          }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error exporting data: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}
