import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { createMcpChildClient } from '../../../src/integration/mcp-child-client.js';

const client = createMcpChildClient({
  command: 'node', args: [fileURLToPath(new URL('./mcp-child.mjs', import.meta.url))],
  clientIdentity: { name: 'close-probe', version: '1' }, nativeHost: 'test',
  label: 'test MCP', errorPrefix: 'test bridge failed', diagnosticPrefix: 'test_mcp',
  startupTimeoutMs: 60_000,
});
const pending = client.callTool('mem_get', {}).then(() => { throw new Error('unexpected initialization success'); }, () => undefined);
try {
  const deadline = Date.now() + 3_000;
  while (true) {
    try { await readFile(process.env.THOTH_TEST_PID_FILE!, 'utf8'); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
} finally {
  await client.close();
}
await pending;
// No process.exit(): an SDK initialization timer must not keep this process alive.
