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

The Codex adapter MUST derive lifecycle event identity from documented host-stable evidence without requiring an undocumented `event_id`; turn-scoped events MUST require `turn_id` for confirmed identity, session-start events MUST use stable session, source, and lifecycle intent evidence, and session finalization MUST use documented `SessionEnd` evidence rather than `Stop`.

#### Scenario: US1 - Accept documented Codex lifecycle payloads 1

- **GIVEN** a documented `SessionStart` payload containing `session_id`, `cwd`, `hook_event_name`, `model`, `permission_mode`, and `source`
- **WHEN** the Codex adapter normalizes `startup`, `resume`, or `clear`
- **THEN** it produces a stable recovery request without requiring `event_id`; `compact` produces the post-compaction recovery intent

#### Scenario: US1 - Accept documented Codex lifecycle payloads 2

- **GIVEN** a turn-scoped Codex event with `turn_id`
- **WHEN** the adapter derives retry identity
- **THEN** repeated delivery resolves to the same event key and a later distinct turn resolves to a different key

#### Scenario: US1 - Accept documented Codex lifecycle payloads 3

- **GIVEN** a lifecycle event with no host-stable id, timestamp, sequence, or documented equivalent
- **WHEN** the adapter evaluates cross-restart idempotency
- **THEN** it reports degradation instead of inventing confirmed exactly-once behavior

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
In addition to the existing compaction contract, automatic terminal
finalization MUST remain strictly capability-gated per harness. A terminal
summary or finalization operation MUST occur only when a verified terminal
trigger and required identity/payload evidence are available. No OpenCode,
Codex, or Claude Code signal MUST be treated as a universal terminal guarantee.
An absent, ambiguous, or version-unproven terminal signal MUST report degraded
or unsupported capability with a safe recovery action while preserving
unrelated supported lifecycle operations. When a harness exposes compaction or
finalization events, the adapter MUST attempt the corresponding bounded memory
operation and MUST report confirmed, failed, or degraded outcome information.
A failed operation MUST remain retryable, and an unavailable event MUST be
represented through the capability mapping rather than silently omitted.

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

#### Scenario: Unproven terminal signal does not finalize the session
- GIVEN a harness emits a stop-like or cleanup-like signal without a verified
  terminal capability mapping
- WHEN the adapter evaluates finalization
- THEN it MUST NOT persist or report automatic finalization as confirmed
- AND it MUST preserve other supported session, recovery, compaction, and
  passive-learning capabilities

### Requirement: Runtime Activation MUST Be Evidenced Separately From Asset Installation

A Codex lifecycle capability MUST be classified as active only when the current documented payload is accepted, the installed runner executes, memory confirms the operation, and any recovery context is emitted through the documented Codex output channel.

#### Scenario: US1 - Accept documented Codex lifecycle payloads 1

- **GIVEN** a documented `SessionStart` payload containing `session_id`, `cwd`, `hook_event_name`, `model`, `permission_mode`, and `source`
- **WHEN** the Codex adapter normalizes `startup`, `resume`, or `clear`
- **THEN** it produces a stable recovery request without requiring `event_id`; `compact` produces the post-compaction recovery intent

#### Scenario: US1 - Accept documented Codex lifecycle payloads 2

- **GIVEN** a turn-scoped Codex event with `turn_id`
- **WHEN** the adapter derives retry identity
- **THEN** repeated delivery resolves to the same event key and a later distinct turn resolves to a different key

#### Scenario: US1 - Accept documented Codex lifecycle payloads 3

- **GIVEN** a lifecycle event with no host-stable id, timestamp, sequence, or documented equivalent
- **WHEN** the adapter evaluates cross-restart idempotency
- **THEN** it reports degradation instead of inventing confirmed exactly-once behavior

### Requirement: Model-Visible Recovery Context MUST Be Bounded and Capability-Gated

Confirmed automatic recovery MUST render only canonical, bounded, source-attributed items from the shared lifecycle result; the host-visible budget MUST be allocated at item boundaries so a long leading item cannot consume the complete content allowance while later selected items fit only outside the final block; an invalid envelope MUST inject no memory and MUST remain distinguishable from successful context delivery and model consumption.

#### Scenario: US3 - Deliver automatic OpenCode recovery through the strict shared contract 1

- **GIVEN** a project with canonical current memories
- **WHEN** OpenCode invokes `experimental.chat.system.transform` for a verified root session
- **THEN** the Node lifecycle envelope passes the shared taxonomy validator and the bounded tagged recovery block contains source-attributed context

#### Scenario: US3 - Deliver automatic OpenCode recovery through the strict shared contract 2

- **GIVEN** Node returns an envelope with a non-canonical recovery item
- **WHEN** the Bun-side client validates it
- **THEN** it rejects the envelope, emits a bounded reason-specific diagnostic, injects no unverified memory, and does not reject the user's prompt

#### Scenario: US3 - Deliver automatic OpenCode recovery through the strict shared contract 3

