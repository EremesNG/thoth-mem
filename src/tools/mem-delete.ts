import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";

export function registerMemDelete(server: McpServer, store: Store): void {
  server.tool(
    "mem_delete",
    "Delete an observation by ID. Soft-deletes by default (recoverable). Use hard_delete=true for permanent removal.",
    {
      id: z.number().describe("Observation ID to delete"),
      hard_delete: z.boolean().optional().describe("Permanent delete if true; soft-delete by default"),
    },
    async ({ id, hard_delete }) => {
      try {
        const deleted = store.deleteObservation(id, hard_delete ?? false);

        if (!deleted) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: `Observation ${id} not found` }],
          };
        }

        return {
          content: [{ type: "text" as const, text: `Observation ${id} ${hard_delete ? 'permanently deleted' : 'soft-deleted'}` }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }],
        };
      }
    }
  );
}
