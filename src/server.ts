import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Store } from "./store/index.js";
import { getConfig, resolveDataDir, ThothConfig } from "./config.js";
import { registerTools } from "./tools/index.js";

/**
 * MCP server instructions — returned during initialization to guide
 * connected agents on how to use thoth-mem tools effectively.
 */
const SERVER_INSTRUCTIONS = `thoth-mem — Persistent memory for coding agents.

## When to Save
Call mem_save IMMEDIATELY after: decisions made, bugs fixed, patterns discovered, architecture changes, configuration changes, non-obvious learnings.

## Session Protocol
1. Call mem_session_start at session beginning
2. Call mem_context to recover context from previous sessions
3. Save observations throughout the session with mem_save
4. Call mem_session_summary before ending (format: Goal/Discoveries/Accomplished/Next Steps/Relevant Files)

## Recall Protocol
When the user references prior work or says "remember/recall/what did we do":
1. mem_context for recent history
2. mem_search with relevant keywords
3. mem_get_observation for full content

## Key Behaviors
- Use topic_key with mem_save for evolving topics (call mem_suggest_topic_key first if unsure)
- Use mem_save_prompt to record significant user requests
- Use mem_capture_passive when output contains '## Key Learnings:' sections
- Search memory proactively when starting work that might overlap with past sessions
`;

export interface ServerOptions {
  profiles: string[];
  dataDir?: string;
}

export function createServer(options: ServerOptions): { server: McpServer; store: Store; config: ThothConfig } {
  const config = getConfig();
  if (options.dataDir) {
    config.dataDir = options.dataDir;
    config.dbPath = `${options.dataDir}/thoth.db`;
  }

  resolveDataDir(config);

  const store = new Store(config.dbPath, config);

  const server = new McpServer({
    name: "thoth-mem",
    version: "0.1.0",
  }, {
    instructions: SERVER_INSTRUCTIONS,
  });

  registerTools(server, store, options.profiles);

  return { server, store, config };
}
