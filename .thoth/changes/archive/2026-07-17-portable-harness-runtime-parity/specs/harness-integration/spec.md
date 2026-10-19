# Delta for Harness Integration

## ADDED Requirements

### Requirement: Runtime Activation MUST Be Evidenced Separately From Asset Installation
OpenCode, Codex, and Claude Code integrations MUST classify runtime activation
separately from package, manifest, plugin, or setup discovery. An adapter MAY
report activation as supported only when its detected host version and payload
mapping are verified, the declared asset executes for an isolated active session,
and a bounded expected lifecycle result is observable. When an official plugin API exposes no current version, an explicit allowlisted OpenCode behavior-evidence mapping MAY establish support only from observed plugin initialization, exact callback/hook and payload shape, successful in-place model-visible mutation, and a structured `client.app.log` marker. In that fallback `hostVersion` MUST remain explicitly unknown/unobserved and MUST NOT be inferred from package constants or setup receipts. Unknown callback, payload, channel, marker, or mutation MUST fail closed. Installed assets without
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
    - AND an allowlisted mapping observes initialization, exact callback/payload, in-place mutation, and structured `client.app.log`
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
content MUST preserve the existing identity, privacy, retrieval-bound, and
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
- AND it MUST deliver bounded post-compaction guidance through the verified
  host mechanism

#### Scenario: Failed checkpoint remains retryable
- GIVEN a verified compaction event occurs
- WHEN the checkpoint memory operation fails or is indeterminate
- THEN the integration MUST NOT mark compaction as completed
- AND it MUST return a retryable failed or degraded outcome without delivering
  a success-like post-compaction result

### Requirement: Passive Subagent Learning MUST Remain Isolated From Root-User Intent
The integration MUST persist passive learning only from verified eligible
subagent lifecycle evidence through existing observation persistence behavior.
It MUST apply the established privacy filtering, bounded normalization, stable
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

## MODIFIED Requirements

### Requirement: Compaction and Finalization Outcomes MUST Be Explicit and Retry-Safe
In addition to the existing compaction contract, automatic terminal
finalization MUST remain strictly capability-gated per harness. A terminal
summary or finalization operation MUST occur only when a verified terminal
trigger and required identity/payload evidence are available. No OpenCode,
Codex, or Claude Code signal MUST be treated as a universal terminal guarantee.
An absent, ambiguous, or version-unproven terminal signal MUST report degraded
or unsupported capability with a safe recovery action while preserving
unrelated supported lifecycle operations.

#### Scenario: Unproven terminal signal does not finalize the session
- GIVEN a harness emits a stop-like or cleanup-like signal without a verified
  terminal capability mapping
- WHEN the adapter evaluates finalization
- THEN it MUST NOT persist or report automatic finalization as confirmed
- AND it MUST preserve other supported session, recovery, compaction, and
  passive-learning capabilities

## REMOVED Requirements

None.
