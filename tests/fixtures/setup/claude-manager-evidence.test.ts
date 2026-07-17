import { existsSync } from 'node:fs';

    import { describe, expect, it } from 'vitest';

    import {
      CLAUDE_LATER_USER_EDITS,
      CLAUDE_MANAGER_PROBES,
      CLAUDE_OWNERSHIP_STATES,
      CLAUDE_REMOVAL_PROOFS,
      buildClaudeDisposableScopes,
    } from './claude-manager-evidence.js';

    describe('Claude manager evidence fixture', () => {
      it('builds isolated temporary-only scopes without real-home or manager-command access', () => {
        const scopes = buildClaudeDisposableScopes('fixture-run');

        try {
          expect(scopes.map((scope) => scope.scope)).toEqual(['global', 'project']);
          expect(new Set(scopes.map((scope) => scope.root)).size).toBe(scopes.length);
          expect(scopes.every((scope) => scope.root.includes('thoth-claude-fixture-run'))).toBe(true);
          expect(scopes.every((scope) => existsSync(scope.root))).toBe(true);
          expect(scopes.every((scope) => scope.isRealHome === false)).toBe(true);
          expect(scopes.every((scope) => scope.managerCommandExecuted === false)).toBe(true);
        } finally {
          for (const scope of scopes) {
            expect(scope.cleanup()).toBe(true);
            expect(scope.cleanup()).toBe(false);
          }
        }
      });

      it('keeps manager/version probes and removal proof variants bounded and capability-gated', () => {
        expect(CLAUDE_MANAGER_PROBES.map((probe) => probe.versionFamily)).toEqual([
          'claude-code-1.x',
          'unknown',
        ]);
        expect(CLAUDE_MANAGER_PROBES[0]?.status).toBe('supported');
        expect(CLAUDE_MANAGER_PROBES[1]?.status).toBe('requires_user_action');
        expect(CLAUDE_MANAGER_PROBES.every((probe) => Object.hasOwn(probe, 'command') === false)).toBe(true);

        expect(CLAUDE_REMOVAL_PROOFS.map((proof) => proof.kind)).toEqual([
          'exact-receipt',
          'manager-observation',
          'unproven',
        ]);
        expect(CLAUDE_REMOVAL_PROOFS.filter((proof) => proof.permitsRemoval)).toEqual([
          expect.objectContaining({ kind: 'exact-receipt', ownership: 'receipt-owned' }),
        ]);
      });

      it('classifies manual, marketplace, receipt-owned, and ambiguous state without overwriting external ownership', () => {
        expect(CLAUDE_OWNERSHIP_STATES.map((state) => state.classification)).toEqual([
          'manual-mcp',
          'marketplace-managed',
          'receipt-owned',
          'ambiguous',
        ]);

        const externalStates = CLAUDE_OWNERSHIP_STATES.filter((state) => state.classification !== 'receipt-owned');
        expect(externalStates.every((state) => state.setupDisposition === 'preserve')).toBe(true);
        expect(externalStates.every((state) => state.rollbackDisposition === 'preserve')).toBe(true);

        const receiptOwned = CLAUDE_OWNERSHIP_STATES.find((state) => state.classification === 'receipt-owned');
        expect(receiptOwned).toEqual(expect.objectContaining({
          setupDisposition: 'manage-receipt-owned',
          rollbackDisposition: 'remove-receipt-owned',
          receiptKey: 'fixture-receipt-claude-code',
        }));
      });

      it('preserves later user edits during receipt-owned rollback evidence', () => {
        expect(CLAUDE_LATER_USER_EDITS).toEqual([
          expect.objectContaining({
            sourceOwnership: 'receipt-owned',
            rollbackDisposition: 'preserve-later-user-edit',
            containsRawConfiguration: false,
          }),
        ]);
      });
    });
