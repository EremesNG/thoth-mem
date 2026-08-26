# CLI

## Requirements

### Requirement: CLI MUST Provide Managed Setup for OpenCode, Codex, and Claude Code

The first-product CLI MUST expose `thoth-mem setup opencode`, `thoth-mem setup codex`, and `thoth-mem setup claude` for global/user-native installation only, with plan and JSON output. OpenCode MUST support public exact-version and explicit local-file provenance; Codex and Claude MUST use their native managers. Project scope, legacy filesystem fallback, and copied-bundle setup MUST be rejected rather than silently emulated.

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 1

- **GIVEN** public setup executes from a verified `thoth-mem` package version
- **WHEN** OpenCode setup completes
- **THEN** its configuration contains exactly `thoth-mem@<executing-version>`, the native Skill tree is current, and neither `.thoth-mem`, `plugins/thoth-mem.js`, nor an owned `mcp.thoth-mem` block is required

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 2

- **GIVEN** local-development setup receives an explicit package root and data directory
- **WHEN** setup completes
- **THEN** OpenCode contains exactly one canonical absolute `file://` plugin entry, the local Skill tree is synchronized, and the native plugin starts the checkout-built v2 core without `npx` or a published-package fallback

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 3

- **GIVEN** recovered memory changes between turns
- **WHEN** OpenCode builds the model payload
- **THEN** thoth-mem changes only its tagged trailing recovery region and preserves the byte-stable prefix used by the provider prompt cache

#### Scenario: US2 - Distribute Codex and Claude through their native managers 1

- **GIVEN** a supported Codex manager
- **WHEN** the user registers `EremesNG/thoth-mem` and installs `thoth-mem@thoth-mem`
- **THEN** Codex resolves one enabled native plugin and starts its exact six-tool MCP and lifecycle hooks without a private descriptor edit

#### Scenario: US2 - Distribute Codex and Claude through their native managers 2

- **GIVEN** the repository Claude marketplace and no paid model session
- **WHEN** strict validation and isolated packed smoke run
- **THEN** the manager-visible structure, hooks, MCP, Skill, runtime, and data binding can pass while real model consumption remains explicitly unobserved

### Requirement: Plan-Only Setup MUST Perform Zero Writes

Plan mode for each native host MUST report the exact package/file provenance, native-manager operations, owned Skill/provider-config changes, verification steps, and restart action without changing files, invoking mutating manager commands, creating backups, or creating receipts; it MUST NOT describe project scope or a legacy filesystem strategy.

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 1

- **GIVEN** public setup executes from a verified `thoth-mem` package version
- **WHEN** OpenCode setup completes
- **THEN** its configuration contains exactly `thoth-mem@<executing-version>`, the native Skill tree is current, and neither `.thoth-mem`, `plugins/thoth-mem.js`, nor an owned `mcp.thoth-mem` block is required

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 2

- **GIVEN** local-development setup receives an explicit package root and data directory
- **WHEN** setup completes
- **THEN** OpenCode contains exactly one canonical absolute `file://` plugin entry, the local Skill tree is synchronized, and the native plugin starts the checkout-built v2 core without `npx` or a published-package fallback

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 3

- **GIVEN** recovered memory changes between turns
- **WHEN** OpenCode builds the model payload
- **THEN** thoth-mem changes only its tagged trailing recovery region and preserves the byte-stable prefix used by the provider prompt cache

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

### Requirement: Setup MUST Merge Only Managed Configuration

OpenCode setup MAY change only exact thoth-mem npm/file plugin entries, the exact owned `skills/thoth-mem` tree, and provider-owned `config.json`; Codex and Claude setup MAY invoke only their native managers and MUST NOT edit manager caches, add separate MCP configuration, or fall back to copied assets. Ambiguous state MUST fail closed.

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 1

- **GIVEN** public setup executes from a verified `thoth-mem` package version
- **WHEN** OpenCode setup completes
- **THEN** its configuration contains exactly `thoth-mem@<executing-version>`, the native Skill tree is current, and neither `.thoth-mem`, `plugins/thoth-mem.js`, nor an owned `mcp.thoth-mem` block is required

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 2

- **GIVEN** local-development setup receives an explicit package root and data directory
- **WHEN** setup completes
- **THEN** OpenCode contains exactly one canonical absolute `file://` plugin entry, the local Skill tree is synchronized, and the native plugin starts the checkout-built v2 core without `npx` or a published-package fallback

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 3

- **GIVEN** recovered memory changes between turns
- **WHEN** OpenCode builds the model payload
- **THEN** thoth-mem changes only its tagged trailing recovery region and preserves the byte-stable prefix used by the provider prompt cache

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

### Requirement: Mutating Setup MUST Be Backed Up, Atomic, and Verifiable
Before the first filesystem mutation, setup MUST create recoverable backups for every existing file it plans to change. Each replacement MUST be atomic from the reader's perspective, and a failed filesystem transaction MUST restore the pre-run managed state or return a `failed` result that identifies any remaining recovery action. Setup MUST verify the installed state before reporting `complete`.

#### Scenario: Successful mutation produces backups and verification
- GIVEN setup plans to modify one or more existing files
- WHEN all planned mutations and verification succeed
- THEN each pre-existing changed file MUST have a pre-change backup
- AND the resulting installation MUST be verified before status `complete` is emitted

#### Scenario: Write failure does not leave false success
- GIVEN a planned filesystem mutation fails after at least one change has begun
- WHEN setup handles the failure
- THEN setup MUST attempt to restore the pre-run managed state from backups
- AND it MUST return `failed` rather than `complete`
- AND it MUST report any path that could not be restored

