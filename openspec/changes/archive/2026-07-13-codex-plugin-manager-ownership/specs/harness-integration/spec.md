# Delta for Harness Integration

## ADDED Requirements

### Requirement: Codex Setup Capability Mapping MUST Select Exactly One Ownership Strategy
Codex setup MUST classify the selected Codex version, selected scope, advertised command grammar, and independently verifiable state capabilities before mutation. It MUST select exactly one ownership strategy: `plugin_manager` when the tested version and safe capabilities for that scope are proven, or `legacy_filesystem` only when plugin management is unavailable or unprovable for that scope. The selected strategy MUST remain fixed for the mutating attempt, and a failure after `plugin_manager` selection MUST NOT cause an implicit legacy installation.

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
- AND it MUST return `partial` when at least one requested manager operation is verified and another attempted operation fails or remains unverified
- AND it MUST return `failed` when safely attempted requested manager operations leave none verified
- AND it MUST return `requires_user_action` when missing capability or ownership ambiguity prevents a safe attempt
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

## MODIFIED Requirements

None.

## REMOVED Requirements

None.

## Assumptions

- Plugin management is considered available only when both a tested version classification and the complete safe capability set for the selected scope are proven; neither signal is sufficient alone.
- An operational failure after `plugin_manager` selection is not evidence that plugin management was unavailable before mutation and therefore does not permit automatic legacy fallback.
- JSON support is a per-command capability. Strict legacy verification remains valid only for commands that do not advertise JSON.
- Exact compatible version ranges and recognized schemas/formats are maintained as compatibility evidence; unknown versions and formats fail closed.
- Existing finite command timeouts, reconciliation limits, output caps, diagnostic bounds, and receipt limits remain authoritative; this change introduces no unbounded retry, output, or evidence collection.
- Legacy fallback requires manager-owned thoth-mem state to be verified absent or compatible; detected unclassifiable manager state blocks legacy mutation.

## handoffHints

- Design MUST preserve one immutable strategy decision per mutating attempt and MUST prevent a modern failure from creating dual ownership through legacy fallback.
- Design MUST keep marketplace and plugin verification independent, scope-bound, exact-identity, bounded, and fail-closed.
- Design MUST preserve the assumption that advertised malformed JSON never falls back to legacy text parsing.
- Design MUST expose unavailable, degraded, and ambiguous ownership evidence without leaking raw config, secrets, or unrelated cache/plugin data.
- Design MUST preserve the exact aggregate status mapping for modern failures and MUST NOT use legacy fallback as error recovery.
- Design MUST stop legacy mutation when existing manager-owned thoth-mem state cannot be classified as absent or compatible.
- Design MUST reuse existing finite executor, reconciliation, output, diagnostic, and receipt bounds rather than introducing unbounded work.
