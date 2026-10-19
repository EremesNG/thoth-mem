# Verification Report: Codex Plugin Manager Ownership

## Round

round 2

## Completeness

- Pipeline: full
- Persistence: OpenSpec
- Tasks: 35/35 completed; 0 pending, in progress, or skipped
- Requirements checklist: complete for CLI, harness integration, and packaging
- Delta requirements: 13/13 represented
- GWT scenarios revalidated: 63/63
- Real Codex/setup/plugin/rollback mutation: not performed
- `.thoth-sync/`: untouched
- Result: all round-1 blockers are resolved

## Build and Test Evidence

- Independent C1/C2 controlled probes: 5 passed
  - Bare `thoth-mem` and `thoth-mem@thoth-mem` legacy output is rejected.
  - The official legacy `PLUGIN STATUS VERSION PATH` row with exact `installed, enabled` remains accepted.
  - Legacy apply and migration receipts carry signed, exact managed-fragment evidence.
  - Unrelated TOML before and after migration survives rollback.
- Independent focused setup/rollback/packaging suites: 183 passed, 1 skipped.
- Independent `pnpm run build`: passed, including typecheck, package verification, bundle, and dashboard build.
- Independent `pnpm test`: 928 passed, 1 skipped across 60 files.
- Provided release evidence: `prepublishOnly` passed with build and 928 passed, 1 skipped.
- Registry robustness adjustment is limited to a 30-second timeout on one asynchronous public-contract test. Assertions, production behavior, global Vitest configuration, and capture count are unchanged; no warning is warranted.

## Compliance Matrix

