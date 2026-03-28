import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";
import { syncExport } from "../sync/index.js";

export function registerMemSyncExport(server: McpServer, store: Store): void {
  server.tool(
    "mem_sync_export",
    `Export memory to a git-friendly sync directory as an append-only compressed chunk.
Incremental v2 exports: each chunk includes only mutations newer than the last export watermark.
If no new mutations exist, no chunk is emitted (no-op).
The sync directory can be committed to git for cross-machine memory sharing.
Deduplication on import is handled by sync_id — safe to export repeatedly.`,
    {
      sync_dir: z.string().describe("Path to the sync directory (e.g. .thoth-sync)"),
      project: z.string().optional().describe("Filter export to a specific project"),
    },
    async ({ sync_dir, project }) => {
      try {
        const result = syncExport(store, sync_dir, project);

        // Handle no-op case
        if (result.message === 'No new changes to export') {
          return {
            content: [{ type: "text" as const, text: "No new changes to export — all mutations already synced." }],
          };
        }

        // Handle successful export
        if (!result.chunk_id) {
          return {
            content: [{ type: "text" as const, text: "Nothing to export — no data found." }],
          };
        }

        const mutationRange = result.from_mutation_id !== null && result.to_mutation_id !== null
          ? `${result.from_mutation_id} → ${result.to_mutation_id}`
          : 'N/A';

        return {
          content: [{
            type: "text" as const,
            text: [
              '## Sync Export Complete',
              `- **Chunk ID:** ${result.chunk_id}`,
              `- **Filename:** ${result.filename}`,
              `- **Mutations Exported:** ${result.exported}`,
              `- **Mutation Range:** ${mutationRange}`,
              `- **Chunks Created:** ${result.chunks}`,
              `- **Sessions:** ${result.sessions}`,
              `- **Observations:** ${result.observations}`,
              `- **Prompts:** ${result.prompts}`,
              '',
              `Sync directory: ${sync_dir}`,
              'Commit this directory to git to share memory across machines.',
            ].join('\n'),
          }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error during sync export: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}
