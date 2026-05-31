import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";
import { OBSERVATION_TYPES } from "../store/types.js";
import { validateContentLength } from "../utils/content.js";
import { getConfig } from "../config.js";
import type { EmbeddingProviderAdapter } from "../retrieval/providers.js";

type SaveKind = 'observation' | 'prompt' | 'session_summary' | 'passive_learnings';

function extractFirstContentLine(content: string): string {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
      return trimmed.substring(0, 200);
    }
  }
  return 'Session completed';
}

function sessionSummaryTopicKey(sessionId: string): string {
  return `session/${sessionId}/summary`;
}

async function capturePassiveLearnings(
  store: Store,
  input: { content: string; session_id?: string; project?: string },
  options: { embeddingProvider?: EmbeddingProviderAdapter | null } = {},
): Promise<string> {
  const headerMatch = input.content.match(/^##\s+(Key Learnings|Aprendizajes Clave)\s*:?\s*$/im);

  if (!headerMatch || headerMatch.index === undefined) {
    throw new Error("No '## Key Learnings:' or '## Aprendizajes Clave:' section found in content");
  }

  const afterHeader = input.content.slice(headerMatch.index + headerMatch[0].length);
  const nextHeaderMatch = afterHeader.match(/^##\s+/m);
  const sectionText = nextHeaderMatch && nextHeaderMatch.index !== undefined
    ? afterHeader.slice(0, nextHeaderMatch.index)
    : afterHeader;

  const items = sectionText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.match(/^(?:-\s+|\*\s+|\d+\.\s+)(.+)$/)?.[1]?.trim())
    .filter((item): item is string => Boolean(item));

  let saved = 0;
  let duplicates = 0;

  for (const item of items) {
    const title = item.length > 50 ? `${item.slice(0, 50)}...` : item;
    const result = await store.saveObservationWithIndex({
      title,
      content: item,
      type: 'learning',
      session_id: input.session_id,
      project: input.project,
      scope: 'project',
    }, { embeddingProvider: options.embeddingProvider ?? null });

    if (result.action === 'created') {
      saved += 1;
    } else if (result.action === 'deduplicated') {
      duplicates += 1;
    }
  }

  return `Extracted ${items.length} learnings: ${saved} saved, ${duplicates} duplicates skipped`;
}

export function registerMemSave(
  server: McpServer,
  store: Store,
  options: { embeddingProvider?: EmbeddingProviderAdapter | null } = {},
): void {
  const config = getConfig();

  server.tool(
    "mem_save",
    `Save memory. This single write tool handles observations, user prompts, session summaries, and passive learning capture.

For durable observations, use kind=observation and structured content:
  **What**: [concise description]
  **Why**: [reasoning or problem]
  **Where**: [files/paths affected]
  **Learned**: [gotchas, edge cases]

Use topic_key for evolving topics that should update in-place.`,
    {
      kind: z.enum(['observation', 'prompt', 'session_summary', 'passive_learnings'] as const).optional().describe("Write mode. Defaults to observation"),
      title: z.string().optional().describe("Short searchable title. Required for kind=observation"),
      content: z.string().describe("Memory content, prompt text, session summary, or text containing a Key Learnings section"),
      type: z.enum(OBSERVATION_TYPES).optional().describe("Observation category for kind=observation"),
      session_id: z.string().optional().describe("Session ID (default: manual-save-{project})"),
      project: z.string().optional().describe("Project name"),
      scope: z.enum(['project', 'personal'] as const).optional().describe("Observation scope"),
      topic_key: z.string().optional().describe("Stable key for observation upserts"),
    },
    async ({ kind = 'observation', title, content, type, session_id, project, scope, topic_key }: {
      kind?: SaveKind;
      title?: string;
      content: string;
      type?: typeof OBSERVATION_TYPES[number];
      session_id?: string;
      project?: string;
      scope?: 'project' | 'personal';
      topic_key?: string;
    }) => {
      try {
        if (kind === 'prompt') {
          const resolvedSessionId = session_id ?? `manual-save-${project || 'unknown'}`;
          const prompt = store.savePrompt(resolvedSessionId, content, project);
          return { content: [{ type: "text" as const, text: `Prompt saved (ID: ${prompt.id})` }] };
        }

        if (kind === 'session_summary') {
          if (!project) {
            return {
              isError: true,
              content: [{ type: "text" as const, text: "project is required for kind=session_summary" }],
            };
          }

          const resolvedSessionId = session_id ?? `manual-save-${project}`;
          const result = await store.saveObservationWithIndex({
            title: `Session summary: ${project}`,
            content,
            type: 'session_summary',
            session_id: resolvedSessionId,
            project,
            scope: 'project',
            topic_key: sessionSummaryTopicKey(resolvedSessionId),
          }, { embeddingProvider: options.embeddingProvider ?? null });
          store.checkpointSession(resolvedSessionId, extractFirstContentLine(content));
          return {
            content: [{
              type: "text" as const,
              text: `Session summary saved (observation ID: ${result.observation.id}) and session '${resolvedSessionId}' checkpointed.`,
            }],
          };
        }

        if (kind === 'passive_learnings') {
          return {
            content: [{ type: "text" as const, text: await capturePassiveLearnings(store, { content, session_id, project }, options) }],
          };
        }

        if (!title || title.trim().length === 0) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: "title is required for kind=observation" }],
          };
        }

        const result = await store.saveObservationWithIndex({
          title,
          content,
          type,
          session_id,
          project,
          scope,
          topic_key,
        }, { embeddingProvider: options.embeddingProvider ?? null });

        const actionMessages: Record<string, string> = {
          created: `Observation saved (ID: ${result.observation.id})`,
          deduplicated: `Duplicate detected — incremented count on existing observation (ID: ${result.observation.id})`,
          upserted: `Topic key update — observation ${result.observation.id} updated (revision ${result.observation.revision_count})`,
        };

        let message = actionMessages[result.action];
        const { warning } = validateContentLength(content, config.maxContentLength);

        if (warning) {
          message += `\n\nWarning: ${warning}`;
        }

        return { content: [{ type: "text" as const, text: message }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error saving memory: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    },
  );
}
