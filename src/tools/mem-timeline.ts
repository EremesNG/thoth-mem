import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";
import { formatObservationMarkdown } from "../utils/content.js";

export function registerMemTimeline(server: McpServer, store: Store): void {
  server.tool(
    "mem_timeline",
    "Show chronological context around a specific observation within the same session. Returns observations before and after the focus point.",
    {
      observation_id: z.number().describe("Anchor observation ID"),
      before: z.number().optional().describe("Number of observations before (default: 5)"),
      after: z.number().optional().describe("Number of observations after (default: 5)"),
    },
    async ({ observation_id, before, after }) => {
      try {
        const timeline = store.getTimeline({
          observation_id,
          before: before ?? 5,
          after: after ?? 5,
        });

        if (!timeline.focus) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: `Observation ${observation_id} not found` }],
          };
        }

        const beforeText = timeline.before.length > 0
          ? timeline.before.map((obs) => formatObservationMarkdown(obs)).join("\n\n")
          : "No earlier observations in this session";

        const focusMarkdown = formatObservationMarkdown(timeline.focus).replace(
          `### [${timeline.focus.type}] ${timeline.focus.title} (ID: ${timeline.focus.id})`,
          `### ► Focus: [${timeline.focus.type}] ${timeline.focus.title} (ID: ${timeline.focus.id})`
        );

        const afterText = timeline.after.length > 0
          ? timeline.after.map((obs) => formatObservationMarkdown(obs)).join("\n\n")
          : "No later observations in this session";

        return {
          content: [{
            type: "text" as const,
            text: [
              `## Timeline around observation ${observation_id}`,
              "",
              "### Before",
              beforeText,
              "",
              focusMarkdown,
              "",
              "### After",
              afterText,
            ].join("\n"),
          }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error retrieving timeline: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}
