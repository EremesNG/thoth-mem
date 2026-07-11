# CLI

## Requirements

### Requirement: CLI MUST Provide Managed Setup for OpenCode and Codex
The public CLI MUST accept `thoth-mem setup opencode` and `thoth-mem setup codex`. Both commands MUST default to global scope. Project scope MUST use `--scope project --project <path>`; explicit global scope MAY use `--scope global`, and `--project` MUST be rejected outside project scope. Plan-only MUST use `--plan`, conflict override MUST use `--force`, rollback MUST use `--rollback <receipt-path>`, and machine-readable output MUST use `--json`. Inspection, planning, mutation, verification, receipts, and rollback MUST remain confined to the selected harness and scope.

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

### Requirement: Plan-Only Setup MUST Perform Zero Writes
Setup MUST provide a plan-only operation that reports the deterministic ordered actions, selected scope, target paths, detected capabilities, conflicts, expected backups, and expected external commands without changing files, invoking mutating external commands, creating backups, or creating receipts.

#### Scenario: Plan-only on a clean target writes nothing
- GIVEN a valid clean harness target
- WHEN setup runs in plan-only mode
- THEN the reported plan MUST describe the actions that a mutating run would attempt
- AND no file, directory, backup, receipt, harness registration, or plugin installation state MUST change

#### Scenario: Plan-only reports conflicts without forcing them
- GIVEN current configuration conflicts with a managed value
- WHEN setup runs in plan-only mode with force requested
- THEN the plan MUST identify the conflict and the managed value that force would replace
- AND the command MUST still perform zero writes and zero mutating external commands
- AND the result MUST be `complete` with exit code `0` and `changed=false`

#### Scenario: Plan-only unresolved conflict requires action
- GIVEN current configuration conflicts with a managed value
- WHEN setup runs in plan-only mode without force
- THEN the command MUST perform zero writes and zero mutating external commands
- AND the result MUST be `requires_user_action` with exit code `3` and `changed=false`

### Requirement: Setup MUST Merge Only Managed Configuration
Mutating setup MUST preserve unrelated user settings and MUST add or update only configuration entries explicitly owned by thoth-mem. A managed conflict MUST stop before mutation unless force is explicitly requested, and force MUST remain limited to conflicting thoth-mem-managed entries.

#### Scenario: Unrelated settings survive setup
- GIVEN an existing harness configuration contains unrelated user keys and extensions
- WHEN setup applies its managed merge
- THEN every unrelated setting MUST remain semantically unchanged
- AND only planned thoth-mem-owned entries MAY be added or updated

#### Scenario: Managed conflict is refused without force
- GIVEN an existing value occupies a thoth-mem-managed location with incompatible ownership or content
- WHEN setup runs without force
- THEN setup MUST return `requires_user_action`
- AND it MUST perform zero mutation
- AND it MUST identify the conflicting location and safe next actions

#### Scenario: Force replaces only the managed conflict
- GIVEN a managed conflict exists and the user explicitly requests force
- WHEN setup applies the plan
- THEN setup MAY replace the conflicting managed entry after backup
- AND it MUST preserve unrelated configuration
- AND the receipt MUST record the forced conflict and prior managed value

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
Every setup attempt that may mutate state MUST durably create a receipt with status `in_progress` after required backups succeed and before the first filesystem mutation or mutating external command. The receipt MUST record the harness, scope, target, planned and attempted steps, thoth-mem-owned entries, backup locations, pre-change managed values, post-change verification, external command outcomes, force use, final status, and safe diagnostics, and MUST be updated after each attempted step. If the initial receipt cannot be created, setup MUST perform zero mutation. A receipt MUST NOT contain credentials, secrets, or raw private prompt content.

#### Scenario: Complete setup emits a usable receipt
- GIVEN a mutating setup completes and verifies successfully
- WHEN result reporting finishes
- THEN a receipt MUST identify every managed change and corresponding backup
- AND the result MUST expose the receipt location