### Requirement: Every Mutating Attempt MUST Emit an Ownership Receipt

A mutating setup attempt MUST checkpoint a secret-free receipt before its first owned filesystem change or native-manager command and record selected host, provenance, exact owned config/Skill/provider state, ordered manager outcomes, verification, recovery status, and final result. It MUST NOT record unrelated config, cache contents, prompts, or credentials.

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 1

- **GIVEN** public setup executes from a verified `thoth-mem` package version
- **WHEN** OpenCode setup completes
- **THEN** its configuration contains exactly `thoth-mem@<executing-version>`, the native Skill tree is current, and neither `.thoth-mem`, `plugins/thoth-mem.js`, nor an owned `mcp.thoth-mem` block is required

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 2

- **GIVEN** local-development setup receives an explicit package root and data directory
- **WHEN** setup completes
- **THEN** OpenCode contains exactly one canonical absolute `file://` plugin entry, the local Skill tree is synchronized, and the native plugin starts the checkout-built v2 core without `npx` or a published-package fallback

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 3

- **GIVEN** recovered memory changes between turns
- **WHEN** OpenCode builds the model payload
- **THEN** thoth-mem changes only its tagged trailing recovery region and preserves the byte-stable prefix used by the provider prompt cache

#### Scenario: US2 - Distribute Codex and Claude through their native managers 1

- **GIVEN** a supported Codex manager
- **WHEN** the user registers `EremesNG/thoth-mem` and installs `thoth-mem@thoth-mem`
- **THEN** Codex resolves one enabled native plugin and starts its exact six-tool MCP and lifecycle hooks without a private descriptor edit

#### Scenario: US2 - Distribute Codex and Claude through their native managers 2

- **GIVEN** the repository Claude marketplace and no paid model session
- **WHEN** strict validation and isolated packed smoke run
- **THEN** the manager-visible structure, hooks, MCP, Skill, runtime, and data binding can pass while real model consumption remains explicitly unobserved

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

### Requirement: Rollback MUST Restore Only Receipt-Owned Changes

Native rollback/recovery MUST restore only exact receipt-owned OpenCode configuration, Skill, and provider state or reconcile independently verified manager operations. A manager removal MAY run only when a valid receipt proves setup created the exact state and the manager exposes a safe scoped removal; otherwise setup MUST preserve manager state and return bounded manual action. Legacy and migration rollback behavior is removed.

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 1

- **GIVEN** public setup executes from a verified `thoth-mem` package version
- **WHEN** OpenCode setup completes
- **THEN** its configuration contains exactly `thoth-mem@<executing-version>`, the native Skill tree is current, and neither `.thoth-mem`, `plugins/thoth-mem.js`, nor an owned `mcp.thoth-mem` block is required

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 2

- **GIVEN** local-development setup receives an explicit package root and data directory
- **WHEN** setup completes
- **THEN** OpenCode contains exactly one canonical absolute `file://` plugin entry, the local Skill tree is synchronized, and the native plugin starts the checkout-built v2 core without `npx` or a published-package fallback

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 3

- **GIVEN** recovered memory changes between turns
- **WHEN** OpenCode builds the model payload
- **THEN** thoth-mem changes only its tagged trailing recovery region and preserves the byte-stable prefix used by the provider prompt cache

#### Scenario: US2 - Distribute Codex and Claude through their native managers 1

- **GIVEN** a supported Codex manager
- **WHEN** the user registers `EremesNG/thoth-mem` and installs `thoth-mem@thoth-mem`
- **THEN** Codex resolves one enabled native plugin and starts its exact six-tool MCP and lifecycle hooks without a private descriptor edit

#### Scenario: US2 - Distribute Codex and Claude through their native managers 2

- **GIVEN** the repository Claude marketplace and no paid model session
- **WHEN** strict validation and isolated packed smoke run
- **THEN** the manager-visible structure, hooks, MCP, Skill, runtime, and data binding can pass while real model consumption remains explicitly unobserved

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

### Requirement: Repeated Setup MUST Be Idempotent

Repeated setup MUST perform zero mutation and return `complete` with `changed=false` only when the requested global/user native state is independently verified: exact npm/file plus owned Skill/provider state for OpenCode, or exact marketplace and enabled-plugin state for Codex/Claude. The removed `legacy_filesystem` strategy and executable-path identity MUST NOT participate.

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 1

- **GIVEN** public setup executes from a verified `thoth-mem` package version
- **WHEN** OpenCode setup completes
- **THEN** its configuration contains exactly `thoth-mem@<executing-version>`, the native Skill tree is current, and neither `.thoth-mem`, `plugins/thoth-mem.js`, nor an owned `mcp.thoth-mem` block is required

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 2

- **GIVEN** local-development setup receives an explicit package root and data directory
- **WHEN** setup completes
- **THEN** OpenCode contains exactly one canonical absolute `file://` plugin entry, the local Skill tree is synchronized, and the native plugin starts the checkout-built v2 core without `npx` or a published-package fallback

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 3

- **GIVEN** recovered memory changes between turns
- **WHEN** OpenCode builds the model payload
- **THEN** thoth-mem changes only its tagged trailing recovery region and preserves the byte-stable prefix used by the provider prompt cache

#### Scenario: US2 - Distribute Codex and Claude through their native managers 1

- **GIVEN** a supported Codex manager
- **WHEN** the user registers `EremesNG/thoth-mem` and installs `thoth-mem@thoth-mem`
- **THEN** Codex resolves one enabled native plugin and starts its exact six-tool MCP and lifecycle hooks without a private descriptor edit

