import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";

export function registerMemContext(server: McpServer, store: Store): void {
  server.tool(
    "mem_context",
    `Get recent memory context from previous sessions. Shows recent sessions, user prompts, and observations to understand what was done before.

Use this at the start of a session to recover context, or when the user asks to recall past work.

Returns formatted Markdown with:
- Recent sessions (last 5 with activity)
- Recent user prompts (last 10)
- Recent observations (configurable limit)
- Memory stats (total counts)`,
    {
      project: z.string().optional().describe("Filter by project name"),
      session_id: z.string().optional().describe('Filter to a specific session'),
      scope: z.enum(['project', 'personal'] as const).optional().describe("Filter by scope"),
      limit: z.number().optional().describe("Number of observations to retrieve (default: 20)"),
    },
    async ({ project, session_id, scope, limit }) => {
      try {
        const context = store.getContext({ project, session_id, scope, limit });

        if (!context || context.trim().length === 0) {
          return {
            content: [{ type: "text" as const, text: "No memory context found. This appears to be a fresh start with no previous sessions." }],
          };
        }

        return { content: [{ type: "text" as const, text: context }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error getting context: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}
