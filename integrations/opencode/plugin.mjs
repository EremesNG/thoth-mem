import { readFile } from 'node:fs/promises';

import { dispatchHookRequest } from '../shared/hook-runner.mjs';

const VERIFIED_EVENTS = [
  'session.created',
  'chat.message',
  'experimental.chat.system.transform',
  'experimental.session.compacting',
];
const MEMORY_PROTOCOL_URL = new URL('./memory-protocol.md', import.meta.url);

function protocolRequest(type, payload, context) {
  return {
    protocolVersion: 1,
    harness: 'opencode',
    capabilityEvidence: {
      verifiedEvents: VERIFIED_EVENTS,
    },
    event: {
      type,
      ...payload,
    },
    context: {
      ...(context.project ? { project: context.project } : {}),
      ...(context.directory ? { directory: context.directory } : {}),
    },
  };
}

export function createOpenCodePlugin(options = {}) {
  const dispatch = options.dispatch ?? dispatchHookRequest;

  return async function ThothMemory(context) {
    const memoryProtocol = await readFile(MEMORY_PROTOCOL_URL, 'utf8');
    const emit = (type, payload = {}) => dispatch(protocolRequest(type, payload, context));

    return {
      event: async ({ event }) => {
        if (event?.type === 'session.created') {
          await emit('session.created', event);
        }
      },
      'chat.message': async (input, output) => {
        await emit('chat.message', { input, output });
      },
      'experimental.session.compacting': async (input, output) => {
        await emit('experimental.session.compacting', { input, output });
      },
      'experimental.chat.system.transform': async (_input, output) => {
        if (!Array.isArray(output.system)) {
          output.system = [];
        }
        output.system.push(memoryProtocol);
      },
    };
  };
}

export const ThothMemory = createOpenCodePlugin();
export default ThothMemory;
