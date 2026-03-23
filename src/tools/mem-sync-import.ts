import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";
import { syncImport } from "../sync/index.js";

export function registerMemSyncImport(server: McpServer, store: Store): void {
  server.tool(
    "mem_sync_import",
    `Import memory from a git-synced directory containing compressed chunks.
Reads the manifest and imports all chunks. Deduplication by sync_id ensures
safe re-import — running this on already-imported data skips duplicates.`,
    {
      sync_dir: z.string().describe("Path to the sync directory (e.g. .thoth-sync)"),
    },
    async ({ sync_dir }) => {
      try {
        const result = syncImport(store, sync_dir);

        if (result.chunks_processed === 0) {
          return {
            content: [{ type: "text" as const, text: `No chunks found in sync directory: ${sync_dir}` }],
          };
        }

        return {
          content: [{
            type: "text" as const,
            text: [
              '## Sync Import Complete',
              `- **Chunks processed:** ${result.chunks_processed}`,
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
          content: [{ type: "text" as const, text: `Error during sync import: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}
