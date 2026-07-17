export type SetupHarness = 'opencode' | 'codex' | 'claude-code';
export type SetupScope = 'global' | 'project';
export type SetupStatus = 'complete' | 'failed' | 'partial' | 'requires_user_action';
export type CodexSetupStrategy = 'plugin_manager' | 'legacy_filesystem';
export type SetupStepOutcome = 'planned' | 'skipped' | 'confirmed' | 'failed' | 'unavailable';
export type SetupExitCode = 0 | 1 | 2 | 3;

export interface SetupRequest {
  harness: SetupHarness;
  scope: SetupScope;
  projectPath?: string;
  planOnly: boolean;
  force: boolean;
  rollbackReceipt?: string;
  json: boolean;
}

export interface SetupStep {
  name: string;
  outcome: SetupStepOutcome;
}

export interface SetupResult {
  status: SetupStatus;
  changed: boolean;
  harness: SetupHarness;
  scope: SetupScope;
  target: string;
  steps: SetupStep[];
  diagnostics: string[];
  manual_actions: string[];
  receipt: string | null;
}

export function getSetupExitCode(status: SetupStatus): SetupExitCode {
  switch (status) {
    case 'complete':
      return 0;
    case 'failed':
      return 1;
    case 'partial':
      return 2;
    case 'requires_user_action':
      return 3;
  }
}
