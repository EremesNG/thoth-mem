import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Store } from "../store/index.js";
import { registerMemSave } from "./mem-save.js";
import { registerMemSearch } from "./mem-search.js";
import { registerMemContext } from "./mem-context.js";
import { registerMemGetObservation } from "./mem-get-observation.js";
import { registerMemSessionStart } from "./mem-session-start.js";
import { registerMemSessionSummary } from "./mem-session-summary.js";
import { registerMemSuggestTopicKey } from "./mem-suggest-topic-key.js";
import { registerMemCapturePassive } from "./mem-capture-passive.js";
import { registerMemSavePrompt } from "./mem-save-prompt.js";
import { registerMemUpdate } from "./mem-update.js";
import { registerMemDelete } from "./mem-delete.js";
import { registerMemStats } from "./mem-stats.js";
import { registerMemTimeline } from "./mem-timeline.js";

interface ToolRegistration {
  name: string;
  register: (server: McpServer, store: Store) => void;
}

const ALL_TOOLS: ToolRegistration[] = [
  { name: 'mem_save', register: registerMemSave },
  { name: 'mem_search', register: registerMemSearch },
  { name: 'mem_context', register: registerMemContext },
  { name: 'mem_get_observation', register: registerMemGetObservation },
  { name: 'mem_session_start', register: registerMemSessionStart },
  { name: 'mem_session_summary', register: registerMemSessionSummary },
  { name: 'mem_suggest_topic_key', register: registerMemSuggestTopicKey },
  { name: 'mem_capture_passive', register: registerMemCapturePassive },
  { name: 'mem_save_prompt', register: registerMemSavePrompt },
  { name: 'mem_update', register: registerMemUpdate },
  { name: 'mem_delete', register: registerMemDelete },
  { name: 'mem_stats', register: registerMemStats },
  { name: 'mem_timeline', register: registerMemTimeline },
];

export function registerTools(server: McpServer, store: Store): void {
  for (const tool of ALL_TOOLS) {
    tool.register(server, store);
  }
}

export function getToolCount(): number {
  return ALL_TOOLS.length;
}

export { ALL_TOOLS };