- **GIVEN** a fresh real OpenCode session and a marker absent from the user prompt
- **WHEN** the model is instructed not to call tools, MCP, or Skills
- **THEN** it can return the marker from automatic context and the export contains no thoth-mem tool calls

### Requirement: Verified Compaction MUST Checkpoint Before Post-Compaction Guidance
For a verified compaction event, the integration MUST request the existing
session checkpoint operation before it delivers post-compaction recovery
guidance. It MUST commit compaction state only after the checkpoint confirms.
When the host also has a verified post-compaction injection capability, the
integration MUST deliver bounded recovery guidance to the resumed model. A
failed checkpoint or delivery MUST remain retryable and visible; an unavailable
injection capability MUST not fabricate guidance or erase the checkpoint result.

#### Scenario: Confirmed compaction delivers ordered recovery
- GIVEN a harness supplies a verified compaction event and post-compaction
  injection capability for an active root session
- WHEN the checkpoint operation confirms
- THEN the integration MUST record the confirmed checkpoint before recovery
  guidance is delivered
- AND it MUST deliver bounded post-compaction guidance through the verified host
  mechanism

#### Scenario: Failed checkpoint remains retryable
- GIVEN a verified compaction event occurs
- WHEN the checkpoint memory operation fails or is indeterminate
- THEN the integration MUST NOT mark compaction as completed
- AND it MUST return a retryable failed or degraded outcome without delivering
  a success-like post-compaction result

### Requirement: Runtime Lifecycle MUST Preserve the V2 Core Contract

Start/resume recovery, prompt capture, compaction, finalization, and degraded diagnostics MUST use the shared v2 identity, privacy, idempotency, temporal, and bounded-output contracts without direct storage access.

#### Scenario: US1 - Resume useful project context in any supported coding agent 1

- **GIVEN** a project with prior durable memories and a supported host version
- **WHEN** a root session starts or resumes
- **THEN** the plugin supplies bounded, source-attributed recovery context through the shared lifecycle contract

#### Scenario: US1 - Resume useful project context in any supported coding agent 2

- **GIVEN** a host event that cannot be mapped safely
- **WHEN** the event is received
- **THEN** the plugin reports that capability as degraded without inventing success or disabling explicit MCP memory operations

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

### Requirement: Hidden Codex Manager Residue MUST NOT Equal Registered State

Exact global/user marketplace and enabled-plugin inspection is the sole authority for Codex native state. Hidden/cache/temporary residue, command text, exit code, or state from another home MUST NOT prove registration or ownership; project-scoped setup and cross-scope project/global verification are removed from the first product.

#### Scenario: US2 - Distribute Codex and Claude through their native managers 1

- **GIVEN** a supported Codex manager
- **WHEN** the user registers `EremesNG/thoth-mem` and installs `thoth-mem@thoth-mem`
- **THEN** Codex resolves one enabled native plugin and starts its exact six-tool MCP and lifecycle hooks without a private descriptor edit

#### Scenario: US2 - Distribute Codex and Claude through their native managers 2

- **GIVEN** the repository Claude marketplace and no paid model session
- **WHEN** strict validation and isolated packed smoke run
- **THEN** the manager-visible structure, hooks, MCP, Skill, runtime, and data binding can pass while real model consumption remains explicitly unobserved

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

### Requirement: Codex Orphan Residue Classification MUST Require Corroborated Safe Evidence
Setup MAY classify the reproduced stale pre-registration marketplace-residue condition only when bounded redacted command evidence identifies the expected thoth-mem marketplace collision and the exact selected-scope marketplace list independently proves the expected marketplace absent. The classification MUST identify the selected scope and logical manager location without exposing a user-specific absolute home path. A name, path, hidden entry, temporary directory, source-like string, or failure message alone MUST NOT be sufficient. Conflicting scope, source provenance, containment, link, or concurrent-manager evidence MUST leave the condition unclassified and fail closed.

This classification MUST describe a blocker and MUST NOT grant ownership or cleanup authority. When the evidence is insufficient, setup MUST report a generic unverified manager failure with safe inspection guidance rather than guessing that the reproduced orphan condition exists.

#### Scenario: Collision plus exact absence classifies stale residue
- GIVEN a bounded redacted marketplace-add diagnostic identifies the expected thoth-mem different-source collision
- AND the exact selected-scope marketplace list proves `EremesNG/thoth-mem` absent
- AND no conflicting scope, provenance, containment, link, or concurrent-manager evidence is observed
- WHEN setup classifies the failure
- THEN it MAY classify stale pre-registration manager residue
- AND it MUST still classify the marketplace as unregistered and ownership as unproven

#### Scenario: Temporary path alone is insufficient
- GIVEN a path named `.codex/.tmp/marketplaces/thoth-mem` exists
- BUT the corresponding safe command collision and exact selected-scope absence are not both available
- WHEN setup classifies manager evidence
- THEN it MUST NOT classify the reproduced orphan condition
- AND it MUST NOT infer that thoth-mem or the current setup attempt owns the path

