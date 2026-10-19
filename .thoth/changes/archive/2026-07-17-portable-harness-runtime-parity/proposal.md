# Proposal: Portable Harness Runtime Parity

## Intent

Close the remaining runtime-delivery gaps in the existing native integrations so
OpenCode, Codex, and Claude Code provide portable, enriched memory parity that
is observable to both operators and models. The change strengthens verifiable
activation, recovery-context delivery, compaction recovery, passive subagent
learning, managed Claude Code setup, coexistence safety, and live/disposable
proof without changing the established memory contract.

## Scope

### In Scope

- Provide evidence-backed runtime activation for the installed OpenCode, Codex,
  and Claude Code integrations, including model-visible recovery context after
  enrollment or resume where the host can safely deliver it.
- Deliver enriched compaction recovery: preserve bounded recovery context,
  provide post-compaction guidance to the resumed model, and expose safe
  degradation when a host cannot inject or confirm either part.
- Capture portable passive learning from eligible subagent lifecycle evidence
  without treating generated traffic as root-user intent or changing the
  existing privacy, identity, deduplication, or six-tool contracts.
- Add managed Claude Code setup that is scoped, reversible, ownership-aware,
  and compatible with existing marketplace/plugin installation paths.
- Define coexistence and migration safeguards so native integrations, manual
  MCP configuration, and externally managed integrations neither silently
  overwrite user state nor claim duplicate ownership.
- Verify each harness through live/disposable activation evidence as well as
  focused contract, packaging, and privacy regression coverage.

Material behavior changes:

- **From:** packaged assets and setup verification can establish installation
  without proving the active host delivers recovery context. **To:** each
  harness must expose verifiable activation evidence and deliver bounded,
  model-visible recovery context when its capability permits. **Reason:** an
  installed asset is not sufficient evidence that the memory lifecycle is
  active for a real session. **Impact:** adapter diagnostics, runtime assets,
  setup verification, and per-harness disposable tests gain activation and
  recovery assertions.
- **From:** compaction guidance and passive subagent learning are incomplete or
  inconsistent across harnesses. **To:** a shared, privacy-safe contract will
  request enriched compaction recovery/post-compaction guidance and passive
  learning only when the host event and payload are verified. **Reason:**
  context continuity and durable learning must survive compaction without
  fabricating host capabilities. **Impact:** lifecycle planning, capability
  mapping, state/diagnostics, and negative ownership fixtures expand while
  root-user prompt persistence remains unchanged.
- **From:** Claude Code relies on a repository marketplace installation path
  without thoth-mem-managed setup/coexistence handling. **To:** Claude Code
  gains a managed, reversible setup path with explicit ownership, migration,
  and rollback behavior. **Reason:** operators need the same safe lifecycle
  management expectations across all supported harnesses. **Impact:** setup
  planning, receipts, packaged assets, operator documentation, and disposable
  installation verification expand without changing unrelated configuration.

Terminal lifecycle handling remains capability-gated: it is not a portable
parity guarantee. A harness without a verified terminal trigger must report an
explicit degraded or unsupported capability and leave unrelated supported
lifecycle behavior available.

### Deferred / Needs Discovery

- Exact current-version payloads, trigger names, and model-context injection
  semantics for OpenCode, Codex, and Claude Code must be confirmed against the
  runtime versions used for live/disposable verification.
- The common passive-learning observation shape, eligibility evidence, and
  bounded deduplication/recovery behavior need specification-level decisions
  that preserve privacy and distinguish subagent learning from root-user
  prompt capture.
- The Claude Code manager command grammar, scope behavior, and independently
  verifiable removal path require runtime capability probing before final setup
  semantics are fixed.
- The portable disposable-environment strategy and proof required for activation
  must be selected without relying on credentials, external server auto-start,
  or unbounded host state.

### Out of Scope

- New, removed, renamed, or expanded MCP tools; the public six-tool surface and
  existing request/response contracts remain unchanged.
- Multi-agent orchestration, SDD routing, agent rosters, terminal multiplexing,
  or any other harness-owned coordination behavior.
- Automatic startup of external servers, unused counters or telemetry, and
  shell-specific workarounds.
