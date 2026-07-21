# CLI

## Requirements

### Requirement: CLI MUST Provide Managed Setup for OpenCode, Codex, and Claude Code
The public CLI MUST accept `thoth-mem setup opencode`, `thoth-mem setup codex`,
and `thoth-mem setup claude`. Each command MUST default to global scope
and MUST use the established explicit project-scope, plan-only, force, rollback,
and JSON controls. Inspection, planning, mutation, verification, receipts, and
rollback MUST remain confined to the selected harness and scope. Claude Code
setup MUST apply its manager-ownership and coexistence checks before any
mutation. Project scope MUST use `--scope project --project <path>`; explicit
global scope MAY use `--scope global`, and `--project` MUST be rejected outside
project scope.

#### Scenario: OpenCode setup defaults to global scope
- GIVEN the user runs `thoth-mem setup opencode` without a scope option
- WHEN setup resolves its target
- THEN it MUST select the detected global OpenCode configuration scope
- AND it MUST NOT write project-local configuration

#### Scenario: Codex setup defaults to global scope
- GIVEN the user runs `thoth-mem setup codex` without a scope option
- WHEN setup resolves its target
- THEN it MUST select the detected global Codex configuration scope
- AND it MUST NOT write project-local configuration

#### Scenario: Explicit project scope stays inside the target project
- GIVEN the user selects project scope and supplies a project target
- WHEN setup plans or applies changes
- THEN every managed filesystem change MUST remain within that project scope
- AND global harness configuration MUST remain unchanged

#### Scenario: Project scope without a target is rejected before mutation
- GIVEN the user selects project scope without an explicit project target
- WHEN setup validates its inputs
- THEN setup MUST return `failed`
- AND it MUST perform zero writes

#### Scenario: Claude Code setup defaults to global scope
- GIVEN the user runs `thoth-mem setup claude` without a scope option
- WHEN setup resolves its target
- THEN it MUST select the detected global Claude Code scope
- AND it MUST NOT write project-local configuration

### Requirement: Plan-Only Setup MUST Perform Zero Writes
Setup MUST provide a plan-only operation that reports the deterministic ordered actions, selected scope, target paths, detected capabilities, selected ownership strategy, ownership evidence, conflicts, expected backups, expected migrations, and expected external commands without changing files, invoking mutating external commands, creating backups, or creating receipts.

#### Scenario: Modern plan declares exclusive manager ownership
- GIVEN a clean modern-capable Codex target
- WHEN setup runs in plan-only mode
- THEN the plan MUST select `plugin_manager` and list only manager-owned mutation and verification actions
- AND it MUST report no legacy asset copy or legacy activation merge
- AND it MUST perform zero mutation

#### Scenario: Legacy plan declares separate filesystem ownership
- GIVEN plugin management is unavailable for the selected Codex version or scope
- WHEN setup runs in plan-only mode
- THEN the plan MUST select `legacy_filesystem` and identify its owned asset, metadata, and config locations
- AND it MUST perform zero mutation

#### Scenario: Dual-state plan reports migration without force
- GIVEN a dual-owned state whose manager and legacy ownership evidence can be inspected safely
- WHEN setup runs with `--plan`
- THEN the plan MUST identify manager-state confirmation before each planned legacy removal
- AND it MUST identify any ambiguous state that blocks migration
- AND no file, receipt, backup, manager state, or registration MUST change

### Requirement: Setup MUST Merge Only Managed Configuration
Mutating setup MUST preserve unrelated user settings and MUST change only configuration explicitly owned by the selected strategy. Under `plugin_manager`, thoth-mem MUST NOT add, update, or restore a legacy plugin MCP activation block, a legacy global MCP definition, or other Codex-manager-owned activation/configuration. Under `legacy_filesystem`, setup MAY change only its exact managed fragments. A conflict MUST stop before mutation unless it is both provably strategy-owned and explicitly forceable; `--force` MUST NOT establish ownership.

#### Scenario: Modern setup does not write legacy activation
- GIVEN setup selected `plugin_manager`
- WHEN marketplace and plugin operations are attempted or verified
- THEN setup MUST NOT add or update the legacy thoth-mem managed activation block
- AND it MUST NOT add a separate global MCP definition for that plugin

#### Scenario: Legacy setup changes only its managed fragments
- GIVEN setup selected `legacy_filesystem`
- WHEN setup applies its configuration plan
- THEN it MAY add or update only the exact thoth-owned legacy fragments
- AND unrelated configuration MUST remain semantically unchanged