#### Scenario: US2 - Distribute Codex and Claude through their native managers 2

- **GIVEN** the repository Claude marketplace and no paid model session
- **WHEN** strict validation and isolated packed smoke run
- **THEN** the manager-visible structure, hooks, MCP, Skill, runtime, and data binding can pass while real model consumption remains explicitly unobserved

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

### Requirement: Codex Manager Operations MUST Be Independent and Verification-Authoritative

Codex marketplace registration and plugin installation/enablement MUST remain independently attempted, checkpointed, and verified for the requested global/user native state; exact manager rereads remain authoritative over exit text. The clean supported fixture MUST use Codex `0.147.0` and the executing thoth-mem package version, never the obsolete `0.144.0`/`0.3.7` pair, project scope, or legacy fallback.

#### Scenario: US2 - Distribute Codex and Claude through their native managers 1

- **GIVEN** a supported Codex manager
- **WHEN** the user registers `EremesNG/thoth-mem` and installs `thoth-mem@thoth-mem`
- **THEN** Codex resolves one enabled native plugin and starts its exact six-tool MCP and lifecycle hooks without a private descriptor edit

#### Scenario: US2 - Distribute Codex and Claude through their native managers 2

- **GIVEN** the repository Claude marketplace and no paid model session
- **WHEN** strict validation and isolated packed smoke run
- **THEN** the manager-visible structure, hooks, MCP, Skill, runtime, and data binding can pass while real model consumption remains explicitly unobserved

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

### Requirement: Codex Failure Diagnostics MUST Be Bounded, Redacted, and Actionable
Codex command execution MUST retain nonzero stdout and stderr only within the existing combined 64 KiB command-output bound. Before any command evidence enters a human result, JSON result, manual action, checkpoint, or receipt, setup MUST reduce it to a deterministic privacy-safe diagnostic of no more than 512 characters. The diagnostic MUST identify the selected scope, failed capability, safe failure class or exit code when available, and an actionable retry or recovery step. It MUST redact credential-bearing arguments or URLs, authorization values, token or secret-like values, user-specific absolute home prefixes, raw configuration, and unrelated marketplace, plugin, cache, or environment content. Truncation MUST occur after redaction and MUST be indicated without echoing omitted content.

Diagnostics MUST remain secondary to exact state verification. Diagnostic wording, including a recognized marketplace collision, MUST NOT by itself establish registration, installation, enablement, or ownership.

#### Scenario: Recognized orphan collision remains useful and bounded
- GIVEN marketplace registration returns nonzero with the recognized `already added from a different source` condition and additional unrelated output
- WHEN setup produces its safe diagnostic
- THEN the diagnostic MUST identify marketplace registration, the selected scope, the collision class, and the safe next action
- AND it MUST contain no more than 512 characters
- AND it MUST omit unrelated command output

#### Scenario: Secret-bearing command output is redacted before persistence
- GIVEN nonzero stdout or stderr contains credentials, token-like values, a user-specific home prefix, raw configuration, and an otherwise useful failure reason
- WHEN setup renders or checkpoints the diagnostic
- THEN the useful capability and failure reason MUST remain identifiable
- AND credentials, token-like values, the home prefix, and raw configuration MUST NOT appear in any output or receipt

#### Scenario: Oversized nonzero output is handled deterministically
- GIVEN combined nonzero stdout and stderr exceeds the existing 64 KiB capture bound
- WHEN setup normalizes the command result
- THEN setup MUST emit only a bounded redacted output-limit diagnostic
- AND it MUST NOT persist or render the raw captured output
- AND exact selected-scope verification MUST still determine whether the requested state is confirmed

#### Scenario: Error text cannot override exact absence
- GIVEN a diagnostic says that a marketplace or plugin is already present
- AND the exact selected-scope list does not verify that state
- WHEN setup derives the manager result
- THEN the operation MUST remain unverified
- AND the diagnostic MUST be used only for classification and recovery guidance

### Requirement: Codex Receipt Checkpoints and Result Renderings MUST Be Evidence-Driven
Every mutating Codex manager attempt MUST preserve the existing ordered receipt contract. For each safely attempted marketplace or plugin operation, setup MUST append and durably persist the mutation outcome before performing its independent reread; it MUST then append and durably persist the exact verification outcome before starting a dependent mutation or deriving final status. Final status MUST be derived only after the required attempt and reread evidence has been checkpointed. A checkpoint persistence failure MUST stop further mutation and MUST remain visible as failure or required manual recovery.

The signed receipt, human-readable output, and JSON output MUST represent the same final status and the same ordered evidence-backed step outcomes. `confirmed` MUST be used only for an operation, checkpoint, reread, or final verification supported by actual evidence. In a mutating result, an unexecuted planned row MUST instead remain `skipped`, `failed`, or `unavailable` according to the observed reason and MUST NOT be blanket-promoted to `confirmed`; `planned` MUST remain a plan-only outcome. Receipt validation MUST preserve the existing maximum of 256 checkpoints, 1 MiB receipt size, and 512-character diagnostic entries. Existing receipt versions MUST remain readable for their original claims, and setup MUST NOT add a schema field merely to retain raw command output.

#### Scenario: Failed attempt does not confirm later planned rows
- GIVEN a marketplace mutation fails and its exact reread remains absent
- AND later checkpoint, reread, or final-verification rows were present in the plan
- WHEN setup renders the final mutating result
- THEN only actually persisted checkpoints and completed rereads MAY be `confirmed`
- AND every unexecuted or unsuccessful row MUST be `skipped`, `failed`, or `unavailable` as supported by evidence

