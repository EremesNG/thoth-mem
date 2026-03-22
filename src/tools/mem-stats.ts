import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Store } from "../store/index.js";

export function registerMemStats(server: McpServer, store: Store): void {
  server.tool(
    "mem_stats",
    "Get memory statistics: total sessions, observations, prompts, and project list.",
    {},
    async () => {
      try {
        const stats = store.getStats();
        const projects = stats.projects.join(', ') || 'none';

        return {
          content: [{
            type: "text" as const,
            text: [
              '## Thoth Memory Statistics',
              `- **Sessions:** ${stats.total_sessions}`,
              `- **Observations:** ${stats.total_observations}`,
              `- **User Prompts:** ${stats.total_prompts}`,
              `- **Projects:** ${projects}`,
            ].join('\n'),
          }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error getting memory statistics: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}
