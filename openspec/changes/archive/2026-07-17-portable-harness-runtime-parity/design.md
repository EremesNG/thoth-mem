# Design: Portable Harness Runtime Parity

## Technical Approach

Build the delta as a capability-gated extension of the existing host-neutral
lifecycle core. The core continues to plan ordered effects through the existing
six memory operations, while adapters supply version- and payload-specific
proof that an event, delivery channel, or terminal trigger is safe to use.
Runtime assets translate only the output that a host can demonstrably make
visible to the active model. Any missing proof produces bounded degraded or
unsupported diagnostics rather than an inferred success.

The design changes four connected paths:

1. **Runtime proof and delivery.** Add the production-owned
   `src/integration/runtime/capability-evidence.ts` authority so an asset
   location, setup receipt, command exit code, or declared hook cannot by
   itself establish activation. A verified mapping must identify the detected
   host version, payload shape, declared asset execution, and, when applicable,
   a model-visible delivery channel. The existing lifecycle state records the
   confirmed enrollment event key for the root session; it stores no raw host
   payload, recovery content, or secret.
2. **Enriched lifecycle effects.** Add a private `capture_passive_learning`
   lifecycle intent plus a neutral `HostOutputDirective`. Start or resume requests
   bounded recovery through `mem_context` after confirmed enrollment. Verified
   compaction performs `mem_session(action="checkpoint")` first and only then
   requests and emits post-compaction guidance. Passive learning accepts only adapter-proven terminal subagent output and
   produces a bounded learning observation through `mem_save`, never a prompt.
3. **Claude Code setup.** Add `claude-code` to the public setup harness union
   and implement it as a manager-aware strategy beside the established OpenCode
   and Codex paths. Inspection is read-only; mutation is permitted only when
   installed version/manager evidence proves the command grammar, target, and
   removal strategy. Otherwise the result is `requires_user_action`.
4. **Hermetic release evidence.** Exercise packed assets in disposable harness
   homes with deterministic version/payload fixtures. These tests prove both a
   supported path and each relevant fail-closed path without credentials, a real
   user home, a development checkout dependency, or automatic external-server
   startup. An explicitly opt-in live smoke may add evidence locally, but it is
   not a release gate.

The existing `inject_protocol` effect remains for stable protocol guidance. For
bounded recovery text, the core returns a neutral `HostOutputDirective` only
after its required memory effects confirm; it neither invokes a host callback
nor persists raw output. Runtime command layers carry that directive unchanged
to the host asset. OpenCode mutates only its verified output channel, while the
shared runner renders an allowlisted directive into the exact native stdout JSON
envelope selected by harness, hook, and version fixture. Local emission is not
model-consumption proof, so the lifecycle result and durable state keep
activation, memory confirmation, output readiness, local emission, and model
consumption as separate semantics.

## Architecture Decisions

### Decision: Activation is stateful evidence, not installation discovery

**Choice:** Adapters will accept a bounded `RuntimeCapabilityEvidence` shape
that includes a known host-version family, payload-mapping identifier, declared
asset execution marker, and optional model-output proof. The adapter reports an
activation/recovery/compaction/finalization capability as `supported` only when
all evidence required for that individual capability matches a verified mapping.
After successful enrollment, `FileLifecycleStateStore` records the existing
bounded confirmed event key for the harness, project, and root session. The
runtime response exposes the capability classification and safe recovery action
without exposing raw payloads.

**Alternatives considered:** Treat manifest/plugin discovery as activation;
trust any zero exit code; make all declared hooks supported by default.

**Rationale:** Current assets and setup receipts prove installation, while the
spec requires evidence that an isolated runtime lifecycle actually executed.
The existing state-store event-key discipline already gives bounded,
restart-safe confirmation without a database migration or a new public input.

### Decision: Production capability evidence is the only authority

