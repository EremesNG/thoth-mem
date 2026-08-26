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

Native integrations MAY automatically capture only verified non-synthetic root prompts, bounded pre-compaction checkpoints, authoritative handoff/finalization payloads, and lifecycle receipts. They MUST NOT automatically persist assistant reasoning, arbitrary tool streams or filesystem content, delegated/subagent output, secrets, complete transcripts, or explicit private blocks. Explicit private blocks and deterministically recognizable credential forms MUST be removed or replaced before persisted content and idempotency hashes are derived.

#### Scenario: US1 - Preserve evidence without promoting noise 1

- **GIVEN** a verified root user prompt
- **WHEN** a native capture hook runs
- **THEN** one idempotent privacy-filtered evidence record is committed and no promoted memory is invented

#### Scenario: US1 - Preserve evidence without promoting noise 2

- **GIVEN** an explicit durable decision, corrected failure, convention, project structure fact, preference, or handoff with supporting evidence
- **WHEN** the root agent saves at a semantic boundary
- **THEN** one typed memory is linked to evidence and its current/history semantics remain explicit

#### Scenario: US1 - Preserve evidence without promoting noise 3

- **GIVEN** assistant traffic, arbitrary tool input/output, delegated-agent output, a private block, or an unverifiable caller
- **WHEN** native capture is considered
- **THEN** it is excluded or fails closed without being presented as verified root memory

#### Scenario: US1 - Preserve evidence without promoting noise 4

- **GIVEN** a bounded host-provided pre-compaction continuation payload
- **WHEN** checkpoint capture runs
- **THEN** immutable checkpoint evidence and at most one source-linked current session handoff are committed without invoking an additional model

### Requirement: Model-Visible Recovery Context MUST Be Bounded and Source-Attributed

Confirmed recovery MUST inject at most one tagged block within the host cap, preserve complete fixed metadata, allocate non-trivial useful content before optional headings/metadata, include only complete selected memory IDs for progressive fetch, omit supporting evidence IDs even when they appear inside selected title/content data, and delimit recovered memory as untrusted data that cannot override current system, developer, or user instructions. A metadata-heavy candidate MUST be omitted when abundant source content exists but the complete metadata would make the 50% useful-content threshold impossible.

#### Scenario: US2 - Resume from actionable context 1

- **GIVEN** a current handoff containing an objective, completed work, first pending action, blockers, archive path, and key checks
- **WHEN** session-start or post-compaction recovery runs
- **THEN** the newest current handoff is considered before generic project guidance and the hidden pending action survives rendering

#### Scenario: US2 - Resume from actionable context 2

- **GIVEN** more candidate memories than fit the host cap
- **WHEN** the continuation capsule is assembled
- **THEN** it selects fewer useful items instead of allocating trivial fragments across every candidate

#### Scenario: US2 - Resume from actionable context 3

- **GIVEN** a selected memory with provenance
- **WHEN** host-visible context renders
- **THEN** it contains a complete memory ID for `mem_get`, omits evidence IDs, identifies the content as untrusted data, and never truncates fixed metadata into a fabricated reference

#### Scenario: US2 - Resume from actionable context 4

- **GIVEN** no useful eligible memory or a degraded lifecycle child
- **WHEN** recovery runs
- **THEN** the host prompt continues with verified identity only or no block, bounded diagnostics, and no claim that the model consumed memory

### Requirement: Lifecycle Events MUST Be Idempotent and Truthful

Stable event keys MUST make capture, checkpoint promotion, start recovery, and post-compaction recovery idempotent across retry/restart. Results MUST report hook execution, memory confirmation, context delivery, and model consumption separately; delivery MUST be false when only identity or an unusable empty capsule is produced.

#### Scenario: US1 - Preserve evidence without promoting noise 1

- **GIVEN** a verified root user prompt
- **WHEN** a native capture hook runs
- **THEN** one idempotent privacy-filtered evidence record is committed and no promoted memory is invented

#### Scenario: US1 - Preserve evidence without promoting noise 2

