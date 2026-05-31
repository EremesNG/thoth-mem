import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Store } from "../store/index.js";
import { registerMemSave } from "./mem-save.js";
import { registerMemContext } from "./mem-context.js";
import { registerMemRecall } from "./mem-recall.js";
import { registerMemGet } from "./mem-get.js";
import { registerMemProject } from "./mem-project.js";
import { registerMemSession } from "./mem-session.js";
import type { EmbeddingProviderAdapter } from "../retrieval/providers.js";

interface ToolRegistration {
  name: string;
  register: (server: McpServer, store: Store, options: ToolRegistrationOptions) => void;
}

export interface ToolRegistrationOptions {
  embeddingProvider?: EmbeddingProviderAdapter | null;
}

const ALL_TOOLS: ToolRegistration[] = [
  { name: 'mem_save', register: registerMemSave },
  { name: 'mem_recall', register: registerMemRecall },
  { name: 'mem_context', register: registerMemContext },
  { name: 'mem_get', register: registerMemGet },
  { name: 'mem_project', register: registerMemProject },
  { name: 'mem_session', register: registerMemSession },
];

export function registerTools(server: McpServer, store: Store, options: ToolRegistrationOptions = {}): void {
  for (const tool of ALL_TOOLS) {
    tool.register(server, store, options);
  }
}

export function getToolCount(): number {
  return ALL_TOOLS.length;
}

export { ALL_TOOLS };
