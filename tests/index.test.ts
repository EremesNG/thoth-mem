import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isMainModule, shouldRunCli } from '../src/index.js';

describe('process entrypoint routing', () => {
  it('routes every long and short help form through the zero-write CLI path', () => {
    for (const args of [
      ['--help'],
      ['-h'],
      ['mcp', '--help'],
      ['mcp', '-h'],
      ['setup', 'opencode', '--help'],
      ['setup', 'claude', '-h'],
    ]) expect(shouldRunCli(args), args.join(' ')).toBe(true);
  });

  it('keeps an MCP invocation with a separate data directory value on the MCP path', () => {
    expect(shouldRunCli([
      'mcp',
      '--no-http',
      '--data-dir',
      'C:\\Users\\example\\.thoth-canary',
    ])).toBe(false);
  });
});

describe('process entrypoint main-module guard', () => {
  it('runs when the entry is reached through a linked package directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-main-'));
    try {
      const real = join(root, 'real');
      mkdirSync(real);
      const entry = join(real, 'index.js');
      writeFileSync(entry, '');
      const linked = join(root, 'linked');
      symlinkSync(real, linked, 'junction');
      const moduleUrl = pathToFileURL(entry).href;
      expect(isMainModule(moduleUrl, entry)).toBe(true);
      expect(isMainModule(moduleUrl, join(linked, 'index.js'))).toBe(true);
      expect(isMainModule(moduleUrl, join(root, 'other.js'))).toBe(false);
      expect(isMainModule(moduleUrl, undefined)).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