#### Scenario: Attempt checkpoint precedes verification checkpoint
- GIVEN a marketplace or plugin mutation is attempted
- WHEN its receipt evidence is persisted
- THEN the ordered ledger MUST record and durably checkpoint the attempt outcome before the independent reread
- AND it MUST record and durably checkpoint the reread outcome before final status derivation

#### Scenario: Checkpoint failure stops the flow truthfully
- GIVEN an external command has returned but its required attempt or reread checkpoint cannot be durably persisted
- WHEN setup handles the checkpoint failure
- THEN setup MUST stop further mutation
- AND the human and JSON results MUST NOT report the failed checkpoint or any dependent step as confirmed
- AND the last valid signed receipt MUST remain the authoritative recovery boundary

#### Scenario: Renderings agree with signed evidence
- GIVEN a mutating flow has a mixture of confirmed, failed, skipped, or unavailable steps
- WHEN setup emits human-readable output, JSON, and its final signed receipt
- THEN all three surfaces MUST agree on the final status and ordered outcomes
- AND none MAY promote a step beyond the receipt and exact verification evidence

#### Scenario: Nonzero then verified is rendered consistently
- GIVEN a mutation returns nonzero but its exact reread verifies the requested state
- WHEN setup checkpoints and renders the operation
- THEN the signed receipt, human output, and JSON output MUST all classify the operation as confirmed
- AND any retained nonzero diagnostic MUST remain bounded, redacted, and secondary

### Requirement: Automated Codex Setup Verification MUST Be Isolated From Real User State

Automated Codex verification MUST use injected execution and disposable global/user homes against the supported `0.147.0` contract; it MUST NOT require project-scope coverage, the obsolete `0.144.0` contract, credentials, or a real personal home. Any authorized real-host regression MUST remain a separately recorded manual smoke.

#### Scenario: US2 - Distribute Codex and Claude through their native managers 1

- **GIVEN** a supported Codex manager
- **WHEN** the user registers `EremesNG/thoth-mem` and installs `thoth-mem@thoth-mem`
- **THEN** Codex resolves one enabled native plugin and starts its exact six-tool MCP and lifecycle hooks without a private descriptor edit

#### Scenario: US2 - Distribute Codex and Claude through their native managers 2

- **GIVEN** the repository Claude marketplace and no paid model session
- **WHEN** strict validation and isolated packed smoke run
- **THEN** the manager-visible structure, hooks, MCP, Skill, runtime, and data binding can pass while real model consumption remains explicitly unobserved

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

### Requirement: Codex Setup MUST Attempt Verified Marketplace and Plugin Registration Safely

Codex setup MUST plan, checkpoint, attempt, and independently verify marketplace registration and enabled-plugin state through supported global/user manager commands. Mixed verified and failed outcomes MUST remain partial or require user action according to receipt evidence; no failure may trigger copied-asset fallback, cache editing, or legacy activation.

#### Scenario: US2 - Distribute Codex and Claude through their native managers 1

- **GIVEN** a supported Codex manager
- **WHEN** the user registers `EremesNG/thoth-mem` and installs `thoth-mem@thoth-mem`
- **THEN** Codex resolves one enabled native plugin and starts its exact six-tool MCP and lifecycle hooks without a private descriptor edit

#### Scenario: US2 - Distribute Codex and Claude through their native managers 2

- **GIVEN** the repository Claude marketplace and no paid model session
- **WHEN** strict validation and isolated packed smoke run
- **THEN** the manager-visible structure, hooks, MCP, Skill, runtime, and data binding can pass while real model consumption remains explicitly unobserved

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

### Requirement: Setup Results and Exit Codes MUST Be Deterministic
Setup results and rollback MUST accept `claude` as a harness value while
preserving the exact `complete`, `failed`, `partial`, and
`requires_user_action` statuses and their existing exit-code mappings. Claude
Code results MUST expose only bounded diagnostics, ordered evidence-backed
steps, scope, target, receipt, and manual actions; they MUST NOT expose
secrets, raw configuration, or unsupported success claims. The machine-readable
JSON object MUST retain the existing status, changed, harness, scope, target,
steps, diagnostics, manual_actions, and receipt fields and their bounds.

#### Scenario: Complete and no-op results exit zero
- GIVEN setup or rollback verifies every required outcome, including an idempotent no-op
- WHEN result reporting completes
- THEN status MUST be `complete`
- AND process exit code MUST be `0`
- AND `changed` MUST distinguish mutation from no-op

#### Scenario: Operational failure exits one
- GIVEN input validation, backup, filesystem mutation, verification, or rollback fails without an acceptable verified result
- WHEN result reporting completes
- THEN status MUST be `failed`
- AND process exit code MUST be `1`

#### Scenario: Ordinary partial external completion exits two
- GIVEN at least one requested Codex external registration step is verified
- AND another safely attempted required step fails or remains unverifiable
- AND no corroborated orphan residue or ownership ambiguity prevents safe recovery or requires manual intervention
- WHEN result reporting completes
- THEN status MUST be `partial`
- AND process exit code MUST be `2`

#### Scenario: Manual action exits three and outranks partial
- GIVEN a conflict, missing safe CLI capability, corroborated orphan residue, or ownership ambiguity prevents automatic completion or safe recovery and requires manual intervention
- WHEN result reporting completes
- THEN status MUST be `requires_user_action`
- AND process exit code MUST be `3`
- AND manual actions MUST identify the unresolved steps
- AND any independently verified requested operation MUST remain represented without changing the final status to `partial`

