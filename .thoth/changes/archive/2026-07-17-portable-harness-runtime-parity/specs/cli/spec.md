# Delta for CLI

## ADDED Requirements

### Requirement: Managed Claude Code Setup MUST Be Capability- and Ownership-Gated
The CLI MUST provide managed Claude Code setup through the established setup
workflow and MUST apply the existing scope, plan-only, conflict, receipt, and
rollback discipline. Before mutation, setup MUST inspect the selected scope,
identify the managed Claude Code assets and activation state, and verify that
any manager command grammar or removal path is safe for the detected runtime.
When safe capability evidence is absent, setup MUST return bounded
`requires_user_action` guidance and MUST NOT guess commands, auto-start an
external server, or rely on a shell-specific workaround.

#### Scenario: Claude Code plan is zero-write and evidence-bearing
- GIVEN an operator requests Claude Code setup in plan-only mode
- WHEN setup inspects the selected scope
- THEN it MUST report the detected activation, ownership, and capability
  evidence without creating a file, receipt, backup, registration, or server
- AND it MUST identify any unproven manager capability before mutation

#### Scenario: Unproven Claude manager grammar requires manual action
- GIVEN a selected Claude Code scope lacks a verified manager mutation or
  removal capability
- WHEN mutating setup or rollback is requested
- THEN setup MUST return `requires_user_action` with a bounded safe next action
- AND it MUST perform zero guessed command, direct manager cleanup, or
  shell-specific fallback

### Requirement: Claude Code Coexistence and Migration MUST Preserve Ownership Boundaries
Managed Claude Code setup MUST classify existing manual MCP configuration,
marketplace-managed installation, prior thoth-mem-managed state, and ambiguous
lookalike state before mutation. It MUST preserve manual and externally managed
state unless a compatible no-op is verified or the exact target is proven
receipt-owned. Migration or rollback MUST change only receipt-owned managed
fragments and MUST preserve unrelated later user changes. Ambiguous ownership
MUST fail closed with manual recovery guidance and MUST NOT create duplicate
activation or cross-repository mutation.

#### Scenario: Manual configuration remains intact during setup
- GIVEN a selected Claude Code scope contains unrelated manual MCP configuration
  or a marketplace-managed integration
- WHEN managed setup evaluates coexistence
- THEN it MUST preserve that state unless compatible ownership is independently
  verified
- AND it MUST not add a duplicate activation or overwrite unrelated settings

#### Scenario: Claude rollback restores only receipt-owned state
- GIVEN a valid Claude Code setup receipt proves exact managed changes
- WHEN rollback succeeds
- THEN it MUST restore or remove only those receipt-owned changes
- AND it MUST preserve marketplace-managed state and unrelated later user edits

## MODIFIED Requirements

### Requirement: CLI MUST Provide Managed Setup for OpenCode, Codex, and Claude Code
The public CLI MUST accept `thoth-mem setup opencode`, `thoth-mem setup codex`,
and `thoth-mem setup claude-code`. Each command MUST default to global scope and
MUST use the established explicit project-scope, plan-only, force, rollback,
and JSON controls. Inspection, planning, mutation, verification, receipts, and
rollback MUST remain confined to the selected harness and scope. Claude Code
setup MUST apply its manager-ownership and coexistence checks before any
mutation.

#### Scenario: Claude Code setup defaults to global scope
- GIVEN the user runs `thoth-mem setup claude-code` without a scope option
- WHEN setup resolves its target
- THEN it MUST select the detected global Claude Code scope
- AND it MUST NOT write project-local configuration

### Requirement: Setup Results and Exit Codes MUST Be Deterministic
The existing setup result contract MUST accept `claude-code` as a harness value while
preserving the exact `complete`, `failed`, `partial`, and
`requires_user_action` statuses and their existing exit-code mappings. Claude
Code results MUST expose only bounded diagnostics, ordered evidence-backed
steps, scope, target, receipt, and manual actions; they MUST NOT expose secrets,
raw configuration, or unsupported success claims.

#### Scenario: Claude manual-recovery result preserves the existing status mapping
- GIVEN a Claude Code setup capability is unsafe or unproven
- WHEN setup renders human-readable and JSON results
- THEN both results MUST report `requires_user_action` with the established exit
  code
- AND they MUST preserve the same bounded evidence and manual-action semantics

## REMOVED Requirements

None.
