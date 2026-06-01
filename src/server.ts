import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Store } from "./store/index.js";
import { getConfig, resolveDataDir, ThothConfig } from "./config.js";
import { registerTools } from "./tools/index.js";
import { VERSION } from "./version.js";
import { createEmbeddingProvider } from "./retrieval/provider-factory.js";
import type { EmbeddingProviderAdapter } from "./retrieval/providers.js";
import { createHydeGenerator } from "./retrieval/hyde-generator.js";
import type { HydeGenerator } from "./retrieval/hyde.js";
import { createKgLlmExtractor } from "./indexing/kg-llm-generator.js";
import type { KgLlmExtractor } from "./indexing/kg-llm-generator.js";

/**
 * MCP server instructions — returned during initialization to guide
 * connected agents on how to use thoth-mem tools effectively.
 */
const SERVER_INSTRUCTIONS = `thoth-mem — Persistent memory for coding agents.

## When to Save
Call mem_save IMMEDIATELY after: decisions made, bugs fixed, patterns discovered, architecture changes, configuration changes, non-obvious learnings.

FORMAT for content — use structured format:
  **What**: [concise description]
  **Why**: [reasoning or problem that drove it]
  **Where**: [files/paths affected]
  **Learned**: [gotchas, edge cases — omit if none]

## Recall Protocol — 3-Layer (Token-Efficient)
Use the compact MCP surface:
1. RECALL: mem_recall(query, mode="compact") → fused hybrid evidence across semantic and lexical lanes, enriched with graph facts
2. EXPAND: mem_recall(query, mode="context") → concise retrieved text for the strongest hits
3. FETCH: mem_get(id) → full content ONLY for the 1-3 records that truly need full detail

Start compact, filter, then expand. Never fetch full content for broad searches.

## Session Protocol
1. Call mem_session(action="start") at session beginning
2. Call mem_context to recover context from previous sessions
3. Save observations throughout the session with mem_save
4. Call mem_session(action="summary") or mem_save(kind="session_summary") before ending

## Key Behaviors
- Use topic_key with mem_save for evolving topics.
- Use mem_save(kind="prompt") to record significant user requests.
- Use mem_save(kind="passive_learnings") when output contains '## Key Learnings:' sections.
- Use mem_project(action="summary"|"graph"|"topics"|"topic") for project-level navigation.
- Search memory proactively when starting work that might overlap with past sessions
`;

export interface ServerOptions {
  dataDir?: string;
}

export function createServer(options: ServerOptions): {
  server: McpServer;
  store: Store;
  config: ThothConfig;
  embeddingProvider: EmbeddingProviderAdapter | null;
  hydeGenerator: HydeGenerator | null;
  kgLlmExtractor: KgLlmExtractor | null;
} {
  const config = getConfig({ dataDir: options.dataDir });

  resolveDataDir(config);

  const store = new Store(config.dbPath, config);
  const embeddingProvider = config.embedding ? createEmbeddingProvider(config.embedding) : null;
  const hydeGenerator = createHydeGenerator(config.hyde);
  const kgLlmExtractor = createKgLlmExtractor(config.kgLlm);

  const server = new McpServer({
    name: "thoth-mem",
    version: VERSION,
  }, {
    instructions: SERVER_INSTRUCTIONS,
  });

  registerTools(server, store, { embeddingProvider, hydeGenerator });

  return { server, store, config, embeddingProvider, hydeGenerator, kgLlmExtractor };
}