#### Scenario: Claude manual-recovery result preserves the existing status mapping
- GIVEN a Claude Code setup capability is unsafe or unproven
- WHEN setup renders human-readable and JSON results
- THEN both results MUST report `requires_user_action` with the established exit
  code
- AND they MUST preserve the same bounded evidence and manual-action semantics

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

First-product Claude setup MUST classify and preserve manual, external, ambiguous, and pre-existing manager state while operating only through verified native-manager commands. It MUST NOT migrate, adopt, restore, or delete prior copied/managed fragments; such residue receives bounded manual guidance, and rollback is limited to receipt-proven safe manager operations under FR-035.

#### Scenario: US2 - Distribute Codex and Claude through their native managers 1

- **GIVEN** a supported Codex manager
- **WHEN** the user registers `EremesNG/thoth-mem` and installs `thoth-mem@thoth-mem`
- **THEN** Codex resolves one enabled native plugin and starts its exact six-tool MCP and lifecycle hooks without a private descriptor edit

#### Scenario: US2 - Distribute Codex and Claude through their native managers 2

- **GIVEN** the repository Claude marketplace and no paid model session
- **WHEN** strict validation and isolated packed smoke run
- **THEN** the manager-visible structure, hooks, MCP, Skill, runtime, and data binding can pass while real model consumption remains explicitly unobserved

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

### Requirement: Converge installer-owned OpenCode state

Public OpenCode setup MUST converge exactly one `thoth-mem@<executing-version>` plugin entry; explicit local-development setup MUST converge exactly one canonical absolute `file://` entry bound to the verified local native plugin build. Both modes MUST synchronize the exact owned `thoth-mem` Skill tree and MUST NOT install `.thoth-mem`, `plugins/thoth-mem.js`, or an owned `mcp.thoth-mem` configuration block.

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 1

- **GIVEN** public setup executes from a verified `thoth-mem` package version
- **WHEN** OpenCode setup completes
- **THEN** its configuration contains exactly `thoth-mem@<executing-version>`, the native Skill tree is current, and neither `.thoth-mem`, `plugins/thoth-mem.js`, nor an owned `mcp.thoth-mem` block is required

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 2

- **GIVEN** local-development setup receives an explicit package root and data directory
- **WHEN** setup completes
- **THEN** OpenCode contains exactly one canonical absolute `file://` plugin entry, the local Skill tree is synchronized, and the native plugin starts the checkout-built v2 core without `npx` or a published-package fallback

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 3

- **GIVEN** recovered memory changes between turns
- **WHEN** OpenCode builds the model payload
- **THEN** thoth-mem changes only its tagged trailing recovery region and preserves the byte-stable prefix used by the provider prompt cache

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

### Requirement: Repair every non-current state

OpenCode setup MUST repair an older, newer, duplicated, wrong-provenance, or same-version-diverged thoth-mem plugin entry and owned Skill tree while treating unrelated config/Skills and unproven copied assets as outside its ownership; exact convergence MUST perform zero mutation.

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 1

- **GIVEN** public setup executes from a verified `thoth-mem` package version
- **WHEN** OpenCode setup completes
- **THEN** its configuration contains exactly `thoth-mem@<executing-version>`, the native Skill tree is current, and neither `.thoth-mem`, `plugins/thoth-mem.js`, nor an owned `mcp.thoth-mem` block is required

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 2

- **GIVEN** local-development setup receives an explicit package root and data directory
- **WHEN** setup completes
- **THEN** OpenCode contains exactly one canonical absolute `file://` plugin entry, the local Skill tree is synchronized, and the native plugin starts the checkout-built v2 core without `npx` or a published-package fallback

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 3

- **GIVEN** recovered memory changes between turns
- **WHEN** OpenCode builds the model payload
- **THEN** thoth-mem changes only its tagged trailing recovery region and preserves the byte-stable prefix used by the provider prompt cache

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

### Requirement: Select and repair configuration deterministically

OpenCode setup MUST select configuration using documented precedence, preserve comments and unrelated JSONC content, replace only exact thoth-mem package/file entries, reject malformed configuration before mutation, and use an explicit local package root rather than inferring development mode.

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 1

- **GIVEN** public setup executes from a verified `thoth-mem` package version
- **WHEN** OpenCode setup completes
- **THEN** its configuration contains exactly `thoth-mem@<executing-version>`, the native Skill tree is current, and neither `.thoth-mem`, `plugins/thoth-mem.js`, nor an owned `mcp.thoth-mem` block is required

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 2

- **GIVEN** local-development setup receives an explicit package root and data directory
- **WHEN** setup completes
- **THEN** OpenCode contains exactly one canonical absolute `file://` plugin entry, the local Skill tree is synchronized, and the native plugin starts the checkout-built v2 core without `npx` or a published-package fallback

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 3

- **GIVEN** recovered memory changes between turns
- **WHEN** OpenCode builds the model payload
- **THEN** thoth-mem changes only its tagged trailing recovery region and preserves the byte-stable prefix used by the provider prompt cache

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

### Requirement: Journal replacement before mutation

Before changing OpenCode configuration or its owned global Skill tree, setup MUST persist target-bounded recovery evidence for the exact managed entry/tree and MUST restore only those owned values after a handled failure; it MUST NOT snapshot or restore unrelated configuration, plugin directories, or shared Skill roots wholesale.

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 1

- **GIVEN** public setup executes from a verified `thoth-mem` package version
- **WHEN** OpenCode setup completes
- **THEN** its configuration contains exactly `thoth-mem@<executing-version>`, the native Skill tree is current, and neither `.thoth-mem`, `plugins/thoth-mem.js`, nor an owned `mcp.thoth-mem` block is required

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 2