#### Scenario: Force cannot claim an ambiguous location
- GIVEN an asset, config fragment, marketplace, or plugin cache location has ambiguous ownership
- WHEN setup runs with `--force`
- THEN it MUST perform zero mutation at that location
- AND it MUST return precise manual recovery guidance

#### Scenario: Later Codex and user config changes are preserved
- GIVEN Codex or the user changes unrelated configuration after a setup checkpoint
- WHEN setup completes, recovers, or rolls back
- THEN those unrelated later changes MUST remain unchanged
- AND setup MUST NOT restore an earlier whole-file configuration snapshot over them

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
Every setup attempt that may mutate state MUST durably create an `in_progress` receipt before its first filesystem mutation or mutating external command. The receipt MUST record the selected ownership strategy, scope, target, ownership evidence, planned and attempted steps, backups for strategy-owned filesystem changes, external command outcomes, migration actions, force use, safe diagnostics, and final status. For each verified manager-owned marketplace or plugin state, the receipt MUST distinguish state verified before the attempt from state created by the attempt. It MUST checkpoint after each attempted external command and each migration mutation. Final manager evidence MUST identify the selected scope, exact marketplace identity and provenance, exact installed-and-enabled plugin identity, and ordered step outcomes; final legacy evidence MUST identify each exact owned fragment and its stable pre/post identity. It MUST NOT treat a whole-config hash computed before external commands as final state. Existing receipt schemas MUST remain readable for their original recovery claims and MUST NOT be reinterpreted as proof of modern manager ownership. Receipts MUST NOT contain credentials, secrets, raw configuration, unrelated plugin/cache contents, or private prompt content.

#### Scenario: Modern receipt records final manager state
- GIVEN `plugin_manager` setup attempts one or more external mutations
- WHEN each attempt and final verification complete
- THEN the receipt MUST checkpoint every attempted outcome in order
- AND its final evidence MUST identify the independently verified marketplace and installed-and-enabled plugin state for the selected scope
- AND it MUST distinguish manager state verified before the attempt from manager state created by the attempt

#### Scenario: Receipt excludes obsolete pre-command full-config evidence
- GIVEN Codex may change configuration during a manager command
- WHEN the receipt records final state
- THEN it MUST NOT use a whole-config hash captured before that command as proof of final state
- AND rollback MUST NOT use that hash to overwrite later Codex or user changes

#### Scenario: Migration receipt records removed legacy ownership
- GIVEN a dual-owned state is eligible for migration
- WHEN setup removes a proven legacy fragment
- THEN the receipt MUST identify the ownership evidence, prior owned fragment state, mutation outcome, and verified post-state
- AND it MUST contain enough bounded evidence to restore only that fragment when recovery requires it

#### Scenario: Old receipt remains bounded to its original claims
- GIVEN an existing valid receipt predates strategy-aware evidence
- WHEN setup loads it for recovery or migration
- THEN setup MUST validate it under its original schema
- AND it MUST NOT infer that it proves manager-created state or removal authority that it did not record

#### Scenario: Checkpoint failure stops further mutation
- GIVEN setup cannot durably persist an attempt or final-state checkpoint
- WHEN that checkpoint is required before the next mutation
- THEN setup MUST stop further mutation and return `failed` or `requires_user_action` as applicable
- AND it MUST leave explicit receipt-based recovery guidance without reporting false completion

### Requirement: Rollback MUST Restore Only Receipt-Owned Changes
The CLI MUST provide rollback semantics for the strategy recorded by a selected valid receipt. Rollback MUST preserve unrelated settings, unrelated later changes, pre-existing manager installations, and manager-owned cache/config not created by that receipt. A modern rollback MAY invoke only a safely exposed and independently verified manager removal operation for state the receipt proves that setup created; it MUST NOT directly delete manager cache/config. A legacy rollback MAY restore or remove only receipt-owned assets, metadata, and managed fragments. A migration rollback MAY restore only receipt-proven legacy fragments removed by that migration and MUST NOT restore an entire pre-CLI config. Ambiguous, tampered, divergent, or unsupported rollback state MUST fail closed with precise manual action.

