import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";
import type { ExportData } from "../store/types.js";

export function registerMemImport(server: McpServer, store: Store): void {
  server.tool(
    "mem_import",
    "Import memory data from JSON (as produced by mem_export). Deduplicates by sync_id — safe to run multiple times on the same data.",
    {
      data: z.string().describe("JSON string of exported memory data"),
    },
    async ({ data }) => {
      try {
        let parsed: ExportData;
        try {
          parsed = JSON.parse(data) as ExportData;
        } catch {
          return {
            isError: true,
            content: [{ type: "text" as const, text: "Invalid JSON — could not parse import data" }],
          };
        }

        if (!parsed.version || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.observations) || !Array.isArray(parsed.prompts)) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: "Invalid export format — missing required fields (version, sessions, observations, prompts)" }],
          };
        }

        const result = store.importData(parsed);

        return {
          content: [{
            type: "text" as const,
            text: [
              '## Memory Import Complete',
              `- **Sessions imported:** ${result.sessions_imported}`,
              `- **Observations imported:** ${result.observations_imported}`,
              `- **Prompts imported:** ${result.prompts_imported}`,
              `- **Skipped (duplicates):** ${result.skipped}`,
            ].join('\n'),
          }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error importing data: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}
