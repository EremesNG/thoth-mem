import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";

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

function getSessionSummaryTopicKey(sessionId: string): string {
  return `session/${sessionId}/summary`;
}

export function registerMemSession(server: McpServer, store: Store): void {
  server.tool(
    "mem_session",
    "Manage the active memory session. Use action=start at session start and action=summary before ending.",
    {
      action: z.enum(['start', 'summary', 'checkpoint'] as const).describe("Session action"),
      id: z.string().optional().describe("Session ID. Required for action=start; defaults to manual-save-{project} for summary/checkpoint"),
      project: z.string().describe("Project name"),
      directory: z.string().optional().describe("Working directory for action=start"),
      content: z.string().optional().describe("Full session summary for action=summary"),
      summary: z.string().optional().describe("Short checkpoint summary for action=checkpoint"),
    },
    async ({ action, id, project, directory, content, summary }) => {
      try {
        const sessionId = id || `manual-save-${project}`;

        if (action === 'start') {
          if (!id) {
            return {
              isError: true,
              content: [{ type: "text" as const, text: "id is required for action=start" }],
            };
          }

          const session = store.startSession(id, project, directory);
          return {
            content: [{ type: "text" as const, text: `Session started: ${session.id} (${session.project})` }],
          };
        }

        if (action === 'checkpoint') {
          const session = store.checkpointSession(sessionId, summary);
          if (!session) {
            return {
              isError: true,
              content: [{ type: "text" as const, text: `Session ${sessionId} not found` }],
            };
          }

          return {
            content: [{ type: "text" as const, text: `Session checkpointed: ${session.id}` }],
          };
        }

        if (!content || content.trim().length === 0) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: "content is required for action=summary" }],
          };
        }

        const result = store.saveObservation({
          title: `Session summary: ${project}`,
          content,
          type: 'session_summary',
          session_id: sessionId,
          project,
          scope: 'project',
          topic_key: getSessionSummaryTopicKey(sessionId),
        });

        store.checkpointSession(sessionId, extractFirstContentLine(content));

        return {
          content: [{
            type: "text" as const,
            text: `Session summary saved (observation ID: ${result.observation.id}) and session '${sessionId}' checkpointed.`,
          }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error managing session: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    },
  );
}