#### Scenario: Modern rollback removes only receipt-created manager state
- GIVEN a valid modern receipt proves the setup attempt created manager state
- AND a safe scoped removal command and independent verification are available
- WHEN rollback succeeds
- THEN it MUST remove only the receipt-created manager state through Codex
- AND it MUST preserve manager state that existed before the receipt

#### Scenario: Unavailable modern removal remains non-destructive
- GIVEN a valid modern receipt identifies created manager state
- BUT no safe scoped removal and verification path is available
- WHEN rollback is requested
- THEN rollback MUST return `requires_user_action` with zero direct cache/config mutation
- AND it MUST provide precise manager-based manual recovery guidance

#### Scenario: Legacy rollback restores only owned fragments
- GIVEN a valid legacy receipt records copied assets, metadata, and managed config fragments
- WHEN rollback succeeds
- THEN it MUST restore or remove only those receipt-owned locations
- AND unrelated and later user configuration MUST remain unchanged

#### Scenario: Migration rollback does not restore a whole config
- GIVEN a migration receipt records removal of one or more legacy managed fragments
- AND Codex or the user later changed other configuration
- WHEN migration rollback restores usability
- THEN it MUST restore only the receipt-proven legacy fragments that require restoration
- AND it MUST preserve all unrelated later changes

#### Scenario: Repeated rollback is idempotent
- GIVEN strategy-owned rollback has already been independently verified
- WHEN the same rollback is requested again
- THEN it MUST return `complete` with `changed=false`
- AND it MUST perform no additional filesystem or manager mutation

### Requirement: Repeated Setup MUST Be Idempotent
When the selected harness, scope, ownership strategy, desired strategy-owned state, and independent verification already match the requested setup, a repeated setup MUST perform no mutation and MUST return `complete` with `changed=false`. Idempotency MUST be based on verified manager state for `plugin_manager` and stable package/content plus owned-state identity for `legacy_filesystem`; executable-path equality alone MUST NOT be required.

#### Scenario: Identical modern setup is a no-op
- GIVEN the expected marketplace and exact installed-and-enabled plugin are independently verified for the selected scope
- AND no proven legacy state remains to migrate
- WHEN the same setup command runs again
- THEN it MUST return `complete` with `changed=false`
- AND it MUST NOT rerun mutating manager commands, copy legacy assets, merge legacy activation, or create a mutation receipt

#### Scenario: Identical legacy setup is a no-op
- GIVEN plugin management remains unavailable for the selected scope
- AND the legacy package/content identity and all owned state are verified current
- WHEN the same setup command runs again
- THEN it MUST return `complete` with `changed=false`
- AND it MUST create no asset, config, backup, or receipt mutation

#### Scenario: Migrated dual state becomes a modern no-op
- GIVEN a prior migration verified manager ownership and removed all proven legacy state
- WHEN setup runs again with the same modern capability evidence
- THEN it MUST classify the target as a verified `plugin_manager` installation
- AND it MUST return `complete` with `changed=false`

#### Scenario: Path-only legacy change remains a no-op
- GIVEN only the resolved executable or shim path changed
- AND all stable legacy package/content and owned-state evidence still matches
- WHEN setup runs again
- THEN it MUST return `complete` with `changed=false`
- AND it MUST NOT rewrite metadata solely to pin the new executable path

### Requirement: Codex Manager Operations MUST Be Independent and Verification-Authoritative
After `plugin_manager` is selected, Codex setup MUST treat marketplace registration and plugin installation or enablement as independent requested operations. A failure, nonzero exit, or unverified result for one operation MUST NOT suppress the other operation when its command remains safely available for the selected scope. Each safely available operation MUST be attempted, durably checkpointed, and independently reread through the exact selected-scope manager list. Exact list verification MUST remain authoritative over exit code, stdout, stderr, temporary manager paths, and diagnostic classification. A nonzero operation MAY be confirmed only when the subsequent exact reread verifies its requested state.

Final status MUST be derived deterministically from exact verification and safe-attempt evidence. `requires_user_action` MUST take precedence whenever ambiguity or the absence of a supported safe reconciliation mechanism prevents a requested operation's safe attempt or recovery. Otherwise, setup MUST return `complete` when both required manager states verify, `partial` when exactly one verifies and the other safely attempted operation fails or remains unverified, and `failed` when neither verifies after all safely available attempts. Once modern execution starts, setup MUST NOT select or apply `legacy_filesystem` as a fallback.

