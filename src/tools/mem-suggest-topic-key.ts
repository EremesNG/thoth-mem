import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";
import { suggestTopicKey } from "../utils/topic-key.js";

export function registerMemSuggestTopicKey(server: McpServer, store: Store): void {
  server.tool(
    "mem_suggest_topic_key",
    "Suggest a stable topic_key for memory upserts. Use this before mem_save when you want evolving topics (like architecture decisions) to update a single observation over time.",
    {
      title: z.string().optional().describe("Observation title (preferred input for stable keys)"),
      type: z.string().optional().describe("Observation type/category, e.g. architecture, decision, bugfix"),
      content: z.string().optional().describe("Observation content used as fallback if title is empty"),
    },
    async ({ title, type, content }) => {
      try {
        if (!title && !content) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: "Error: provide either title or content." }],
          };
        }

        const key = suggestTopicKey(title ?? "", type, content);

        return {
          content: [{
            type: "text" as const,
            text: `Suggested topic key: \`${key}\`\n\nUse this in \`mem_save\` with the \`topic_key\` parameter to enable upsert behavior.`,
          }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error suggesting topic key: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}
