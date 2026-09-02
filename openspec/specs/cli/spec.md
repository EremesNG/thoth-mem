# CLI

## Requirements

### Requirement: CLI MUST Provide Managed Setup for OpenCode, Codex, and Claude Code

The CLI MUST retain existing managed setup and current runtime/import commands while adding only `project rename` for exact local display-name administration; rename MUST leave canonical identity and related records unchanged.

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

### Requirement: Plan-Only Setup MUST Perform Zero Writes

Plan mode MUST NOT write configuration, Skills, provider state, receipts, backups, or manager state.

#### Scenario: Plan an installation in a disposable home

- **GIVEN** a disposable home with existing unrelated configuration
- **WHEN** any supported setup runs in plan mode
- **THEN** every file and manager-state hash remains unchanged

### Requirement: Setup MUST Merge Only Managed Configuration

OpenCode setup MUST continue to own only exact thoth-mem plugin entries, the thoth-mem Skill tree, provider configuration fields, and its receipt. Codex and Claude Code setup MUST use their native managers to add, inspect, install, enable or repair, verify, and roll back only the canonical marketplace `thoth-plugins` at `https://github.com/EremesNG/thoth-plugins.git` and plugin `thoth-mem@thoth-plugins`. Codex CLI `0.151.x` MUST be accepted without an override only after the complete manager capability contract is observed; other versions MUST fail closed unless an explicit force override verifies that same complete contract. On Windows, the implicit `codex` command MUST use shell-compatible `cmd.exe` lookup without enabling Node `shell:true`, so an earlier `.cmd` shim is not bypassed for a later `.exe`; an explicit command override MUST remain literal, and non-Windows execution MUST remain direct. After Codex verifies `thoth-mem@thoth-plugins`, thoth-mem setup MUST remove only known thoth-mem legacy manager IDs and exact orphan roots, MUST preserve sibling/unrelated state, and MUST fail closed on conflicting provenance or unsafe path resolution.

#### Scenario: US1 - Resolve an installed Skill on the first path 1

- **GIVEN** marketplace `thoth-plugins`, plugin `thoth-mem`, and version `0.4.13`
- **WHEN** Codex derives the installed Skill path
- **THEN** it resolves `cache/thoth-plugins/thoth-mem/0.4.13/skills/thoth-mem/SKILL.md` without first probing a path that omits the plugin segment

#### Scenario: US1 - Resolve an installed Skill on the first path 2

- **GIVEN** marketplace `thoth-plugins`, plugin `thoth-agents`, and an independently selected plugin version
- **WHEN** Codex or Claude Code installs it
- **THEN** the host retains `thoth-plugins` and `thoth-agents` as separate adjacent cache segments

#### Scenario: US2 - Install either plugin from one canonical catalog 1

- **GIVEN** a host with no Thoth marketplace
- **WHEN** thoth-mem managed setup runs
- **THEN** it registers `https://github.com/EremesNG/thoth-plugins.git` as `thoth-plugins` and installs only `thoth-mem@thoth-plugins`

#### Scenario: US2 - Install either plugin from one canonical catalog 2

- **GIVEN** the same canonical marketplace
- **WHEN** thoth-agents managed setup runs
- **THEN** it reuses or repairs that registration and installs only `thoth-agents@thoth-plugins`

#### Scenario: US2 - Install either plugin from one canonical catalog 3

- **GIVEN** Codex and Claude Code on the same machine
- **WHEN** both setups complete
- **THEN** each host uses the internal marketplace name `thoth-plugins` while retaining its own native manager state

#### Scenario: US2 - Install either plugin from one canonical catalog 4

- **GIVEN** Codex CLI `0.151.x` with the complete inspected native-manager capability contract
- **WHEN** thoth-mem setup runs without an override
- **THEN** it accepts the host; another Codex version fails closed unless an explicit force override verifies that same complete capability contract

#### Scenario: US2 - Install either plugin from one canonical catalog 5

- **GIVEN** Windows has an npm `codex.cmd` for `0.151.x` earlier in `PATH` and a Desktop `codex.exe` for an older version later in `PATH`
- **WHEN** thoth-mem invokes the implicit `codex` command from Node
- **THEN** it observes the same command selected by `cmd.exe` rather than bypassing the earlier shim for the later executable

#### Scenario: US4 - Retire owned legacy Codex state safely 1

