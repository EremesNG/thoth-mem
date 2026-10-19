# CLI

## Requirements

### Requirement: CLI MUST Provide Managed Setup for OpenCode, Codex, Claude Code, and Pi

The CLI MUST retain current runtime, import, project administration, and existing managed setup behavior while accepting `thoth-mem setup pi` as a global managed Pi-package installation path with public and explicit-local provenance.

#### Scenario: US1 - Install thoth-mem natively in Pi 1

- **GIVEN** Pi is installed with the supported package-manager contract
- **WHEN** `thoth-mem setup pi` runs for the public package
- **THEN** it asks Pi to install the exact thoth-mem package version globally and reports complete only after the package is independently visible and loadable

#### Scenario: US1 - Install thoth-mem natively in Pi 2

- **GIVEN** a verified local thoth-mem build
- **WHEN** setup runs with the explicit local package-root option
- **THEN** it installs that absolute local package through Pi and records its distinct provenance

#### Scenario: US1 - Install thoth-mem natively in Pi 3

- **GIVEN** plan mode or an already verified matching installation
- **WHEN** setup runs
- **THEN** plan mode performs zero writes and the repeated real setup performs zero mutations with `changed=false`

#### Scenario: US1 - Install thoth-mem natively in Pi 4

- **GIVEN** unrelated Pi packages and configuration
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** it mutates only the exact managed thoth-mem package and its receipt-owned state

### Requirement: Plan-Only Setup MUST Perform Zero Writes

Plan mode MUST NOT write configuration, Skills, provider state, receipts, backups, or manager state.

#### Scenario: Plan an installation in a disposable home

- **GIVEN** a disposable home with existing unrelated configuration
- **WHEN** any supported setup runs in plan mode
- **THEN** every file and manager-state hash remains unchanged

### Requirement: Setup MUST Merge Only Managed Configuration

OpenCode, Codex, and Claude Code setup MUST preserve their current ownership contracts. Pi setup MUST use Pi's native package manager to inspect, install, repair, and verify only the exact thoth-mem package, MUST record only receipt-owned thoth-mem state, and MUST preserve unrelated Pi packages, extensions, Skills, settings, and files during success or rollback.

#### Scenario: US1 - Install thoth-mem natively in Pi 1

- **GIVEN** Pi is installed with the supported package-manager contract
- **WHEN** `thoth-mem setup pi` runs for the public package
- **THEN** it asks Pi to install the exact thoth-mem package version globally and reports complete only after the package is independently visible and loadable

#### Scenario: US1 - Install thoth-mem natively in Pi 2

- **GIVEN** a verified local thoth-mem build
- **WHEN** setup runs with the explicit local package-root option
- **THEN** it installs that absolute local package through Pi and records its distinct provenance

#### Scenario: US1 - Install thoth-mem natively in Pi 3

- **GIVEN** plan mode or an already verified matching installation
- **WHEN** setup runs
- **THEN** plan mode performs zero writes and the repeated real setup performs zero mutations with `changed=false`

#### Scenario: US1 - Install thoth-mem natively in Pi 4

- **GIVEN** unrelated Pi packages and configuration
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** it mutates only the exact managed thoth-mem package and its receipt-owned state

### Requirement: Mutating Setup MUST Be Atomic, Receipt-Owned, and Verifiable

Before mutation, setup MUST record bounded ownership and recoverable pre-change state; replacements MUST be atomic, and `complete` MUST be reported only after independent installed-state verification.

#### Scenario: A write fails during setup

- **GIVEN** a mutation fails after setup begins
- **WHEN** rollback executes
- **THEN** only receipt-owned state is restored and the result does not claim completion

### Requirement: Repeated Setup MUST Be Idempotent

A repeated setup request MUST return `changed=false` and request no restart only when the requested plugin, Skill, provider, runtime, and manager state are already verified.

#### Scenario: Repeat a complete setup

- **GIVEN** a verified current installation
- **WHEN** the same setup command runs again
- **THEN** it performs zero mutations and returns a complete no-op result

### Requirement: CLI Command Surface MUST Use Current Product Names

The CLI MUST expose a bounded `project rename` administration command in addition to setup, MCP, lifecycle, and explicit legacy import, and MUST reject unknown project subcommands without compatibility aliases.

#### Scenario: US4 - Rename the project display name explicitly 1

- **GIVEN** one exact project UUID or unambiguous exact alias and a valid new display name
- **WHEN** `project rename` runs
- **THEN** it updates one project name and reports the unchanged canonical key

#### Scenario: US4 - Rename the project display name explicitly 2

- **GIVEN** an unknown, ambiguous, blank, unsafe, or oversized selector/name
- **WHEN** rename is requested
- **THEN** it performs zero durable changes and returns a bounded nonzero result

#### Scenario: US4 - Rename the project display name explicitly 3

- **GIVEN** a successful rename repeated with the same target name
- **WHEN** the CLI runs again
- **THEN** it reports an idempotent no-op

### Requirement: Legacy Import MUST Be Explicit and Non-Destructive

