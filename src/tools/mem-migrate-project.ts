import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";

export function registerMemMigrateProject(server: McpServer, store: Store): void {
  server.tool(
    "mem_migrate_project",
    "Rename a project across all sessions, observations, and prompts. Use when a project name changes or needs consolidation.",
    {
      old_project: z.string().describe("Current project name to rename"),
      new_project: z.string().describe("New project name"),
    },
    async ({ old_project, new_project }) => {
      try {
        if (old_project === new_project) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: "Old and new project names are the same" }],
          };
        }

        const result = store.migrateProject(old_project, new_project);

        const total = result.sessions_updated + result.observations_updated + result.prompts_updated;
        if (total === 0) {
          return {
            content: [{ type: "text" as const, text: `No records found for project "${old_project}"` }],
          };
        }

        return {
          content: [{
            type: "text" as const,
            text: [
              `## Project Migrated: ${old_project} → ${new_project}`,
              `- **Sessions updated:** ${result.sessions_updated}`,
              `- **Observations updated:** ${result.observations_updated}`,
              `- **Prompts updated:** ${result.prompts_updated}`,
            ].join('\n'),
          }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error migrating project: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}
