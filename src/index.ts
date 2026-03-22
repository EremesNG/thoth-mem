#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

function parseArgs(argv: string[]): { profiles: string[]; dataDir?: string } {
  const args = argv.slice(2);
  let profiles = ["agent", "admin"];
  let dataDir: string | undefined;

  for (const arg of args) {
    if (arg.startsWith("--tools=")) {
      profiles = arg.slice("--tools=".length).split(",").map(s => s.trim()).filter(Boolean);
    } else if (arg.startsWith("--data-dir=")) {
      dataDir = arg.slice("--data-dir=".length);
    }
  }

  return { profiles, dataDir };
}

async function main(): Promise<void> {
  const { profiles, dataDir } = parseArgs(process.argv);

  const { server, store } = createServer({ profiles, dataDir });

  const transport = new StdioServerTransport();

  const shutdown = () => {
    store.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  process.stderr.write(`thoth-mem MCP server started (tools: ${profiles.join(', ')})\n`);

  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err}\n`);
  process.exit(1);
});
