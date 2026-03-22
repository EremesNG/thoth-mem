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

export type ToolProfile = 'agent' | 'admin';

interface ToolRegistration {
  name: string;
  profile: ToolProfile;
  register: (server: McpServer, store: Store) => void;
}

const ALL_TOOLS: ToolRegistration[] = [
  { name: 'mem_save', profile: 'agent', register: registerMemSave },
  { name: 'mem_search', profile: 'agent', register: registerMemSearch },
  { name: 'mem_context', profile: 'agent', register: registerMemContext },
  { name: 'mem_get_observation', profile: 'agent', register: registerMemGetObservation },
  { name: 'mem_session_start', profile: 'agent', register: registerMemSessionStart },
  { name: 'mem_session_summary', profile: 'agent', register: registerMemSessionSummary },
  { name: 'mem_suggest_topic_key', profile: 'agent', register: registerMemSuggestTopicKey },
  { name: 'mem_capture_passive', profile: 'agent', register: registerMemCapturePassive },
  { name: 'mem_save_prompt', profile: 'agent', register: registerMemSavePrompt },
  { name: 'mem_update', profile: 'agent', register: registerMemUpdate },
  { name: 'mem_delete', profile: 'admin', register: registerMemDelete },
  { name: 'mem_stats', profile: 'admin', register: registerMemStats },
  { name: 'mem_timeline', profile: 'admin', register: registerMemTimeline },
];

export function registerTools(server: McpServer, store: Store, profiles: string[]): void {
  const filtered = ALL_TOOLS.filter(t => profiles.includes(t.profile));
  for (const tool of filtered) {
    tool.register(server, store);
  }
}

export function getToolCount(profiles: string[]): number {
  return ALL_TOOLS.filter(t => profiles.includes(t.profile)).length;
}

export { ALL_TOOLS };
