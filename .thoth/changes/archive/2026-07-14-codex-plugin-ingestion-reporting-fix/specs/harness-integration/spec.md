# Delta for Harness Integration

## ADDED Requirements

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

## MODIFIED Requirements

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

## REMOVED Requirements

## Assumptions

- The selected scope is the single normalized global or explicit project target chosen before manager inspection; classification, mutation, and exact list verification use that same immutable scope for the attempt.
- A reconciliation operation counts as Codex-supported only when selected-scope capability inspection advertises it and controlled disposable-home tests establish exact pre-state and post-state list verification for the targeted Codex version family. Version recognition, diagnostic text, filesystem access, or an undocumented command alone is insufficient.
- Concurrent-manager evidence means either an explicit manager busy, lock, or in-progress signal, or a material change in the relevant exact list, source identity, or normalized or resolved residue identity across the bounded observations used for classification or reconciliation. Such evidence, or inability to obtain the required stable reread, blocks automatic reconciliation.
- No tested Codex 0.144.0 selected-scope operation is currently proven to reconcile the reproduced orphan temporary checkout safely. Unless clarify or design provides that proof, the required default is zero automatic cleanup plus precise `requires_user_action` guidance.
- The logical `.codex/.tmp/marketplaces/thoth-mem` location and the recognized different-source collision are diagnostic clues only; neither is ownership evidence.
- Existing exact JSON or recognized strict legacy list verification remains unchanged and authoritative for its selected scope.
- Reconciliation does not require or authorize changes to the current plugin bundle, flat MCP declaration, hooks, marketplace topology, legacy fallback, rollback design, or package version.
