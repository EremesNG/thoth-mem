// Disposable V2 host fixture. Run in Bun too: the host must never load SQLite.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

const [entry, directory] = process.argv.slice(2);
const { default: plugin } = await import(pathToFileURL(entry).href);
assert.equal(typeof plugin, 'object');
assert.equal(plugin.id, 'thoth-mem');
const tools = [], skills = [], hooks = new Map(), storage = new Map(), entries = [];
let wake, pending, aborted = false, disposed = 0;
const registration = () => ({ dispose: async () => { disposed++; } });
const ctx = {
  location: { directory },
  tool: { transform: async (edit) => { edit({ add: (tool) => tools.push(tool) }); return registration(); } },
  skill: { transform: async (edit) => { edit({ add: (skill) => skills.push(skill) }); return registration(); } },
  storage: { get: async (key) => storage.get(key), set: async (key, value) => storage.set(key, value), remove: async (key) => storage.delete(key) },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID }),
    hook: async (name, hook) => { hooks.set(name, hook); return registration(); },
    instructions: { entry: { list: async () => entries, put: async (value) => { entries.push(value); } } },
  },
  event: { subscribe: async function* ({ signal, types }) {
    assert.deepEqual(types, ['session.created', 'session.deleted', 'session.compaction.ended']);
    signal.addEventListener('abort', () => { aborted = true; wake?.(); }, { once: true });
    while (!signal.aborted) {
      if (!pending) await new Promise((resolve) => { wake = resolve; });
      if (signal.aborted) break;
      const { event, resolve } = pending; pending = undefined;
      yield event;
      resolve(); // The consumer completed this event before asking for the next.
    }
  } },
};
const emit = (type, data) => new Promise((resolve) => {
  pending = { event: { id: `packed-${type}`, type, data }, resolve }; wake?.();
});
const cleanup = await plugin.setup(ctx);
try {
  assert.deepEqual(tools.map(({ name }) => name), ['mem_save', 'mem_recall', 'mem_context', 'mem_get', 'mem_project', 'thoth_mem_root_identity']);
  assert.equal(skills.length, 1);
  assert.ok(isAbsolute(skills[0].path) && existsSync(skills[0].path));
  assert.deepEqual([...hooks.keys()], ['prompt', 'compaction']);
  const result = await tools.find(({ name }) => name === 'mem_project').execute({ action: 'list' }, { sessionID: 'packed-root', signal: new AbortController().signal });
  const envelope = JSON.parse(result.content[0].text);
  assert.equal(envelope.schema, 'thoth-mem.mcp.mem_project'); // Also proves MCP initialization.
  await emit('session.created', { sessionID: 'packed-root' });
  const prompt = { sessionID: 'packed-root', messageID: 'packed-first', prompt: { text: 'Packed OpenCode root input.' } };
  const before = JSON.stringify(prompt);
  await hooks.get('prompt')(prompt);
  assert.equal(JSON.stringify(prompt), before);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].key, 'thoth-mem-recovery');
  assert.ok(entries[0].value.includes('root_session_id=packed-root'));
  assert.deepEqual(storage.get('recovery/packed-root'), { mode: 'verified' });
  const compaction = { sessionID: 'packed-root', messages: [{ role: 'user', content: [{ type: 'text', text: 'Packed lifecycle checkpoint.' }] }] };
  await hooks.get('compaction')(compaction);
  assert.equal(compaction.result, undefined);
  await emit('session.compaction.ended', { sessionID: 'packed-root', text: 'Packed lifecycle summary.' });
  await hooks.get('prompt')({ ...prompt, messageID: 'packed-later' });
  assert.equal(entries.length, 1); // No rewrite after compaction or on later prompts.
  await emit('session.deleted', { sessionID: 'packed-root' });
  assert.equal(storage.size, 0);
} finally {
  await cleanup(); await cleanup();
}
assert.ok(aborted);
assert.equal(disposed, 4);
process.stdout.write('native-opencode-v2-ok');
