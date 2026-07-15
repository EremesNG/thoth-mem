# Requirements Quality Checklist: Codex Plugin Manager Ownership

## Domain: cli

### Completeness

- [x] Modern plugin-manager exclusivity, explicit legacy fallback, dual-state migration, receipts, rollback, idempotency, and stable installation identity are each covered by a named requirement.
- [x] Clean, partial, ambiguous, interrupted, repeat, and path-only-drift states are represented by concrete scenarios.
- [x] Proposal constraints for no-force migration, no whole-config restoration, old receipt compatibility, and controlled mutation boundaries are preserved.

### Clarity

- [x] `plugin_manager`, `legacy_filesystem`, dual-owned state, strategy-owned state, and ambiguous ownership have explicit observable behavior.
- [x] The boundary between pre-mutation capability unavailability and post-selection operational failure is explicit.
- [x] Modern, legacy, and migration rollback responsibilities are stated separately.
- [x] Destructive legacy ownership proof and pre-existing-versus-created manager receipt evidence are pinned explicitly.

### Measurability

- [x] Completion and no-op outcomes use observable status, `changed`, mutation-count, state-preservation, and final-verification assertions.
- [x] Migration ordering is measurable through manager verification, durable checkpoint, legacy removal, and final-state verification.
- [x] Privacy and ownership preservation are measurable through absence of raw config/secrets and byte/semantic preservation of unrelated state.

### Testability

- [x] Every CLI requirement has at least one GIVEN/WHEN/THEN scenario suitable for controlled filesystem and executor fixtures.
- [x] Interrupted checkpoints, rollback divergence, executable-path variation, and repeated setup can be exercised without real Codex mutation.
- [x] All CLI requirements use RFC 2119 keywords and avoid implementation-specific file/module design.

## Domain: harness-integration

### Completeness

- [x] Version/capability strategy selection, structured/legacy state verification, and explicit non-destructive degradation are covered.
- [x] Per-command JSON capability, exact identities, malformed schemas, lookalikes, partial capability, and ambiguous ownership are represented.

### Clarity

- [x] Plugin management availability requires both tested version evidence and complete safe selected-scope capabilities.
- [x] The spec explicitly forbids implicit legacy fallback after a modern operational failure.
- [x] Structured JSON and legacy text verification paths have mutually exclusive, fail-closed conditions.
- [x] Modern aggregate status mapping and the partial-manager-state block on legacy fallback are explicit.

### Measurability

- [x] Strategy selection yields exactly one named outcome and observable forbidden mutations.
- [x] Verification success requires exact marketplace provenance and exact installed-and-enabled plugin identity.
- [x] Degraded diagnostics have observable boundedness, privacy, and non-destructive behavior.

### Testability

- [x] Every harness-integration requirement has GWT scenarios using controlled version/help/list outputs.
- [x] Malformed JSON, schema mismatch, strict legacy format, and identity lookalikes have deterministic negative cases.
- [x] All harness-integration requirements use RFC 2119 keywords and remain behavior-focused.
- [x] Existing finite executor, reconciliation, output, diagnostic, and receipt bounds are preserved explicitly.

## Domain: packaging

### Completeness

- [x] Packed manager-facing identity, legacy fallback assets, strategy compatibility, and checkout independence are covered.
- [x] Controlled smoke coverage includes modern, legacy, dual-owned, ambiguous, project/global, repeat, path-variation, and real-smoke authorization boundaries.
- [x] Existing OpenCode and Claude Code packed-install coverage remains present in the modified requirement.

### Clarity

- [x] Modern manager consumption and legacy direct-copy consumption are distinct while sharing one canonical plugin identity.
- [x] Automated controlled verification and separately authorized real Codex mutation are explicitly separated.
- [x] Project-scope expectations identify when global state must remain unchanged.

### Measurability

- [x] Asset discoverability is measured by exact manifests/runtime presence and compatible stable identity.
- [x] Modern smoke success requires absence of legacy copied/config state and a repeat no-op.
- [x] Ambiguous migration requires a full controlled-state no-change assertion with or without force.

### Testability

- [x] Every packaging requirement has GWT scenarios executable from packed artifacts and controlled fixtures.
- [x] No scenario requires credentials or access to a real personal/global Codex home.
- [x] All packaging requirements use RFC 2119 keywords and describe observable package/setup behavior.

## Gate Result

- [x] All required dimensions are complete for every authored domain.
- [x] No checklist item is open.
- [x] No waiver is required.
