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
OpenCode, Codex, and Claude Code integrations MUST classify runtime activation
separately from package, manifest, plugin, or setup discovery. An adapter MAY
report activation as supported only when its detected host version and payload
mapping are verified, the declared asset executes for an isolated active
session, and a bounded expected lifecycle result is observable. When an
official plugin API exposes no current version, an explicit allowlisted
OpenCode behavior-evidence mapping MAY establish support only from observed
plugin initialization, exact callback/hook and payload shape, successful
in-place model-visible mutation, and a structured `client.app.log` marker. In
that fallback `hostVersion` MUST remain explicitly unknown/unobserved and MUST
NOT be inferred from package constants or setup receipts. Unknown callback,
payload, channel, marker, or mutation MUST fail closed. Installed assets without
that evidence MUST remain degraded or unsupported and MUST NOT be reported as
an active memory lifecycle.

#### Scenario: Installed assets do not prove activation
- GIVEN a harness can discover the packaged integration assets
- BUT no isolated session has produced verified runtime activation evidence
- WHEN the integration reports its capability state
- THEN it MUST NOT report runtime activation as supported
- AND it MUST report a bounded degraded or unsupported reason with a safe
  recovery action

#### Scenario: Verified host payload activates the lifecycle
- GIVEN an isolated harness session supplies a payload matching a verified
  version-specific activation mapping
- WHEN the declared integration asset handles that payload successfully
- THEN it MUST record bounded activation evidence for that harness and session
- AND it MUST report runtime activation as supported without changing any MCP
  tool contract

#### Scenario: OpenCode behavior evidence fallback remains bounded
- GIVEN OpenCode v1.17.19 PluginInput/SDK exposes no current host version
- AND an allowlisted mapping observes initialization, exact callback/payload,
  in-place mutation, and structured `client.app.log`
- WHEN activation is evaluated
- THEN it MAY report support only with `hostVersion` unknown/unobserved
- AND package constants and setup receipts MUST NOT be treated as observed
- AND missing callback, payload, channel, marker, or mutation MUST fail closed

#### Scenario: Unknown payload evidence fails closed
- GIVEN a harness version or activation payload is not in a verified mapping
- WHEN the integration evaluates activation
- THEN it MUST classify the unproven capability as degraded or unsupported
- AND it MUST NOT infer activation from the asset path, process exit code, or
  setup receipt alone

### Requirement: Model-Visible Recovery Context MUST Be Bounded and Capability-Gated
When a verified OpenCode, Codex, or Claude Code activation path safely supports
model-context delivery on session start or resume, the integration MUST request
only bounded recovery through the existing memory lifecycle and MUST deliver the
result to the active model through that verified host capability. Recovery
content MUST preserve existing identity, privacy, retrieval-bound, and
source-attribution contracts. A host that cannot safely inject or confirm
model-visible delivery MUST report that recovery capability as degraded or
unsupported without claiming that delivered context was consumed.

#### Scenario: Supported start delivers bounded recovery context
- GIVEN an active root session has a verified model-context injection capability
- WHEN activation or resume succeeds
- THEN the integration MUST request bounded recovery using only the existing
  memory operations
- AND it MUST deliver the resulting bounded guidance through the verified host
  mechanism

#### Scenario: Unverified injection does not claim delivery
- GIVEN a harness can activate an asset but cannot safely prove model-context
  injection for the detected version and payload
- WHEN the session starts or resumes
- THEN the integration MUST report recovery delivery as degraded or unsupported
- AND it MUST NOT report model-visible recovery as confirmed

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

### Requirement: Passive Subagent Learning MUST Remain Isolated From Root-User Intent
The integration MUST persist passive learning only from verified eligible
subagent lifecycle evidence through existing observation persistence behavior.
It MUST apply established privacy filtering, bounded normalization, stable
parent project/session identity, confirmed-success transition rules, and
event-delivery deduplication. Passive learning MUST NOT create, replace, or be
reported as a root-user prompt record, and missing stable event evidence MUST
explicitly degrade cross-restart exactly-once claims.

#### Scenario: Eligible subagent evidence saves an observation, not a prompt
- GIVEN a verified subagent lifecycle event carries eligible passive-learning
  evidence under an active root session
- WHEN the integration persists that evidence successfully
- THEN it MUST create or upsert only an observation through the existing memory
  contract
- AND it MUST NOT create a root-user prompt record or claim that generated
  subagent content is user intent

#### Scenario: Private or ineligible subagent traffic is excluded
- GIVEN a subagent event contains private, generated, assistant, tool, or
  otherwise ineligible content
- WHEN passive-learning eligibility is evaluated
- THEN the integration MUST persist no unsafe learning content
- AND it MUST return a bounded privacy-safe skipped or degraded outcome