#### Scenario: Collision message alone is insufficient
- GIVEN a command diagnostic resembles the expected different-source collision
- BUT exact selected-scope marketplace output is unavailable, malformed, or verifies a marketplace
- WHEN setup classifies manager evidence
- THEN it MUST NOT use the diagnostic as proof of an orphan or registered state
- AND it MUST report the verification limitation safely

#### Scenario: Divergent provenance or unsafe path evidence fails closed
- GIVEN residue evidence points outside the selected Codex home, resolves through a link or reparse point, names divergent source provenance, or may be changing under concurrent Codex activity
- WHEN setup evaluates stale-residue classification
- THEN it MUST keep ownership and reconciliation authority unproven
- AND it MUST perform zero direct cleanup

### Requirement: Codex Orphan Reconciliation MUST Be Supported, Scoped, and Fail Closed
Setup MAY automatically reconcile classified orphan residue only through a tested Codex-supported manager operation that is explicitly available for the selected scope and whose pre-state and post-state can be independently verified through exact manager lists. Before invoking that operation, setup MUST prove the required classification evidence and MUST durably checkpoint the reconciliation decision. After invocation, it MUST reread exact selected-scope state and MUST continue only from that verified result.

Setup MUST NOT directly delete, rename, rewrite, or repair Codex-owned temporary checkouts, cache, configuration, marketplace state, plugin state, or unrelated manager content. A path, name, error message, `--force`, or prior thoth-mem setup receipt MUST NOT create such direct cleanup authority. When a supported mechanism, sufficient evidence, containment, source provenance, or exclusive manager state cannot be proven, setup MUST perform zero automatic cleanup and MUST return precise `requires_user_action` guidance. That guidance MUST identify the selected scope, affected capability, logical residue condition, exact-list absence or limitation, and safe rerun or inspection action without exposing secrets, raw configuration, unrelated manager entries, or a user-specific absolute home path.

#### Scenario: No supported reconciliation returns user action
- GIVEN stale pre-registration residue is safely classified
- AND no tested selected-scope Codex manager operation can reconcile it with exact pre-state and post-state verification
- WHEN setup handles the blocker
- THEN it MUST return `requires_user_action`
- AND it MUST perform zero direct temporary, cache, configuration, marketplace, or plugin cleanup
- AND its manual action MUST identify the selected scope, logical residue, verification result, and safe rerun boundary

#### Scenario: Supported manager reconciliation remains verification-gated
- GIVEN stale residue is safely classified
- AND a tested Codex-supported reconciliation operation is advertised for the selected scope
- AND its preconditions and exact pre-state are verified and durably checkpointed
- WHEN setup invokes the supported operation
- THEN setup MUST use Codex rather than direct filesystem cleanup
- AND it MUST durably checkpoint the attempt and exact post-state reread before continuing
- AND it MUST NOT report success unless the requested final manager state verifies exactly

#### Scenario: Force cannot create cleanup authority
- GIVEN stale or ambiguous manager residue blocks setup
- WHEN setup runs with `--force`
- THEN `--force` MUST NOT authorize direct deletion, renaming, rewriting, ownership inference, or an unverified manager command
- AND setup MUST return the same evidence-based safe reconciliation or user-action outcome

#### Scenario: Concurrent or escaped residue blocks automatic reconciliation
- GIVEN a supported operation exists but the relevant residue may be changing concurrently or its normalized or resolved location is not contained within the selected Codex home
- WHEN setup evaluates reconciliation safety
- THEN it MUST NOT invoke automatic reconciliation
- AND it MUST return `requires_user_action` with zero direct cleanup

#### Scenario: Reconciliation failure does not activate legacy ownership
- GIVEN `plugin_manager` was selected and a supported reconciliation attempt fails or remains unverified
- WHEN setup derives the ownership strategy and result
- THEN it MUST retain `plugin_manager` for that attempt
- AND it MUST NOT copy legacy assets or add legacy activation configuration

### Requirement: Codex Setup Capability Mapping MUST Select Exactly One Ownership Strategy

Codex setup MUST select `plugin_manager` only when exact manager mutation and verification capabilities are available; otherwise it MUST return a non-mutating unsupported or requires-user-action result. The removed `legacy_filesystem` strategy MUST NOT be selected or emulated.

#### Scenario: US2 - Distribute Codex and Claude through their native managers 1

- **GIVEN** a supported Codex manager
- **WHEN** the user registers `EremesNG/thoth-mem` and installs `thoth-mem@thoth-mem`
- **THEN** Codex resolves one enabled native plugin and starts its exact six-tool MCP and lifecycle hooks without a private descriptor edit

#### Scenario: US2 - Distribute Codex and Claude through their native managers 2

- **GIVEN** the repository Claude marketplace and no paid model session
- **WHEN** strict validation and isolated packed smoke run
- **THEN** the manager-visible structure, hooks, MCP, Skill, runtime, and data binding can pass while real model consumption remains explicitly unobserved

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