- **GIVEN** an explicit durable decision, corrected failure, convention, project structure fact, preference, or handoff with supporting evidence
- **WHEN** the root agent saves at a semantic boundary
- **THEN** one typed memory is linked to evidence and its current/history semantics remain explicit

#### Scenario: US1 - Preserve evidence without promoting noise 3

- **GIVEN** assistant traffic, arbitrary tool input/output, delegated-agent output, a private block, or an unverifiable caller
- **WHEN** native capture is considered
- **THEN** it is excluded or fails closed without being presented as verified root memory

#### Scenario: US1 - Preserve evidence without promoting noise 4

- **GIVEN** a bounded host-provided pre-compaction continuation payload
- **WHEN** checkpoint capture runs
- **THEN** immutable checkpoint evidence and at most one source-linked current session handoff are committed without invoking an additional model

#### Scenario: US2 - Resume from actionable context 1

- **GIVEN** a current handoff containing an objective, completed work, first pending action, blockers, archive path, and key checks
- **WHEN** session-start or post-compaction recovery runs
- **THEN** the newest current handoff is considered before generic project guidance and the hidden pending action survives rendering

#### Scenario: US2 - Resume from actionable context 2

- **GIVEN** more candidate memories than fit the host cap
- **WHEN** the continuation capsule is assembled
- **THEN** it selects fewer useful items instead of allocating trivial fragments across every candidate

#### Scenario: US2 - Resume from actionable context 3

- **GIVEN** a selected memory with provenance
- **WHEN** host-visible context renders
- **THEN** it contains a complete memory ID for `mem_get`, omits evidence IDs, identifies the content as untrusted data, and never truncates fixed metadata into a fabricated reference

#### Scenario: US2 - Resume from actionable context 4

- **GIVEN** no useful eligible memory or a degraded lifecycle child
- **WHEN** recovery runs
- **THEN** the host prompt continues with verified identity only or no block, bounded diagnostics, and no claim that the model consumed memory

### Requirement: Native Failures MUST Degrade Without Blocking the Host Prompt

Child launch, timeout, nonzero exit, oversized output, invalid envelope, or unverifiable identity MUST produce bounded safe diagnostics, inject no unverified memory, and MUST NOT reject an otherwise valid host prompt.

#### Scenario: OpenCode Node lifecycle child fails

- **GIVEN** the Bun adapter cannot obtain a valid Node lifecycle envelope
- **WHEN** the host hook completes
- **THEN** the user prompt continues with no recovery block and one bounded diagnostic

### Requirement: Shared Skills MUST Preserve Semantic-Boundary Memory Practice

The shared Skill MUST define the durable promotion test, the content required for each current memory kind, explicit failure/outcome preservation, topic supersession, privacy exclusions, progressive recall, and a root-owned handoff containing objective, completed work, first pending action, blockers, and key files/checks.

#### Scenario: US1 - Preserve evidence without promoting noise 1

- **GIVEN** a verified root user prompt
- **WHEN** a native capture hook runs
- **THEN** one idempotent privacy-filtered evidence record is committed and no promoted memory is invented

#### Scenario: US1 - Preserve evidence without promoting noise 2

- **GIVEN** an explicit durable decision, corrected failure, convention, project structure fact, preference, or handoff with supporting evidence
- **WHEN** the root agent saves at a semantic boundary
- **THEN** one typed memory is linked to evidence and its current/history semantics remain explicit

#### Scenario: US1 - Preserve evidence without promoting noise 3

- **GIVEN** assistant traffic, arbitrary tool input/output, delegated-agent output, a private block, or an unverifiable caller
- **WHEN** native capture is considered
- **THEN** it is excluded or fails closed without being presented as verified root memory

#### Scenario: US1 - Preserve evidence without promoting noise 4

- **GIVEN** a bounded host-provided pre-compaction continuation payload
- **WHEN** checkpoint capture runs
- **THEN** immutable checkpoint evidence and at most one source-linked current session handoff are committed without invoking an additional model