- **GIVEN** `thoth-mem`, `thoth-mem-codex`, `thoth-agents`, or `thoth-agents-codex` residue and a stopped Codex host
- **WHEN** the corresponding product setup verifies its central plugin
- **THEN** it removes only that product's exact legacy plugin IDs and marketplace registrations through Codex and removes only still-orphaned exact product cache/snapshot roots beneath the resolved `CODEX_HOME`

#### Scenario: US4 - Retire owned legacy Codex state safely 2

- **GIVEN** an existing central or legacy marketplace whose name has different provenance
- **WHEN** setup inspects it
- **THEN** setup fails closed before cleanup rather than silently replacing, trusting, or deleting it

#### Scenario: US4 - Retire owned legacy Codex state safely 3

- **GIVEN** cleanup fails after the central installation is verified
- **WHEN** setup returns
- **THEN** it reports a bounded close-Codex-and-retry action, retains the central installation, and completes idempotently on a later retry

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

`import-legacy` MUST separate zero-write planning from explicit apply; require distinct explicit source and current-target paths plus a plan bound to their fingerprints and exact mapping/privacy policy; support a populated current target by building from a verified backup into an isolated candidate; reject fuzzy or ambiguous project matching, changed/locked inputs, unsafe artifact paths, and stale plans; publish only a completely verified candidate through an atomic target replacement; retain bounded recovery/report artifacts; and make an identical replay a no-op.

#### Scenario: US1 - Inspect a migration without changing either database 1

- **GIVEN** distinct readable legacy and current databases
- **WHEN** planning runs
- **THEN** it performs zero input writes and reports source/target fingerprints, supported schema, authoritative row counts, ignored derived inventory, project dispositions, privacy transformations, and blocking errors

#### Scenario: US1 - Inspect a migration without changing either database 2

- **GIVEN** legacy virtual tables whose modules are unavailable
- **WHEN** planning inventories derived state
- **THEN** it classifies them from schema metadata without querying or loading those modules

#### Scenario: US1 - Inspect a migration without changing either database 3

- **GIVEN** an unsupported source schema, aliased paths, unreadable input, or a source/target that changes during planning
- **WHEN** planning completes
- **THEN** it fails closed with no candidate or input mutation

#### Scenario: US2 - Reconcile project identities without guessing 1

- **GIVEN** an explicit source-project mapping to one exact current project key or alias
- **WHEN** it validates
- **THEN** every mapped legacy row uses that canonical project and the mapping is bound into the import receipt

#### Scenario: US2 - Reconcile project identities without guessing 2

- **GIVEN** one unambiguous exact canonical key or exact path alias
- **WHEN** no explicit override conflicts
- **THEN** the plan may propose that mapping and reports the evidence used

#### Scenario: US2 - Reconcile project identities without guessing 3

- **GIVEN** a non-placeholder legacy project that has no safe current match
- **WHEN** planning runs
- **THEN** it assigns one deterministic isolated legacy project identity rather than dropping its history or guessing a current project

#### Scenario: US2 - Reconcile project identities without guessing 4

- **GIVEN** placeholder identity, contradictory row/session identity, ambiguous aliases, or a conflicting explicit mapping
- **WHEN** reconciliation cannot resolve it safely
- **THEN** affected rows are quarantined or the plan is blocked with bounded reasons and no invented verified identity

#### Scenario: US4 - Commit a verified candidate atomically 1

- **GIVEN** an approved plan bound to exact source and target fingerprints
- **WHEN** apply starts
- **THEN** it creates a recoverable verified backup and a private candidate copy rather than mutating the active target in place

#### Scenario: US4 - Commit a verified candidate atomically 2

- **GIVEN** a fully reconciled candidate
- **WHEN** foreign keys, schema revision, import lineage, row dispositions, memory provenance, and FTS checks pass and both inputs are unchanged
- **THEN** publication replaces the target atomically and emits a bounded durable report

#### Scenario: US4 - Commit a verified candidate atomically 3

- **GIVEN** any failed check, changed input, target lock, write error, or interrupted candidate build
- **WHEN** apply exits
- **THEN** the prior target remains recoverable and no partial candidate is reported as committed

#### Scenario: US5 - Repeat or audit the import safely 1

- **GIVEN** a previously committed import with the same source fingerprint, mapping, policy, and target lineage
- **WHEN** it is replayed
- **THEN** it returns the original import and row mappings as an idempotent no-op

#### Scenario: US5 - Repeat or audit the import safely 2

- **GIVEN** the same source under a changed mapping or policy
- **WHEN** replay is attempted
- **THEN** it requires a new explicit plan and cannot silently reuse prior receipts