### Requirement: Codex Manager State Verification MUST Be Exact and Fail Closed
Codex setup MUST verify marketplace and plugin state independently for the selected scope. When a list command advertises structured JSON, verification MUST use that command's JSON output and MUST require its expected schema, exact marketplace identity and Git provenance, and exact installed-and-enabled plugin identity. When JSON is not advertised for a list command, verification MAY use only a recognized strict legacy format for that command. Malformed or unexpected advertised JSON MUST fail closed and MUST NOT fall back to textual substring matching.

#### Scenario: JSON capability is selected independently per command
- GIVEN the marketplace list command advertises JSON
- AND the plugin list command does not advertise JSON
- WHEN setup builds independent verification operations
- THEN marketplace verification MUST request and validate JSON
- AND plugin verification MUST use only its recognized legacy format

#### Scenario: Exact structured marketplace state verifies
- GIVEN structured marketplace output contains the expected marketplace name
- AND its provenance is the canonical thoth-mem Git repository in an accepted canonical URL form
- WHEN marketplace state is verified
- THEN the marketplace operation MUST be classified as verified

#### Scenario: Exact structured plugin state verifies
- GIVEN structured plugin output contains the exact thoth-mem plugin id, plugin name, and marketplace name
- AND that entry is both installed and enabled
- WHEN plugin state is verified
- THEN the plugin operation MUST be classified as verified

#### Scenario: Malformed advertised JSON fails closed
- GIVEN a list command advertises JSON
- AND its returned JSON is malformed or does not contain the expected schema
- WHEN setup verifies the corresponding state
- THEN verification MUST remain unconfirmed
- AND setup MUST NOT reinterpret that output using the legacy text verifier

#### Scenario: Lookalike identities are rejected
- GIVEN list output contains a repository, marketplace, or plugin identifier that only prefixes, suffixes, or resembles the expected identity
- WHEN setup verifies Codex manager state
- THEN verification MUST remain unconfirmed
- AND the lookalike MUST NOT establish ownership or successful installation

### Requirement: Unproven Codex Ownership Evidence MUST Be Explicit and Non-Destructive
Unknown, degraded, malformed, or conflicting Codex ownership evidence MUST produce bounded operator-visible diagnostics and MUST NOT be treated as successful manager state or proof of thoth-owned legacy state. Diagnostics MUST identify the affected capability or ownership location and safe recovery action without including credentials, raw configuration, unrelated plugin/cache contents, or unbounded command output.

#### Scenario: Ambiguous legacy ownership causes zero removal
- GIVEN a legacy-looking asset or config entry lacks sufficient receipt, marker, metadata, and stable content evidence
- WHEN setup evaluates migration ownership
- THEN it MUST classify the legacy state as ambiguous
- AND it MUST remove or overwrite none of that state

#### Scenario: Verification diagnostic remains bounded and private
- GIVEN Codex verification fails while command output or configuration contains unrelated or secret values
- WHEN setup reports the failure
- THEN the diagnostic MUST identify only the failed capability, safe reason, and recovery action
- AND it MUST NOT include the secret values, raw config, or unrelated plugin/cache entries

#### Scenario: One unavailable manager capability does not imply false success
- GIVEN marketplace state is verified
- AND plugin installation or enablement remains unavailable or unverified
- WHEN setup derives the ownership outcome
- THEN it MUST NOT report the modern installation as complete
- AND it MUST preserve each independently supported operation and report the unresolved capability

### Requirement: Shared Skills MUST Route to One Host-Specific Lifecycle Contract

Packaged OpenCode, Codex, and Claude Skills MUST document their distinct authoritative sources and rejected substitutes: OpenCode prioritizes `thoth_mem_root_identity`; Codex prioritizes injected verified identity then targeted `CODEX_THREAD_ID` with only an unambiguous current-task cross-check; Claude prioritizes injected identity or official hook `session_id` plus `cwd` and MUST NOT invent `CLAUDE_SESSION_ID`. Canonical and distributed copies MUST remain synchronized.

#### Scenario: US5 - Recover the verified root identity in every native host 1

- **GIVEN** an OpenCode root or delegated session
- **WHEN** `thoth_mem_root_identity` runs
- **THEN** it returns the bounded versioned identity contract, resolves at most 16 parent links with cycle detection, grants lifecycle authorization only to the root caller, performs no memory dispatch, and does not change the six MCP tools

#### Scenario: US5 - Recover the verified root identity in every native host 2

- **GIVEN** Codex or Claude lifecycle recovery has accepted native `session_id` and project context
- **WHEN** host output is produced
- **THEN** it includes the complete verified identity before bounded memory context; Codex may use its documented root-agent fallback and Claude invents no environment fallback

#### Scenario: US5 - Recover the verified root identity in every native host 3

- **GIVEN** identity is absent, delegated, malformed, ambiguous, or too large for bounded output
- **WHEN** the integration cannot prove the root
- **THEN** it fails closed without inventing continuity or emitting a partial identity

