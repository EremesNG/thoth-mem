import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Store } from "./store/index.js";
import { getConfig, resolveDataDir, ThothConfig } from "./config.js";
import { registerTools } from "./tools/index.js";

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
  });

  registerTools(server, store, options.profiles);

  return { server, store, config };
}