`import-legacy` MUST make one explicit CLI invocation the normal migration workflow; default the source to the conventional legacy database under the user home and the target to `memory.sqlite` under the resolved runtime data directory; accept bounded source, mapping, and data-directory overrides; bind the complete canonical mapping request, including null versus empty mode, inside the sealed plan hash recorded by the target receipt; internally create and retain importer-owned request custody with immutable baseline-bound plan attempts and create-only reports; use a fresh attempt while no matching source import is committed; read the committed plan hash from the target and reuse only that exact retained sealed plan for an equivalent replay; execute fingerprint-bound planning and verified apply without manual artifact choreography; emit bounded aggregate success or actionable failure output; preserve advanced `plan` and `apply` subcommands; reject changed, locked, aliased, invalid, tampered, substituted, or unsafe inputs before claiming commit; allow a later stable retry after an uncommitted failure; preserve a verified backup and recoverable publication; accept importer-controlled physical WAL normalization only when the complete logical baseline remains equal to the sealed plan; verify restoration by SQLite integrity, foreign keys, and logical baseline rather than stale pre-checkpoint byte hashes; and keep repeated imports idempotent.

#### Scenario: US1 - Publish from a stable WAL target 1

- **GIVEN** a stable current target with a non-empty WAL that is logically identical to its sealed plan baseline
- **WHEN** one-command import publishes a fully verified candidate
- **THEN** importer-controlled WAL normalization does not produce a target-changed failure and the command reports a committed import

#### Scenario: US1 - Publish from a stable WAL target 2

- **GIVEN** an equivalent stable target with an absent or empty WAL
- **WHEN** the same import runs
- **THEN** existing successful publication and recovery behavior remains unchanged

#### Scenario: US2 - Restore publication failures truthfully 1

- **GIVEN** a non-empty-WAL target and an injected failure after the target enters recovery
- **WHEN** recovery runs
- **THEN** the prior logical database is restored and verified even if its WAL/main byte representation was normalized

#### Scenario: US2 - Restore publication failures truthfully 2

- **GIVEN** a candidate that reached the target path but fails before final commit verification
- **WHEN** recovery runs
- **THEN** the candidate is removed from the active path and the verified prior baseline is restored without overwriting unrelated files

#### Scenario: US3 - Fail closed on real target activity 1

- **GIVEN** the target cannot reach the importer's quiescence barrier
- **WHEN** publication begins
- **THEN** the import fails as locked/busy, retains recoverable artifacts, and tells the user to close hosts and rerun the same command

#### Scenario: US3 - Fail closed on real target activity 2

- **GIVEN** the target's logical contents change before or during the bounded publication handoff
- **WHEN** the importer revalidates the recovery snapshot or target paths
- **THEN** it refuses candidate publication, restores the captured prior state when possible, and never claims commit

#### Scenario: US4 - Complete the real cutover after verification 1

- **GIVEN** the fixed packaged build, the conventional legacy source, and a stopped stable target
- **WHEN** `thoth-mem import-legacy` runs
- **THEN** the command commits once and post-cutover integrity plus bounded recall inspection pass

#### Scenario: US5 - Preserve the established import contract 1

- **GIVEN** the conventional legacy database and a configured current data directory
- **WHEN** `thoth-mem import-legacy` runs
- **THEN** it resolves both database paths, creates private run artifacts, plans, applies, verifies, and reports success in that single invocation

#### Scenario: US5 - Preserve the established import contract 2

- **GIVEN** a nonstandard legacy database or reviewed mapping manifest
- **WHEN** the operator passes the optional source, mapping, or data-directory override
- **THEN** the same one-command workflow binds those exact values into the audited plan

#### Scenario: US5 - Preserve the established import contract 3

- **GIVEN** a successful import
- **WHEN** the CLI returns
- **THEN** its bounded output identifies aggregate dispositions, retained plan/report locations, and nullable backup/recovery locations without exposing legacy prose

#### Scenario: US5 - Preserve the established import contract 4

- **GIVEN** the configured target is open or changes between internal planning and apply
- **WHEN** one-command import runs
- **THEN** it exits nonzero, reports a bounded close-host-or-retry action, and leaves the active target recoverable without claiming commit

#### Scenario: US5 - Preserve the established import contract 5

- **GIVEN** an invalid source, mapping, target alias, or unsafe artifact condition
- **WHEN** one-command import runs
- **THEN** it fails closed without requiring the user to inspect or repair an internal plan manually

#### Scenario: US5 - Preserve the established import contract 6

- **GIVEN** the same source fingerprint was already committed
- **WHEN** an equivalent one-command import is run again
- **THEN** it reads the committed plan hash from the target, selects that exact retained sealed plan from matching request custody, the existing importer receipts prevent duplicate authoritative rows, and the command reports the idempotent outcome

#### Scenario: US5 - Preserve the established import contract 7

- **GIVEN** a prior attempt failed safely because the uncommitted target changed after planning
- **WHEN** the target becomes stable and the same one-command request is retried
- **THEN** it creates or selects a fresh baseline-bound plan attempt and can complete without manual artifact cleanup

#### Scenario: US5 - Preserve the established import contract 8

- **GIVEN** an operator explicitly selects `plan` or `apply`
- **WHEN** that subcommand runs
- **THEN** the existing explicit paths, fingerprint binding, create-only artifacts, and stale-plan rejection remain authoritative