#### Scenario: Clean current plugin installation verifies complete
- GIVEN a clean disposable Codex 0.144.0 home can ingest the current thoth-mem v0.3.7 marketplace and plugin bundle
- WHEN setup registers `EremesNG/thoth-mem`, installs or enables `thoth-mem@thoth-mem`, and exact selected-scope lists verify both states
- THEN setup MUST return `complete`
- AND it MUST NOT report the current plugin bundle, canonical `mcpServers` MCP declaration, hooks, or marketplace topology as defective
- AND it MUST NOT create legacy copied assets or legacy activation configuration

#### Scenario: Nonzero mutation followed by exact verification succeeds
- GIVEN a marketplace or plugin mutation returns a nonzero exit with a bounded diagnostic
- AND the subsequent exact selected-scope list verifies the requested state
- WHEN setup derives the operation outcome
- THEN that operation MUST be `confirmed`
- AND the nonzero result MUST remain secondary diagnostic evidence rather than forcing failure

#### Scenario: Marketplace failure does not suppress a safe plugin attempt
- GIVEN marketplace registration returns nonzero and remains absent from its exact selected-scope list
- AND the plugin operation is still safely available for the selected scope
- WHEN modern setup continues
- THEN setup MUST attempt and checkpoint the plugin operation independently
- AND the marketplace outcome MUST NOT be inferred from the plugin outcome or vice versa

#### Scenario: Exactly one verified manager operation is partial
- GIVEN one requested manager operation is exactly verified
- AND the other safely attempted operation fails or remains unverified
- WHEN setup derives the final result
- THEN setup MUST return `partial`
- AND it MUST preserve both independent outcomes
- AND it MUST NOT install a legacy fallback

#### Scenario: Safe attempts verify no requested manager state
- GIVEN both requested manager operations are safely attempted
- AND neither requested state is exactly verified
- AND no ownership or capability ambiguity requires manual intervention
- WHEN setup derives the final result
- THEN setup MUST return `failed`
- AND it MUST NOT promote either operation or any later verification row to `confirmed`

#### Scenario: Unreconciled orphan residue requires user action
- GIVEN bounded command evidence and exact list absence classify stale pre-registration manager residue
- AND no supported selected-scope reconciliation mechanism is proven
- WHEN neither requested manager state verifies
- THEN setup MUST return `requires_user_action`
- AND it MUST perform zero direct cleanup of Codex-owned temporary, cache, configuration, marketplace, or plugin state

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
Automated Codex setup and packed-flow verification MUST use injected or controlled command execution, a disposable `CODEX_HOME`, and disposable project targets. It MUST NOT discover credentials from, read manager state from, or mutate a real personal or global Codex home. Controlled environments MUST cover both a clean Codex 0.144.0 manager flow and the orphan-residue reproduction while keeping global and project scopes isolated. Any real Codex mutation smoke MUST remain outside automated verification and MUST require separate explicit authorization for a disposable controlled home.

#### Scenario: Clean and orphan regressions use controlled execution
- GIVEN automated tests exercise clean installation, nonzero-then-verified success, mixed outcomes, and orphan residue
- WHEN the scenarios execute
- THEN every manager command MUST run through an injected or controlled executor against disposable state
- AND no command MUST target the developer or CI account's real Codex home

#### Scenario: Packed-flow regression remains disposable
- GIVEN automated verification installs the packed thoth-mem artifact
- WHEN Codex setup behavior is exercised from that artifact
- THEN the test MUST use a disposable `CODEX_HOME` and project target
- AND source-checkout availability, ambient credentials, and real manager state MUST NOT be required for success

#### Scenario: Real-home target is rejected by automated verification
- GIVEN an automated Codex verification target resolves to the active user's real personal or global Codex home
- WHEN the test harness validates its isolation boundary
- THEN the run MUST fail before any manager or filesystem mutation
- AND it MUST report the isolation violation without exposing credentials or unrelated state

### Requirement: Codex Setup MUST Attempt Verified Marketplace and Plugin Registration Safely
When `plugin_manager` is selected, Codex setup MUST independently plan, attempt, checkpoint, and verify marketplace registration and plugin installation/enablement through safely exposed commands for the selected scope. Marketplace success alone MUST NOT imply plugin success. Command success without exact independent state verification MUST NOT produce `complete`. One verified operation plus another ordinary safely attempted failure or unverified result MUST produce `partial`. When corroborated orphan residue or ownership ambiguity prevents safe recovery and requires manual intervention, `requires_user_action` MUST take precedence even if the independent other operation verifies. The modern route MUST NOT copy legacy plugin assets or merge legacy activation/configuration, and a supported command failure MUST NOT trigger an implicit legacy fallback.