- **GIVEN** local-development setup receives an explicit package root and data directory
- **WHEN** setup completes
- **THEN** OpenCode contains exactly one canonical absolute `file://` plugin entry, the local Skill tree is synchronized, and the native plugin starts the checkout-built v2 core without `npx` or a published-package fallback

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 3

- **GIVEN** recovered memory changes between turns
- **WHEN** OpenCode builds the model payload
- **THEN** thoth-mem changes only its tagged trailing recovery region and preserves the byte-stable prefix used by the provider prompt cache

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

### Requirement: Recover interrupted setup automatically

A later setup run MUST validate any canonical in-progress receipt, restore only its exact owned OpenCode plugin entries, Skill tree, and provider config or reconcile independently verified native-manager operations, then retry from a clean owned baseline; invalid receipt paths MUST never be followed.

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 1

- **GIVEN** public setup executes from a verified `thoth-mem` package version
- **WHEN** OpenCode setup completes
- **THEN** its configuration contains exactly `thoth-mem@<executing-version>`, the native Skill tree is current, and neither `.thoth-mem`, `plugins/thoth-mem.js`, nor an owned `mcp.thoth-mem` block is required

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 2

- **GIVEN** local-development setup receives an explicit package root and data directory
- **WHEN** setup completes
- **THEN** OpenCode contains exactly one canonical absolute `file://` plugin entry, the local Skill tree is synchronized, and the native plugin starts the checkout-built v2 core without `npx` or a published-package fallback

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 3

- **GIVEN** recovered memory changes between turns
- **WHEN** OpenCode builds the model payload
- **THEN** thoth-mem changes only its tagged trailing recovery region and preserves the byte-stable prefix used by the provider prompt cache

#### Scenario: US2 - Distribute Codex and Claude through their native managers 1

- **GIVEN** a supported Codex manager
- **WHEN** the user registers `EremesNG/thoth-mem` and installs `thoth-mem@thoth-mem`
- **THEN** Codex resolves one enabled native plugin and starts its exact six-tool MCP and lifecycle hooks without a private descriptor edit

#### Scenario: US2 - Distribute Codex and Claude through their native managers 2

- **GIVEN** the repository Claude marketplace and no paid model session
- **WHEN** strict validation and isolated packed smoke run
- **THEN** the manager-visible structure, hooks, MCP, Skill, runtime, and data binding can pass while real model consumption remains explicitly unobserved

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

### Requirement: Remove durable rollback state after success

After exact native post-state verification, setup MUST remove temporary journals and superseded backups for the same host/scope while retaining the minimal final ownership receipt needed for status and future bounded repair.

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 1

- **GIVEN** public setup executes from a verified `thoth-mem` package version
- **WHEN** OpenCode setup completes
- **THEN** its configuration contains exactly `thoth-mem@<executing-version>`, the native Skill tree is current, and neither `.thoth-mem`, `plugins/thoth-mem.js`, nor an owned `mcp.thoth-mem` block is required

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 2

- **GIVEN** local-development setup receives an explicit package root and data directory
- **WHEN** setup completes
- **THEN** OpenCode contains exactly one canonical absolute `file://` plugin entry, the local Skill tree is synchronized, and the native plugin starts the checkout-built v2 core without `npx` or a published-package fallback

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 3

- **GIVEN** recovered memory changes between turns
- **WHEN** OpenCode builds the model payload
- **THEN** thoth-mem changes only its tagged trailing recovery region and preserves the byte-stable prefix used by the provider prompt cache

#### Scenario: US2 - Distribute Codex and Claude through their native managers 1

- **GIVEN** a supported Codex manager
- **WHEN** the user registers `EremesNG/thoth-mem` and installs `thoth-mem@thoth-mem`
- **THEN** Codex resolves one enabled native plugin and starts its exact six-tool MCP and lifecycle hooks without a private descriptor edit

#### Scenario: US2 - Distribute Codex and Claude through their native managers 2

- **GIVEN** the repository Claude marketplace and no paid model session
- **WHEN** strict validation and isolated packed smoke run
- **THEN** the manager-visible structure, hooks, MCP, Skill, runtime, and data binding can pass while real model consumption remains explicitly unobserved

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

### Requirement: Degrade cleanup without false installation failure

If native installation verifies but cleanup of target-bounded temporary state is incomplete, setup MAY report `complete` with a bounded cleanup warning and MUST retry that cleanup before a later no-op; it MUST NOT roll back a verified host install solely for cleanup failure.

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 1

- **GIVEN** public setup executes from a verified `thoth-mem` package version
- **WHEN** OpenCode setup completes
- **THEN** its configuration contains exactly `thoth-mem@<executing-version>`, the native Skill tree is current, and neither `.thoth-mem`, `plugins/thoth-mem.js`, nor an owned `mcp.thoth-mem` block is required

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 2

- **GIVEN** local-development setup receives an explicit package root and data directory
- **WHEN** setup completes
- **THEN** OpenCode contains exactly one canonical absolute `file://` plugin entry, the local Skill tree is synchronized, and the native plugin starts the checkout-built v2 core without `npx` or a published-package fallback

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 3

- **GIVEN** recovered memory changes between turns
- **WHEN** OpenCode builds the model payload
- **THEN** thoth-mem changes only its tagged trailing recovery region and preserves the byte-stable prefix used by the provider prompt cache

#### Scenario: US2 - Distribute Codex and Claude through their native managers 1

