import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";
import { formatTopicKeyContext, formatTopicKeyList } from "./project-views.js";

export function registerMemTopicKeys(server: McpServer, store: Store): void {
  server.tool(
    "mem_topic_keys",
    `List stable topic keys, optionally filtered by project. When topic_key is provided, returns agent-ready context for that exact topic key.

Use this to discover evolving memory topics before deciding whether to call mem_search with topic_key_exact or mem_get_observation for full records.`,
    {
      project: z.string().optional().describe("Filter by project name. Required when topic_key is provided."),
      topic_key: z.string().optional().describe("Exact topic key to read as contextual memory"),
      limit: z.number().min(1).max(20).optional().describe("Maximum observations for exact topic-key context (default: 10)"),
      max_chars: z.number().min(200).max(20000).optional().describe("Character budget for exact topic-key context (default: 6000)"),
    },
    async ({ project, topic_key, limit, max_chars }) => {
      try {
        if (topic_key) {
          if (!project) {
            return {
              isError: true,
              content: [{ type: "text" as const, text: "project is required when topic_key is provided" }],
            };
          }

          return {
            content: [{
              type: "text" as const,
              text: formatTopicKeyContext(store, project, topic_key, max_chars, limit),
            }],
          };
        }

        return {
          content: [{
            type: "text" as const,
            text: formatTopicKeyList(store, project),
          }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error getting topic keys: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}
