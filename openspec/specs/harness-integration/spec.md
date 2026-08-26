# Harness Integration

## Requirements

### Requirement: Every Native Plugin MUST Bundle Hooks, MCP, and Skills

Each host bundle MUST continue to package its supported hooks, one registration path for the shared six-tool MCP server, and the same memory Skill, with no transitional product-generation wording or stale copied contract.

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

### Requirement: Runtime Lifecycle MUST Preserve the Core Contract

Start/resume recovery, root-prompt capture, compaction, finalization, and degraded diagnostics MUST use the shared unversioned lifecycle command and envelope while preserving identity, privacy, idempotency, temporal, and bounded-output behavior.

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

### Requirement: Root Session Identity MUST Be Verified and Host-Specific Only at the Adapter

OpenCode MUST resolve bounded current-session metadata through its native identity helper; Codex MUST use verified thread context; Claude MUST use official hook session identity. Delegated or ambiguous callers MUST NOT receive root authority.

#### Scenario: Delegated OpenCode caller requests identity

- **GIVEN** a child session with a resolvable parent chain
- **WHEN** the identity helper runs
- **THEN** it returns bounded metadata but denies root lifecycle authorization to the child

### Requirement: Automatic Capture MUST Remain Privacy-Safe and Minimal

Native hooks MAY capture privacy-filtered root-user prompts and explicit lifecycle checkpoints, but MUST NOT auto-persist assistant traffic, tool streams, subagent output, secrets, or private blocks.

#### Scenario: Prompt contains a private block

- **GIVEN** a root prompt containing public text and a private block
- **WHEN** capture runs
- **THEN** only the allowed bounded public portion can become immutable evidence

### Requirement: Model-Visible Recovery Context MUST Be Bounded and Source-Attributed

Confirmed recovery MUST inject at most one tagged bounded block containing complete source-attributed items and verified root identity where supported. Hook execution or delivery MUST NOT be reported as model consumption without real evidence.

#### Scenario: Recovered items exceed the host budget

- **GIVEN** several selected memories larger than the host output budget
- **WHEN** recovery renders
- **THEN** complete item boundaries are retained within the cap and truncation cannot fabricate partial metadata

### Requirement: Lifecycle Events MUST Be Idempotent and Truthful

Stable event keys MUST prevent duplicate capture or checkpoints across retry and restart. Receipts MUST distinguish hook execution, persistence confirmation, recovery delivery, and observed model consumption.

#### Scenario: Session-start hook is delivered twice

- **GIVEN** the same verified event key
- **WHEN** lifecycle processes it twice
- **THEN** authoritative state changes once and both responses report duplicate truth consistently

### Requirement: Native Failures MUST Degrade Without Blocking the Host Prompt

Child launch, timeout, nonzero exit, oversized output, invalid envelope, or unverifiable identity MUST produce bounded safe diagnostics, inject no unverified memory, and MUST NOT reject an otherwise valid host prompt.

#### Scenario: OpenCode Node lifecycle child fails

- **GIVEN** the Bun adapter cannot obtain a valid Node lifecycle envelope
- **WHEN** the host hook completes
- **THEN** the user prompt continues with no recovery block and one bounded diagnostic

### Requirement: Shared Skills MUST Preserve Semantic-Boundary Memory Practice

The packaged Skill MUST teach progressive recall, root identity ownership, privacy exclusions, and explicit durable handoff persistence at meaningful semantic boundaries using only the six MCP tools.

#### Scenario: Work reaches a reusable completion boundary

- **GIVEN** a verified durable decision or completed change
- **WHEN** the root agent follows the Skill before final response
- **THEN** it saves one concise evidence-backed handoff or truthfully reports that persistence was not confirmed
