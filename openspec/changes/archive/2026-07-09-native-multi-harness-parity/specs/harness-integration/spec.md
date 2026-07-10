# Harness Integration

## Requirements

### Requirement: Harness Adapters MUST Preserve One Host-Neutral Memory Lifecycle
OpenCode, Codex, and Claude Code integrations MUST translate supported host events into the same observable memory lifecycle outcomes for session enrollment, root-user prompt capture, recall guidance, compaction, and finalization. Equivalent lifecycle inputs with equivalent stable identity and memory availability MUST produce equivalent memory operations and outcome classifications regardless of harness.

#### Scenario: Equivalent supported events produce equivalent lifecycle outcomes
- GIVEN OpenCode, Codex, and Claude Code each expose a native event representing the same lifecycle intent
- AND each adapter receives the same stable project and root-session identity
- WHEN each adapter handles that event successfully
- THEN each adapter MUST request the same semantic memory operation
- AND each adapter MUST report an equivalent confirmed lifecycle outcome

#### Scenario: Harness-specific event data does not enter the memory contract
- GIVEN two harnesses encode equivalent lifecycle events with different native payload shapes
- WHEN their adapters normalize those events
- THEN the resulting memory request MUST use the harness-neutral project, session, content, and lifecycle semantics
- AND persisted memory MUST NOT require harness-specific fields to be read by another conforming client

### Requirement: Each Adapter MUST Expose an Explicit Capability Mapping
Each OpenCode, Codex, and Claude Code adapter MUST classify session enrollment, root-user prompt capture, recall guidance, compaction, and finalization as exactly one of `supported`, `degraded`, or `unsupported` for the detected host capability set. `supported` means a verified native trigger and the complete lifecycle operation are available; `degraded` means the operation remains available with an explicitly stated limitation; `unsupported` means no safe verified trigger or operation exists. An adapter MUST NOT simulate an unavailable native event or report its lifecycle effect as completed. Each handled lifecycle event MUST return exactly one outcome from `confirmed`, `failed`, `degraded`, or `no_op`; `failed` and `degraded` outcomes MUST include a safe reason and a `retryable` boolean.

#### Scenario: Supported capabilities identify their native trigger
- GIVEN a detected harness version exposes a native trigger for a lifecycle capability
- WHEN the adapter capability mapping is evaluated
- THEN that capability MUST be reported as supported
- AND handling the trigger MUST map to the corresponding host-neutral lifecycle intent

#### Scenario: Missing capability is explicit
- GIVEN a detected harness version does not expose a safe native trigger for compaction or finalization
- WHEN the adapter capability mapping is evaluated
- THEN the missing capability MUST be reported as `unsupported` with a reason
- AND the adapter MUST NOT fabricate the missing event or report the corresponding lifecycle operation as successful

#### Scenario: Unknown harness version fails closed
- GIVEN a harness version cannot be matched to a verified capability set
- WHEN the adapter starts
- THEN capabilities that cannot be proven MUST be reported as unsupported or degraded
- AND capabilities that remain safely available MAY continue without claiming full lifecycle parity

### Requirement: Automatic Prompt Capture MUST Persist Only Privacy-Safe Root-User Intent
Automatic capture MUST submit exactly one bounded and sanitized prompt-persistence operation for each genuine root-user prompt event whose post-sanitization content is non-empty and MUST submit zero prompt-persistence operations when sanitization removes all content. Stored-row cardinality MUST remain governed by `Store.savePrompt`: same-session byte-identical content within 30 seconds MUST resolve to one canonical prompt row, including intentional repetitions, and automatic capture MUST NOT promise a second row inside that window. It MUST exclude sub-agent prompts, generated handoffs, assistant output, tool scaffolding, tool results, and other agent-generated text. Valid private-tagged regions MUST be removed before persistence, and malformed private-tag input MUST be handled fail-closed so protected or ambiguous content is not stored. Sanitization MUST run before a hard maximum of 8,000 Unicode code points is applied; overlong content MUST submit the first 8,000 code points and MUST report truncation without echoing omitted content.