**Choice:** Create `src/integration/runtime/capability-evidence.ts` as the
    production authority for bounded version, payload, asset-execution, delivery
    mapping IDs, and evidence-claim validation. It resolves immutable packaged
    mapping facts plus bounded observed host facts into the only capability result
    that adapters may consume. Production never imports `tests/fixtures/**`; tests
    may import production contracts or pass fixture values to production resolvers.

    OpenCode `protocolRequest` supplies per-event bounded asset protocol/version,
    observed event/mapping ID, available mutable-output channel, and host version
    only when the host exposes it. The shared runner constructs bounded Codex/Claude
    claims from immutable harness/hook/packaged mapping plus validated host
    payload/version fields when available. `hook-command.ts` parses that bounded
    claim and invokes the production resolver before adapter normalization. No asset
    may self-assert `supported`, forward arbitrary `verifiedEvents`, or escalate a
    capability by claiming a fixture mapping. Unknown or unobservable host version,
    payload, or channel resolves to degraded rather than fabricated evidence.

    **Alternatives considered:** Keep evidence parsing in adapters; let assets
    self-declare verified events; import fixture mappings from production code.

    **Rationale:** Immutable package facts, observed host facts, resolved
    capability, activation result, output readiness, local emission, and model
    consumption are different evidence layers. One production authority makes their
    boundary testable and prevents runtime assets from converting a declaration into
    capability proof.

    ### Decision: Recovery output is a neutral directive with harness-native rendering

**Choice:** After the required memory effect confirms, `MemoryIntegrationCore`
returns an optional bounded `HostOutputDirective` in `LifecycleResult`. The
directive contains only `purpose` (`recovery_context` or
`post_compaction_guidance`), bounded text, and a verified delivery-mapping ID.
The core does not execute a host callback, serialize a native envelope, persist
raw directive text, or claim model consumption. `integration-event-command`
must preserve the directive instead of narrowing `LifecycleResult` to outcome
fields. `HookExecutionResult` and `HookCommandResponse` validate and carry the
same neutral directive.

For a matching verified OpenCode hook, the plugin awaits the dispatch response
and applies the directive only to the proven mutable channel (`output.context`
or the merged final system entry selected by that mapping). For Codex and Claude
Code, the shared runner validates the neutral directive and renders it into the
exact native stdout JSON envelope selected by harness, hook, and version
fixture; it never writes a raw `HookCommandResponse` as native context.
Successful asset mutation or native serialization is recorded only as
`emitted_via_verified_channel`. It is local emission, not proof that the model
consumed the text. Unknown, mismatched, or unrenderable mappings fail closed,
leaving confirmed memory effects intact and delivery unclaimed.

**Alternatives considered:** Put host SDK values in the core; retain a callback
port; treat protocol injection, process exit, or raw runner stdout as model
context; treat local emission as model consumption.

**Rationale:** Current transport loses the necessary value at each boundary:
`integration-event-command` narrows lifecycle results, `HookExecutionResult`
and `HookCommandResponse` drop outputs, the OpenCode plugin ignores dispatch
results, and the shared runner prints the raw response. A neutral directive
repairs those exact boundaries without coupling the core to host SDK types.
Version-fixture rendering makes native output executable and fail-closed while
keeping activation, memory confirmation, output readiness, local emission, and
model consumption distinct.

### Decision: Start/resume and compaction use confirmed effect chains

**Choice:** A verified start/resume mapping composes enrollment with a bounded
`mem_context` recovery request and, only after confirmation, a neutral
`HostOutputDirective` marked output-ready for a verified mapping. A verified
compaction mapping plans checkpoint first, records the existing confirmed
compaction transition only after the checkpoint succeeds, then requests bounded
recovery and returns a post-compaction directive only for a matching verified
mapping. Harness assets may record `emitted_via_verified_channel` after their
own mutation/serialization, but no core result or durable lifecycle state claims
model consumption. The executor stops dependent work after a failed or
indeterminate checkpoint; no success-like guidance is emitted.

**Alternatives considered:** Send recovery before checkpoint; precompute
context before lifecycle confirmation; mark compaction complete when a host
hook returns.

**Rationale:** This uses the current ordered effect executor and its
confirmed-success state transitions, preserving retry behavior and guaranteeing
the required checkpoint-before-guidance order.

### Decision: Passive learning is an observation-only internal intent

