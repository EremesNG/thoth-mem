import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createNodeClaudeCommandExecutor,
  inspectClaudeCodeManager,
} from '../../src/setup/claude-code-cli.js';

describe('Claude Code command execution', () => {
  it('reports only a safe OS code when the Claude command is missing', async () => {
    const missingCommand = join(
      tmpdir(),
      `missing claude private-token ${process.pid} ${Date.now()}`,
    );
    const executor = createNodeClaudeCommandExecutor({ command: missingCommand });

    const command = await executor.execute(['--version'], { timeoutMs: 1_000 });
    const inspection = await inspectClaudeCodeManager({ executor, scope: 'global' });

    expect(command).toMatchObject({
      exitCode: null,
      error: 'spawn_failed',
      errorCode: 'ENOENT',
    });
    expect(inspection.status).toBe('requires_user_action');
    expect(inspection.diagnostics).toEqual([
      'Claude Code version probing could not start (ENOENT).',
    ]);
    expect(inspection.diagnostics.join('\n')).not.toContain(missingCommand);
    expect(inspection.diagnostics.join('\n')).not.toContain('private-token');
  });
});