#### Scenario: Failed mutating attempt remains auditable
- GIVEN setup begins mutation and later fails or rolls back
- WHEN failure handling completes
- THEN a receipt MUST record attempted steps, restoration outcomes, and final status
- AND the receipt MUST omit secret values and private content

#### Scenario: Interrupted setup remains recoverable
- GIVEN setup durably created an `in_progress` receipt and began mutation
- WHEN the process terminates before a final status is recorded
- THEN the next setup or rollback operation MUST detect the incomplete receipt
- AND it MUST return `requires_user_action` or perform a receipt-evidenced safe recovery
- AND it MUST NOT infer `complete` from partial state

### Requirement: Rollback MUST Restore Only Receipt-Owned Changes
The CLI MUST provide rollback for a selected setup receipt. Rollback MUST restore prior managed values or remove entries created by that receipt, MUST preserve unrelated settings and unrelated changes made after setup, MUST be idempotent after confirmed success, and MUST refuse ambiguous or tampered receipt state without force or precise manual recovery guidance. Forced rollback MAY replace only receipt-owned managed locations, MUST create fresh backups and an `in_progress` rollback receipt before mutation, and MUST still refuse an invalid receipt or ambiguity outside receipt-owned locations.

#### Scenario: Rollback restores prior managed state
- GIVEN a valid receipt records values changed by setup
- WHEN rollback succeeds
- THEN prior managed values MUST be restored or receipt-created entries MUST be removed
- AND unrelated settings added before or after setup MUST remain unchanged

#### Scenario: Repeated rollback is an idempotent complete result
- GIVEN a receipt has already been rolled back and the managed target still matches that rolled-back state
- WHEN rollback is requested again
- THEN rollback MUST return `complete` with `changed=false`
- AND it MUST perform no additional mutation

#### Scenario: Ambiguous rollback stops safely
- GIVEN current managed state no longer matches either the receipt-installed state or the expected rolled-back state
- WHEN rollback runs without force
- THEN rollback MUST return `requires_user_action`
- AND it MUST perform zero mutation
- AND it MUST identify the conflicting managed locations

#### Scenario: Forced rollback remains ownership-bounded
- GIVEN a valid receipt-owned managed location diverged after setup
- WHEN rollback runs with force
- THEN rollback MAY restore the receipt-recorded prior managed value after a fresh backup and rollback receipt are created
- AND unrelated or non-receipt-owned locations MUST remain unchanged
- AND an invalid receipt MUST still be refused

### Requirement: Repeated Setup MUST Be Idempotent
When the selected harness, scope, desired assets, owned configuration, and verified external registration already match the requested setup, a repeated setup MUST perform no mutation and MUST return `complete` with `changed=false`.

#### Scenario: Identical OpenCode setup is a no-op
- GIVEN OpenCode setup is already verified for the selected scope
- WHEN the same setup command runs again
- THEN it MUST return `complete` with `changed=false`
- AND it MUST create no new configuration mutation or backup

#### Scenario: Identical Codex setup does not repeat verified registration
- GIVEN Codex marketplace and plugin registration are already independently verified
- WHEN the same setup command runs again
- THEN it MUST return `complete` with `changed=false`
- AND it MUST NOT rerun mutating registration commands solely to rediscover success

### Requirement: Codex Setup MUST Attempt Verified Marketplace and Plugin Registration Safely
Codex setup MUST independently detect, attempt, and verify marketplace registration and plugin installation when the detected Codex CLI safely exposes those operations. The undocumented plugin-add capability MUST be treated as best effort: setup MUST NOT guess or execute an unverified command shape, and any unavailable, failed, or unverifiable step MUST produce precise diagnostics and manual actions instead of false success.

#### Scenario: Both Codex operations verify complete
- GIVEN the detected Codex CLI safely exposes marketplace registration and plugin installation
- WHEN both operations complete and their resulting state is independently verified
- THEN Codex setup MUST return `complete`
- AND no manual action MUST be required

