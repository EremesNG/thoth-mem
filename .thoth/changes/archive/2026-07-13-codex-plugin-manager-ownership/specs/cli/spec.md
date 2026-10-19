# Delta for CLI

## ADDED Requirements

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

## MODIFIED Requirements

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

### Requirement: Codex Setup MUST Attempt Verified Marketplace and Plugin Registration Safely
When `plugin_manager` is selected, Codex setup MUST independently plan, attempt, checkpoint, and verify marketplace registration and plugin installation/enablement through safely exposed commands for the selected scope. Marketplace success alone MUST NOT imply plugin success. Command success without exact independent state verification MUST NOT produce `complete`. The modern route MUST NOT copy legacy plugin assets or merge legacy activation/configuration, and a supported command failure MUST NOT trigger an implicit legacy fallback.

#### Scenario: Both manager operations verify complete without legacy state
- GIVEN `plugin_manager` is selected
- WHEN marketplace and plugin operations complete and exact selected-scope state is independently verified
- THEN setup MUST return `complete`
- AND it MUST create no legacy direct-copy installation or legacy activation definition

#### Scenario: One modern operation fails after another succeeds
- GIVEN `plugin_manager` is selected
- AND one manager operation is verified while another safely attempted operation fails or remains unverifiable
- WHEN setup derives the result
- THEN it MUST return `partial`
- AND it MUST report each step outcome without installing a legacy fallback

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

## REMOVED Requirements

None.

## Assumptions

- The public setup result shape and existing status/exit-code mapping remain unchanged; selected strategy and migration evidence are surfaced through ordered steps and bounded diagnostics unless design proves an additive compatible field is necessary.
- `--force` remains a conflict override only for locations whose thoth ownership is already proven; it never creates ownership evidence.
- Once a mutating attempt selects `plugin_manager`, operational failure does not reselect `legacy_filesystem`.
- Old valid receipts remain readable, but automatic modern rollback or destructive migration requires evidence explicitly present in the receipt or corroborated by exact independent ownership checks.
- Migration recovery prioritizes a usable state: before legacy removal it leaves dual state intact; after removal it may restore only receipt-proven legacy fragments or complete manager verification.
- A destructive legacy migration location is proven thoth-owned only by a binding signed receipt or by the complete exact marker + metadata + scoped path + stable package/content identity + current owned-content evidence set.
- Strategy-aware receipts distinguish pre-existing verified manager state from state created by the current attempt; only the latter can authorize automatic manager rollback.

## handoffHints

- Design MUST model clean modern, clean legacy, proven dual-owned, ambiguous, partial, and interrupted states without narrowing any migration scenario.
- Design MUST order modern verification and durable migration checkpointing before legacy removal, and MUST prevent `--force` from manufacturing ownership.
- Design MUST replace pre-external whole-config final evidence with bounded strategy-owned post-state while preserving old receipt readability.
- Design MUST keep modern, legacy, and migration rollback separate and MUST preserve later unrelated Codex/user changes.
- Design MUST use stable package/content identity for legacy freshness and treat executable path only as diagnostic evidence.
- Design MUST preserve the existing public status/exit contract and justify any additive result field if one is introduced.
- Design MUST implement the pinned legacy ownership-proof alternatives without accepting a name, path, or `--force` alone.
- Design MUST make receipt evidence distinguish pre-existing verified manager state from state created by the attempt and bind rollback authority accordingly.