**Choice:** `capture_passive_learning` is accepted only from an adapter-proven
terminal subagent-output mapping that proves the subagent actor, terminal-output
semantics, active root-session identity, eligible content, and stable event
evidence. The dedicated bounded sanitizer accepts assistant/generated text only
when it is that exact proven terminal subagent output. It rejects subagent
prompts, generated handoffs, task instructions, tool scaffolding or results,
recursive memory traces, private-tagged, malformed, empty, and unverified
actor/event payloads. On success it invokes only `mem_save` with `kind`
`observation`, `type` `learning`, `scope` `project`, the resolved root
`session_id` and `project`, and a bounded deterministic title derived from
verified harness, terminal mapping, and actor evidence. It does not create a
prompt. It supplies a topic key only when the existing contract provides a
genuine semantic topic; it never derives a per-event topic key. Existing
state-store event keys suppress confirmed re-delivery, while content
deduplication remains Store behavior. Without a stable key the result remains
explicit degradation rather than claiming cross-restart exactly-once behavior.

**Alternatives considered:** Reuse `capture_root_prompt`; treat any
assistant/generated message as eligible; persist raw hook payloads; derive a
topic key from the event; add a new public idempotency field or direct store
access.

**Rationale:** Terminal subagent output is assistant/generated by definition,
so rejecting it categorically would make the approved passive-learning path
impossible. Provenance, terminal semantics, stable event evidence, and the
narrow rejection list distinguish eligible learning from user intent, recursive
memory, and runtime scaffolding without widening the six-tool surface or
changing prompt canonical-row behavior.

### Decision: Finalization remains independently capability-gated

**Choice:** Preserve the existing `finalize_session` intent but require a
verified terminal event mapping and identity/payload proof before planning a
summary effect. Each adapter must report an absent, ambiguous, or
version-unproven stop-like event as degraded or unsupported with bounded manual
recovery; it must not reduce the capability state of independent enrollment,
recovery, compaction, or passive-learning paths.

**Alternatives considered:** Treat every Stop hook as terminal; infer
finalization from compaction; disable all lifecycle behavior when finalization
is unknown.

**Rationale:** Host terminal semantics differ. Independent capabilities retain
useful verified behavior without fabricating a portable terminal guarantee.

### Decision: Claude Code setup is receipt-owned and manager-aware

**Choice:** Introduce `ClaudeCodeSetupStrategy` and a Claude-specific inspector
that resolves the selected global or explicit project scope, classifies manual
MCP settings, marketplace-managed assets, receipt-owned managed assets, and
ambiguous lookalikes, then produces a zero-write plan. A mutation plan is
executable only when an allowlisted manager/version probe proves the command
and independently verifiable removal semantics. Plans with incomplete evidence
return `requires_user_action`; they do not guess command syntax, clean manager
cache, or use a shell fallback. Receipts record only exact managed fragments and
assets, and rollback verifies ownership before restoring or removing them.

**Alternatives considered:** Copy plugin files into every scope; reuse the
Codex manager grammar; overwrite compatible-looking configuration; remove all
Claude assets on rollback.

**Rationale:** This follows the existing engine's plan-before-lock,
receipt-backed, ownership-bounded model while keeping marketplace and manual
configuration outside thoth-mem ownership.

### Decision: Package verification is hermetic; live smoke is opt-in

**Choice:** Extend inventory synchronization and package verification with a
fixture matrix for OpenCode, Codex, and Claude Code. Each fixture installs the
packed tarball into a temporary home, supplies a verified or deliberately
unverified payload mapping, observes bounded activation/recovery/compaction
results, and asserts that no source checkout or actual user home was consulted.
Claude fixtures additionally exercise plan-only, coexistence, receipt rollback,
and manual-action outcomes. A separately named opt-in smoke command may probe a
locally installed host but cannot be required for build, test, or publish.

**Alternatives considered:** Rely on static inventory checks; invoke real hosts
in every test; start an external service from verification.

**Rationale:** Static checks prove packaging only. Deterministic disposable
fixtures make runtime claims reproducible and safe for CI while preserving a
place for non-hermetic operator evidence.

## Data Flow

### Verified activation or resume

1. OpenCode `protocolRequest` forwards only bounded per-event asset
   protocol/version, observed event/mapping ID, mutable-output channel, and an
   actually observable host version. The shared runner constructs bounded
   Codex/Claude claims from immutable packaged harness/hook mapping plus
   validated host payload/version fields when available.
2. `hook-command` parses that claim and calls the production capability-evidence
   resolver before adapter normalization. Unknown/unobservable version, payload,
   channel, or mapping degrades; no asset declaration can self-assert support. It validates any returned directive rather
   than discarding it from `HookExecutionResult` or `HookCommandResponse`.
