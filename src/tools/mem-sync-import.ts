import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";
import { syncImport } from "../sync/index.js";

export function registerMemSyncImport(server: McpServer, store: Store): void {
  server.tool(
    "mem_sync_import",
    `Import memory from a git-synced directory containing compressed chunks.
Reads the manifest and imports all chunks. Replay-safe deduplication by sync_id
ensures safe re-import — running this on already-imported data skips duplicates.`,
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

        const lines = [
          '## Sync Import Complete',
          `- **Chunks processed:** ${result.chunks_processed}`,
          `- **Chunks imported:** ${result.imported}`,
          `- **Skipped (duplicates):** ${result.skipped}`,
          `- **Failed:** ${result.failed}`,
        ];

        // Show legacy counts when available
        if (result.sessions_imported > 0 || result.observations_imported > 0 || result.prompts_imported > 0) {
          lines.push('');
          lines.push('**Entity counts:**');
          lines.push(`- **Sessions:** ${result.sessions_imported}`);
          lines.push(`- **Observations:** ${result.observations_imported}`);
          lines.push(`- **Prompts:** ${result.prompts_imported}`);
        }

        // Add warning if there were failures
        if (result.failed > 0) {
          lines.push('');
          lines.push(`⚠️ **Warning:** ${result.failed} chunk(s) failed to import. Check logs for details.`);
        }

        return {
          content: [{
            type: "text" as const,
            text: lines.join('\n'),
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
