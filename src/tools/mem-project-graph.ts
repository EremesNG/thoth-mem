import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";
import { formatProjectGraph } from "./project-views.js";

const GRAPH_RELATIONS = [
  'HAS_TYPE',
  'IN_PROJECT',
  'HAS_TOPIC_KEY',
  'HAS_WHAT',
  'HAS_WHY',
  'HAS_WHERE',
  'HAS_LEARNED',
] as const;

export function registerMemProjectGraph(server: McpServer, store: Store): void {
  server.tool(
    "mem_project_graph",
    "Get deterministic graph-lite facts derived from structured observations for a project. Use topic_key, relation, limit, and max_chars to keep output focused.",
    {
      project: z.string().min(1).describe("Project name to inspect"),
      topic_key: z.string().optional().describe("Filter graph facts to a stable topic key"),
      relation: z.enum(GRAPH_RELATIONS).optional().describe("Filter by fact relation"),
      limit: z.number().min(1).max(500).optional().describe("Maximum number of graph facts to return (default: 100)"),
      max_chars: z.number().min(200).max(20000).optional().describe("Maximum characters in the response (default: 6000)"),
    },
    async ({ project, topic_key, relation, limit, max_chars }) => {
      try {
        return {
          content: [{
            type: "text" as const,
            text: formatProjectGraph(store, project, {
              topicKey: topic_key,
              relation,
              limit,
              maxChars: max_chars,
            }),
          }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error getting project graph: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}
