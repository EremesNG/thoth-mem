import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";

export function registerMemSessionStart(server: McpServer, store: Store): void {
  server.tool(
    "mem_session_start",
    `Register the start of a new coding session. Call this at the beginning of a session to track activity.

Sessions are idempotent — calling with the same ID multiple times is safe and will not create duplicates.`,
    {
      id: z.string().describe("Unique session identifier"),
      project: z.string().describe("Project name"),
      directory: z.string().optional().describe("Working directory path"),
    },
    async ({ id, project, directory }) => {
      try {
        const session = store.startSession(id, project, directory);
        return {
          content: [{ type: "text" as const, text: `Session '${session.id}' started for project '${project}'${directory ? ` in ${directory}` : ''}.` }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error starting session: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}
