import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";
import { formatProjectSummary } from "./project-views.js";

export function registerMemProjectSummary(server: McpServer, store: Store): void {
  server.tool(
    "mem_project_summary",
    "Get a project-focused memory summary with recent sessions, prompts, observations, and stats. OpenCode-facing replacement for project summary MCP Resources.",
    {
      project: z.string().min(1).describe("Project name to summarize"),
      limit: z.number().min(1).max(20).optional().describe("Maximum recent observations to include (default: 10)"),
    },
    async ({ project, limit }) => {
      try {
        return {
          content: [{
            type: "text" as const,
            text: formatProjectSummary(store, project, limit),
          }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error getting project summary: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}
