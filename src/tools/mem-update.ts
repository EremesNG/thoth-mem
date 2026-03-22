import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";
import { OBSERVATION_TYPES } from "../store/types.js";

export function registerMemUpdate(server: McpServer, store: Store): void {
  server.tool(
    "mem_update",
    "Update an existing observation by ID. Only provided fields are changed. Previous version is automatically saved to history.",
    {
      id: z.number().describe("Observation ID to update"),
      title: z.string().optional().describe("New title"),
      content: z.string().optional().describe("New content"),
      type: z.enum(OBSERVATION_TYPES).optional().describe("New type/category"),
      project: z.string().optional().describe("New project value"),
      scope: z.enum(['project', 'personal'] as const).optional().describe("New scope: project or personal"),
      topic_key: z.string().optional().describe("New topic key (normalized internally)"),
    },
    async ({ id, title, content, type, project, scope, topic_key }) => {
      try {
        const updates: {
          title?: string;
          content?: string;
          type?: typeof OBSERVATION_TYPES[number];
          project?: string;
          scope?: 'project' | 'personal';
          topic_key?: string;
        } = {};

        if (title !== undefined) updates.title = title;
        if (content !== undefined) updates.content = content;
        if (type !== undefined) updates.type = type;
        if (project !== undefined) updates.project = project;
        if (scope !== undefined) updates.scope = scope;
        if (topic_key !== undefined) updates.topic_key = topic_key;

        if (Object.keys(updates).length === 0) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: "At least one field to update must be provided" }],
          };
        }

        const observation = store.updateObservation({ id, ...updates });

        if (!observation) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: `Observation with ID ${id} not found` }],
          };
        }

        return {
          content: [{ type: "text" as const, text: `Observation ${id} updated (revision ${observation.revision_count}). Previous version saved to history.` }],
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
