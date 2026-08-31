# CLI

## Requirements

### Requirement: CLI MUST Provide Managed Setup for OpenCode, Codex, and Claude Code

The CLI MUST retain scoped managed setup and expose only the current commands `mcp`, `lifecycle`, and `import-legacy`; removed generation-labelled commands MUST remain unavailable without compatibility aliases.

#### Scenario: US2 - Treat the replacement architecture as the normal product base 1

- **GIVEN** a clean installation
- **WHEN** the MCP and native lifecycle paths execute
- **THEN** their public envelopes and commands use the current unversioned thoth-mem contract and persist to `memory.sqlite`

#### Scenario: US2 - Treat the replacement architecture as the normal product base 2

- **GIVEN** an invocation using a removed transitional command or namespace
- **WHEN** it reaches the current package
- **THEN** it fails explicitly instead of entering a compatibility shim

#### Scenario: US2 - Treat the replacement architecture as the normal product base 3

- **GIVEN** a legacy database selected for import
- **WHEN** the operator runs the current importer
- **THEN** `import-legacy` writes a distinct current database and preserves the source without describing the target as a replacement generation

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

The CLI MUST expose `setup`, `mcp`, `lifecycle`, and `import-legacy` and MUST reject removed generation-labelled commands without compatibility aliases.

#### Scenario: Invoke a removed command

- **GIVEN** a removed transitional command name
- **WHEN** it is passed to the current CLI
- **THEN** the CLI returns the deterministic unknown-command exit code and performs no durable operation

### Requirement: Legacy Import MUST Be Explicit and Non-Destructive

`import-legacy` MUST require distinct explicit source and target paths, read the source without mutation, write a clean current database, and emit bounded imported, skipped, quarantined, failed, and integrity results.

#### Scenario: Import a supported legacy database

- **GIVEN** a supported source and absent distinct target
- **WHEN** `import-legacy` completes
- **THEN** the source hash is unchanged and the target passes foreign-key, lineage, and FTS integrity checks