### Requirement: Codex identity procedure

The Codex reference MUST prioritize a verified model-visible identity block, define `CODEX_THREAD_ID` as the explicit root-agent recovery check, permit current-thread inventory only as an unambiguous cross-check, map the resolved ID to `mem_session.id` and other tools' `session_id`, and distinguish the project name from Codex's saved-project ID.

#### Scenario: US1 - Resolve identity in the active harness 1

- **GIVEN** a root agent running in Codex
- **WHEN** no verified identity block is already visible
- **THEN** the guide directs it to check `CODEX_THREAD_ID`, optionally cross-check an unambiguous current thread, derive the project consistently, and reject turn, agent, tool, shell-session, and Codex saved-project identifiers

#### Scenario: US1 - Resolve identity in the active harness 2

- **GIVEN** a root agent running in Claude Code or OpenCode
- **WHEN** it needs stable identity
- **THEN** it reads only that harness reference and uses verified native lifecycle identity before any documented manual fallback

#### Scenario: US1 - Resolve identity in the active harness 3

- **GIVEN** an unsupported or ambiguous identity source
- **WHEN** the agent cannot prove root identity
- **THEN** it reports degradation and does not invent continuity

### Requirement: Claude Code identity procedure

The Claude Code reference MUST identify the verified native `session_id` and `cwd` lifecycle fields, reuse model-visible verified identity when present, and forbid invented environment-variable or nearby-ID fallbacks.

#### Scenario: US1 - Resolve identity in the active harness 1

- **GIVEN** a root agent running in Codex
- **WHEN** no verified identity block is already visible
- **THEN** the guide directs it to check `CODEX_THREAD_ID`, optionally cross-check an unambiguous current thread, derive the project consistently, and reject turn, agent, tool, shell-session, and Codex saved-project identifiers

#### Scenario: US1 - Resolve identity in the active harness 2

- **GIVEN** a root agent running in Claude Code or OpenCode
- **WHEN** it needs stable identity
- **THEN** it reads only that harness reference and uses verified native lifecycle identity before any documented manual fallback

#### Scenario: US1 - Resolve identity in the active harness 3

- **GIVEN** an unsupported or ambiguous identity source
- **WHEN** the agent cannot prove root identity
- **THEN** it reports degradation and does not invent continuity

### Requirement: OpenCode identity procedure

The OpenCode reference MUST identify the verified root session fields and project/worktree context used by the native adapter, reject delegated session identity, and forbid invented environment-variable or nearby-ID fallbacks.

#### Scenario: US1 - Resolve identity in the active harness 1

- **GIVEN** a root agent running in Codex
- **WHEN** no verified identity block is already visible
- **THEN** the guide directs it to check `CODEX_THREAD_ID`, optionally cross-check an unambiguous current thread, derive the project consistently, and reject turn, agent, tool, shell-session, and Codex saved-project identifiers

#### Scenario: US1 - Resolve identity in the active harness 2

- **GIVEN** a root agent running in Claude Code or OpenCode
- **WHEN** it needs stable identity
- **THEN** it reads only that harness reference and uses verified native lifecycle identity before any documented manual fallback

#### Scenario: US1 - Resolve identity in the active harness 3

- **GIVEN** an unsupported or ambiguous identity source
- **WHEN** the agent cannot prove root identity
- **THEN** it reports degradation and does not invent continuity

### Requirement: Verified identity header

OpenCode, Codex, and Claude recovery or post-compaction output MUST preserve the lifecycle-resolved root session and project in a complete bounded identity header before optional memory context. V2 consumers MUST map that exact host root identifier to `root_session_key`; output MUST truncate only optional context and MUST be unavailable rather than truncate identity.

#### Scenario: US5 - Recover the verified root identity in every native host 1

- **GIVEN** an OpenCode root or delegated session
- **WHEN** `thoth_mem_root_identity` runs
- **THEN** it returns the bounded versioned identity contract, resolves at most 16 parent links with cycle detection, grants lifecycle authorization only to the root caller, performs no memory dispatch, and does not change the six MCP tools

#### Scenario: US5 - Recover the verified root identity in every native host 2

- **GIVEN** Codex or Claude lifecycle recovery has accepted native `session_id` and project context
- **WHEN** host output is produced
- **THEN** it includes the complete verified identity before bounded memory context; Codex may use its documented root-agent fallback and Claude invents no environment fallback

#### Scenario: US5 - Recover the verified root identity in every native host 3

- **GIVEN** identity is absent, delegated, malformed, ambiguous, or too large for bounded output
- **WHEN** the integration cannot prove the root
- **THEN** it fails closed without inventing continuity or emitting a partial identity

### Requirement: Preserve bounded output truth

Identity-aware host output MUST preserve the existing 1,000-code-point bound, keep the identity complete, retain as much recovery context as fits, and return unavailable when the complete identity header cannot fit.

#### Scenario: US2 - Receive verified identity from native lifecycle context 1

