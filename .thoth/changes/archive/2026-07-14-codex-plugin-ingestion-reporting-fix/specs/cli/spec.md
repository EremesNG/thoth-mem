# Delta for CLI

## ADDED Requirements

### Requirement: Codex Manager Operations MUST Be Independent and Verification-Authoritative
After `plugin_manager` is selected, Codex setup MUST treat marketplace registration and plugin installation or enablement as independent requested operations. A failure, nonzero exit, or unverified result for one operation MUST NOT suppress the other operation when its command remains safely available for the selected scope. Each safely available operation MUST be attempted, durably checkpointed, and independently reread through the exact selected-scope manager list. Exact list verification MUST remain authoritative over exit code, stdout, stderr, temporary manager paths, and diagnostic classification. A nonzero operation MAY be confirmed only when the subsequent exact reread verifies its requested state.

Final status MUST be derived deterministically from exact verification and safe-attempt evidence. `requires_user_action` MUST take precedence whenever ambiguity or the absence of a supported safe reconciliation mechanism prevents a requested operation's safe attempt or recovery. Otherwise, setup MUST return `complete` when both required manager states verify, `partial` when exactly one verifies and the other safely attempted operation fails or remains unverified, and `failed` when neither verifies after all safely available attempts. Once modern execution starts, setup MUST NOT select or apply `legacy_filesystem` as a fallback.

#### Scenario: Clean current plugin installation verifies complete
- GIVEN a clean disposable Codex 0.144.0 home can ingest the current thoth-mem v0.3.7 marketplace and plugin bundle
- WHEN setup registers `EremesNG/thoth-mem`, installs or enables `thoth-mem@thoth-mem`, and exact selected-scope lists verify both states
- THEN setup MUST return `complete`
- AND it MUST NOT report the current plugin bundle, flat MCP declaration, hooks, or marketplace topology as defective
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

## MODIFIED Requirements

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
Setup and rollback MUST emit a human-readable result and MUST support a machine-readable JSON object. That object MUST contain `status` as `complete|failed|partial|requires_user_action`, `changed` as a boolean, `harness` as `opencode|codex`, `scope` as `global|project`, `target` as a string, `steps` as an ordered array whose entries contain a non-empty `name` and `outcome` from `planned|skipped|confirmed|failed|unavailable`, `diagnostics` and `manual_actions` as arrays of strings, and `receipt` as a string path or `null`. `requires_user_action` MUST take precedence over `partial` whenever corroborated orphan residue or ownership ambiguity prevents safe recovery and requires manual intervention, even if another requested operation is independently verified. Status and process exit code MUST map exactly as follows: `complete` to `0`, `failed` to `1`, `partial` to `2`, and `requires_user_action` to `3`.

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

## REMOVED Requirements

## Assumptions

- A manager operation is a safe attempt only when the already-selected `plugin_manager` route has an explicitly recognized command capability for the immutable selected scope and expected fixed marketplace or plugin identity, and no unresolved capability, scope, or ownership ambiguity blocks invocation. Exit outcome does not determine whether the attempt was safe; the exact reread remains authoritative for state.
- The existing setup status vocabulary (`complete`, `partial`, `failed`, `requires_user_action`) and step outcome vocabulary (`planned`, `skipped`, `confirmed`, `failed`, `unavailable`) are sufficient; no new public result values are required.
- The current V2 ordered checkpoint ledger can represent attempt and reread evidence without a receipt schema change. Clarify or design MAY propose an additive compatible field only if it proves the existing ledger cannot express a required distinction.
- Existing safety bounds remain normative: 64 KiB combined command output, 512 characters per persisted or rendered safe diagnostic, 256 receipt checkpoints, and a 1 MiB receipt.
- Clean Codex 0.144.0 ingestion of the current v0.3.7 marketplace and plugin bundle is accepted evidence; this change does not require plugin assets, flat MCP declarations, hooks, marketplace topology, or the package version to change.