- Direct edits to generated `dist/` output, database/schema changes, or changes
  to existing privacy, identity, retrieval, and prompt-row semantics unless a
  later approved delta requires them.
- Mutating any repository outside thoth-mem or silently replacing unrelated
  user configuration.

## Approach

1. Extend the host-neutral runtime contract only through existing memory
   operations, with thin adapter mappings that prove activation, context
   delivery, compaction recovery, passive learning eligibility, and every
   degraded/unsupported outcome.
2. Treat activation and setup as inspectable lifecycle evidence: plan scoped
   managed changes, preserve ownership boundaries, verify final host-visible
   state, and retain manual MCP configuration as a safe coexistence path.
3. Keep terminal lifecycle behavior capability-gated per harness and make every
   unavailable trigger operator-visible rather than inferred or simulated.
4. Use isolated live/disposable harness homes, packed assets, and bounded
   privacy-safe fixtures to verify actual activation and recovery delivery,
   then preserve the established contract suites as regression anchors.

## Affected Areas

- `src/integration/core/` and `src/integration/adapters/` for normalized
  lifecycle effects, capability diagnostics, enriched recovery, and passive
  learning boundaries.
- `src/integration/runtime/`, `integrations/opencode/`,
  `integrations/codex/`, and `integrations/claude-code/` for portable runtime
  assets, activation proof, and model-visible guidance.
- `src/setup/`, CLI setup routing, package inventory, and operator guidance for
  managed Claude Code setup, coexistence, migration, and rollback boundaries.
- Integration, setup, packaging, and disposable-harness tests for per-harness
  activation, context delivery, compaction, privacy, deduplication, and
  capability-gated terminal behavior.

## Risks

- Host event and setup APIs may vary by version or expose incomplete payloads.
  Mitigation: capability-gate every runtime path, fail closed for unproven
  triggers, and retain explicit manual recovery guidance.
- Model-visible recovery injection may be accepted by an asset but not consumed
  by the active host. Mitigation: require live/disposable evidence that observes
  activation and bounded delivered context, not merely installed files.
- Passive subagent learning could leak generated or private content. Mitigation:
  reuse strict ownership/privacy controls, bounded normalization, and negative
  fixtures; never reclassify it as root-user intent.
- Managed Claude Code setup or migration could conflict with marketplace or
  user-owned state. Mitigation: scope inspection, ownership receipts,
  idempotent verification, conflict refusal, and non-destructive coexistence.
- A non-portable terminal signal could be reported as universal completion.
  Mitigation: preserve per-harness capability mappings and prohibit fabricated
  terminal success.

## Rollback Plan

- Keep activation, enriched recovery, passive learning, and managed setup
  additive and independently disableable per harness; a failed harness path
  returns bounded manual guidance while other verified paths remain available.
- Restore only receipt-owned managed Claude Code changes and preserve later
  unrelated user edits; retain existing marketplace/manual MCP configurations
  as recovery paths.
- If live/disposable verification exposes a version-specific regression, revert
  the affected adapter/asset or disable that capability rather than altering the
  shared memory contract, stored memories, or public MCP surface.
- Revert package/setup/runtime additions together when necessary; no data,
  schema, or external-repository rollback is required.

## Success Criteria

- For each of OpenCode, Codex, and Claude Code, a packed, disposable
  installation produces recorded evidence of successful activation or an exact
  supported/degraded/unsupported classification with a safe recovery action.
- Where supported, the active model receives bounded recovery context after
  session start/resume and receives post-compaction guidance after verified
  compaction; unsupported delivery is explicit and never claimed as complete.
- Passive learning accepts only verified eligible subagent evidence, remains
  privacy-safe and bounded, does not create root-user prompt records, and is
  retry/dedup safe across restart according to available host evidence.
- Managed Claude Code setup is planable, scoped, idempotent, reversible, and
  verified in disposable fixtures without modifying unrelated user or
  marketplace-managed configuration.
- Coexistence/migration tests prove manual MCP configuration and externally
  managed integrations are detected and preserved without duplicate ownership
  claims or cross-repository mutation.
- Focused per-harness runtime/setup/package tests plus `pnpm run build` and
  `pnpm test` provide reproducible evidence, while registry checks continue to
  expose exactly the six existing MCP tools.