3. The adapter normalizes identity and the verified event. The core confirms
   enrollment through `mem_session`, records the stable event key, obtains
   bounded recovery with `mem_context`, and returns an output-ready neutral
   directive only when its delivery-mapping ID is verified.
4. `integration-event-command` carries the directive without narrowing it.
   OpenCode awaits that response and mutates only the mapping-selected
   `output.context` or merged final system entry. The shared runner instead
   renders it into the fixture-selected Codex/Claude native stdout JSON envelope.
5. A successful mutation/serialization is `emitted_via_verified_channel`.
   Activation, confirmed memory effects, output readiness, local emission, and
   model consumption remain separate; unknown/mismatched channels fail closed
   without reversing memory confirmation or claiming delivery/consumption.

### Verified compaction

1. The adapter maps a verified compaction payload to `compact_session`.
2. The core invokes `mem_session(action="checkpoint")` first.
3. Only a confirmed checkpoint advances the compaction transition and permits a
   bounded recovery request plus an output-ready post-compaction directive for a
   matching verified delivery mapping.
4. The command layers preserve that directive; the host asset emits it only via
   its fixture-selected native channel. Emission is `emitted_via_verified_channel`,
   never model-consumption proof. Checkpoint, directive, mapping, or renderer
   failure remains visible and retryable where applicable without undoing the
   confirmed checkpoint or claiming output delivery.

### Passive subagent learning

1. An adapter-proven terminal subagent-output event maps to
   `capture_passive_learning` and supplies terminal semantics, subagent actor,
   active root-session/project identity, and a stable native event key.
2. The dedicated sanitizer accepts assistant/generated content only from that
   proven terminal output and rejects subagent prompts, handoffs, task
   instructions, tool scaffolding or results, recursive memory traces, private,
   malformed, empty, or unverified actor/event payloads before any memory call.
3. An eligible payload becomes only a `mem_save` request with `kind`
   `observation`, `type` `learning`, `scope` `project`, root `session_id` and
   `project`, and a bounded deterministic title. It creates no prompt and uses
   a topic key only when an existing genuine semantic topic is available.
4. The confirmed event key is written only after the observation result
   confirms. Replays of confirmed keys are no-ops; absent stable evidence
   produces a bounded degraded outcome and no false exactly-once claim, while
   content deduplication remains Store behavior.

### Managed Claude Code setup

1. CLI parsing resolves `claude-code` to the selected global or project scope.
2. The planner inspects the scope and capability evidence without writes.
3. The engine returns a verified no-op, an ownership conflict/manual action, or
   a receipt-backed plan. Only the last category locks and mutates the managed
   target.
4. Verification rereads the target. Rollback uses the validated receipt and
   preserves later unrelated edits and externally managed state.

### OpenCode private two-phase behavior confirmation
    
    `prepare_delivery` and `confirm_delivery` are private `HookCommandRequest`
    operations, not lifecycle intents, MCP tools, HTTP routes, or schema changes.
    For `prepare_delivery`, the production resolver accepts only bounded eligibility
    mapping facts plus the existing event/context and returns status `eligible`,
    never supported. After core memory effects confirm, `LifecycleResult` contains a
    bounded `HostOutputDirective`, `deliveryState`, and signed short-lived
    `DeliveryAttempt` token. The token binds HMAC identity, session, mapping/channel
    IDs, directive hash, nonce, and issued time.
    
    The v1.17.19 plugin validates the token, keeps `hostVersion` unknown/unobserved,
    mutates the original array only (`system.transform` merges the final
    `output.system` entry or pushes when empty; `compacting` uses
    `output.context.push`), and awaits structured `client.app.log`. It returns
    `Promise<void>`. Static protocol and recovered context use global bounded
    deduplication before mutation; array identity, payload bounds, log rollback, and
    exact callback/payload rules are strict. Local mutation/log is internal
    `emitted_via_verified_channel`, never a returned host object or consumption.
    
    `confirm_delivery` receives token plus exact mapping/channel IDs. It verifies
    HMAC identity, mappings, channel, directive hash, nonce, and issued time, then
    records support only through the existing state-store `confirmedEvents` lock.
    Replay is a no-op; wrong, expired, or cross-session confirmation fails; lock or
    transport failures are retryable. Confirmation retry never repeats memory.
    Responses separately expose activation, `memoryConfirmation`, `outputSupport`,
    local emission, and `modelConsumption`; support is recorded only post-mutation,
    and no response claims consumption. No setup-time version propagation or generic
    behavior-evidence bypass exists.
    
    File/test plan: retain `capability-evidence.ts` for eligibility resolver and add
    private delivery-attempt validation to `host-output.ts`/hook command plumbing;
    add focused prepare/confirm token, replay/expiry/cross-session, array identity,
    log rollback, global dedup, and memory-once tests before the native gate.
    
    ## Interfaces / Contracts