- **GIVEN** confirmed enrollment and recovery context
- **WHEN** native host output is ready
- **THEN** the emitted context begins with the verified root session ID and project and retains bounded memory context

#### Scenario: US2 - Receive verified identity from native lifecycle context 2

- **GIVEN** identity plus recovery text near the output limit
- **WHEN** host output is built
- **THEN** it stays within the existing bound without truncating or fabricating the identity

#### Scenario: US2 - Receive verified identity from native lifecycle context 3

- **GIVEN** an identity header that cannot fit safely
- **WHEN** host output is built
- **THEN** output is reported unavailable rather than emitting a partial identity

### Requirement: Every Harness Setup MUST Install Its Packaged Skill Asset

OpenCode setup MUST synchronize the canonical packaged thoth-mem Skill into the exact global native `skills/thoth-mem` directory; Codex and Claude MUST receive the Skill from their native marketplace bundle. Setup MUST preserve unrelated Skills and verify the host-appropriate discovery path.

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 1

- **GIVEN** public setup executes from a verified `thoth-mem` package version
- **WHEN** OpenCode setup completes
- **THEN** its configuration contains exactly `thoth-mem@<executing-version>`, the native Skill tree is current, and neither `.thoth-mem`, `plugins/thoth-mem.js`, nor an owned `mcp.thoth-mem` block is required

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 2

- **GIVEN** local-development setup receives an explicit package root and data directory
- **WHEN** setup completes
- **THEN** OpenCode contains exactly one canonical absolute `file://` plugin entry, the local Skill tree is synchronized, and the native plugin starts the checkout-built v2 core without `npx` or a published-package fallback

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 3

- **GIVEN** recovered memory changes between turns
- **WHEN** OpenCode builds the model payload
- **THEN** thoth-mem changes only its tagged trailing recovery region and preserves the byte-stable prefix used by the provider prompt cache

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

### Requirement: Preserve user skill configuration

OpenCode setup and runtime MUST preserve every existing `skills.paths` value and every sibling global Skill; only the exact setup-owned `skills/thoth-mem` tree may be synchronized or restored.

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 1

- **GIVEN** public setup executes from a verified `thoth-mem` package version
- **WHEN** OpenCode setup completes
- **THEN** its configuration contains exactly `thoth-mem@<executing-version>`, the native Skill tree is current, and neither `.thoth-mem`, `plugins/thoth-mem.js`, nor an owned `mcp.thoth-mem` block is required

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 2

- **GIVEN** local-development setup receives an explicit package root and data directory
- **WHEN** setup completes
- **THEN** OpenCode contains exactly one canonical absolute `file://` plugin entry, the local Skill tree is synchronized, and the native plugin starts the checkout-built v2 core without `npx` or a published-package fallback

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 3

- **GIVEN** recovered memory changes between turns
- **WHEN** OpenCode builds the model payload
- **THEN** thoth-mem changes only its tagged trailing recovery region and preserves the byte-stable prefix used by the provider prompt cache

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

### Requirement: Add an explicit version-gate override

When Codex setup is requested with `--force`, it MUST allow plugin-manager strategy selection without requiring the detected Codex version to belong to the tested compatibility set, provided all existing selected-scope capability and manager-state requirements are satisfied.

#### Scenario: Force a future untested Codex version through verified capabilities

- **GIVEN** Codex `0.148.x` advertises complete safe plugin-manager mutation and verification commands and exact manager state is classifiable
- **WHEN** setup runs with `--force`
- **THEN** it bypasses the version gate, selects `plugin_manager`, and emits a bounded warning instead of returning `requires_user_action` solely because of the version

#### Scenario: Force remains capability-gated for other untested versions

- **GIVEN** another untested Codex version exposes the same complete safe contract
- **WHEN** setup runs with `--force`
- **THEN** it follows the same forced plugin-manager path and warning contract

#### Scenario: Forced future compatible state remains an exact no-op

- **GIVEN** both marketplace and plugin state are already exactly present on a forced untested version
- **WHEN** setup runs with `--force`
- **THEN** it returns `complete` with `changed=false` and no manual recovery action

### Requirement: Proceed through the existing modern flow

A forced version override that proves complete safe mutation and independent verification capabilities and classifiable manager state MUST select and retain `plugin_manager`, and MUST derive `complete`, `partial`, `failed`, or `requires_user_action` from the existing operation and ambiguity evidence rather than rejecting solely because of version classification.

#### Scenario: Forced future version uses the modern flow

- **GIVEN** Codex `0.148.x` advertises complete safe plugin-manager mutation and verification commands and exact manager state is classifiable
- **WHEN** setup runs with `--force`
- **THEN** it bypasses the version gate, selects `plugin_manager`, and emits a bounded warning instead of returning `requires_user_action` solely because of the version

#### Scenario: Forced modern results remain evidence-derived

- **GIVEN** another untested Codex version exposes the same complete safe contract
- **WHEN** setup runs with `--force`
- **THEN** it follows the same forced plugin-manager path and warning contract

