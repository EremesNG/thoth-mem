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

export function registerMemSessionSummary(server: McpServer, store: Store): void {
  server.tool(
    "mem_session_summary",
    `Save a comprehensive end-of-session summary AND close the session in one call.

This replaces the need for separate "session end" and "session summary" calls.

FORMAT — use this exact structure in the content field:

## Goal
[One sentence: what were we building/working on in this session]

## Instructions
[User preferences, constraints, or context discovered during this session. Skip if nothing notable.]

## Discoveries
- [Technical finding, gotcha, or learning 1]
- [Technical finding 2]

## Accomplished
- ✅ [Completed task 1 — with key implementation details]
- 🔲 [Identified but not yet done — for next session]

## Relevant Files
- path/to/file.ts — [what it does or what changed]

This is NOT optional. If you skip this, the next session starts blind.`,
    {
      content: z.string().describe("Full session summary using the Goal/Instructions/Discoveries/Accomplished/Files format"),
      project: z.string().describe("Project name"),
      session_id: z.string().optional().describe("Session ID (default: manual-save-{project})"),
    },
    async ({ content, project, session_id }) => {
      try {
        const effectiveSessionId = session_id || `manual-save-${project}`;

        const result = store.saveObservation({
          title: `Session summary: ${project}`,
          content,
          type: 'session_summary',
          session_id: effectiveSessionId,
          project,
          scope: 'project',
        });

        const briefSummary = extractFirstContentLine(content);
        store.endSession(effectiveSessionId, briefSummary);

        return {
          content: [{ type: "text" as const, text: `Session summary saved (observation ID: ${result.observation.id}) and session '${effectiveSessionId}' closed.` }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error saving session summary: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}