| Contract | Change | Boundary |
| --- | --- | --- |
| `LifecycleIntent` | Add private `capture_passive_learning`; preserve all existing intent values. | Internal core only; no MCP tool or public harness field. |
| `LifecycleEffect` / `LifecycleResult` | Plan memory effects as today; after confirmed effects, return an optional bounded neutral `HostOutputDirective` rather than execute a callback. | Core owns output readiness only; it persists no raw directive and claims no local emission or model consumption. |
| `RuntimeCapabilityEvidence` | Bounded ingress claim containing version, payload, asset-execution, and delivery facts. | Parsed by `hook-command`; no raw payload persistence or asset self-assertion. |
| `capability-evidence.ts` | Production resolver owns immutable package mapping IDs, validates observed host facts, and returns resolved capability only. | Production never imports `tests/fixtures/**`; fixtures supply test values only. |
| `HostOutputDirective` | `{ purpose, boundedText, verifiedDeliveryMappingId }` survives `integration-event-command`, `HookExecutionResult`, and `HookCommandResponse`. | `host-output.ts` validates/bounds directives and renderer metadata; no callback port or host SDK type enters the core. |
| Native emission result | `emitted_via_verified_channel` is recorded only after a mapping-selected OpenCode mutation or Codex/Claude envelope serialization. | Asset/runtime boundary; separate from activation, memory confirmation, output readiness, and unprovable model consumption. |
| passive-learning eligibility/sanitizer | Accept only adapter-proven terminal subagent output; reject prompts, handoffs, instructions, tool/recursive traces, private, malformed, empty, and unverified payloads. A persist maps to `mem_save` observation/learning/project with root identity and bounded deterministic title; no prompt or automatic event topic key. | Core private helper; skip never calls memory; state owns event idempotency and Store retains content deduplication. |
| `SetupHarness` | Add public `claude-code`; keep internal runtime/inventory `claude` translation at their existing private boundary. | CLI/setup types; no `claude` alias is accepted publicly. |
| Claude setup strategy | Inspect, plan, verify, receipt, rollback, and manual-action operations. | Setup engine; changes stay confined to selected scope. |

The fixed memory-port allowlist remains exactly `mem_save`, `mem_recall`,
`mem_context`, `mem_get`, `mem_project`, and `mem_session`. No database schema,
HTTP endpoint, public idempotency input, tool registration, or root-prompt
semantics change.

## File Changes

### Create

- `src/integration/runtime/capability-evidence.ts` — production-owned bounded
  mapping IDs and evidence-claim resolver; no test-fixture dependency.
- `src/integration/runtime/host-output.ts` — bounded neutral-directive validation,
  mapping metadata, and harness-renderer selection; no callback port.
- `src/setup/claude-code-cli.ts` — Claude manager/version capability probing and
  safe command/removal classification.
- `src/setup/harnesses/claude-code.ts` — scope inspection, ownership
  classification, mutation plan, verification, and receipt-owned rollback.
- `tests/integration/capability-evidence.test.ts` — independent production
  resolver contracts and unknown-evidence degradation.
- `tests/integration/opencode-request.test.ts` — OpenCode request/binding ingress
  facts and verified mutable-output channel selection.
- `tests/integration/runner-native-output.test.ts` — independent Codex/Claude
  runner claims and fixture-selected native JSON output envelopes.
- `tests/integration/runtime-delivery.test.ts` — full native gate only after the
  independent resolver, OpenCode binding, and runner-native-output contracts.
- `tests/setup/claude-code.test.ts` — plan-only, coexistence, ownership,
  rollback, and unproven-manager coverage.

### Modify

- `src/integration/core/types.ts` — private intent/effect/evidence/output
  contracts while retaining the fixed memory-tool list.