#### Scenario: Both manager operations verify complete without legacy state
- GIVEN `plugin_manager` is selected
- WHEN marketplace and plugin operations complete and exact selected-scope state is independently verified
- THEN setup MUST return `complete`
- AND it MUST create no legacy direct-copy installation or legacy activation definition

#### Scenario: One modern operation has an ordinary failure after another succeeds
- GIVEN `plugin_manager` is selected
- AND one manager operation is verified while another safely attempted operation fails or remains unverifiable
- AND no corroborated orphan residue or ownership ambiguity prevents safe recovery
- WHEN setup derives the result
- THEN it MUST return `partial`
- AND it MUST report each step outcome without installing a legacy fallback

#### Scenario: Manual-recovery ambiguity overrides one verified operation
- GIVEN `plugin_manager` is selected
- AND one manager operation is exactly verified
- AND corroborated orphan residue or ownership ambiguity prevents safe recovery for the other requested operation and requires manual intervention
- WHEN setup derives the result
- THEN it MUST return `requires_user_action`
- AND it MUST preserve the independently verified operation outcome
- AND it MUST report the unresolved manual recovery without installing a legacy fallback

#### Scenario: Pre-mutation unavailable manager capability uses legacy strategy
- GIVEN plugin management is unavailable or unprovable for the selected version and scope before mutation
- WHEN setup selects and applies its strategy
- THEN it MUST use `legacy_filesystem`
- AND it MUST NOT attempt guessed manager commands or claim manager ownership

#### Scenario: Marketplace success cannot mask unavailable plugin state
- GIVEN marketplace registration is verified
- AND exact installed-and-enabled plugin state is unavailable or unverified
- WHEN setup derives the final result
- THEN it MUST NOT report `complete`
- AND it MUST provide bounded precise retry or manual-completion guidance

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
Managed Claude Code setup MUST classify existing manual MCP configuration,
marketplace-managed installation, prior thoth-mem-managed state, and ambiguous
lookalikes before mutation. It MUST preserve manual and externally managed
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

### Requirement: Codex Setup MUST Safely Migrate Proven Dual-Owned State
Codex setup MUST recognize a dual-owned state when independently verified plugin-manager state coexists with legacy copied assets, legacy managed activation, or legacy metadata. For destructive migration, a legacy location MUST be considered proven thoth-owned only when either a valid signed receipt binds that exact location and prior owned state, or the exact managed marker, valid legacy metadata, expected scoped path, stable package/content identity, and current owned content all agree. A name or path alone MUST NOT prove ownership. For a modern-capable target, setup MUST preserve the working manager installation until its state is confirmed and the migration decision is durably recorded. It MUST then remove only proven legacy state and MUST verify the final single-owned state. Routine migration MUST NOT require `--force`, and `--force` MUST NOT establish ownership of ambiguous state.

#### Scenario: Proven dual-owned state migrates without force
- GIVEN the expected marketplace and installed-and-enabled plugin are independently verified
- AND legacy assets and activation are proven thoth-owned
- WHEN Codex setup runs without `--force`
- THEN it MUST checkpoint the verified manager state before legacy removal
- AND it MUST remove only the proven legacy state
- AND it MUST verify a final `plugin_manager` installation before returning `complete`

#### Scenario: Existing manager and user state survive migration
- GIVEN a dual-owned installation contains the expected manager state, unrelated marketplaces or plugins, manager cache content, and unrelated user configuration
- WHEN migration completes
- THEN the expected and unrelated manager-owned state MUST remain unchanged except for manager operations explicitly required by the plan
- AND unrelated user configuration MUST remain semantically unchanged

#### Scenario: Ambiguous legacy state blocks automatic migration
- GIVEN manager state is verified
- AND a legacy-looking asset or config location cannot be proven thoth-owned
- WHEN Codex setup plans or applies migration
- THEN it MUST return `requires_user_action` with `changed=false` before any migration mutation
- AND `--force` MUST NOT authorize deletion or overwrite of the ambiguous state

