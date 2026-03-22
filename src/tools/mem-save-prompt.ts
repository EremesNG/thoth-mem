import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";

export function getMemSavePromptSessionId(sessionId: string | undefined, project: string | undefined): string {
  return sessionId ?? `manual-save-${project || 'unknown'}`;
}

export function registerMemSavePrompt(server: McpServer, store: Store): void {
  server.tool(
    "mem_save_prompt",
    "Save a user prompt to persistent memory. Use this to record what the user asked — their intent, questions, and requests — so future sessions have context about the user's goals.",
    {
      content: z.string().describe("The user's prompt text"),
      session_id: z.string().optional().describe("Session ID to associate with (default: manual-save-{project})"),
      project: z.string().optional().describe("Project name"),
    },
    async ({ content, session_id, project }) => {
      try {
        const resolvedSessionId = getMemSavePromptSessionId(session_id, project);
        const prompt = store.savePrompt(resolvedSessionId, content, project);

        return {
          content: [{ type: "text" as const, text: `Prompt saved (ID: ${prompt.id})` }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }],
        };
      }
    }
  );
}