- **GIVEN** a supported Codex manager
- **WHEN** the user registers `EremesNG/thoth-mem` and installs `thoth-mem@thoth-mem`
- **THEN** Codex resolves one enabled native plugin and starts its exact six-tool MCP and lifecycle hooks without a private descriptor edit

#### Scenario: US2 - Distribute Codex and Claude through their native managers 2

- **GIVEN** the repository Claude marketplace and no paid model session
- **WHEN** strict validation and isolated packed smoke run
- **THEN** the manager-visible structure, hooks, MCP, Skill, runtime, and data binding can pass while real model consumption remains explicitly unobserved

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

### Requirement: Preserve truthful planning and results

Plan and JSON/human results MUST report native provenance, exact owned mutations, manager evidence, verification dimensions, cleanup, and restart actions consistently. Changed success requests a host restart; exact no-op performs zero writes and requests none; missing native package/Skill/manager capability fails before mutation without legacy fallback.

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 1

- **GIVEN** public setup executes from a verified `thoth-mem` package version
- **WHEN** OpenCode setup completes
- **THEN** its configuration contains exactly `thoth-mem@<executing-version>`, the native Skill tree is current, and neither `.thoth-mem`, `plugins/thoth-mem.js`, nor an owned `mcp.thoth-mem` block is required

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 2

- **GIVEN** local-development setup receives an explicit package root and data directory
- **WHEN** setup completes
- **THEN** OpenCode contains exactly one canonical absolute `file://` plugin entry, the local Skill tree is synchronized, and the native plugin starts the checkout-built v2 core without `npx` or a published-package fallback

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 3

- **GIVEN** recovered memory changes between turns
- **WHEN** OpenCode builds the model payload
- **THEN** thoth-mem changes only its tagged trailing recovery region and preserves the byte-stable prefix used by the provider prompt cache

#### Scenario: US2 - Distribute Codex and Claude through their native managers 1

- **GIVEN** a supported Codex manager
- **WHEN** the user registers `EremesNG/thoth-mem` and installs `thoth-mem@thoth-mem`
- **THEN** Codex resolves one enabled native plugin and starts its exact six-tool MCP and lifecycle hooks without a private descriptor edit

#### Scenario: US2 - Distribute Codex and Claude through their native managers 2

- **GIVEN** the repository Claude marketplace and no paid model session
- **WHEN** strict validation and isolated packed smoke run
- **THEN** the manager-visible structure, hooks, MCP, Skill, runtime, and data binding can pass while real model consumption remains explicitly unobserved

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

### Requirement: Render a bounded forced-version warning

A forced Codex version outside `0.147.x`, including `0.146.x`, MUST emit exactly one bounded override warning only after complete safe manager capabilities are independently verified and actually bypass the version gate. Codex `0.147.x` uses the normal supported path without that warning. Forced incomplete, malformed, or unsafe capabilities MUST fail closed with an ordinary bounded capability diagnostic and no override warning; neither diagnostic may change the evidence-derived status or add a manual action by itself.

#### Scenario: US2 - Distribute Codex and Claude through their native managers 1

- **GIVEN** a supported Codex manager
- **WHEN** the user registers `EremesNG/thoth-mem` and installs `thoth-mem@thoth-mem`
- **THEN** Codex resolves one enabled native plugin and starts its exact six-tool MCP and lifecycle hooks without a private descriptor edit

#### Scenario: US2 - Distribute Codex and Claude through their native managers 2

- **GIVEN** the repository Claude marketplace and no paid model session
- **WHEN** strict validation and isolated packed smoke run
- **THEN** the manager-visible structure, hooks, MCP, Skill, runtime, and data binding can pass while real model consumption remains explicitly unobserved

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

### Requirement: Report only applicable mutation requirements

Forced Codex setup MUST report manager-state inspection according to classified evidence and MUST emit the configuration-backup diagnostic only when the selected strategy actually plans a legacy configuration mutation.

#### Scenario: US3 - Preserve every non-version safety gate 1

- **GIVEN** a forced Codex version lacks any required selected-scope mutation or verification capability
- **WHEN** setup classifies ownership
- **THEN** `--force` does not select `plugin_manager` from version override alone

#### Scenario: US3 - Preserve every non-version safety gate 2

- **GIVEN** a forced version returns malformed, conflicting, or unclassifiable manager state
- **WHEN** setup evaluates the result
- **THEN** it retains fail-closed behavior and performs no unsafe cleanup or implicit legacy fallback

#### Scenario: US3 - Preserve every non-version safety gate 3

- **GIVEN** forced modern setup needs no legacy filesystem changes
- **WHEN** an unrelated `config.toml` exists
- **THEN** output does not claim a configuration backup is required before mutation

### Requirement: Verify override behavior in isolated controlled execution

Automated injected verification MUST cover unforced supported `0.147.x`, unforced fail-closed `0.146.x`/future versions, and forced capability-complete plus incomplete/unsafe `0.146.x` and future-version cases in disposable global/user homes. It MUST NOT classify `0.146.x` as unforced-tested, exercise project scope, or read/mutate a real Codex home.

#### Scenario: US2 - Distribute Codex and Claude through their native managers 1

- **GIVEN** a supported Codex manager
- **WHEN** the user registers `EremesNG/thoth-mem` and installs `thoth-mem@thoth-mem`
- **THEN** Codex resolves one enabled native plugin and starts its exact six-tool MCP and lifecycle hooks without a private descriptor edit

#### Scenario: US2 - Distribute Codex and Claude through their native managers 2

