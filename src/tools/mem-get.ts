import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";
import { registerTracedTool } from "./tracing.js";
import { formatObservationMarkdown } from "../utils/content.js";

function formatPaginatedObservation(
  store: Store,
  id: number,
  offset: number,
  maxLength: number,
): { isError?: boolean; text: string } {
  const observation = store.getObservation(id);

  if (!observation) {
    return { isError: true, text: `Observation with ID ${id} not found.` };
  }

  const fullContent = observation.content;
  const totalLength = fullContent.length;

  if (totalLength <= maxLength && offset === 0) {
    return { text: formatObservationMarkdown(observation) };
  }

  const slice = fullContent.substring(offset, offset + maxLength);
  const returnedTo = offset + slice.length;
  const hasMore = returnedTo < totalLength;
  const lines = [
    `### [${observation.type}] ${observation.title} (ID: ${observation.id})`,
    `**Project:** ${observation.project || 'none'} | **Scope:** ${observation.scope} | **Created:** ${observation.created_at}`,
    observation.topic_key ? `**Topic:** ${observation.topic_key}` : null,
    `**Revisions:** ${observation.revision_count} | **Duplicates:** ${observation.duplicate_count}`,
    '',
    `**Content pagination:** Showing characters ${offset}-${returnedTo} of ${totalLength}`,
    hasMore ? `Call mem_get with id=${id} and offset=${returnedTo} to get more.` : null,
    '',
    slice,
  ].filter((line): line is string => line !== null);

  return { text: lines.join('\n') };
}

function formatTimeline(store: Store, id: number, before: number, after: number): { isError?: boolean; text: string } {
  const timeline = store.getTimeline({ observation_id: id, before, after });

  if (!timeline.focus) {
    return { isError: true, text: `Observation ${id} not found.` };
  }

  const beforeText = timeline.before.length > 0
    ? timeline.before.map((obs) => formatObservationMarkdown(obs)).join("\n\n")
    : "No earlier observations in this session";

  const focusMarkdown = formatObservationMarkdown(timeline.focus).replace(
    `### [${timeline.focus.type}] ${timeline.focus.title} (ID: ${timeline.focus.id})`,
    `### Focus: [${timeline.focus.type}] ${timeline.focus.title} (ID: ${timeline.focus.id})`,
  );

  const afterText = timeline.after.length > 0
    ? timeline.after.map((obs) => formatObservationMarkdown(obs)).join("\n\n")
    : "No later observations in this session";

  return {
    text: [
      `## Timeline around observation ${id}`,
      "",
      "### Before",
      beforeText,
      "",
      focusMarkdown,
      "",
      "### After",
      afterText,
    ].join("\n"),
  };
}

export function registerMemGet(server: McpServer, store: Store): void {
  registerTracedTool(
    server,
    store,
    "mem_get",
    "Fetch a saved memory by ID. Use include_timeline=true when the surrounding session chronology matters.",
    {
      id: z.number().describe("Observation ID to retrieve"),
      offset: z.number().min(0).optional().describe("Character offset for large content (default: 0)"),
      max_length: z.number().min(100).optional().describe("Max characters to return (default: 50000)"),
      include_timeline: z.boolean().optional().describe("Include surrounding observations in the same session"),
      before: z.number().min(0).max(20).optional().describe("Timeline observations before the focus item (default: 5)"),
      after: z.number().min(0).max(20).optional().describe("Timeline observations after the focus item (default: 5)"),
    },
    async ({ id, offset = 0, max_length = 50000, include_timeline, before = 5, after = 5 }) => {
      try {
        const result = include_timeline
          ? formatTimeline(store, id, before, after)
          : formatPaginatedObservation(store, id, offset, max_length);

        return {
          isError: result.isError,
          content: [{ type: "text" as const, text: result.text }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error retrieving memory: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    },
  );
}
