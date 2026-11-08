import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin } from '@opencode/plugin';

import { loadRuntimeConfig, type RuntimeConfigOptions } from '../../config/runtime.js';
import { VERSION } from '../../version.js';
import { createMcpChildClient, type McpChildClient } from '../mcp-child-client.js';
import { resolveMcpRuntime } from '../runtime-resolver.js';
import { createNativeTools } from './tools.js';
import { loadPackagedSkill } from './skills.js';
import { registerLifecycle } from './lifecycle.js';

export interface ThothMemPluginOptions {
  runtimeConfig?: RuntimeConfigOptions;
  runtimeEntry?: string;
  client?: McpChildClient;
}

function packageRoot(): string {
  const directory = dirname(fileURLToPath(import.meta.url));
  return resolve(directory, basename(directory) === 'dist' ? '..' : '../../..');
}

export function createThothMemPlugin(options: ThothMemPluginOptions = {}) {
  // Cache static content (including a failed load) for this plugin instance.
  let skill: ReturnType<typeof loadPackagedSkill> | undefined;
  return {
    id: 'thoth-mem',
    async setup(ctx: Plugin.Context) {
      const runtimeConfig = loadRuntimeConfig(options.runtimeConfig);
      const env = { ...process.env, ...options.runtimeConfig?.env };
      if (options.runtimeConfig?.homeDir) {
        env.HOME = options.runtimeConfig.homeDir;
        env.USERPROFILE = options.runtimeConfig.homeDir;
      }
      if (options.runtimeConfig?.explicitDataDir !== undefined) env.THOTH_MEM_DATA_DIR = runtimeConfig.dataDir;
      const runtime = resolveMcpRuntime({
        packageRoot: packageRoot(), version: VERSION,
        provider: runtimeConfig.provider, runtimeEntry: options.runtimeEntry, env,
      });
      const reportDiagnostic = (code: string): void => {
        console.error(`[thoth-mem] OpenCode bridge degraded: ${code.slice(0, 100)}`);
      };
      // The shared client owns one lazy, reconnecting child; constructing it never spawns.
      const client = options.client ?? createMcpChildClient({
        ...runtime, env,
        clientIdentity: { name: 'thoth-mem-opencode', version: VERSION },
        nativeHost: 'opencode', label: 'OpenCode MCP',
        errorPrefix: 'thoth-mem OpenCode bridge failed', diagnosticPrefix: 'opencode_mcp',
        onDiagnostic: reportDiagnostic,
      });
      const subscription = new AbortController();
      const registrations: { dispose(): Promise<void> }[] = [];

      const tools = createNativeTools(client, ctx);
      try {
        registrations.push(await ctx.tool.transform((editor) => {
          for (const tool of tools) editor.add(tool);
        }));
      } catch (error) {
        await client.close();
        throw error;
      }
      try {
        const info = await (skill ??= loadPackagedSkill(packageRoot()));
        registrations.push(await ctx.skill.transform((editor) => editor.add(info)));
      } catch {
        reportDiagnostic('packaged_skill_registration_failed');
      }
      try {
        await registerLifecycle(ctx, client, subscription.signal, registrations, reportDiagnostic);
      } catch {
        reportDiagnostic('lifecycle_registration_failed');
      }

      let cleanup: Promise<void> | undefined;
      return () => cleanup ??= (async () => {
        subscription.abort();
        for (const registration of registrations.reverse()) {
          try { await registration.dispose(); } catch { reportDiagnostic('registration_cleanup_failed'); }
        }
        await client.close();
      })();
    },
  } satisfies Plugin.Plugin;
}