#### Scenario: Forced modern compatible state remains unchanged

- **GIVEN** both marketplace and plugin state are already exactly present on a forced untested version
- **WHEN** setup runs with `--force`
- **THEN** it returns `complete` with `changed=false` and no manual recovery action

### Requirement: Preserve unforced setup behavior

Codex `0.147.x` is the supported unforced first-product manager contract. Other versions MUST fail closed before mutation unless an explicit force path independently proves the complete safe native-manager capability contract; safely absent manager state on any version MUST never select or preserve a legacy filesystem strategy.

#### Scenario: US2 - Distribute Codex and Claude through their native managers 1

- **GIVEN** a supported Codex manager
- **WHEN** the user registers `EremesNG/thoth-mem` and installs `thoth-mem@thoth-mem`
- **THEN** Codex resolves one enabled native plugin and starts its exact six-tool MCP and lifecycle hooks without a private descriptor edit

#### Scenario: US2 - Distribute Codex and Claude through their native managers 2

- **GIVEN** the repository Claude marketplace and no paid model session
- **WHEN** strict validation and isolated packed smoke run
- **THEN** the manager-visible structure, hooks, MCP, Skill, runtime, and data binding can pass while real model consumption remains explicitly unobserved

#### Scenario: US4 - Keep installation evidence truthful and repairable 1

- **GIVEN** unrelated OpenCode plugins, MCP entries, comments, and Skills
- **WHEN** setup installs, repairs, or rolls back thoth-mem
- **THEN** only the exact thoth-mem plugin entry and owned Skill tree change

#### Scenario: US4 - Keep installation evidence truthful and repairable 2

- **GIVEN** copied legacy/inert thoth-mem assets still exist
- **WHEN** native setup inspects them
- **THEN** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone

### Requirement: Preserve non-version safety and ownership gates

`--force` MUST NOT relax exact JSON or recognized legacy parsing, selected-scope capability verification, conflict classification, checkpointing, reconciliation, legacy ownership proof, containment, or the prohibition on implicit legacy fallback and direct manager-state cleanup.

#### Scenario: US3 - Preserve every non-version safety gate 1

- **GIVEN** a forced Codex version lacks any required selected-scope mutation or verification capability
- **WHEN** setup classifies ownership
- **THEN** `--force` does not select `plugin_manager` from version override alone

#### Scenario: US3 - Preserve every non-version safety gate 2

- **GIVEN** a forced version returns malformed, conflicting, or unclassifiable manager state
- **WHEN** setup evaluates the result
- **THEN** it retains fail-closed behavior and performs no unsafe cleanup or implicit legacy fallback

#### Scenario: US3 - Preserve every non-version safety gate 3

- **GIVEN** forced modern setup needs no legacy filesystem changes
- **WHEN** an unrelated `config.toml` exists
- **THEN** output does not claim a configuration backup is required before mutation

### Requirement: Every Native Plugin MUST Bundle Hooks, MCP, and Skills

OpenCode MUST export a typed native plugin that contributes the shared MCP and verified lifecycle hooks while its setup synchronizes the bundled Skill source into OpenCode's native Skill root; Codex and Claude MUST expose their hooks, MCP, and Skill through their native marketplace bundle. Equivalent events MUST still terminate in the same host-neutral v2 lifecycle.

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 1

- **GIVEN** public setup executes from a verified `thoth-mem` package version
- **WHEN** OpenCode setup completes
- **THEN** its configuration contains exactly `thoth-mem@<executing-version>`, the native Skill tree is current, and neither `.thoth-mem`, `plugins/thoth-mem.js`, nor an owned `mcp.thoth-mem` block is required

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 2

- **GIVEN** local-development setup receives an explicit package root and data directory
- **WHEN** setup completes
- **THEN** OpenCode contains exactly one canonical absolute `file://` plugin entry, the local Skill tree is synchronized, and the native plugin starts the checkout-built v2 core without `npx` or a published-package fallback

#### Scenario: US1 - Install thoth-mem as a native OpenCode plugin 3

- **GIVEN** recovered memory changes between turns
- **WHEN** OpenCode builds the model payload
- **THEN** thoth-mem changes only its tagged trailing recovery region and preserves the byte-stable prefix used by the provider prompt cache

#### Scenario: US2 - Distribute Codex and Claude through their native managers 1

- **GIVEN** a supported Codex manager
- **WHEN** the user registers `EremesNG/thoth-mem` and installs `thoth-mem@thoth-mem`
- **THEN** Codex resolves one enabled native plugin and starts its exact six-tool MCP and lifecycle hooks without a private descriptor edit

#### Scenario: US2 - Distribute Codex and Claude through their native managers 2

- **GIVEN** the repository Claude marketplace and no paid model session
- **WHEN** strict validation and isolated packed smoke run
- **THEN** the manager-visible structure, hooks, MCP, Skill, runtime, and data binding can pass while real model consumption remains explicitly unobserved

#### Scenario: US3 - Continue one memory across native hosts 1

