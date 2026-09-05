import assert from 'node:assert/strict';
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(process.argv[2]);
const repo = fileURLToPath(new URL('../../', import.meta.url));
// Isolate credentials, settings, sessions, and persistence before loading Pi.
for (const key of Object.keys(process.env)) {
  if (!['path', 'systemroot', 'windir', 'comspec', 'pathext', 'temp', 'tmp'].includes(key.toLowerCase())) delete process.env[key];
}
for (const [key, directory] of Object.entries({ HOME: 'home', USERPROFILE: 'home', XDG_CONFIG_HOME: 'config', XDG_CACHE_HOME: 'cache', PI_CODING_AGENT_DIR: 'agent', THOTH_MEM_DATA_DIR: 'data', JITI_CACHE_DIR: 'jiti' })) {
  process.env[key] = join(root, directory);
  mkdirSync(process.env[key], { recursive: true });
}
process.env.PI_OFFLINE = '1';
const cwd = join(root, 'project');
mkdirSync(cwd, { recursive: true });
process.chdir(cwd);

const sdk = await import('@earendil-works/pi-coding-agent');
const hostRequire = createRequire(realpathSync(fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent'))));
const aiEntry = hostRequire.resolve.paths('@earendil-works/pi-ai').map((directory) => join(directory, '@earendil-works/pi-ai/dist/index.js')).find(existsSync);
assert.ok(aiEntry, 'the pinned Pi SDK must provide pi-ai');
const ai = await import(pathToFileURL(aiEntry).href);
const calls = [
  { name: 'mem_get', arguments: { id: 'missing-native-error-regression' } },
  { name: 'mem_project', arguments: { action: 'list' } },
];
const modelResults = new Map();
const toolResults = [];
let callIndex = 0;

function stream(model, context) {
  for (const message of context.messages) {
    if (message.role === 'toolResult') modelResults.set(message.toolCallId, message);
  }
  const events = ai.createAssistantMessageEventStream();
  queueMicrotask(() => {
    const call = calls[callIndex++];
    const message = {
      role: 'assistant', api: model.api, provider: model.provider, model: model.id,
      content: call ? [{ type: 'toolCall', id: `call-${callIndex}`, ...call }] : [{ type: 'text', text: 'Done.' }],
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: call ? 'toolUse' : 'stop', timestamp: Date.now(),
    };
    events.push({ type: 'start', partial: message });
    events.push({ type: 'done', reason: message.stopReason, message });
    events.end();
  });
  return events;
}

const observer = (pi) => {
  pi.registerProvider('error-regression', {
    baseUrl: 'http://127.0.0.1:1', apiKey: 'synthetic-only', api: 'error-regression', streamSimple: stream,
    models: [{ id: 'synthetic', name: 'Synthetic', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 2048 }],
  });
  pi.on('tool_result', (event) => { toolResults.push(event); });
};
const runtime = await sdk.createAgentSessionRuntime(async ({ cwd, sessionManager, sessionStartEvent }) => {
  const modelRuntime = await sdk.ModelRuntime.create({ credentials: new ai.InMemoryCredentialStore(), modelsPath: null, modelsStorePath: join(root, 'models.json'), allowModelNetwork: false, refreshOnCreate: false });
  const settingsManager = sdk.SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false }, defaultProvider: 'error-regression', defaultModel: 'synthetic' });
  const services = await sdk.createAgentSessionServices({
    cwd, agentDir: process.env.PI_CODING_AGENT_DIR, modelRuntime, settingsManager,
    resourceLoaderOptions: { additionalExtensionPaths: [join(repo, 'dist/pi.js')], extensionFactories: [observer], noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, systemPrompt: 'Offline tool error regression.' },
  });
  const result = await sdk.createAgentSessionFromServices({ services, sessionManager, sessionStartEvent, noTools: 'builtin' });
  assert.deepEqual(result.extensionsResult.errors, []);
  return { ...result, services, diagnostics: services.diagnostics };
}, { cwd, agentDir: process.env.PI_CODING_AGENT_DIR, sessionManager: sdk.SessionManager.create(cwd, join(root, 'sessions')) });

try {
  await runtime.session.bindExtensions({ mode: 'rpc', onError: (error) => { throw new Error(String(error)); } });
  await runtime.session.prompt('Run the missing-record query, then list projects.', { source: 'rpc' });
  assert.equal(toolResults.length, 2);
  assert.equal(toolResults[0].isError, true, 'Pi tool_result must mark the failed call as an error');
  assert.equal(modelResults.get('call-1')?.isError, true, 'the model must receive the failed call as an error');
  assert.match(JSON.stringify(modelResults.get('call-1').content), /Memory record not found/);
  assert.equal(toolResults[1].isError, false, 'the next call must succeed after reconnect');
  assert.equal(modelResults.get('call-2')?.isError, false);
  assert.equal(toolResults[1].details.data.projects.length, 1);
  console.log('Pi native error signaling and subsequent MCP call passed');
} finally {
  await runtime.dispose();
}