#### Scenario: Failure before legacy removal preserves usable dual state
- GIVEN a usable dual-owned installation
- WHEN manager verification or migration-decision checkpointing fails before legacy removal
- THEN setup MUST leave the legacy state unchanged
- AND it MUST NOT report migration as complete

#### Scenario: Interruption after legacy removal remains recoverable
- GIVEN the migration decision and removed legacy fragments are durably receipt-backed
- WHEN the process terminates after one or more legacy fragments are removed but before final verification
- THEN the next setup or rollback MUST detect the incomplete migration
- AND it MUST recover to the original usable dual state or finish the verified single-owned state from receipt evidence
- AND it MUST NOT infer completion from partial filesystem state

### Requirement: Legacy Codex Installation Freshness MUST Use Stable Package and Content Identity
Legacy installation metadata MUST determine freshness from stable package identity, compatible package version, stable packaged-content or manifest identity, harness, scope, target, and verified owned content. The resolved executable or shim path MAY be retained as diagnostic evidence but MUST NOT by itself make an otherwise matching legacy installation stale.

#### Scenario: Executable path change alone remains current
- GIVEN a verified legacy installation matches package identity, version/content identity, harness, scope, target, and owned content
- AND the thoth-mem executable is now reached through a different absolute shim or package-manager path
- WHEN setup inspects freshness
- THEN it MUST treat the installation as current
- AND it MUST NOT rewrite assets, config, metadata, backups, or receipts solely because the executable path changed

#### Scenario: Content drift remains stale
- GIVEN legacy metadata names the expected package and scope
- BUT the stable packaged-content identity or verified owned content differs
- WHEN setup inspects freshness
- THEN it MUST classify the installation as stale or conflicting
- AND it MUST require a planned ownership-safe update or manual action before mutation

#### Scenario: Legacy metadata without sufficient stable identity is not upgraded implicitly
- GIVEN old legacy metadata is readable but does not prove the stable identity required for a destructive migration
- WHEN modern migration evaluates that metadata
- THEN it MUST use the metadata only for claims its schema actually proves
- AND it MUST require additional exact ownership evidence or return `requires_user_action`

### Requirement: Converge installer-owned OpenCode state

Global and project-scoped OpenCode setup MUST treat any existing canonical `.thoth-mem` asset-path entry as installer-owned and MUST converge it, the canonical `plugins/thoth-mem.js` entry, installation metadata, and `mcp.thoth-mem` configuration to the currently executing package without requiring metadata validity, receipt proof, manual deletion, or `--force`.

#### Scenario: US1 - Converge an existing OpenCode installation 1

- **GIVEN** the canonical OpenCode managed asset target contains an older or newer package version
- **WHEN** setup runs without `--force`
- **THEN** setup replaces the complete managed directory and canonical plugin entry with the current package and reports `complete` with `changed=true`

#### Scenario: US1 - Converge an existing OpenCode installation 2

- **GIVEN** the managed asset target exists without valid installation metadata
- **WHEN** setup runs
- **THEN** directory existence authorizes adoption and setup writes current canonical metadata instead of requiring manual deletion

#### Scenario: US1 - Converge an existing OpenCode installation 3

- **GIVEN** metadata names the current package version but any managed asset, metadata field, plugin entry, or owned configuration value differs
- **WHEN** setup runs
- **THEN** setup repairs the full managed state automatically

#### Scenario: US1 - Converge an existing OpenCode installation 4

- **GIVEN** every current managed asset, metadata value, plugin entry, and owned configuration value matches
- **WHEN** setup runs again
- **THEN** it returns `complete` with `changed=false` and performs zero mutation

### Requirement: Repair every non-current state

OpenCode setup MUST replace or repair its managed state for any package-version mismatch, including a downgrade, and for any same-version content or configuration divergence; it MUST mutate nothing only when the complete desired state already matches exactly.

#### Scenario: US1 - Converge an existing OpenCode installation 1

- **GIVEN** the canonical OpenCode managed asset target contains an older or newer package version
- **WHEN** setup runs without `--force`
- **THEN** setup replaces the complete managed directory and canonical plugin entry with the current package and reports `complete` with `changed=true`

#### Scenario: US1 - Converge an existing OpenCode installation 2

- **GIVEN** the managed asset target exists without valid installation metadata
- **WHEN** setup runs
- **THEN** directory existence authorizes adoption and setup writes current canonical metadata instead of requiring manual deletion

#### Scenario: US1 - Converge an existing OpenCode installation 3