- `src/integration/core/lifecycle.ts` — ordered enrichment plans, passive
  observation behavior, and output-dependent confirmation handling.
- `src/integration/core/sanitizer.ts` — bounded passive-learning eligibility
  and privacy filtering.
- `src/integration/core/state-store.ts` — reuse confirmed event-key persistence
  for activation/passive-learning proof without a schema migration.
- `src/integration/adapters/shared.ts`, `src/integration/adapters/opencode.ts`, `src/integration/adapters/codex.ts`, and `src/integration/adapters/claude-code.ts` —
  evidence-gated mappings and independent terminal/delivery capability states.
- `src/integration/runtime/hook-command.ts` and `src/integration/runtime/integration-event-command.ts` —
  parse bounded claims through the production resolver before adapter normalization,
  preserve validated directives through response envelopes, and never narrow them away.
- `src/setup/types.ts`, `src/setup/paths.ts`, `src/setup/engine.ts`, and `src/setup/receipt.ts` — extend setup routing and
  receipt validation for `claude-code` without weakening existing strategies.
- `src/cli.ts` — parse and render only `thoth-mem setup claude-code` alongside
  the existing harness values and controls.
- `integrations/shared/hook-runner.mjs`, `integrations/opencode/plugin.mjs`, `integrations/codex/hooks/hooks.json`, and `integrations/claude-code/hooks/hooks.json` — OpenCode awaits and mutates only its mapping-selected output channel; the runner renders validated directives, not raw responses, into fixture-selected Codex/Claude stdout JSON envelopes.
- `integrations/inventory.json`, `scripts/sync-integration-assets.mjs`, and
  `scripts/verify-integration-package.mjs` — register new/changed assets and
  enforce packed disposable verification.
- `tests/integration/lifecycle.test.ts`, `tests/integration/adapters.test.ts`, and `tests/integration/hook-command.test.ts` — core,
  adapter, privacy, deduplication, and terminal regression coverage.
- `tests/setup/engine.test.ts`, `tests/setup/rollback.test.ts`, `tests/cli.test.ts`,
  `tests/packaging/inventory.test.ts`, `tests/packaging/packed-install.test.ts`, and
  `tests/tools/registry.test.ts` — setup result, public command, package, and
  unchanged six-tool regressions.

### Do not modify

- `dist/` generated output.
- Database schema or public MCP/HTTP contracts.
- Any repository outside this checkout.

## Testing Strategy

1. **Core unit tests:** prove unknown evidence cannot activate a capability;
   confirm recovery text bounds; assert checkpoint precedes guidance; ensure
   failed checkpoint/output is retryable and does not create a success-like
   result; cover one adapter-proven terminal subagent output persisted only as
   a bounded `mem_save` observation/learning/project request with root identity
   and deterministic title, no prompt, and no automatic event topic key; reject
   subagent prompts, handoffs, task instructions, tool/recursive traces,
   private, malformed, empty, and unverified payloads; cover duplicate replay,
   Store content-dedup preservation, and missing-stable-key degradation.
2. **Capability evidence tests:** independently test the production resolver;
   OpenCode request/binding ingress; and Codex/Claude runner/native-output
   envelopes. Fixtures remain standalone under `tests/` and may import production
   contracts or provide values, but `src/` never imports test fixtures. Run the
   full native gate only after all three independent contracts pass.
3. **Adapter/runtime contract tests:** use verified, unknown, and mismatched
   harness/hook/version mappings. Assert that core output readiness occurs only
   after memory confirmation; `integration-event-command`, `HookExecutionResult`,
   and `HookCommandResponse` preserve directives; OpenCode awaits and mutates the
   exact selected channel; and the runner renders the exact selected Codex/Claude
   envelope instead of raw responses. Assert activation, memory confirmation,
   output readiness, `emitted_via_verified_channel`, and model consumption as
   distinct states, with no durable consumption claim and fail-closed channels.
4. **Setup tests:** use disposable paths and fake command executors to prove
   `claude-code --plan` makes zero writes; manager uncertainty returns exit 3;
   manual/marketplace state survives; only receipt-owned fragments roll back;
   unrelated later edits remain.