#### Scenario: Genuine root-user prompt is captured once
- GIVEN a host event is attributable to a genuine user message in the root session
- AND no same-session prompt row contains byte-identical sanitized content from the preceding 30 seconds
- WHEN automatic prompt capture succeeds
- THEN exactly one prompt-persistence operation MUST be submitted under the root session and project
- AND one new prompt row MUST be persisted
- AND its stored content MUST NOT exceed 8,000 Unicode code points after sanitization

#### Scenario: Intentional identical repetition inside the window reuses the canonical row
- GIVEN a genuine root-user prompt event has already resolved to a prompt row
- AND a distinct intentional prompt event in the same session has byte-identical sanitized content within 30 seconds
- WHEN automatic prompt capture handles the distinct event once
- THEN exactly one prompt-persistence operation MUST be submitted for that event
- AND `Store.savePrompt` MUST return the existing canonical prompt row
- AND automatic capture MUST NOT claim that a second row was created

#### Scenario: Intentional identical repetition after the window follows existing Store behavior
- GIVEN a genuine root-user prompt event resolved to a prompt row more than 30 seconds earlier
- AND a distinct intentional prompt event in the same session has byte-identical sanitized content
- WHEN automatic prompt capture handles the later event once
- THEN prompt persistence MAY create a new row according to existing `Store.savePrompt` behavior
- AND event identity MUST NOT independently force or forbid a new row

#### Scenario: Delegated or generated traffic is excluded
- GIVEN an event contains a sub-agent prompt, generated handoff, assistant message, tool scaffold, or tool result
- WHEN automatic prompt capture evaluates ownership
- THEN no user-prompt record MUST be persisted for that event

#### Scenario: Valid private content is removed
- GIVEN a genuine root-user prompt contains valid private-tagged content and public content
- WHEN automatic prompt capture sanitizes the prompt
- THEN the private-tagged content MUST NOT appear in the persisted record
- AND the remaining public content MAY be persisted within the configured bound

#### Scenario: Malformed private tags fail closed
- GIVEN a genuine root-user prompt contains malformed private-tag syntax whose protected extent is ambiguous
- WHEN automatic prompt capture sanitizes the prompt
- THEN the ambiguous protected region MUST NOT be persisted
- AND the capture outcome MUST indicate that privacy sanitization degraded or omitted content

#### Scenario: Fully private prompt creates no content leak
- GIVEN sanitization removes all meaningful content from a genuine root-user prompt
- WHEN automatic prompt capture completes
- THEN zero prompt records MUST be persisted for that event
- AND the outcome MUST NOT echo the removed private content

#### Scenario: Overlong sanitized prompt is truncated deterministically
- GIVEN a genuine root-user prompt contains more than 8,000 Unicode code points after privacy sanitization
- WHEN automatic prompt capture succeeds
- THEN exactly the first 8,000 sanitized Unicode code points MUST be persisted
- AND the outcome MUST report truncation without including the omitted content

### Requirement: Lifecycle Operations MUST Preserve Stable Root Session and Project Identity
Every lifecycle operation MUST preserve a non-empty explicit root `session_id` and project identity when supplied, MUST use the established deterministic identity-resolution contract when identity is absent, and MUST keep the effective identity stable across events and process restarts. Per-turn identifiers and sub-agent session identifiers MUST NOT replace the stable root identity.

#### Scenario: Explicit stable identity is propagated
- GIVEN the harness supplies a stable root session id and explicit project identity
- WHEN session enrollment, prompt capture, compaction, or finalization invokes memory
- THEN every operation MUST use those explicit identity values
- AND no derived or compatibility identity MUST replace them

#### Scenario: Missing identity degrades deterministically
- GIVEN a harness omits stable session or project identity
- WHEN an adapter invokes a lifecycle operation that requires identity
- THEN the existing identity resolver MUST derive or synthesize a deterministic effective identity
- AND the lifecycle outcome MUST identify the degraded field, source, and effective fallback value

#### Scenario: Sub-agent identity cannot take root ownership
- GIVEN a delegated event carries a sub-agent session identifier alongside root-session context
- WHEN the adapter evaluates prompt ownership or lifecycle state
- THEN the sub-agent identifier MUST NOT become the root session identity
- AND generated delegated content MUST NOT be persisted as a root-user prompt

### Requirement: Lifecycle State MUST Advance Only After Confirmed Memory Success
A lifecycle transition MUST be recorded as completed only after the corresponding memory operation returns confirmed success. A timeout, transport error, validation error, rejected response, or indeterminate result MUST leave the transition retryable and MUST NOT be treated as success.

