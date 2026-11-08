import type { Plugin } from '@opencode/plugin';

import type { LifecycleInput, LifecycleResult } from '../../memory-core/contracts.js';
import { normalizeAdapterEvent, type LifecycleIntent } from '../adapters/index.js';
import type { McpChildClient } from '../mcp-child-client.js';
import { resolveLocalProjectIdentity } from '../project-identity.js';
import { identityOnlyRecovery, recoveryWithProvenance, type RecoveryBlock } from '../recovery.js';
import { isBoundedIdentifier, resolveRootSession, sanitizeLifecycleContent, stableLifecycleEventKey } from './helpers.js';

const LIFECYCLE_TIMEOUT_MS = 1_500;
const INTENTS: Record<LifecycleInput['operation'], LifecycleIntent> = {
  enroll: 'session.enroll', recover: 'session.recover', capture_root: 'prompt.capture_root',
  checkpoint_pre_compact: 'session.checkpoint_pre_compact', guide_post_compact: 'session.guide_post_compact', finalize: 'session.finalize',
};

export async function registerLifecycle(
  ctx: Plugin.Context,
  client: McpChildClient,
  subscription: AbortSignal,
  registrations: { dispose(): Promise<void> }[],
  report: (code: string) => void,
): Promise<void> {
  const roots = new Map<string, Promise<boolean>>();
  const dispatched = new Set<string>();
  const reported = new Set<string>();
  const diagnostic = (code: string) => {
    if (reported.has(code)) return;
    reported.add(code);
    try { report(code); } catch { /* Diagnostics must not reject a host callback. */ }
  };
  const isRoot = (sessionID: string): Promise<boolean> => {
    let root = roots.get(sessionID);
    if (!root) {
      root = resolveRootSession(sessionID, (id) => ctx.session.get({ sessionID: id }))
        .then((result) => 'rootSessionID' in result && result.rootSessionID === sessionID);
      roots.set(sessionID, root);
    }
    return root;
  };
  // Race even an uncooperative client/host lookup; abort also cancels the real MCP request.
  const bounded = async (work: (signal: AbortSignal) => Promise<void>): Promise<void> => {
    if (subscription.aborted) return;
    const controller = new AbortController();
    const abort = () => controller.abort();
    subscription.addEventListener('abort', abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stopped = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(new Error('Lifecycle stopped')), { once: true });
      timer = setTimeout(abort, LIFECYCLE_TIMEOUT_MS);
    });
    try { await Promise.race([work(controller.signal), stopped]); }
    catch { if (!subscription.aborted) diagnostic('lifecycle_request_failed_or_timed_out'); }
    finally { clearTimeout(timer); subscription.removeEventListener('abort', abort); }
  };
  const dispatch = async (signal: AbortSignal, sessionID: string, operation: LifecycleInput['operation'], keyParts: unknown[], content?: string) => {
    if (!isBoundedIdentifier(sessionID) || !await isRoot(sessionID) || signal.aborted) return;
    const eventKey = `opencode:${operation}:${stableLifecycleEventKey([sessionID, ...keyParts])}`;
    if (dispatched.has(eventKey)) return;
    const project = resolveLocalProjectIdentity(ctx.location.directory);
    const input = normalizeAdapterEvent({
      version: 3, harness: 'opencode', intent: INTENTS[operation], projectKey: project.key,
      projectName: project.name, rootSessionKey: sessionID, eventKey, ...(content ? { content } : {}),
    });
    dispatched.add(eventKey);
    const result = await client.callTool('mem_session', {
      operation: input.operation, harness: input.harness, project_key: input.project.key,
      project_name: input.project.name, root_session_key: input.rootSessionKey, event_key: input.eventKey,
      ...(input.content ? { content: input.content.slice(0, 20_000) } : {}),
    }, signal);
    if (result.isError) throw new Error('Lifecycle request failed');
  };
  const sanitize = (text: string) => sanitizeLifecycleContent([{ type: 'text', text }]);
  type DeliveryMode = 'identity' | 'verified';
  const delivered = new Map<string, DeliveryMode>();
  const deliveries = new Map<string, Promise<void>>();
  const deleted = new Set<string>();
  const deliverRecovery = async (sessionID: string, messageID: string): Promise<void> => {
    const storageKey = `recovery/${sessionID}`;
    let mode = delivered.get(sessionID);
    let checked = false;
    await bounded(async (signal) => {
      if (!mode) {
        const stored = await ctx.storage.get(storageKey);
        if (signal.aborted) return;
        if (stored && typeof stored === 'object' && 'mode' in stored && (stored.mode === 'verified' || stored.mode === 'identity')) {
          mode = stored.mode;
        } else {
          const entries = await ctx.session.instructions.entry.list({ sessionID });
          if (signal.aborted) return;
          // Lost storage means lost write history. Treat ANY existing entry as terminal,
          // even identity-only: cache stability takes priority over a speculative retry.
          if (entries.some((entry) => entry.key === 'thoth-mem-recovery')) mode = 'verified';
        }
        if (mode) delivered.set(sessionID, mode);
      }
      checked = true;
    });
    if (!checked || mode === 'verified' || subscription.aborted || deleted.has(sessionID)) return;
    let recovery: RecoveryBlock | undefined;
    await bounded(async (signal) => {
      const project = resolveLocalProjectIdentity(ctx.location.directory);
      const result = await client.callTool('mem_session', {
        operation: 'recover', harness: 'opencode', project_key: project.key, project_name: project.name,
        root_session_key: sessionID,
        event_key: `opencode:recover:${stableLifecycleEventKey([sessionID, messageID])}`,
      }, signal);
      if (signal.aborted || result.isError) return;
      const structured = result.structuredContent;
      const data = structured && typeof structured === 'object' && 'data' in structured ? structured.data : undefined;
      // The shared validator checks identity, provenance and the complete bounded block.
      recovery = recoveryWithProvenance(data as LifecycleResult | undefined, sessionID, ctx.location.directory, 'opencode');
    });
    if (subscription.aborted || deleted.has(sessionID)) return;
    if (recovery?.source !== 'verified') {
      if (mode === 'identity') return;
      const block = identityOnlyRecovery(sessionID, ctx.location.directory);
      if (!block) return;
      recovery = { block, source: 'fallback' };
    }
    const nextMode: DeliveryMode = recovery.source === 'verified' ? 'verified' : 'identity';
    const value = recovery.block;
    await bounded(async (signal) => {
      // put has no cancellation API. Unknown admission must not trigger another
      // write in this process if the host rejects or outlives our bounded wait.
      delivered.set(sessionID, 'verified');
      await ctx.session.instructions.entry.put({ sessionID, key: 'thoth-mem-recovery', value });
      if (signal.aborted || deleted.has(sessionID)) return;
      delivered.set(sessionID, nextMode);
      await ctx.storage.set(storageKey, { mode: nextMode });
    });
  };

  registrations.push(await ctx.session.hook('prompt', async (event) => {
    let root = false;
    await bounded(async (signal) => {
      if (!await isRoot(event.sessionID) || signal.aborted) return;
      root = true;
      const content = sanitize(event.prompt.text);
      if (content) await dispatch(signal, event.sessionID, 'capture_root', [event.messageID, content], content);
    });
    if (!root || subscription.aborted || deleted.has(event.sessionID)) return;
    // Concurrent root prompts share one delivery decision, including a slow put.
    let delivery = deliveries.get(event.sessionID);
    if (!delivery) {
      delivery = deliverRecovery(event.sessionID, event.messageID);
      deliveries.set(event.sessionID, delivery);
    }
    try { await delivery; }
    catch { diagnostic('lifecycle_request_failed_or_timed_out'); }
    finally { if (deliveries.get(event.sessionID) === delivery) deliveries.delete(event.sessionID); }
  }));
  registrations.push(await ctx.session.hook('compaction', (event) => bounded(async (signal) => {
    // Only admitted user text is evidence, never system, reasoning, or tool streams.
    const content = sanitizeLifecycleContent(event.messages.filter((message) => message.role === 'user')
      .flatMap((message) => message.content.filter((part) => part.type === 'text')));
    await dispatch(signal, event.sessionID, 'checkpoint_pre_compact', [content], content);
    // Do not set event.result: the host still performs its compaction.
  })));

  // The subscription owns its lifetime. Every event and iterator failure is contained.
  const eventLoop = (async () => {
    try {
      for await (const event of ctx.event.subscribe({
        types: ['session.created', 'session.deleted', 'session.compaction.ended'], signal: subscription,
      })) {
        if (subscription.aborted) break;
        const sessionID = event.data.sessionID;
        let deletedRoot = false;
        await bounded(async (signal) => {
          if (event.type === 'session.created') {
            if (isBoundedIdentifier(sessionID)) {
              roots.set(sessionID, event.data.parentID === undefined
                ? Promise.resolve(true)
                : resolveRootSession(sessionID, (id) => id === sessionID
                  ? Promise.resolve({ id, parentID: event.data.parentID })
                  : ctx.session.get({ sessionID: id }))
                  .then(() => false));
            }
            await dispatch(signal, sessionID, 'enroll', [event.id]);
          } else if (event.type === 'session.compaction.ended') {
            await dispatch(signal, sessionID, 'guide_post_compact', [event.id], sanitize(event.data.text));
          } else {
            if (!await isRoot(sessionID) || signal.aborted) return;
            deletedRoot = true;
            deleted.add(sessionID);
            await dispatch(signal, sessionID, 'finalize', []);
          }
        });
        if (deletedRoot) await bounded(async () => {
          delivered.delete(sessionID);
          await ctx.storage.remove(`recovery/${sessionID}`);
        });
      }
    } catch { if (!subscription.aborted) diagnostic('lifecycle_subscription_failed'); }
  })();
  registrations.push({ dispose: async () => { await eventLoop; } });
}
