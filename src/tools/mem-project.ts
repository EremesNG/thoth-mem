import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Store } from "../store/index.js";
import { registerTracedTool } from "./tracing.js";
import { formatProjectGraph, formatProjectSummary, formatTopicKeyContext, formatTopicKeyList } from "./project-views.js";

const GRAPH_RELATIONS = [
  'HAS_TYPE',
  'IN_PROJECT',
  'HAS_TOPIC_KEY',
  'HAS_WHAT',
  'HAS_WHY',
  'HAS_WHERE',
  'HAS_LEARNED',
] as const;

export function registerMemProject(server: McpServer, store: Store): void {
  registerTracedTool(
    server,
    store,
    "mem_project",
    "Project-level memory navigation. Lists projects, summarizes one project, reads graph facts, or inspects topic-key memory.",
    {
      action: z.enum(['list', 'summary', 'graph', 'topics', 'topic'] as const).describe("Project view to return"),
      project: z.string().optional().describe("Project name. Required except action=list and optional for action=topics"),
      topic_key: z.string().optional().describe("Topic key for action=topic or graph filtering"),
      relation: z.enum(GRAPH_RELATIONS).optional().describe("Graph relation filter for action=graph"),
      limit: z.number().min(1).max(500).optional().describe("Maximum items to return"),
      max_chars: z.number().min(200).max(20000).optional().describe("Response character budget"),
    },
    async ({ action, project, topic_key, relation, limit, max_chars }) => {
      try {
        if (action === 'list') {
          const stats = store.getStats();
          const lines = stats.projects.map((name) => `- ${name}`);
          return {
            content: [{
              type: "text" as const,
              text: ['## Projects', '', lines.length > 0 ? lines.join('\n') : 'No projects found.'].join('\n'),
            }],
          };
        }

        if (action === 'topics') {
          return {
            content: [{
              type: "text" as const,
              text: formatTopicKeyList(store, project),
            }],
          };
        }

        if (!project) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: `project is required for action=${action}` }],
          };
        }

        if (action === 'summary') {
          return {
            content: [{
              type: "text" as const,
              text: formatProjectSummary(store, project, limit && limit <= 20 ? limit : 10),
            }],
          };
        }

        if (action === 'graph') {
          return {
            content: [{
              type: "text" as const,
              text: formatProjectGraph(store, project, {
                topicKey: topic_key,
                relation,
                limit,
                maxChars: max_chars,
              }),
            }],
          };
        }

        if (!topic_key) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: "topic_key is required for action=topic" }],
          };
        }

        return {
          content: [{
            type: "text" as const,
            text: formatTopicKeyContext(store, project, topic_key, max_chars, limit && limit <= 20 ? limit : 10),
          }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error reading project memory: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    },
  );
}
