import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createMcpChildClient } from '../../src/integration/mcp-child-client.js';

import { resolveMcpRuntime } from '../../src/integration/runtime-resolver.js';

const root = resolve('/plugin');
const entry = resolve('/checkout/dist/index.js');
function fixture() {
  const files = new Map<string, string>([
    [entry, ''], [resolve('/checkout/package.json'), JSON.stringify({ name: 'thoth-mem', version: '0.6.3' })],
    [join(root, 'dist/index.js'), ''], [resolve('/native/better_sqlite3.node'), ''],
  ]);
  return { files, options: {
    packageRoot: root, version: '0.6.3', platform: 'linux' as NodeJS.Platform,
    fs: { isFile: (path: string) => files.has(path), readText: (path: string) => files.get(path) ?? '' },
    resolveBinding: () => resolve('/native/better_sqlite3.node'),
  } };
}

describe('owned MCP runtime resolver', () => {
  it('uses the package build only with an existing native binding; otherwise pins npx with a longer configurable timeout', () => {
    const { files, options } = fixture();
    expect(resolveMcpRuntime(options)).toEqual({ command: 'node', args: [join(root, 'dist/index.js'), 'mcp', '--no-http'], source: 'package', startupTimeoutMs: 5_000 });
    files.delete(resolve('/native/better_sqlite3.node'));
    expect(resolveMcpRuntime(options)).toEqual({ command: 'npx', args: ['--yes', 'thoth-mem@0.6.3', 'mcp', '--no-http'], source: 'npx', startupTimeoutMs: 120_000 });
    expect(resolveMcpRuntime({ ...options, npxStartupTimeoutMs: 180_000 }).startupTimeoutMs).toBe(180_000);
  });
  it('never borrows an ancestor binding when the selected dependency was installed without scripts', () => {
    const directory = mkdtempSync(join(tmpdir(), 'thoth-shadowed-binding-'));
    const packageRoot = join(directory, 'cache/node_modules/thoth-mem');
    try {
      mkdirSync(join(packageRoot, 'dist'), { recursive: true });
      writeFileSync(join(packageRoot, 'dist/index.js'), '');
      for (const base of [directory, join(directory, 'cache')]) {
        const sqlite = join(base, 'node_modules/better-sqlite3');
        mkdirSync(join(sqlite, 'build/Release'), { recursive: true });
        writeFileSync(join(sqlite, 'package.json'), JSON.stringify({ name: 'better-sqlite3', version: '12.0.0' }));
        if (base === directory) writeFileSync(join(sqlite, 'build/Release/better_sqlite3.node'), 'ancestor binding');
      }
      expect(resolveMcpRuntime({ packageRoot, version: '0.6.3', env: {} }).source).toBe('npx');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('selects the provider entry and allows configurable local startup time', () => {
    const { options } = fixture();
    expect(resolveMcpRuntime({ ...options, provider: { runtimeEntry: entry }, localStartupTimeoutMs: 8_000 })).toMatchObject({ source: 'configured', command: 'node', startupTimeoutMs: 8_000 });
  });

  it.each([
    { name: 'other-package', version: '0.6.3' },
    { name: 'thoth-mem', version: '0.6.2' },
  ])('fails closed on configured identity mismatch: %j', (manifest) => {
    const { files, options } = fixture();
    files.set(resolve('/checkout/package.json'), JSON.stringify(manifest));
    expect(() => resolveMcpRuntime({ ...options, runtimeEntry: entry })).toThrow('package identity does not match');
  });

  it('rejects relative, absent and unreadable configured entries without falling back', () => {
    const { files, options } = fixture();
    expect(() => resolveMcpRuntime({ ...options, runtimeEntry: 'relative.js' })).toThrow('absolute path');
    expect(() => resolveMcpRuntime({ ...options, runtimeEntry: resolve('/missing') })).toThrow('regular file');
    files.set(resolve('/checkout/package.json'), 'private invalid manifest');
    expect(() => resolveMcpRuntime({ ...options, runtimeEntry: entry })).toThrow('manifest is invalid');
  });

  it('uses platform npx resolution when the dependency cannot resolve or the package build is missing', () => {
    const { files, options } = fixture();
    files.delete(join(root, 'dist/index.js'));
    expect(resolveMcpRuntime({ ...options, platform: 'win32', env: {} })).toMatchObject({ command: 'npx.cmd', args: ['--yes', 'thoth-mem@0.6.3', 'mcp', '--no-http'] });
    expect(resolveMcpRuntime({ ...options, platform: 'win32', env: { THOTH_MEM_PUBLIC_NPX_COMMAND: 'C:\\runtime tools\\npx.cmd' } }).command).toBe('C:\\runtime tools\\npx.cmd');
    expect(resolveMcpRuntime({ ...options, resolveBinding: () => { throw new Error('not installed'); } }).source).toBe('npx');
  });

  it.each(process.platform === 'win32' ? ['configured', 'package', 'npx'] as const : ['configured', 'package'] as const)('launches %s runtime without the non-Node host executable', async (source) => {
    const directory = mkdtempSync(join(tmpdir(), 'thoth runtime & fixture-'));
    const runtimeEntry = join(directory, 'dist/index.js');
    mkdirSync(join(directory, 'dist'));
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: 'thoth-mem', version: '0.6.3', type: 'module' }));
    writeFileSync(runtimeEntry, `
import { createInterface } from 'node:readline';
createInterface({ input: process.stdin }).on('line', (line) => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  const result = request.method === 'initialize'
    ? { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } }
    : { content: [{ type: 'text', text: process.env.THOTH_MEM_NATIVE_HOST }] };
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n');
});
`);
    const npxCommand = join(directory, 'npx.cmd');
    if (source === 'npx') writeFileSync(npxCommand, '@echo off\r\nnode "%~dp0dist\\index.js" %*\r\n');
    const executable = process.execPath;
    Object.defineProperty(process, 'execPath', { value: '/compiled-bun/opencode' });
    let client: ReturnType<typeof createMcpChildClient> | undefined;
    try {
      const launch = resolveMcpRuntime({ packageRoot: directory, version: '0.6.3',
        ...(source === 'configured' ? { runtimeEntry } : source === 'package'
          ? { resolveBinding: () => runtimeEntry }
          : { resolveBinding: () => { throw new Error('scripts disabled'); }, env: { THOTH_MEM_PUBLIC_NPX_COMMAND: npxCommand } }),
      });
      expect(launch.command).toBe(source === 'npx' ? npxCommand : 'node');
      client = createMcpChildClient({ ...launch, clientIdentity: { name: 'thoth-mem-opencode', version: '1' }, nativeHost: 'opencode', label: 'OpenCode MCP', errorPrefix: 'bridge failed', diagnosticPrefix: 'opencode_mcp' });
      await expect(client.callTool('mem_project', {})).resolves.toMatchObject({ content: [{ text: 'opencode' }] });
    } finally {
      Object.defineProperty(process, 'execPath', { value: executable });
      await client?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('prefers a validated explicit entry over provider and package entries, using literal Node', () => {
    const { options } = fixture();
    expect(resolveMcpRuntime({ ...options, runtimeEntry: entry, provider: { runtimeEntry: '/unselected' } })).toEqual({
      command: 'node', args: [entry, 'mcp', '--no-http'], source: 'configured', startupTimeoutMs: 5_000,
    });
  });
});
