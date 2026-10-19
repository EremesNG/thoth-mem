# Delta for Tools

## ADDED Requirements

### Requirement: Native Integrations MUST Use Only the Existing MCP Tool Surface
OpenCode, Codex, and Claude Code lifecycle integrations MUST perform memory operations only through `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`. Session enrollment and lifecycle checkpoint/summary MUST use `mem_session`; root-user prompt and explicit observation persistence MUST use `mem_save`; compact/context recall and full-record escalation MUST use `mem_recall`, `mem_context`, and `mem_get`; project navigation or health MUST use `mem_project`. Native integration MUST NOT require direct storage access, a harness-specific memory tool, a legacy granular tool, or an admin/sync operation to satisfy lifecycle behavior.

#### Scenario: Session lifecycle uses existing tools
- GIVEN a native harness starts, compacts, or finalizes a root session
- WHEN its integration performs memory work
- THEN enrollment and lifecycle checkpoint/summary MUST use `mem_session`
- AND root-user prompt or explicit observation persistence MUST use `mem_save`
- AND recall or full-record escalation MUST use `mem_recall`, `mem_context`, or `mem_get` according to the requested tier
- AND it MUST NOT invoke a harness-specific MCP tool

#### Scenario: Project context uses existing tools
- GIVEN a native integration needs project-level memory context or health information
- WHEN it requests that information
- THEN it MUST use existing `mem_project`, `mem_context`, or `mem_recall` behavior as applicable
- AND it MUST NOT access storage through a new MCP surface

### Requirement: Native Integration MUST Preserve Existing Tool Request and Response Contracts
Multi-harness integration MUST NOT add a required field, remove an accepted field, rename an action, or incompatibly change the success, error, bounded-output, identity, privacy, or degraded-state behavior of any existing MCP tool. It MUST NOT add an optional prompt idempotency key, harness event field, or other public tool input to alter prompt-row cardinality. Harness capability, setup, and lifecycle-status diagnostics MUST be returned by adapter or CLI surfaces and MUST NOT be injected into existing MCP responses. Optional metadata already defined by an existing tool contract MAY continue independently of native integration.

#### Scenario: Existing client remains compatible
- GIVEN an MCP client uses the pre-change request shapes for all six tools
- WHEN the same requests run after native integrations are installed
- THEN the requests MUST remain valid
- AND their observable tool semantics MUST remain backward-compatible

#### Scenario: Integration does not create required harness fields
- GIVEN the same memory request can originate from OpenCode, Codex, Claude Code, or another conforming client
- WHEN an existing tool validates the request
- THEN no harness identifier or adapter-specific field MUST be required
- AND the request MUST remain expressible as the existing harness-agnostic contract

### Requirement: Native Integration MUST Preserve Storage and Retrieval Semantics
Installing or enabling a native integration MUST NOT change the SQLite schema, observation taxonomy, topic-key upsert behavior, sync-id deduplication, prompt-row cardinality behavior, retrieval lanes, ranking, bounds, graph semantics, or mirrored HTTP memory semantics. `Store.savePrompt` MUST remain authoritative: same-session byte-identical content received within 30 seconds MUST resolve to one canonical prompt row, including distinct intentional prompt events, and a byte-identical repeat after the window MAY create a new row under existing behavior. Native event/message identity MUST suppress repeated delivery and lifecycle effects but MUST NOT override this storage rule. For a fixed database, fixed configuration, and identical request, deterministic serialized tool output MUST be byte-for-byte equal before and after native integration enablement; fields already documented as volatile, such as a current execution timestamp, MAY differ only according to their pre-existing contract.

#### Scenario: Stored memory remains harness-independent
- GIVEN equivalent memory is saved with the same project, session, type, topic key, and content through two supported harnesses
- WHEN a conforming client retrieves those records
- THEN the records MUST follow the same existing storage and query semantics
- AND retrieval MUST NOT require knowledge of the originating harness

#### Scenario: Intentional identical prompts inside 30 seconds share one row
- GIVEN two distinct genuine prompt events in the same session contain byte-identical sanitized content within 30 seconds
- WHEN each event submits one existing `mem_save(kind='prompt')` operation
- THEN `Store.savePrompt` MUST resolve both operations to one canonical prompt row
- AND no event identity MUST force creation of a second row

