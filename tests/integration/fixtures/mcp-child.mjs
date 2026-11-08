import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

appendFileSync(process.env.THOTH_TEST_PID_FILE, `${process.pid}\n`);
// Deliberately survive stdin EOF so cleanup must terminate the child.
const keepAlive = setInterval(() => {}, 1_000);
createInterface({ input: process.stdin }).on('line', (line) => {
  const request = JSON.parse(line);
  if (process.env.THOTH_TEST_MCP_MODE === 'hang') return;
  if (request.id === undefined) return;
  const result = request.method === 'initialize'
    ? { protocolVersion: process.env.THOTH_TEST_MCP_MODE === 'invalid' ? 'invalid-version' : request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } }
    : { content: [{ type: 'text', text: 'ok' }] };
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result })}\n`);
}).on('close', () => {
  if (process.env.THOTH_TEST_MCP_MODE === 'healthy') {
    appendFileSync(`${process.env.THOTH_TEST_PID_FILE}.closed`, 'graceful');
    clearInterval(keepAlive);
  }
});
