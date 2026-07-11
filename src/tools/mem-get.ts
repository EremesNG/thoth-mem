import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";
import { registerTracedTool } from "./tracing.js";
import { formatObservationMarkdown } from "../utils/content.js";
import { formatObservationMaintenanceEvidence } from "./maintenance-format.js";
import { estimateTokensFromChars } from "../utils/token-metrics.js";

function formatPromptMarkdown(prompt: { id: number; project: string | null; session_id: string; content: string; created_at: string }): string {
  return [
    `### Prompt (ID: ${prompt.id})`,
    `**Project:** ${prompt.project || 'none'} | **Session:** ${prompt.session_id} | **Created:** ${prompt.created_at}`,
    '',
    prompt.content,
  ].join('\n');
}

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
  const maintenance = formatObservationMaintenanceEvidence(store.getMaintenanceEvidenceForObservations([id])[0]);
  const metricLine = (returnedChars: number) =>
    `measurement: token_basis=estimated_chars_div_4 full_chars=${totalLength} returned_chars=${returnedChars} returned_tokens_estimated=${estimateTokensFromChars(returnedChars)}`;

  if (totalLength <= maxLength && offset === 0) {
    const base = formatObservationMarkdown(observation);
    const withMaintenance = maintenance ? `${base}\n\n**Maintenance:** ${maintenance}` : base;
    return { text: `${metricLine(withMaintenance.length)}\n${withMaintenance}` };
  }

  const slice = fullContent.substring(offset, offset + maxLength);
  const returnedTo = offset + slice.length;
  const hasMore = returnedTo < totalLength;
  const lines = [
    `### [${observation.type}] ${observation.title} (ID: ${observation.id})`,
    `**Project:** ${observation.project || 'none'} | **Scope:** ${observation.scope} | **Created:** ${observation.created_at}`,
    observation.topic_key ? `**Topic:** ${observation.topic_key}` : null,
    `**Revisions:** ${observation.revision_count} | **Duplicates:** ${observation.duplicate_count}`,
    maintenance ? `**Maintenance:** ${maintenance}` : null,
    '',
    metricLine(slice.length),
    '',
    `**Content pagination:** Showing characters ${offset}-${returnedTo} of ${totalLength}`,
    hasMore ? `Call mem_get with id=${id} and offset=${returnedTo} to get more.` : null,
    '',
    slice,
  ].filter((line): line is string => line !== null);

  return { text: lines.join('\n') };
}

function formatPaginatedPrompt(store: Store, id: number, offset: number, maxLength: number): { isError?: boolean; text: string } {
  const prompt = store.getPrompt(id);

  if (!prompt) {
    return { isError: true, text: `Prompt with ID ${id} not found.` };
  }

  const fullContent = prompt.content;
  const totalLength = fullContent.length;
  const metricLine = (returnedChars: number) =>
    `measurement: token_basis=estimated_chars_div_4 full_chars=${totalLength} returned_chars=${returnedChars} returned_tokens_estimated=${estimateTokensFromChars(returnedChars)}`;

  if (totalLength <= maxLength && offset === 0) {
    const markdown = formatPromptMarkdown(prompt);
    return { text: `${metricLine(markdown.length)}\n${markdown}` };
  }

  const slice = fullContent.substring(offset, offset + maxLength);
  const returnedTo = offset + slice.length;
  const hasMore = returnedTo < totalLength;
  const lines = [
    `### Prompt (ID: ${prompt.id})`,
    `**Project:** ${prompt.project || 'none'} | **Session:** ${prompt.session_id} | **Created:** ${prompt.created_at}`,
    '',
    metricLine(slice.length),
    '',
    `**Content pagination:** Showing characters ${offset}-${returnedTo} of ${totalLength}`,
    hasMore ? `Call mem_get(kind="prompt", id=${id}, offset=${returnedTo}) to get more.` : null,
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
    "Fetch a saved observation or prompt by ID. Use include_timeline=true when the surrounding observation chronology matters.",
    {
      id: z.number().describe("Record ID to retrieve, interpreted according to kind"),
      kind: z.enum(['observation', 'prompt'] as const).optional().describe("Memory kind to retrieve (defaults to observation)"),
      offset: z.number().min(0).optional().describe("Character offset for large content (default: 0)"),
      max_length: z.number().min(100).optional().describe("Max characters to return (default: 50000)"),
      include_timeline: z.boolean().optional().describe("Include surrounding observations in the same session"),
      before: z.number().min(0).max(20).optional().describe("Timeline observations before the focus item (default: 5)"),
      after: z.number().min(0).max(20).optional().describe("Timeline observations after the focus item (default: 5)"),
    },
    async ({ id, kind = 'observation', offset = 0, max_length = 50000, include_timeline, before = 5, after = 5 }) => {
      try {
        if (kind === 'prompt' && include_timeline) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: "include_timeline=true is only supported for kind=\"observation\"." }],
          };
        }

        const result = kind === 'prompt'
          ? formatPaginatedPrompt(store, id, offset, max_length)
          : include_timeline
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