- **GIVEN** metadata names the current package version but any managed asset, metadata field, plugin entry, or owned configuration value differs
- **WHEN** setup runs
- **THEN** setup repairs the full managed state automatically

#### Scenario: US1 - Converge an existing OpenCode installation 4

- **GIVEN** every current managed asset, metadata value, plugin entry, and owned configuration value matches
- **WHEN** setup runs again
- **THEN** it returns `complete` with `changed=false` and performs zero mutation

### Requirement: Select and repair configuration deterministically

Setup MUST prefer `opencode.jsonc` when both config candidates exist, MUST preserve unrelated settings when the selected file parses, and MUST persist a byte-exact non-colliding backup before replacing a malformed selected file with a minimal valid configuration containing canonical `mcp.thoth-mem`.

#### Scenario: US3 - Repair OpenCode configuration deterministically 1

- **GIVEN** the selected OpenCode configuration parses successfully
- **WHEN** setup runs
- **THEN** it normalizes only `mcp.thoth-mem` and preserves unrelated settings

#### Scenario: US3 - Repair OpenCode configuration deterministically 2

- **GIVEN** both `opencode.json` and `opencode.jsonc` exist
- **WHEN** setup runs
- **THEN** it selects JSONC and leaves JSON unchanged

#### Scenario: US3 - Repair OpenCode configuration deterministically 3

- **GIVEN** the selected configuration is malformed
- **WHEN** setup runs
- **THEN** it persists a byte-exact non-colliding backup, recreates a minimal valid configuration containing canonical `mcp.thoth-mem`, and reports the backup path

### Requirement: Journal replacement before mutation

Before the first OpenCode mutation, setup MUST durably persist target-bounded temporary journal and backup evidence sufficient to restore every selected pre-run state; an in-process failure MUST restore that state before returning `failed` whenever restoration remains possible.

#### Scenario: US2 - Survive interrupted replacement 1

- **GIVEN** setup has begun replacing OpenCode state
- **WHEN** a filesystem mutation fails while the process remains alive
- **THEN** setup restores the complete pre-run state and returns `failed` without claiming completion

#### Scenario: US2 - Survive interrupted replacement 2

- **GIVEN** a prior process stopped with a valid in-progress journal
- **WHEN** setup runs again
- **THEN** it restores the journal's verified pre-state and retries setup from a clean baseline

#### Scenario: US2 - Survive interrupted replacement 3

- **GIVEN** an in-progress journal fails signature, path, topology, or hash validation
- **WHEN** setup runs again
- **THEN** it discards only canonical journal artifacts without following embedded paths and performs a fresh canonical installation

#### Scenario: US2 - Survive interrupted replacement 4

- **GIVEN** setup verifies the new post-state
- **WHEN** completion succeeds
- **THEN** no durable OpenCode rollback receipt or pre-version backup for that target remains

#### Scenario: US2 - Survive interrupted replacement 5

- **GIVEN** post-success cleanup cannot remove every journal or backup artifact
- **WHEN** setup renders its result
- **THEN** it returns `complete` with a bounded warning and retries canonical cleanup on the next run

### Requirement: Recover interrupted setup automatically

A subsequent setup run MUST validate any canonical in-progress OpenCode journal, restore its verified pre-state, and retry from a clean baseline; an invalid journal MUST be discarded without following any embedded path before a fresh canonical installation proceeds.

#### Scenario: US2 - Survive interrupted replacement 1

- **GIVEN** setup has begun replacing OpenCode state
- **WHEN** a filesystem mutation fails while the process remains alive
- **THEN** setup restores the complete pre-run state and returns `failed` without claiming completion

#### Scenario: US2 - Survive interrupted replacement 2

- **GIVEN** a prior process stopped with a valid in-progress journal
- **WHEN** setup runs again
- **THEN** it restores the journal's verified pre-state and retries setup from a clean baseline

#### Scenario: US2 - Survive interrupted replacement 3

- **GIVEN** an in-progress journal fails signature, path, topology, or hash validation
- **WHEN** setup runs again
- **THEN** it discards only canonical journal artifacts without following embedded paths and performs a fresh canonical installation

#### Scenario: US2 - Survive interrupted replacement 4

- **GIVEN** setup verifies the new post-state
- **WHEN** completion succeeds
- **THEN** no durable OpenCode rollback receipt or pre-version backup for that target remains

