import { describe, expect, it } from 'vitest';

import { shouldRunCli } from '../src/index.js';

describe('process entrypoint routing', () => {
  it('keeps an MCP invocation with a separate data directory value on the MCP path', () => {
    expect(shouldRunCli([
      'mcp',
      '--no-http',
      '--data-dir',
      'C:\\Users\\example\\.thoth-canary',
    ])).toBe(false);
  });
});