#### Scenario: Passive-learning retry and duplicate delivery are safe
- GIVEN an eligible passive-learning event has failed before confirmation or is
  delivered more than once with stable event evidence
- WHEN the integration handles the event
- THEN an unconfirmed event MUST remain retryable
- AND a confirmed duplicate MUST NOT create another equivalent observation

### Requirement: Runtime Enrichment MUST Preserve Existing Memory Contracts
Runtime activation, recovery, compaction, passive learning, and terminal
capability diagnostics MUST use only `mem_save`, `mem_recall`, `mem_context`,
`mem_get`, `mem_project`, and `mem_session`. They MUST preserve the existing
storage schema, observation taxonomy, identity resolution, privacy
sanitization, retrieval semantics, and `Store.savePrompt` canonical-row
behavior. The integration MUST NOT add a public tool, public harness field,
idempotency input, schema migration, direct store access, or new prompt-row
semantics.

#### Scenario: Enriched runtime behavior leaves fixed memory requests unchanged
- GIVEN a fixed database, configuration, and existing memory-tool request
- WHEN the request runs before and after an enriched harness integration is
  enabled
- THEN its deterministic observable tool behavior MUST remain unchanged under
  the existing contract
- AND same-session byte-identical root-user prompts within 30 seconds MUST
  continue to resolve to the existing canonical row

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
Codex setup MUST treat exact selected-scope marketplace and plugin list verification as the sole authority for registered, installed, and enabled manager state. A temporary checkout, cache entry, hidden directory, orphaned manager artifact, command exit code, or error string MUST remain secondary evidence and MUST NOT establish registration, successful installation, enablement, or thoth-mem ownership. State observed in another scope MUST NOT satisfy verification for the selected scope.

#### Scenario: Orphan temporary checkout remains unregistered
- GIVEN the selected Codex home contains `.codex/.tmp/marketplaces/thoth-mem`
- AND exact selected-scope marketplace configuration and list output contain no registered thoth-mem marketplace
- WHEN setup classifies marketplace state
- THEN the marketplace MUST remain unverified and unregistered
- AND the temporary checkout MUST NOT establish setup ownership or removal authority

#### Scenario: Nonzero command cannot negate exact verified state
- GIVEN a marketplace or plugin command returns nonzero
- AND its subsequent exact selected-scope list verifies the expected identity and state
- WHEN setup classifies the operation
- THEN the requested state MUST be treated as verified
- AND the nonzero command evidence MUST remain diagnostic only

#### Scenario: Error text alone cannot prove registration
- GIVEN command output says thoth-mem is already added or installed
- BUT exact selected-scope list verification is absent, malformed, or conflicting
- WHEN setup classifies manager state
- THEN setup MUST keep that state unverified
- AND it MUST NOT infer ownership or successful registration from the text

#### Scenario: State from another scope is not authoritative
- GIVEN the expected marketplace or plugin verifies in a global scope different from the selected project scope
- WHEN project-scoped setup verifies its requested state
- THEN the global entry MUST NOT satisfy project-scoped verification
- AND setup MUST preserve the global state without claiming project completion

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
Codex setup MUST classify the selected Codex version, selected scope, advertised command grammar, and independently verifiable state capabilities before mutation. It MUST select exactly one ownership strategy: `plugin_manager` when the tested version and safe capabilities for that scope are proven, or `legacy_filesystem` only when plugin management is unavailable or unprovable for that scope. The selected strategy MUST remain fixed for the mutating attempt, and a failure after `plugin_manager` selection MUST NOT cause an implicit legacy installation. When modern execution encounters corroborated orphan residue or ownership ambiguity that prevents safe recovery and requires manual intervention, `requires_user_action` MUST take precedence over `partial` even if another requested manager operation is independently verified.

#### Scenario: Proven modern capability selects plugin manager ownership
- GIVEN the selected Codex version is in a tested compatibility set
- AND the selected scope safely exposes exact marketplace and plugin mutation and verification commands
- WHEN setup classifies the Codex capability evidence
- THEN it MUST select `plugin_manager`
- AND it MUST classify marketplace, cache, installation, enablement, and generated activation state as Codex-owned

#### Scenario: Unavailable scoped plugin management selects legacy ownership
- GIVEN the selected Codex version or scope does not safely expose a complete and independently verifiable plugin-management path
- WHEN setup classifies the Codex capability evidence before mutation
- THEN it MUST select `legacy_filesystem`
- AND it MUST report the missing or unproven manager capability without claiming modern ownership

#### Scenario: Version evidence alone is insufficient
- GIVEN the selected Codex version is recognized
- BUT one required scoped command shape or independent verification capability is unproven
- WHEN setup selects an ownership strategy
- THEN it MUST NOT select `plugin_manager`
- AND it MUST classify plugin management as unavailable for that setup attempt