#### Scenario: Failed session start remains retryable
- GIVEN root-session enrollment has not been confirmed
- WHEN the memory operation fails or returns an indeterminate result
- THEN lifecycle state MUST remain unenrolled or pending
- AND a later equivalent start event MUST retry enrollment

#### Scenario: Successful retry advances once
- GIVEN a previous lifecycle operation failed without advancing state
- WHEN a retry returns confirmed success
- THEN the lifecycle transition MUST advance exactly once
- AND later duplicate success events MUST NOT create an additional equivalent memory effect

#### Scenario: Failed finalization is not marked complete
- GIVEN a session finalization operation is attempted
- WHEN summary persistence or session finalization fails
- THEN the session MUST NOT be marked successfully finalized
- AND the failure outcome MUST remain visible for retry or manual recovery

### Requirement: Duplicate Events and Retries MUST Be Idempotent
Equivalent duplicate native events and retried delivery of an already confirmed lifecycle event MUST NOT create duplicate prompt-persistence operations, duplicate session enrollment, or duplicate terminal summaries. Event equivalence MUST use a stable native event or message id when available. Otherwise, it MUST use deterministic evidence containing the harness, stable project, root session, lifecycle intent, actor role, normalized sanitized content when applicable, and a host-stable timestamp or sequence. The timestamp or sequence MUST distinguish a later intentional repetition of identical prompt text for lifecycle handling, but event identity MUST NOT override `Store.savePrompt` row cardinality. If the host supplies neither a stable event id nor stable timestamp or sequence, cross-restart exactly-once handling MUST be reported as degraded and MUST NOT be claimed as confirmed.

#### Scenario: Duplicate prompt event persists one record
- GIVEN the same root-user prompt event is delivered more than once for the same project and root session
- WHEN automatic capture handles every delivery
- THEN exactly one prompt-persistence operation MUST be submitted for that event identity
- AND no repeated delivery MUST create an additional prompt row or lifecycle effect
- AND every duplicate handling outcome MUST indicate confirmed prior handling or a no-op

#### Scenario: Duplicate terminal event is a no-op
- GIVEN finalization for a root session has already been confirmed
- WHEN an equivalent terminal event is delivered again
- THEN no duplicate terminal summary MUST be persisted
- AND lifecycle state MUST remain finalized

#### Scenario: Missing stable event evidence degrades cross-restart idempotency
- GIVEN a harness supplies neither a stable event id nor a stable timestamp or sequence for prompt events
- WHEN the adapter evaluates duplicate protection across process restart
- THEN cross-restart exactly-once prompt handling MUST be reported as degraded
- AND the integration MUST NOT claim confirmed deduplication for those events

### Requirement: Restart Recovery MUST Preserve Confirmed State Without Inventing Success
After an adapter or host process restart, lifecycle handling MUST recover or re-establish enough bounded state to distinguish confirmed operations from pending or unknown operations. Recovery MUST rely on stable identity and confirmed durable evidence when available; missing evidence MUST produce a retryable or degraded outcome rather than assumed success.

#### Scenario: Confirmed prompt remains deduplicated after restart
- GIVEN a root-user prompt was confirmed persisted before process restart
- WHEN the host redelivers the equivalent prompt event after restart
- THEN the integration MUST NOT persist a duplicate prompt record
- AND the result MUST indicate prior confirmed handling or a no-op

#### Scenario: Unconfirmed operation is retried after restart
- GIVEN a lifecycle operation was pending or failed before process restart
- WHEN an equivalent event is received after restart
- THEN the integration MUST retry the operation or report explicit degradation
- AND it MUST NOT infer successful completion solely from pre-restart in-memory state

### Requirement: Compaction and Finalization Outcomes MUST Be Explicit and Retry-Safe
When a harness exposes compaction or finalization events, the adapter MUST attempt the corresponding bounded memory operation and MUST report confirmed, failed, or degraded outcome information. A failed operation MUST remain retryable, and an unavailable event MUST be represented through the capability mapping rather than silently omitted.

