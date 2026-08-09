# Verification Report: Transformers local execution device selection

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: PASS — FR-001 through FR-007 and SC-001 through SC-007 are represented in implementation and independently exercised.
- **Correctness**: PASS — Focused tests, build, full suite, fresh IDE diagnostics, and the real configured DirectML smoke passed.
- **Coherence**: PASS — Specification, plan, tasks, code, schema, tests, README, and the accepted no-rebuild decision agree.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `src/config.ts` defines the required five-value device type; `config.schema.json` matches; complete typed constructions include CPU. | Focused tests, build, fresh IDE diagnostics | PASS |
| FR-002 | `src/config.ts` strictly normalizes/validates device input and resolves environment before persistence. | Configuration suite covers five values, precedence, and invalid environment/persisted sources. | PASS |
| FR-003 | `src/retrieval/local-transformers-provider.ts` adds the exact device while preserving model-profile dtype behavior. | Provider suite covers pipeline-backed and direct-model executor paths. | PASS |
| FR-004 | Default persisted and runtime configuration materializes CPU. | Default, backfill, schema, and typed-construction tests plus build | PASS |
| FR-005 | Device remains outside semantic `hashPayload`; no store/lineage implementation changed. | Device-only CPU/DML hash equality test and diff inspection | PASS |
| FR-006 | Explicit values and `auto` pass unchanged; executor rejection has no thoth-mem fallback. | Provider failure test observes one attempt and the original error. | PASS |
| FR-007 | README documents taxonomy, precedence, platforms, `auto`, cold start, explicit failure, and no rebuild. | Documentation/schema inspection and focused schema assertions | PASS |
| SC-001 `[buildable]` | All five values and invalid-value behavior are covered. | Focused Vitest and build | PASS |
| SC-002 `[buildable]` | Device plus existing Q8 dtype reaches both model-loading paths. | Focused provider Vitest | PASS |
| SC-003 `[buildable]` | CPU runtime/default/backfill/schema behavior and typed propagation are implemented. | Focused Vitest, build, IDE diagnostics | PASS |
| SC-004 `[buildable]` | CPU and DML configurations share the same semantic hash. | Focused configuration Vitest | PASS |
| SC-005 `[buildable]` | Invalid configuration and initialization failures remain visible with zero fallback. | Focused configuration/provider Vitest | PASS |
| SC-006 `[outcome]` | Configured real DirectML execution returned 2 finite 768-dimensional vectors with norms `1.000000000000001` and `1.0000000000000002`. | Isolated `getConfig()` plus public provider-factory DML smoke | PASS |
| SC-007 `[buildable]` | README and schema expose the same five values and CPU default. | Schema test, build, and documentation inspection | PASS |

## Executed checks

- `pnpm exec vitest run tests/config.test.ts tests/retrieval/local-transformers-provider.test.ts tests/retrieval/remote-provider.test.ts tests/store/index.test.ts tests/evals/embedding-models.test.ts`: 5 files and 143 tests passed.
- `pnpm run build`: TypeScript, package build, and dashboard build passed.
- `pnpm test`: 73 files passed; 1,131 tests passed and 1 skipped.
- Fresh WebStorm error diagnostics: zero errors across all seven changed TypeScript/test files.
- Isolated configured `dml` smoke: SC-006 passed; temporary configuration and directory were removed.
- `git diff --check`: exit 0; only non-blocking LF-to-CRLF working-copy advisories were emitted.
- Status and secret-pattern audit: only declared tracked surfaces and expected SDD artifacts; no generated, dependency, unrelated, or secret material.

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| None | — | — | No stable findings. | — |

## Warnings

- CUDA and CoreML hardware execution were not observed on this Windows host; exact forwarding is covered deterministically and platform availability is documented.
- The first inline smoke harness attempt encountered `tsx -e` top-level-await/CJS handling before application execution; an async-wrapped rerun passed.

## Residual risks

- None for SC-001 through SC-007. Execution-provider availability outside the observed Windows DirectML path remains environment-dependent as documented.
