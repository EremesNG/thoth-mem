import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";
import { registerTracedTool } from "./tracing.js";
import type { EmbeddingProviderAdapter } from "../retrieval/providers.js";
import type { HydeGenerator } from "../retrieval/hyde.js";
import { trimToBudget } from "../utils/content.js";

export function registerMemContext(
  server: McpServer,
  store: Store,
  options: { embeddingProvider?: EmbeddingProviderAdapter | null; hydeGenerator?: HydeGenerator | null } = {},
): void {
  registerTracedTool(
    server,
    store,
    "mem_context",
    `Get recent memory context from previous sessions. Shows recent sessions, user prompts, and observations to understand what was done before.

Use this at the start of a session to recover context, or when the user asks to recall past work.

Returns bounded Markdown with:
- Recent sessions (last 5 with activity)
- Recent user prompts (last 10)
- Recent observations (configurable limit)
- Memory stats (total counts)

Observation bodies are previewed by default; use mem_get(id=...) for full content.`,
    {
      project: z.string().optional().describe("Filter by project name"),
      session_id: z.string().optional().describe('Filter to a specific session'),
      scope: z.enum(['project', 'personal'] as const).optional().describe("Filter by scope"),
      limit: z.number().optional().describe("Number of observations to retrieve (default: 20)"),
      max_chars: z.number().min(0).optional().describe("Output character budget; 0 disables the context cap"),
      recall_query: z.string().optional().describe('Optional query to append fused recall evidence without changing base context sections'),
    },
    async ({ project, session_id, scope, limit, recall_query, max_chars }) => {
      try {
        const selectedMaxChars = max_chars ?? store.config.maxContextChars;
        const context = store.getContext({ project, session_id, scope, limit, maxOutputChars: selectedMaxChars });
        let recallSection = '';

        if (recall_query && recall_query.trim().length > 0) {
          const retrieval = await store.hybridRetrieve({
            query: recall_query.trim(),
            limit: 3,
            project,
            embeddingProvider: options.embeddingProvider,
            hydeGenerator: options.hydeGenerator,
          });
          const evidence = retrieval.results.slice(0, 3).map((hit, index) => {
            const source = hit.evidence.primary.source ?? 'unknown';
            return `${index + 1}. [${hit.evidence.primary.lane}] ${hit.observation.title} (source: ${source})`;
          });
          recallSection = [
            '',
            '### Optional Fused Recall',
            `- query: ${recall_query.trim()}`,
            `- pending: ${retrieval.pending ? 'yes' : 'no'}`,
            `- degraded_fallback: ${retrieval.degradedFallback.length > 0 ? retrieval.degradedFallback.join(', ') : 'none'}`,
            ...(evidence.length > 0 ? ['- evidence:', ...evidence.map((line) => `  ${line}`)] : ['- evidence: none']),
          ].join('\n');
        }

        if (!context || context.trim().length === 0) {
          return {
            content: [{ type: "text" as const, text: "No memory context found. This appears to be a fresh start with no previous sessions." }],
          };
        }

        const fullText = `${context}${recallSection}`;
        const boundedText = selectedMaxChars === 0 ? fullText : trimToBudget(fullText, selectedMaxChars);

        return { content: [{ type: "text" as const, text: boundedText }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error getting context: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}
