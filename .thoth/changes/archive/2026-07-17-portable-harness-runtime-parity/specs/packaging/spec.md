# Delta for Packaging

## ADDED Requirements

### Requirement: Disposable Per-Harness Verification MUST Prove Runtime Activation
Release verification MUST exercise the packed OpenCode, Codex, and Claude Code
assets in isolated disposable harness homes and MUST distinguish installed
assets from a verified active runtime lifecycle. For each harness, verification
MUST record the detected version/payload capability evidence, the declared asset
execution result, and the resulting activation classification. Verification
MUST fail or report the harness capability as unproven when an asset is merely
discoverable but activation cannot be observed. It MUST not require credentials,
a development checkout, a real user home, cross-repository mutation, or
automatic external-server startup.

#### Scenario: Discoverable asset without execution fails activation proof
- GIVEN a packed harness asset is present in a disposable installation
- BUT no controlled runtime event produces observable activation evidence
- WHEN release verification evaluates that harness
- THEN it MUST not treat package discovery as activation success
- AND it MUST report failed or unproven activation evidence for that harness

#### Scenario: All three harnesses record isolated activation evidence
- GIVEN disposable OpenCode, Codex, and Claude Code homes with verified
  version/payload fixtures
- WHEN each packed integration handles its controlled activation event
- THEN verification MUST record a bounded activation result for each harness
- AND it MUST prove that no source-checkout or real-home dependency was used

### Requirement: Disposable Runtime Verification MUST Validate Recovery and Compaction Capabilities
For every supported harness capability, packed-artifact verification MUST prove
bounded model-visible recovery delivery after activation or resume and ordered
checkpoint-plus-guidance behavior after compaction. When a host version or
payload does not safely support recovery injection or compaction guidance,
verification MUST assert the exact degraded or unsupported capability outcome
rather than skip the case or report a successful delivery.

#### Scenario: Supported recovery and compaction paths are exercised
- GIVEN a disposable harness fixture supports verified recovery injection and
  compaction payloads
- WHEN the packed integration activates, resumes, and compacts an active root
  session
- THEN verification MUST observe bounded recovery delivery and a confirmed
  checkpoint before post-compaction guidance

#### Scenario: Unsupported delivery remains explicit in packed verification
- GIVEN a disposable harness fixture lacks verified recovery injection or
  compaction guidance capability
- WHEN the packed integration handles the corresponding lifecycle event
- THEN verification MUST assert a degraded or unsupported outcome
- AND it MUST not accept a success-like activation, context, or guidance claim

### Requirement: Packed Claude Code Setup Verification MUST Preserve Coexistence and Rollback Safety
Packaging verification MUST exercise managed Claude Code setup, coexistence,
and rollback using a disposable home and packed assets. It MUST prove that plan
mode is zero-write, compatible marketplace or manual configuration remains
preserved, only receipt-owned managed changes are reverted, and unavailable
manager capabilities return bounded manual guidance. The verification MUST NOT
use direct manager-cache cleanup, shell-specific wrappers, or a development
checkout as a runtime dependency.

#### Scenario: Disposable Claude setup preserves external state
- GIVEN a disposable Claude Code home contains marketplace-managed or unrelated
  manual configuration
- WHEN managed setup plans or applies a compatible installation from packed
  assets
- THEN verification MUST preserve the external state and avoid duplicate
  activation
- AND it MUST record the ownership classification and final setup outcome

#### Scenario: Disposable Claude rollback is ownership-bounded
- GIVEN packed managed Claude Code setup created receipt-owned changes in a
  disposable home
- WHEN rollback runs
- THEN verification MUST confirm that only receipt-owned changes are restored
  or removed
- AND it MUST confirm that unrelated later configuration remains unchanged

## MODIFIED Requirements

None.

## REMOVED Requirements

None.