| # | Domain | Scenario | Status | Concrete evidence |
|---:|---|---|---|---|
| H1 | Harness integration | Proven modern capability selects plugin manager ownership | Compliant | Strategy classification in `src/setup/codex-cli.ts:947-1023`; capability matrix in `tests/setup/codex-cli.test.ts`. |
| H2 | Harness integration | Unavailable scoped plugin management selects legacy ownership | Compliant | `selectCodexStrategy` and unavailable capability handling in `src/setup/codex-cli.ts:958-1023`; global/project strategy tests. |
| H3 | Harness integration | Version evidence alone is insufficient | Compliant | Selection requires both tested version and complete scoped capability evidence; version-only negative tests pass. |
| H4 | Harness integration | Modern operational failure does not activate legacy fallback | Compliant | Fixed strategy execution in `src/setup/codex-cli.ts:309-449`; failure aggregation tests confirm no legacy actions. |
| H5 | Harness integration | Existing manager state blocks unsafe legacy coexistence | Compliant | Manager-state classification and setup planning in `src/setup/codex-cli.ts:966-1023` and `src/setup/engine.ts:684-869`; ambiguity tests pass. |
| H6 | Harness integration | JSON capability is selected independently per command | Compliant | `operationState` branches per command at `src/setup/codex-cli.ts:744-757`; mixed JSON test plus new bare-output negatives at `tests/setup/codex-cli.test.ts:1089-1132`. |
| H7 | Harness integration | Exact structured marketplace state verifies | Compliant | Exact name, Git type, and canonical source validation at `src/setup/codex-cli.ts:759-779`; provenance alias/lookalike tests pass. |
| H8 | Harness integration | Exact structured plugin state verifies | Compliant | Exact plugin ID/name/marketplace and installed/enabled checks at `src/setup/codex-cli.ts:780-803`; conflicting-field tests pass. |
| H9 | Harness integration | Malformed advertised JSON fails closed | Compliant | JSON path never invokes text fallback at `src/setup/codex-cli.ts:744-803`; malformed/schema-mismatch tests pass. |
| H10 | Harness integration | Lookalike identities are rejected | Compliant | Exact structured and legacy matching at `src/setup/codex-cli.ts:759-849`; repository/plugin lookalike tests pass. |
| H11 | Harness integration | Ambiguous legacy ownership causes zero removal | Compliant | Proof classification and blocking plan in `src/setup/engine.ts:260-438,2864-3077`; partial-proof tests preserve state. |
| H12 | Harness integration | Verification diagnostic remains bounded and private | Compliant | Output/diagnostic caps in `src/setup/codex-cli.ts`; secret and unrelated-output tests pass. |
| H13 | Harness integration | One unavailable manager capability does not imply false success | Compliant | Independent operation state and aggregate status in `src/setup/codex-cli.ts:184-307,594-601`; partial-capability tests pass. |
| P1 | Packaging | OpenCode assets are discoverable | Compliant | Actual-tarball OpenCode asset and setup coverage in `tests/packaging/packed-install.test.ts`. |
| P2 | Packaging | Modern Codex plugin identity is discoverable | Compliant | Packed marketplace descriptor, manifest, hook, runner, skill, and MCP graph assertions pass. |
| P3 | Packaging | Legacy Codex fallback assets are discoverable | Compliant | Packed legacy installation resolves and compares only tarball assets. |
| P4 | Packaging | Claude marketplace and plugin assets are discoverable | Compliant | Packed repository marketplace and declared Claude asset coverage passes. |
| P5 | Packaging | Modern and legacy identities cannot diverge | Compliant | Inventory, package version, manifest, runner, hook, skill, and MCP identity assertions pass. |
| P6 | Packaging | OpenCode installs globally from the tarball | Compliant | Isolated packed global setup and repeated no-op test passes. |
| P7 | Packaging | OpenCode installs only in explicit project scope | Compliant | Project setup test preserves the global-home digest. |
| P8 | Packaging | Controlled modern Codex setup uses manager ownership | Compliant | Isolated global/project fixtures verify manager state, absent legacy state, and repeat no-op. |
| P9 | Packaging | Controlled legacy Codex setup uses packaged fallback assets | Compliant | Packed legacy-only assets/config/metadata and second-run no-op are verified. |
| P10 | Packaging | Controlled dual-owned fixture migrates safely | Compliant | Packed dual-state migration preserves manager/user state, removes proven legacy state, and repeats as a modern no-op. |
| P11 | Packaging | Controlled ambiguous migration performs zero mutation | Compliant | With- and without-force controlled filesystem digests remain unchanged. |
| P12 | Packaging | Project-scoped Codex verification leaves global state unchanged | Compliant | Packed modern project isolation and rollback project migration tests preserve the global sentinel. |
| P13 | Packaging | Executable-path variation does not create false legacy drift | Compliant | Alternate packed shim path produces byte-identical no-op behavior. |
| P14 | Packaging | Claude plugin installs from repository marketplace assets | Compliant | Isolated Claude marketplace/plugin installation and portable runner resolution pass. |
| P15 | Packaging | Packed installation detects external checkout dependency | Compliant | Checkout-reference guards execute across all packed routes. |
| P16 | Packaging | Automated Codex verification never mutates a real home | Compliant | Tests scrub credentials and assert isolated `HOME`, `USERPROFILE`, and `CODEX_HOME`. |
| P17 | Packaging | Real Codex smoke requires explicit authorization | Compliant | Automated suites use controlled launchers only; README and task manual gate retain explicit authorization. |
| C1 | CLI | Proven dual-owned state migrates without force | Compliant | Verify-checkpoint-remove-reread flow in `src/setup/engine.ts:1965-2135`; signed and corroborated proof tests pass. |
| C2 | CLI | Existing manager and user state survive migration | Compliant | Exact fragment removal plus manager/user preservation tests pass. |
| C3 | CLI | Ambiguous legacy state blocks automatic migration | Compliant | Receipt-or-complete-corroboration proof boundary; partial proof stays zero-write even with force. |
| C4 | CLI | Failure before legacy removal preserves usable dual state | Compliant | Manager checkpoint precedes first removal; checkpoint-failure test preserves legacy state. |
| C5 | CLI | Interruption after legacy removal remains recoverable | Compliant | Per-fragment checkpoints and interruption/recovery matrix converge to verified dual or modern state. |
| C6 | CLI | Executable path change alone remains current | Compliant | `metadataMatches` excludes executable equality as authority; alternate-shim repeat test passes. |
| C7 | CLI | Content drift remains stale | Compliant | Directory/content identity inspection rejects drift; packed drift matrix passes. |
| C8 | CLI | Legacy metadata without sufficient stable identity is not upgraded implicitly | Compliant | Versioned metadata parsing and destructive proof gating reject insufficient legacy claims. |
| C9 | CLI | Modern plan declares exclusive manager ownership | Compliant | Modern plan emits manager operations/checkpoints/verification only; zero-write plan tests pass. |
| C10 | CLI | Legacy plan declares separate filesystem ownership | Compliant | Legacy plan identifies only copied assets, metadata, and managed config ownership. |
| C11 | CLI | Dual-state plan reports migration without force | Compliant | Ordered manager confirmation and legacy removal are visible in zero-write global/project plans. |
| C12 | CLI | Modern setup does not write legacy activation | Compliant | Modern execution excludes direct-copy/config changes; exclusivity tests pass. |
| C13 | CLI | Legacy setup changes only its managed fragments | Compliant | Fragment capture/apply/restore boundary in `src/setup/harnesses/codex.ts`; preservation tests pass. |
| C14 | CLI | Force cannot claim an ambiguous location | Compliant | Ambiguity remains non-forceable in planning/apply; filesystem remains unchanged. |
| C15 | CLI | Later Codex and user config changes are preserved | Compliant | Fragment recomposition preserves unrelated earlier and later TOML during setup and rollback. |
| C16 | CLI | Modern receipt records final manager state | Compliant | V2 manager evidence distinguishes pre-existing and attempt-created state and is finalized from reread outcomes at `src/setup/engine.ts:1366-1429`. |
| C17 | CLI | Receipt excludes obsolete pre-command full-config evidence | Compliant | Modern final authority is logical verified manager state; skipped config hashes are not rollback/final-state authority. |
| C18 | CLI | Migration receipt records removed legacy ownership | Compliant | Exact bounded contract at `src/setup/receipt.ts:53-83,249-299,681-799`; migration population at `src/setup/engine.ts:1965-2058`; focused receipt/rollback probes pass. |
| C19 | CLI | Old receipt remains bounded to its original claims | Compliant | Version-dispatched validation at `src/setup/receipt.ts:484-570`; V1 forbids V2 managed-fragment evidence and grants no manager authority. |
| C20 | CLI | Checkpoint failure stops further mutation | Compliant | Write-ahead and per-step persistence failures halt later mutations; controlled fault tests pass. |
| C21 | CLI | Modern rollback removes only receipt-created manager state | Compliant | No independently verified removal grammar is exposed, so modern rollback remains manual-only and performs no direct manager mutation. |
| C22 | CLI | Unavailable modern removal remains non-destructive | Compliant | Modern rollback returns `requires_user_action`, preserving cache/config and existing manager state. |
| C23 | CLI | Legacy rollback restores only owned fragments | Compliant | Rollback consumes signed fragment authority and exact asset/metadata hashes; unrelated TOML survives. |
| C24 | CLI | Migration rollback does not restore a whole config | Compliant | Rollback reconstructs only the signed managed fragment; before/after unrelated TOML tests pass. |
| C25 | CLI | Repeated rollback is idempotent | Compliant | Legacy and migration repeat rollback tests return verified no-op without further mutation. |
| C26 | CLI | Identical modern setup is a no-op | Compliant | Read-only pre-lock verification returns `complete`, `changed=false`, without command, backup, or receipt mutation. |
| C27 | CLI | Identical legacy setup is a no-op | Compliant | Stable metadata/content and owned fragment inspection returns no-op. |
| C28 | CLI | Migrated dual state becomes a modern no-op | Compliant | Packed migration repeat verifies manager ownership with no legacy residue or mutation. |
| C29 | CLI | Path-only legacy change remains a no-op | Compliant | Executable path remains diagnostic only; no metadata rewrite occurs. |
| C30 | CLI | Both manager operations verify complete without legacy state | Compliant | Ordered marketplace/plugin execution and independent verification return complete with no legacy state. |
| C31 | CLI | One modern operation fails after another succeeds | Compliant | Aggregate status returns partial and retains each step result without fallback. |
| C32 | CLI | Pre-mutation unavailable manager capability uses legacy strategy | Compliant | Unsupported/unproven capability selects legacy before mutation and invokes no guessed manager command. |
| C33 | CLI | Marketplace success cannot mask unavailable plugin state | Compliant | Independent plugin evidence prevents complete and produces bounded recovery guidance. |