#### Scenario: Supported Codex step fails after another succeeds
- GIVEN both required Codex operations are safely exposed
- AND one operation is verified while another attempted operation fails or cannot be verified
- WHEN setup derives the final result
- THEN setup MUST return `partial`
- AND it MUST report each step outcome and an exact retry or manual completion action

#### Scenario: Required Codex operation is unavailable
- GIVEN the detected Codex CLI does not safely expose marketplace registration or plugin installation
- WHEN setup derives the final result
- THEN setup MUST return `requires_user_action`
- AND it MUST identify the unavailable capability and precise manual completion steps
- AND it MUST NOT execute a guessed command

#### Scenario: Marketplace success cannot mask unavailable plugin installation
- GIVEN marketplace registration is verified
- AND plugin installation is unavailable or unsafe to invoke
- WHEN setup derives the final result
- THEN setup MUST return `requires_user_action`
- AND it MUST NOT report `complete`

### Requirement: Setup Results and Exit Codes MUST Be Deterministic
Setup and rollback MUST emit a human-readable result and MUST support a machine-readable JSON object. That object MUST contain `status` as `complete|failed|partial|requires_user_action`, `changed` as a boolean, `harness` as `opencode|codex`, `scope` as `global|project`, `target` as a string, `steps` as an ordered array whose entries contain a non-empty `name` and `outcome` from `planned|skipped|confirmed|failed|unavailable`, `diagnostics` and `manual_actions` as arrays of strings, and `receipt` as a string path or `null`. Status and process exit code MUST map exactly as follows: `complete` to `0`, `failed` to `1`, `partial` to `2`, and `requires_user_action` to `3`.

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

#### Scenario: Partial external completion exits two
- GIVEN at least one requested Codex external registration step is verified
- AND another safely attempted required step fails or remains unverifiable
- WHEN result reporting completes
- THEN status MUST be `partial`
- AND process exit code MUST be `2`

#### Scenario: Manual action exits three
- GIVEN a conflict or missing safe CLI capability prevents automatic completion before unsafe mutation
- WHEN result reporting completes
- THEN status MUST be `requires_user_action`
- AND process exit code MUST be `3`
- AND manual actions MUST identify the unresolved steps

## Assumptions

- Global scope is the default because it matches the requested commands; project scope is explicit and requires an explicit target path to prevent accidental writes to the current directory.
- Public controls are pinned to `--scope project --project <path>`, optional `--scope global`, `--plan`, `--force`, `--rollback <receipt-path>`, and `--json`.
- A successfully computed plan returns `complete/0` with `changed=false`; an unresolved unforced managed conflict returns `requires_user_action/3`. `--plan --force` reports the forced plan but remains zero-write.
- Receipts are durable write-ahead evidence: `in_progress` is persisted before mutation and cannot be interpreted as `complete`; forced rollback remains limited to valid receipt-owned locations.
- `complete` includes a verified idempotent no-op. `partial` is reserved for safely attempted Codex external steps with mixed verified outcomes. `requires_user_action` takes precedence when a required operation is unavailable or unsafe to infer.
- Exit codes `0`, `1`, `2`, and `3` are stable automation contracts for `complete`, `failed`, `partial`, and `requires_user_action` respectively.
- External Codex commands may not be atomically reversible; receipts and per-step verification therefore report those outcomes independently from reversible filesystem changes.
- Force authorizes replacement only at thoth-mem-managed conflict locations and does not bypass filesystem permissions, trust controls, command approval, or unrelated ownership.

## Handoff Hints

- Design one result model shared by plan, setup, Codex external steps, and rollback, preserving the four exact status/exit mappings.
- Separate reversible filesystem transactions from non-atomic external Codex registration steps while keeping one receipt and per-step evidence.
- Prove zero-write plan behavior and selected-scope confinement before implementing mutations.
- Preserve unrelated configuration during merge, force, rollback, and post-install user edits.
- Preserve the exact public options, JSON field types, step outcome vocabulary, plan status precedence, and write-ahead receipt recovery rules.
- Treat undocumented Codex plugin installation as capability-gated best effort and never derive `complete` from marketplace registration alone.
