import { mkdtempSync, rmSync } from 'node:fs';
    import { tmpdir } from 'node:os';
    import { join } from 'node:path';

    export const CLAUDE_SCOPES = ['global', 'project'] as const;

    export type ClaudeScope = (typeof CLAUDE_SCOPES)[number];
    export type ClaudeManagerProbeStatus = 'supported' | 'requires_user_action';
    export type ClaudeOwnership = 'manual-mcp' | 'marketplace-managed' | 'receipt-owned' | 'ambiguous';

    export interface ClaudeDisposableScope {
      scope: ClaudeScope;
      root: string;
      isRealHome: false;
      managerCommandExecuted: false;
      cleanup: () => boolean;
    }

    export interface ClaudeManagerProbe {
      versionFamily: string;
      managerId: string;
      status: ClaudeManagerProbeStatus;
      evidenceKey: string;
      removalProofKind: 'exact-receipt' | 'unproven';
    }

    export interface ClaudeRemovalProof {
      kind: 'exact-receipt' | 'manager-observation' | 'unproven';
      ownership: 'receipt-owned' | 'manager-observed' | 'unproven';
      permitsRemoval: boolean;
      evidenceKey: string;
    }

    export interface ClaudeOwnershipState {
      classification: ClaudeOwnership;
      setupDisposition: 'preserve' | 'manage-receipt-owned';
      rollbackDisposition: 'preserve' | 'remove-receipt-owned';
      receiptKey: string | null;
    }

    export interface ClaudeLaterUserEdit {
      sourceOwnership: 'receipt-owned';
      editKey: string;
      rollbackDisposition: 'preserve-later-user-edit';
      containsRawConfiguration: false;
    }

    function normalizeFixtureRunId(runId: string): string {
      const normalized = runId.toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 48);
      return normalized || 'fixture';
    }

    export function buildClaudeDisposableScopes(runId: string): ClaudeDisposableScope[] {
      const fixtureRunId = normalizeFixtureRunId(runId);

      return CLAUDE_SCOPES.map((scope) => {
        const root = mkdtempSync(join(tmpdir(), 'thoth-claude-' + fixtureRunId + '-' + scope + '-'));
        let cleaned = false;

        return {
          scope,
          root,
          isRealHome: false,
          managerCommandExecuted: false,
          cleanup: () => {
            if (cleaned) return false;
            rmSync(root, { recursive: true, force: true });
            cleaned = true;
            return true;
          },
        };
      });
    }

    export const CLAUDE_MANAGER_PROBES: readonly ClaudeManagerProbe[] = [
      {
        versionFamily: 'claude-code-1.x',
        managerId: 'claude-code-manager-v1',
        status: 'supported',
        evidenceKey: 'manager:claude-code:grammar-v1',
        removalProofKind: 'exact-receipt',
      },
      {
        versionFamily: 'unknown',
        managerId: 'unverified',
        status: 'requires_user_action',
        evidenceKey: 'manager:claude-code:unverified',
        removalProofKind: 'unproven',
      },
    ];

    export const CLAUDE_REMOVAL_PROOFS: readonly ClaudeRemovalProof[] = [
      {
        kind: 'exact-receipt',
        ownership: 'receipt-owned',
        permitsRemoval: true,
        evidenceKey: 'removal:claude-code:receipt-owned',
      },
      {
        kind: 'manager-observation',
        ownership: 'manager-observed',
        permitsRemoval: false,
        evidenceKey: 'removal:claude-code:manager-observed',
      },
      {
        kind: 'unproven',
        ownership: 'unproven',
        permitsRemoval: false,
        evidenceKey: 'removal:claude-code:unverified',
      },
    ];

    export const CLAUDE_OWNERSHIP_STATES: readonly ClaudeOwnershipState[] = [
      {
        classification: 'manual-mcp',
        setupDisposition: 'preserve',
        rollbackDisposition: 'preserve',
        receiptKey: null,
      },
      {
        classification: 'marketplace-managed',
        setupDisposition: 'preserve',
        rollbackDisposition: 'preserve',
        receiptKey: null,
      },
      {
        classification: 'receipt-owned',
        setupDisposition: 'manage-receipt-owned',
        rollbackDisposition: 'remove-receipt-owned',
        receiptKey: 'fixture-receipt-claude-code',
      },
      {
        classification: 'ambiguous',
        setupDisposition: 'preserve',
        rollbackDisposition: 'preserve',
        receiptKey: null,
      },
    ];

    export const CLAUDE_LATER_USER_EDITS: readonly ClaudeLaterUserEdit[] = [
      {
        sourceOwnership: 'receipt-owned',
        editKey: 'later-user-edit-v1',
        rollbackDisposition: 'preserve-later-user-edit',
        containsRawConfiguration: false,
      },
    ];
