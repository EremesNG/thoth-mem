# Verification Report: Disambiguate native plugin cache paths

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: PASS — Every accepted FR and buildable SC has implementation and executed evidence; SC-003 is explicit residual risk.
- **Correctness**: PASS — The frozen implementation remains correct and both corrected deltas are strict semantic supersets of their pre-change canonical requirements.
- **Coherence**: PASS — Spec, tasks, code, descriptors, README, verification, and archive report agree on US1 setup, US2 packaging, and host-specific identities.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `src/setup/native-manager.ts:114` derives exact host identities used by inspection, planning, mutation, repair, journal recovery, and rollback. The corrected delta preserves OpenCode ownership, explicitly mandates native managers, prohibits direct cache editing, and preserves unrelated/legacy state. | Focused setup/packaging 18 PASS; `pnpm exec tsc --noEmit`; comparison with `git show HEAD:openspec/specs/cli/spec.md` | PASS |
| FR-002 | Both descriptors retain plugin/Skill `thoth-mem` under distinct marketplaces; packed verification rejects repeated segments. The corrected delta preserves exact-one/shared inventory ownership, common package/setup/smoke inventory consumption, and missing-asset failure. | Focused packaging PASS; `pnpm run integration:verify`; descriptor SHA-256 comparison; comparison with `git show HEAD:openspec/specs/packaging/spec.md` | PASS |
| SC-001 `[buildable]` | Tests cover exact commands, legacy preservation, provenance collisions, schema-1 journal rejection, recovery, and rollback for both hosts. | Independent focused rerun: 2 files and 18 tests passed. | PASS |
| SC-002 `[buildable]` | Packaging tests derive `cache/thoth-mem-codex/thoth-mem/.../SKILL.md` and `cache/thoth-mem-claude/thoth-mem/.../SKILL.md`; both resolve and match locked descriptors. | Focused packaging, integration inventory, packed smoke, and prepublish passed. | PASS |
| SC-003 `[outcome]` | Deterministic topology is proven, but no separately authorized real Codex or Claude user-home installation was performed. | N/A — explicit future stateful observation per host. | RISK |

## Delta preservation

- FR-001 retains the prior OpenCode exact ownership clause, restores the explicit native-manager mandate, retains direct-cache prohibition and byte-identical unrelated-state scenario, and adds exact host-specific identity operations.
- FR-002 retains exact-one harness/shared ownership, common package/setup/smoke inventory consumption, and missing-tarball-asset failure, and adds distinct marketplace/plugin topology.
- Story routing is correct: US1 covers FR-001/SC-001; US2 covers FR-002/SC-002/SC-003; T001, T002, and T009 map to US1; T003–T008 map to US2; all T001–T011 are complete.

## Executed evidence

- Corrected Accelerated `ready` validator: PASS, zero errors or warnings.
- Focused setup and packaging: PASS, 2 files and 18 tests.
- `pnpm run build`: PASS.
- `pnpm test`: PASS, 45 files and 286 tests.
- `pnpm run integration:verify`: PASS.
- `pnpm run integration:smoke`: PASS for OpenCode, Codex, and Claude Code packed runners.
- `pnpm run benchmark:fixture`: PASS.
- `pnpm run prepublishOnly`: PASS, including another 45-file/286-test run.
- Independent `pnpm exec tsc --noEmit`: PASS.
- Both descriptor SHA-256 values exactly match `plugin/distribution-lock.json`; no non-target digest changed from `HEAD`.
- `git diff --check`: exit 0; Windows line-ending warnings only.
- Fresh convergence Oracle compared both corrected deltas with their exact `HEAD` canonical requirements and returned PASS.

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| ORACLE-WARN-001 | Warning | Coherence | `benchmarks/results/fixture-report.json` contains out-of-scope timestamp/runtime churn. | Preserve it according to its prior owner; exclude it from this archive/commit. |
| ORACLE-WARN-002 | Warning | Coherence | `tasks.md` retains a single Story US1 section heading although T003–T008 are explicitly and correctly tagged US2. | Editorial only; task mapping is complete and no obligation is lost. |
| ORACLE-WARN-003 | Warning | Freshness | Optional pre-implementation plan-review digests predate the convergence-only spec correction. | Fresh mandatory final Oracle verification covers the corrected delta; no implementation authority is inferred from the stale review. |

## Residual risks

- SC-003: RISK — With separate explicit authorization per host, record host version/pre-install state; install or migrate through the native manager; restart; confirm Codex resolves `cache/thoth-mem-codex/thoth-mem/<version>/skills/thoth-mem/SKILL.md`; confirm Claude resolves `cache/thoth-mem-claude/thoth-mem/<version>/skills/thoth-mem/SKILL.md`; verify each file exists and each host loads the Skill without segment collapse.
