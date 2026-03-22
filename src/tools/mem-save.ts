import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";
import { OBSERVATION_TYPES } from "../store/types.js";
import { validateContentLength } from "../utils/content.js";
import { getConfig } from "../config.js";

export function registerMemSave(server: McpServer, store: Store): void {
  const config = getConfig();

  server.tool(
    "mem_save",
    `Save an important observation to persistent memory. Call this PROACTIVELY after:
- Architectural decisions or tradeoffs
- Bug fixes (what was wrong, why, how fixed)
- New patterns or conventions established
- Configuration changes or environment setup
- Important discoveries or gotchas

FORMAT for content — use structured format:
  **What**: [concise description]
  **Why**: [reasoning or problem that drove it]
  **Where**: [files/paths affected]
  **Learned**: [gotchas, edge cases — omit if none]

TITLE: Short and searchable (e.g. "JWT auth middleware", "Fixed N+1 in user list")
TYPE options: decision, architecture, bugfix, pattern, config, discovery, learning, manual
TOPIC_KEY: Use for evolving topics that should update in-place (e.g. "architecture/auth-model"). Call mem_suggest_topic_key first if unsure.

Returns: Observation ID and action taken (created/deduplicated/upserted).`,
    {
      title: z.string().describe("Short, searchable title"),
      content: z.string().describe("Structured content with What/Why/Where/Learned format"),
      type: z.enum(OBSERVATION_TYPES).optional().describe("Category type"),
      session_id: z.string().optional().describe("Session ID (default: manual-save-{project})"),
      project: z.string().optional().describe("Project name"),
      scope: z.enum(['project', 'personal'] as const).optional().describe("Scope: project (default) or personal"),
      topic_key: z.string().optional().describe("Stable key for upserts (e.g. architecture/auth-model)"),
    },
    async ({ title, content, type, session_id, project, scope, topic_key }) => {
      try {
        const result = store.saveObservation({
          title,
          content,
          type,
          session_id,
          project,
          scope,
          topic_key,
        });

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
          content: [{ type: "text" as const, text: `Error saving observation: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}