#### Scenario: Modern operational failure does not activate legacy fallback
- GIVEN setup selected `plugin_manager` before mutation
- WHEN a manager mutation fails, times out, or cannot be independently verified
- THEN setup MUST retain the `plugin_manager` ownership classification for that attempt
- AND it MUST return `requires_user_action` when missing capability or ownership ambiguity prevents a safe attempt, or when corroborated orphan residue or ownership ambiguity prevents safe recovery and requires manual intervention, even if another requested manager operation verifies
- AND otherwise it MUST return `partial` when at least one requested manager operation is verified and another safely attempted operation fails or remains unverified
- AND otherwise it MUST return `failed` when safely attempted requested manager operations leave none verified
- AND it MUST NOT copy legacy assets or add legacy activation config

#### Scenario: Existing manager state blocks unsafe legacy coexistence
- GIVEN plugin management is unavailable or unprovable for the selected scope
- AND existing thoth-mem manager-owned installation or activation state is detected but cannot be safely classified as absent or compatible
- WHEN setup considers `legacy_filesystem`
- THEN it MUST return `requires_user_action` before legacy mutation
- AND it MUST NOT create a second owner by copying assets or adding legacy activation config

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

### Requirement: Progressive harness routing

The canonical memory skill MUST keep shared lifecycle invariants in `SKILL.md`, identify the active harness from verified ambient context, and instruct the agent to read exactly one matching harness reference before declaring stable identity unavailable.

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

Confirmed native recovery and post-compaction host output MUST prepend the lifecycle-resolved root session ID and project name to model-visible memory context.

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

### Requirement: Install packaged skill asset

OpenCode project and global setup MUST copy the packaged `thoth-mem` skill, including every declared reference, into the receipt-owned OpenCode plugin asset directory.

#### Scenario: US1 - Receive the memory skill with OpenCode setup 1

- **GIVEN** a packed `thoth-mem` distribution
- **WHEN** project-scoped OpenCode setup is applied
- **THEN** the installed plugin asset directory contains a byte-equivalent `thoth-mem` skill bundle sourced from the package

#### Scenario: US1 - Receive the memory skill with OpenCode setup 2

- **GIVEN** a packed `thoth-mem` distribution
- **WHEN** global OpenCode setup is applied
- **THEN** the same skill bundle is installed under the global receipt-owned plugin asset directory rather than `~/.config/opencode/skills`

#### Scenario: US1 - Receive the memory skill with OpenCode setup 3

- **GIVEN** a packaged skill source that is missing or incomplete
- **WHEN** setup inspection or application runs
- **THEN** setup reports the missing managed asset instead of claiming a complete installation

### Requirement: Register bundled discovery path

The OpenCode plugin MUST register the native absolute parent directory of its bundled `thoth-mem` skill through the supported runtime configuration hook.

#### Scenario: US2 - Discover the installed skill at OpenCode runtime 1

- **GIVEN** an OpenCode configuration with no `skills` block
- **WHEN** the plugin configuration hook runs
- **THEN** it creates `skills.paths` containing the absolute bundled skill parent

#### Scenario: US2 - Discover the installed skill at OpenCode runtime 2

- **GIVEN** existing user-defined skill paths
- **WHEN** the plugin configuration hook runs
- **THEN** it preserves their order and values and appends only the missing bundled path

#### Scenario: US2 - Discover the installed skill at OpenCode runtime 3

- **GIVEN** the hook runs more than once
- **WHEN** the bundled path is already registered
- **THEN** the configuration remains unchanged and contains no duplicate path

#### Scenario: US2 - Discover the installed skill at OpenCode runtime 4

- **GIVEN** an installation path containing spaces or URL-encoded characters
- **WHEN** the plugin resolves its bundle
- **THEN** it registers a valid native absolute filesystem path

### Requirement: Preserve user skill configuration

Runtime registration MUST preserve existing `skills.paths` entries and MUST be idempotent across repeated hook execution.

#### Scenario: US2 - Discover the installed skill at OpenCode runtime 1

- **GIVEN** an OpenCode configuration with no `skills` block
- **WHEN** the plugin configuration hook runs
- **THEN** it creates `skills.paths` containing the absolute bundled skill parent

#### Scenario: US2 - Discover the installed skill at OpenCode runtime 2

- **GIVEN** existing user-defined skill paths
- **WHEN** the plugin configuration hook runs
- **THEN** it preserves their order and values and appends only the missing bundled path

#### Scenario: US2 - Discover the installed skill at OpenCode runtime 3

- **GIVEN** the hook runs more than once
- **WHEN** the bundled path is already registered
- **THEN** the configuration remains unchanged and contains no duplicate path

#### Scenario: US2 - Discover the installed skill at OpenCode runtime 4

- **GIVEN** an installation path containing spaces or URL-encoded characters
- **WHEN** the plugin resolves its bundle
- **THEN** it registers a valid native absolute filesystem path