- **GIVEN** Codex confirmed a handoff in the selected v2 database
- **WHEN** native OpenCode starts for the same project
- **THEN** bounded recovery is injected through a supported native channel and the six tools can expand the same stable IDs

#### Scenario: US3 - Continue one memory across native hosts 2

- **GIVEN** any host lacks proof of model-visible consumption
- **WHEN** certification is reported
- **THEN** plugin resolution, hook execution, memory confirmation, context delivery, and model use are recorded as distinct dimensions

#### Scenario: US5 - Recover the verified root identity in every native host 1

- **GIVEN** an OpenCode root or delegated session
- **WHEN** `thoth_mem_root_identity` runs
- **THEN** it returns the bounded versioned identity contract, resolves at most 16 parent links with cycle detection, grants lifecycle authorization only to the root caller, performs no memory dispatch, and does not change the six MCP tools

#### Scenario: US5 - Recover the verified root identity in every native host 2

- **GIVEN** Codex or Claude lifecycle recovery has accepted native `session_id` and project context
- **WHEN** host output is produced
- **THEN** it includes the complete verified identity before bounded memory context; Codex may use its documented root-agent fallback and Claude invents no environment fallback

#### Scenario: US5 - Recover the verified root identity in every native host 3

- **GIVEN** identity is absent, delegated, malformed, ambiguous, or too large for bounded output
- **WHEN** the integration cannot prove the root
- **THEN** it fails closed without inventing continuity or emitting a partial identity

#### Scenario: US6 - Run native OpenCode hooks safely inside Bun 1

- **GIVEN** OpenCode loads the native plugin inside Bun
- **WHEN** a root lifecycle event requires persistence or recovery
- **THEN** the Bun bundle sends one bounded v2 JSON request to the package-relative `node dist/index.js lifecycle-v2` entry and never imports or instantiates `better-sqlite3` or `MemoryService` itself

#### Scenario: US6 - Run native OpenCode hooks safely inside Bun 2

- **GIVEN** Node is missing, exits nonzero, times out, or returns malformed output
- **WHEN** a lifecycle hook runs
- **THEN** thoth-mem fails closed without injecting unverified recovery and without rejecting the user's OpenCode prompt

### Requirement: OpenCode MUST expose one native identity-only tool

The native OpenCode plugin MUST register exactly one host-native tool named `thoth_mem_root_identity`, separate from the exact six-tool MCP registry. It MUST accept no user arguments, return the proven versioned root/caller/project/authorization contract, resolve `parentID` ancestry with a fixed depth-16 bound and cycle detection, deny delegated lifecycle authority, perform no lifecycle or persistence side effect, and fail closed without a root ID when identity cannot be proven.

#### Scenario: US5 - Recover the verified root identity in every native host 1

- **GIVEN** an OpenCode root or delegated session
- **WHEN** `thoth_mem_root_identity` runs
- **THEN** it returns the bounded versioned identity contract, resolves at most 16 parent links with cycle detection, grants lifecycle authorization only to the root caller, performs no memory dispatch, and does not change the six MCP tools

#### Scenario: US5 - Recover the verified root identity in every native host 2

- **GIVEN** Codex or Claude lifecycle recovery has accepted native `session_id` and project context
- **WHEN** host output is produced
- **THEN** it includes the complete verified identity before bounded memory context; Codex may use its documented root-agent fallback and Claude invents no environment fallback

#### Scenario: US5 - Recover the verified root identity in every native host 3

- **GIVEN** identity is absent, delegated, malformed, ambiguous, or too large for bounded output
- **WHEN** the integration cannot prove the root
- **THEN** it fails closed without inventing continuity or emitting a partial identity

### Requirement: OpenCode Bun Runtime MUST Keep SQLite Behind the Node Boundary

The Bun-side lifecycle client MUST continue to accept only a bounded versioned Node envelope, but its nested taxonomy validation MUST consume the same canonical runtime values as the Node core and MUST report a reason-specific safe diagnostic when validation fails.

#### Scenario: US3 - Deliver automatic OpenCode recovery through the strict shared contract 1

- **GIVEN** a project with canonical current memories
- **WHEN** OpenCode invokes `experimental.chat.system.transform` for a verified root session
- **THEN** the Node lifecycle envelope passes the shared taxonomy validator and the bounded tagged recovery block contains source-attributed context

#### Scenario: US3 - Deliver automatic OpenCode recovery through the strict shared contract 2

- **GIVEN** Node returns an envelope with a non-canonical recovery item
- **WHEN** the Bun-side client validates it
- **THEN** it rejects the envelope, emits a bounded reason-specific diagnostic, injects no unverified memory, and does not reject the user's prompt

#### Scenario: US3 - Deliver automatic OpenCode recovery through the strict shared contract 3

- **GIVEN** a fresh real OpenCode session and a marker absent from the user prompt
- **WHEN** the model is instructed not to call tools, MCP, or Skills
- **THEN** it can return the marker from automatic context and the export contains no thoth-mem tool calls
