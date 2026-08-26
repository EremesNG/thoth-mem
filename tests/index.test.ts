import { describe, expect, it } from 'vitest';

import { shouldRunCli } from '../src/index.js';

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