5. **Packed-disposable tests:** package the tarball, install it into three
   temporary homes, and run controlled activation/resume/compaction fixtures.
   Require recorded evidence for every harness or the exact degraded/unsupported
   result. Assert the fixture uses neither the source checkout nor a real home.
6. **Regression gate:** run focused suites first, then `pnpm run build` and
   `pnpm test`. Keep registry assertions at exactly six tools and retain the
   existing fixed-input prompt canonical-row tests.

## Requirement Coverage

| Requirement group | Design enforcement | Primary tests |
| --- | --- | --- |
| Runtime activation (3 scenarios) | Production evidence authority resolves immutable packaged mappings plus bounded observed host facts before adapter normalization; asset self-assertions and unknown/unobservable version, payload, or channel fail closed. | Capability-evidence, OpenCode request/binding, runner-native-output, full native gate, packed-install. |
| Model-visible recovery (2) | Confirmed bounded `mem_context` returns a validated neutral directive; command layers preserve it and assets emit only through fixture-selected native channels. Output readiness and `emitted_via_verified_channel` remain separate from activation, memory confirmation, and model consumption. | Lifecycle, runtime-delivery, packed-install. |
| Compaction ordering (2) | Checkpoint-confirmed transition precedes recovery and an output-ready directive; channel mismatch or renderer failure fails closed without undoing memory confirmation or claiming model consumption. | Lifecycle, runtime-delivery, packed-install. |
| Passive learning (3) | Only adapter-proven terminal subagent output is eligible; it persists solely as a bounded observation/learning/project request with root identity and deterministic title. Prompts, handoffs, instructions, tool/recursive traces, private, malformed, empty, and unverified payloads are rejected; lifecycle state owns event idempotency, Store retains content deduplication, and no automatic event topic key is created. | Lifecycle, sanitizer, adapter. |
| Fixed memory contracts (1) | Existing port allowlist and prompt flow unchanged; no direct store/schema/tool change. | Registry, tools, fixed-input regression. |
| Finalization (1) | Per-harness verified terminal mapping only; unrelated capability states are retained. | Adapter, hook-command. |
| Claude capability-gated setup (2) | Read-only probe/plan and manual action for unknown manager grammar. | Claude setup, CLI. |
| Claude coexistence/rollback (2) | Ownership classification, receipts, verified no-op, bounded rollback. | Claude setup, engine, rollback, packed install. |
| CLI command and deterministic results (2 requirements, 2 scenarios) | Public `claude-code` route, existing scope/exit result model, bounded diagnostics. | CLI, setup. |
| Disposable activation (2) | Packed temporary homes and controlled evidence fixtures for all harnesses. | Packed install, package verification. |
| Disposable recovery/compaction (2) | Supported and unsupported fixture assertions; no static-only success. | Runtime-delivery, packed install. |
| Packed Claude setup (2) | Plan/coexistence/receipt rollback in a packed disposable home. | Claude setup, packed install. |

## Migration / Rollout

- Ship the runtime, asset, inventory, and setup additions together so package
  verification always tests the same asset inventory that setup installs.
- Preserve all current OpenCode/Codex behavior until the production evidence
  authority accepts a bounded mapping and standalone tests prove resolver,
  ingress, and native rendering. New capabilities begin degraded or unsupported
  rather than changing existing native defaults optimistically.
- Keep the private runtime/inventory `claude` label as a compatibility boundary;
  translate it to public `claude-code` only in setup/CLI validation and results.
- Do not migrate stored data. Existing lifecycle state retains confirmed event
  keys; new evidence is bounded runtime input and confirmation state, not a
  persistent raw-payload format.
- Roll out Claude setup behind capability inspection. Operators with
  marketplace/manual configuration retain their current state and receive
  manual-action guidance where ownership or manager semantics are unproven.
- If a host release invalidates a mapping, disable only that affected directive
  renderer/delivery capability and retain verified enrollment or setup paths. A
  real-host smoke can update a native envelope mapping only after hermetic
  fixture tests prove directive preservation, local emission, and fail-closed
  mismatch behavior; it cannot convert local emission into model-consumption proof.

## Open Questions

No implementation-blocking question remains for the design phase. Version-
specific host mappings and Claude manager grammar are intentionally resolved at
execution time by explicit probes and disposable fixtures; lack of proof is a
supported fail-closed outcome, not a reason to widen the memory or setup
contract.