#### Scenario: Identical prompt after 30 seconds follows existing behavior
- GIVEN a same-session prompt row was created more than 30 seconds earlier
- WHEN a distinct prompt event submits byte-identical content through existing `mem_save(kind='prompt')`
- THEN `Store.savePrompt` MAY create a new row according to its existing behavior
- AND the integration MUST NOT add a public input or HTTP semantic to force the outcome

#### Scenario: Retrieval behavior is unchanged by integration enablement
- GIVEN a fixed database and an existing `mem_recall`, `mem_context`, `mem_get`, or `mem_project` request
- WHEN the request runs before and after a native integration is enabled
- THEN deterministic serialized output MUST be byte-for-byte equal for the fixed fixture
- AND any pre-existing volatile field MAY differ only as already documented by its existing contract
- AND lane selection, ranking, bounds, source attribution, and degraded-state semantics MUST remain governed by the existing retrieval contracts
- AND integration enablement MUST NOT claim or introduce a retrieval behavior change

#### Scenario: Existing identity behavior remains authoritative
- GIVEN a tool request supplies explicit project and session identity or requires deterministic fallback
- WHEN it is issued through any native harness
- THEN the existing identity-preservation and degraded-fallback rules MUST apply
- AND the adapter MUST NOT substitute a harness-local identity policy

## MODIFIED Requirements

### Requirement: MCP Surface MUST Be Compact and Workflow-Level
The MCP server MUST continue to expose exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session` after OpenCode, Codex, and Claude Code integrations are installed. This change MUST NOT add, remove, rename, or split an MCP tool, and setup, capability inspection, hook administration, marketplace registration, rollback, and packaging operations MUST remain outside the MCP registry.

#### Scenario: Registry remains exactly six tools
- GIVEN any supported native integration is installed or enabled
- WHEN a client lists MCP tools
- THEN exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session` MUST be registered
- AND no harness-specific integration tool MUST appear

#### Scenario: Setup and administration stay outside MCP
- GIVEN an operator needs setup, rollback, capability detection, marketplace registration, plugin installation, package validation, or sync administration
- WHEN the supported operational surface is used
- THEN those actions MUST remain on CLI, harness, package, HTTP, or documentation surfaces as already appropriate
- AND they MUST NOT expand the MCP registry

## REMOVED Requirements

## Assumptions

- The existing six tools already express every memory operation required by the lifecycle contract; native adapters translate events but do not create a seventh workflow.
- Harness setup and hook diagnostics are operational concerns, not memory-tool actions.
- No schema, taxonomy, retrieval, ranking, sync, graph, HTTP-memory, or existing tool-shape change is necessary for native integration.
- Existing identity, privacy, bounded-output, and degraded-state contracts remain authoritative when an adapter calls a tool.
- Lifecycle-to-tool mapping is fixed as defined above; harness diagnostics stay outside MCP responses.
- Fixed-input parity means byte-for-byte deterministic output equality, excluding only fields already documented as volatile before this change.
- Existing prompt cardinality is authoritative: one canonical row for same-session byte-identical content inside 30 seconds, including intentional repetitions; event identity controls delivery/effects, not stored-row count.
- No optional idempotency input, schema/storage/cardinality migration, public tool input expansion, or new HTTP semantic is permitted by this change.

## Handoff Hints

- Preserve the exact six-name registry assertion in design, implementation tasks, and packed-artifact smoke tests.
- Keep adapters on public tool contracts and do not couple them to Store internals or harness-specific persistence fields.
- Reuse existing identity, privacy, deduplication, and retrieval behavior rather than reimplementing it in adapters.
- Add regression evidence that enabling each integration leaves fixed-input tool and retrieval behavior unchanged.
- Preserve the explicit lifecycle-to-tool mapping, adapter-side diagnostic boundary, and deterministic byte-for-byte parity rule.
- Preserve and test the 30-second canonical prompt-row collapse independently from adapter event-delivery deduplication; do not add an idempotency input or storage migration.
