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

OpenCode setup MUST own only exact thoth-mem plugin entries, the thoth-mem Skill tree, provider configuration fields, and its receipt. Codex and Claude Code setup MUST use their native managers. Managed Codex setup MUST add, inspect, install, enable or repair, verify, and roll back only marketplace `thoth-mem-codex` and plugin `thoth-mem@thoth-mem-codex`; managed Claude Code setup MUST do the same only for marketplace `thoth-mem-claude` and plugin `thoth-mem@thoth-mem-claude`; neither host setup may edit manager caches directly or delete legacy/unrelated state by name alone.

#### Scenario: US1 - Manage each native host identity safely 1

- **GIVEN** a Codex manager with no thoth-mem marketplace or plugin
- **WHEN** managed setup installs the package
- **THEN** it adds marketplace `thoth-mem-codex`, installs and verifies `thoth-mem@thoth-mem-codex`, and never edits the manager cache directly

#### Scenario: US1 - Manage each native host identity safely 2

- **GIVEN** a Claude Code manager with no thoth-mem marketplace or plugin
- **WHEN** managed setup installs the package
- **THEN** it adds marketplace `thoth-mem-claude`, installs and verifies `thoth-mem@thoth-mem-claude`, and never edits the manager cache directly

#### Scenario: US1 - Manage each native host identity safely 3

- **GIVEN** unrelated plugins, Skills, comments, and provider fields
- **WHEN** setup installs or repairs thoth-mem
- **THEN** unrelated state remains byte-identical

#### Scenario: US1 - Manage each native host identity safely 4

- **GIVEN** a real existing native installation
- **WHEN** this repository change is verified
- **THEN** no marketplace, plugin, cache, receipt, or home state is mutated without separate explicit authorization

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
