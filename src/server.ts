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
import { SERVER_MEMORY_PROTOCOL_INSTRUCTIONS } from "./integration/core/protocol.js";

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
    instructions: SERVER_MEMORY_PROTOCOL_INSTRUCTIONS,
  });

  registerTools(server, store, { embeddingProvider, hydeGenerator });

  return { server, store, config, embeddingProvider, hydeGenerator, kgLlmExtractor };
}