- **GIVEN** the repository Claude marketplace and no paid model session
- **WHEN** strict validation and isolated packed smoke run
- **THEN** the manager-visible structure, hooks, MCP, Skill, runtime, and data binding can pass while real model consumption remains explicitly unobserved

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

### Requirement: Journal Repair CLI Administration

The CLI MUST expose preview-first `repair-sync-journal` with exactly one project or all-projects scope and explicit `--apply`. Apply without a fingerprint MUST obtain a bounded preview internally and pass its exact fingerprint to the unchanged Store apply contract. A supplied fingerprint MUST remain an effective binding. Any stale or persistence failure MUST surface without retrying a different batch.

#### Scenario: US1 - Apply a repair without copying an internal fingerprint 1

- **GIVEN** a repairable unchanged scope
- **WHEN** the operator invokes `repair-sync-journal --apply` with exactly one scope
- **THEN** the CLI obtains an internal preview and applies its fingerprint through the existing Store precondition contract

#### Scenario: US1 - Apply a repair without copying an internal fingerprint 2

- **GIVEN** repair candidates change between the internal preview and Store apply
- **WHEN** apply re-evaluates the scope
- **THEN** it fails non-zero without repair writes and does not retry a different unreviewed batch

#### Scenario: US1 - Apply a repair without copying an internal fingerprint 3

- **GIVEN** the operator does not select apply
- **WHEN** repair runs
- **THEN** it remains a read-only preview

### Requirement: Trace Retention CLI Administration

The CLI MUST expose preview-first `prune-operation-traces` with exactly one project or all-projects scope and explicit `--apply`, without requiring operator-supplied fingerprint or effective-time flags. Apply without those values MUST bind itself to one internal preview; supplied values MUST remain effective bindings. `--until-complete` MUST keep the first effective instant fixed, bind each subsequent batch to a fresh internal preview, emit compact progress and a final aggregate, and stop non-zero on stale state, failure, bounded-growth violation, or lack of progress.

#### Scenario: US2 - Prune a bounded or complete backlog without copying bindings 1

- **GIVEN** an eligible trace scope
- **WHEN** the operator invokes `prune-operation-traces --apply`
- **THEN** the CLI creates one internal preview and applies exactly its fingerprint and effective instant

#### Scenario: US2 - Prune a bounded or complete backlog without copying bindings 2

- **GIVEN** an eligible backlog spans multiple batches
- **WHEN** the operator adds `--until-complete`
- **THEN** the first internal preview fixes the effective instant and each later batch uses a fresh internal fingerprint until no eligible rows remain

#### Scenario: US2 - Prune a bounded or complete backlog without copying bindings 3

- **GIVEN** candidates change, a Store apply fails, no progress occurs, or eligible work grows beyond the initial bounded batch count
- **WHEN** the loop detects it
- **THEN** it exits non-zero, reports completed work truthfully, and does not claim rollback of already committed batches

#### Scenario: US2 - Prune a bounded or complete backlog without copying bindings 4

- **GIVEN** apply is not selected
- **WHEN** the command runs
- **THEN** it returns the existing read-only preview

### Requirement: Database Compaction CLI Administration

The CLI MUST expose preview-first `compact-database` for the resolved data directory with explicit `--apply`, bounded human-readable and machine-copyable results, non-zero exit on validation, exclusivity, space, checkpoint, `VACUUM`, reopen, or recovery failure, and no project scope or MCP tool registration. It MUST remain independent and MUST NOT invoke, require, or imply `prune-operation-traces` or `repair-sync-journal`.

#### Scenario: US3 - Compact a database with guarded failure handling 1

- **GIVEN** an existing database
- **WHEN** `compact-database` runs without apply
- **THEN** it performs no checkpoint, file creation, rename, deletion, or database mutation; uses an immutable open when no sidecars exist, normal read-only only when both readable WAL and SHM exist, and otherwise fails read-only; and reports page size, page count, freelist count, physical and logical size, estimated reclaimable bytes, journal mode, sidecar state, and available-versus-required free space

#### Scenario: US3 - Compact a database with guarded failure handling 2

- **GIVEN** a clean preflight and sufficient free space
- **WHEN** `compact-database --apply` runs
- **THEN** it estimates capacity from at least the greater of main-file and logical page bytes, checkpoints committed WAL state, rechecks capacity against refreshed metrics, verifies integrity, obtains SQLite write exclusivity, executes SQLite-managed `VACUUM`, reopens the database, verifies integrity, foreign keys, schema identity, journal mode, and durable readability, and reports exact before/after bytes

#### Scenario: US3 - Compact a database with guarded failure handling 3

- **GIVEN** another SQLite client prevents checkpoint or write exclusivity
- **WHEN** apply starts
- **THEN** it fails non-zero without claiming compaction or deleting any database file

#### Scenario: US3 - Compact a database with guarded failure handling 4

- **GIVEN** preflight, checkpoint, validation before `VACUUM`, or `VACUUM` before commit fails
- **WHEN** the command unwinds
- **THEN** no mutation or SQLite transaction recovery preserves the pre-operation logical database and the CLI never reports successful compaction

#### Scenario: US3 - Compact a database with guarded failure handling 5

- **GIVEN** verification fails after a committed `VACUUM`
- **WHEN** the command unwinds
- **THEN** the CLI exits non-zero, preserves the database and sidecar files for diagnosis, never reports successful compaction, and makes no claim that it restored the pre-operation physical database

#### Scenario: US3 - Compact a database with guarded failure handling 6

- **GIVEN** a custom data directory
- **WHEN** preview or apply runs
- **THEN** every database, sidecar, free-space check, and result path remains confined to that directory