#### Scenario: Supported compaction is confirmed
- GIVEN a harness exposes a supported compaction event for an active root session
- WHEN the adapter completes the bounded compaction memory operation successfully
- THEN the outcome MUST identify compaction as confirmed
- AND subsequent duplicate compaction delivery MUST NOT create duplicate equivalent state

#### Scenario: Compaction failure remains visible
- GIVEN a supported compaction event occurs
- WHEN its memory operation fails
- THEN the outcome MUST identify compaction as failed with a safe reason
- AND compaction MUST remain eligible for retry

#### Scenario: Supported finalization completes once
- GIVEN a harness exposes a supported terminal event for an enrolled root session
- WHEN summary persistence and finalization are confirmed
- THEN the outcome MUST identify finalization as confirmed
- AND later equivalent terminal events MUST be idempotent no-ops

#### Scenario: Unsupported terminal event is not simulated
- GIVEN a harness exposes no verified terminal event
- WHEN adapter capabilities are reported
- THEN finalization MUST be identified as `unsupported` with a manual or fallback action when one exists
- AND the integration MUST NOT claim automatic finalization occurred

### Requirement: Degraded Lifecycle Operation MUST Be Operator-Visible and Non-Destructive
Any unsupported, failed, or partially available lifecycle capability MUST produce a bounded privacy-safe diagnostic identifying the harness, capability, outcome, reason, and available recovery action. Degradation MUST NOT disable unrelated supported memory operations, expose private prompt content, or report false success.

#### Scenario: One degraded capability does not disable supported capabilities
- GIVEN finalization is unsupported but session enrollment and prompt capture are supported
- WHEN the integration runs
- THEN finalization MUST be reported as degraded or unsupported
- AND supported enrollment and privacy-safe prompt capture MUST remain available

#### Scenario: Diagnostic omits sensitive content
- GIVEN a lifecycle failure involves a prompt containing private or secret-like content
- WHEN the integration reports the failure
- THEN the diagnostic MUST identify the failed capability and safe reason
- AND it MUST NOT include the raw prompt or removed private content

## Assumptions

- The host-neutral lifecycle intents are session enrollment, root-user prompt capture, recall guidance, compaction, and finalization; exact native event names remain adapter-boundary concerns.
- Capability support is proven from detected host behavior or a verified compatibility declaration. Unknown capabilities fail closed as unsupported or degraded.
- A genuine root-user prompt is an event attributable to the user role in the root execution context; delegated, assistant, tool, and generated traffic is not user intent even if it contains user-derived text.
- Prompt capture uses a hard post-sanitization maximum of 8,000 Unicode code points and retains the prefix; private-only content submits no prompt-persistence operation.
- Malformed private tags are handled fail-closed by omitting the ambiguous protected region rather than attempting permissive reconstruction.
- Capability classifications and lifecycle outcomes use the exact vocabularies defined above; adapters may add safe diagnostics but may not invent success-like states.
- Duplicate-event equivalence requires stable native identity or stable timestamp/sequence evidence; absence of both is an explicit degraded capability rather than a content-only deduplication guess.
- Event identity suppresses repeated delivery and repeated lifecycle effects only. `Store.savePrompt` remains authoritative for storage cardinality: intentional same-session byte-identical repeats inside 30 seconds share one canonical row, while a repeat after the window may create a row under existing behavior.
- No optional idempotency input, schema/storage/cardinality migration, public tool input expansion, or new HTTP semantics are introduced for prompt capture.
- Existing identity-resolver, privacy-sanitization, deduplication, and six-tool semantics remain authoritative and require no schema change.

## Handoff Hints

- Preserve one lifecycle outcome vocabulary and one state-transition contract across all three adapters.
- Keep capability detection and native event translation at adapter boundaries; unsupported events must remain explicit.
- Design prompt ownership tests with negative fixtures for every excluded traffic class and malformed-private-tag cases.
- Make every state mutation conditional on confirmed memory success and prove retry, duplicate, restart, compaction, and terminal sequences.
- Preserve the exact capability/outcome vocabularies, 8,000-code-point prompt rule, private-only zero-operation behavior, stable event-equivalence precedence, and the Store's 30-second canonical-row collapse.
- Design must test duplicate delivery separately from distinct intentional identical events inside and after the 30-second window, without adding a tool input or storage migration.
- Do not absorb agent orchestration, SDD routing, or sub-agent lifecycle behavior into the memory integration.