Compliance: **63/63 scenarios compliant**.

## Design Coherence

- The immutable `plugin_manager | legacy_filesystem` decision remains fixed after pre-mutation selection.
- Modern ownership is exclusive: no direct legacy asset copy, activation merge, manager-cache edit, or runtime fallback.
- Legacy ownership is limited to packaged assets, stable metadata/content identity, and one exact managed TOML location.
- Dual migration follows verified manager state → durable checkpoint → config fragment → metadata → assets → final reread.
- Receipt V2 now signs bounded fragment authority:
  - exact absolute config path;
  - fixed owned location;
  - operation and fragment kind;
  - direction-bound pre/post absent-or-SHA-256 state;
  - restore data limited to the managed fragment;
  - maximum fragment size of 4 KiB;
  - no simultaneous whole-file pre/post hashes.
- Receipt validation remains HMAC-protected, allowlist-based, size/checkpoint bounded, topology-confined, version-dispatched, and fail-closed.
- V1 remains readable only for its original claims and cannot acquire V2 manager or fragment authority.
- Rollback does not restore whole Codex configuration or directly edit manager cache/config.
- Global/project targets and backup namespaces remain confined and disjoint.
- Diagnostics and receipts exclude credentials, unrelated TOML, unrelated plugins/cache, and unbounded output.
- Specs, checklist, proposal, and design still match their reviewed digests. `tasks.md` changed only through expected completion markers and now records 35/35 complete.
- Documentation and codemaps describe the implemented ownership, migration, recovery, isolation, and real-smoke gate accurately.

## Issues Found

### Critical

None.

### Warnings

None.

## Verdict

**pass**

Both round-1 critical issues are resolved with direct source evidence and passing controlled probes. All 63 scenarios comply, the focused and full suites are green, and no unsafe real Codex mutation was used as verification evidence.

## Constitution Suggestion

This change touched governance/principles — consider running `sdd-constitution` to record a constitution amendment. This is advisory and does not affect the verdict.

---

Change: `codex-plugin-manager-ownership`  
Artifact: `openspec/changes/codex-plugin-manager-ownership/verify-report.md`  
Topic Key: `sdd/codex-plugin-manager-ownership/verify-report`  
Round: `round 2`  
Verdict: `pass`  
Compliance Summary: `63/63 scenarios compliant`  
Critical Issues: `None`  
Constitution Suggestion: `This change touched governance/principles — consider running sdd-constitution to record a constitution amendment.`