#### Scenario: US2 - Survive interrupted replacement 5

- **GIVEN** post-success cleanup cannot remove every journal or backup artifact
- **WHEN** setup renders its result
- **THEN** it returns `complete` with a bounded warning and retries canonical cleanup on the next run

### Requirement: Remove durable rollback state after success

After exact post-state verification, setup MUST remove temporary journal data plus all prior setup receipts and backups bound to the same OpenCode harness, scope, and target so no successful OpenCode setup retains a usable durable rollback to the prior installation.

#### Scenario: US2 - Survive interrupted replacement 1

- **GIVEN** setup has begun replacing OpenCode state
- **WHEN** a filesystem mutation fails while the process remains alive
- **THEN** setup restores the complete pre-run state and returns `failed` without claiming completion

#### Scenario: US2 - Survive interrupted replacement 2

- **GIVEN** a prior process stopped with a valid in-progress journal
- **WHEN** setup runs again
- **THEN** it restores the journal's verified pre-state and retries setup from a clean baseline

#### Scenario: US2 - Survive interrupted replacement 3

- **GIVEN** an in-progress journal fails signature, path, topology, or hash validation
- **WHEN** setup runs again
- **THEN** it discards only canonical journal artifacts without following embedded paths and performs a fresh canonical installation

#### Scenario: US2 - Survive interrupted replacement 4

- **GIVEN** setup verifies the new post-state
- **WHEN** completion succeeds
- **THEN** no durable OpenCode rollback receipt or pre-version backup for that target remains

#### Scenario: US2 - Survive interrupted replacement 5

- **GIVEN** post-success cleanup cannot remove every journal or backup artifact
- **WHEN** setup renders its result
- **THEN** it returns `complete` with a bounded warning and retries canonical cleanup on the next run

### Requirement: Degrade cleanup without false installation failure

If verified setup succeeds but target-bounded receipt or backup cleanup is incomplete, setup MUST still return `complete`, MUST emit a bounded warning naming only safe cleanup context, and MUST retry cleanup before declaring a later no-op.

#### Scenario: US2 - Survive interrupted replacement 1

- **GIVEN** setup has begun replacing OpenCode state
- **WHEN** a filesystem mutation fails while the process remains alive
- **THEN** setup restores the complete pre-run state and returns `failed` without claiming completion

#### Scenario: US2 - Survive interrupted replacement 2

- **GIVEN** a prior process stopped with a valid in-progress journal
- **WHEN** setup runs again
- **THEN** it restores the journal's verified pre-state and retries setup from a clean baseline

#### Scenario: US2 - Survive interrupted replacement 3

- **GIVEN** an in-progress journal fails signature, path, topology, or hash validation
- **WHEN** setup runs again
- **THEN** it discards only canonical journal artifacts without following embedded paths and performs a fresh canonical installation

#### Scenario: US2 - Survive interrupted replacement 4

- **GIVEN** setup verifies the new post-state
- **WHEN** completion succeeds
- **THEN** no durable OpenCode rollback receipt or pre-version backup for that target remains

#### Scenario: US2 - Survive interrupted replacement 5

- **GIVEN** post-success cleanup cannot remove every journal or backup artifact
- **WHEN** setup renders its result
- **THEN** it returns `complete` with a bounded warning and retries canonical cleanup on the next run

### Requirement: Preserve truthful planning and results

Plan mode MUST report deterministic convergence, recovery, cleanup, and restart actions with zero writes; a changed successful result MUST request an OpenCode restart without attempting process control, while an exact no-op MUST return `complete` with `changed=false` and no restart action.

#### Scenario: US4 - Preview and verify destructive convergence 1

- **GIVEN** a target requires replacement or repair
- **WHEN** setup runs with `--plan`
- **THEN** it reports the selected config, whole managed-directory replacement, plugin-entry replacement, temporary recovery evidence, cleanup, and restart requirement while performing zero writes

#### Scenario: US4 - Preview and verify destructive convergence 2

- **GIVEN** mutating setup changes OpenCode state successfully
- **WHEN** results are rendered
- **THEN** human and JSON output agree on `complete`, `changed=true`, bounded warnings, and the manual OpenCode restart action

#### Scenario: US4 - Preview and verify destructive convergence 3

- **GIVEN** the current package lacks a required OpenCode source asset
- **WHEN** setup inspects the package
- **THEN** it fails before creating a journal, backup, or target mutation
