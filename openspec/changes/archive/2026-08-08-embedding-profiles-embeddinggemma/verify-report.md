# Verification Report: Model-aware embedding profiles and three-model default gate

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: All accepted FR-001–FR-012 and SC-001–SC-008 scope is represented and verified.
- **Correctness**: Profile, provider, vector, gate, persistence, default, and degradation behavior matches the accepted contracts.
- **Coherence**: Specification, plan, tasks, deltas, implementation, tests, README, durable evidence, and static default agree.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | Deterministic profile resolution | Focused profile tests | PASS |
| FR-002 | Structured per-item retrieval inputs | Provider/store tests | PASS |
| FR-003 | Exact/idempotent Nomic, Gemma and Qwen formatting | Profile tests | PASS |
| FR-004 | Query/document HyDE roles and fallback | HyDE/store tests | PASS |
| FR-005 | Compatible config/schema/env precedence | Config tests | PASS |
| FR-006 | Profile/version/normalization lineage hashing | Config/rebuild tests | PASS |
| FR-007 | Vector validation, normalization, recall degradation and indexing retry | Vector/provider/store tests | PASS |
| FR-008 | LM Studio/Ollama/local Gemma and Qwen paths | Provider tests | PASS |
| FR-009 | Title-aware ephemeral indexing | Indexing tests | PASS |
| FR-010 | Complete JSON and Markdown model/operational/gate reports | Benchmark tests/live evidence | PASS |
| FR-011 | Three-run, candidate thresholds, no-regression and deterministic winner | Gate tests/live evidence | PASS |
| FR-012 | Durable winner matches static default and dimensions | Artifact/source/config tests | PASS |
| SC-001 `[buildable]` | Profile resolution and formatting | Focused suite | PASS |
| SC-002 `[buildable]` | Mixed roles and HyDE | Focused suite | PASS |
| SC-003 `[buildable]` | Providers, vectors, retry/degradation | Focused suite | PASS |
| SC-004 `[buildable]` | Config compatibility, lineage, rebuild | Focused suite | PASS |
| SC-005 `[buildable]` | Renderer parity plus invalid-vector/persistence fail-closed coverage | 15 benchmark tests | PASS |
| SC-006 `[outcome]` | Complete observed three-model evidence | `benchmark-result.json` | PASS |
| SC-007 `[buildable]` | Static default/evidence comparison; no OpenSpec dependency | Inspection/config tests | PASS |
| SC-008 `[buildable]` | Focused, typecheck, build, full suite and retrieval eval | Executed checks | PASS |

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |

## Stable findings

- OVR-001 closed: Markdown includes timestamp, corpus, model IDs, profiles, completeness/errors, dimensions, norms, metrics, requests, timing, bytes, thresholds/tolerance, candidate checks/reasons, winner trace and final decision; the candidate table is structurally consistent.
- OVR-002 closed: non-finite vectors make the model incomplete and gate fail closed. Persistence failure returns status `1`, emits no decision and leaves no artifact; normal rejected gates persist/render before returning `1`.
- OVR-003 closed: README distinguishes restored valid out-of-order rows from missing, duplicate, or invalid indexes.
- Artifact comparison: all runs complete; `gate.passed=true`; `defaultDecision=embeddinggemma`; observed Gemma dimension `768`; shipped constant is `onnx-community/embeddinggemma-300m-ONNX` with `768` dimensions.
- No active OpenSpec evidence-path references exist in product source or permanent tests.

## Commands and results

- `pnpm exec vitest run tests/evals/embedding-models.test.ts`: 15/15 PASS.
- Eight focused files: 149/149 PASS; `pnpm exec tsc --noEmit`: PASS.
- `pnpm run build`: PASS.
- `pnpm test`: 73 files, 1091 PASS, 1 skipped.
- `pnpm run eval:retrieval`: Recall@1 `0.957`, Recall@5 `1.000`, MRR `0.978`, PASS.
- `git diff --check`: PASS with non-blocking CRLF notices.
- SDD ready validator: zero errors/warnings.

## Residual risks

- At the time of the independent verdict, real local Transformers.js model smoke remained outside Oracle verification. The user subsequently authorized and root executed that operational smoke; both published Q8 artifacts loaded and inferred successfully on the current host. Other host/runtime combinations remain ordinary operational variability rather than a known defect.

## Post-verdict operational smoke

- `onnx-community/embeddinggemma-300m-ONNX`: two rows, dimensions `[768, 768]`, all values finite, L2 norms `1.0000000000000016` and `1.0000000000000009`, initial load plus inference `2674 ms`.
- `onnx-community/Qwen3-Embedding-0.6B-ONNX`: two rows, dimensions `[1024, 1024]`, all values finite, L2 norms `1.0000000000000007` and `0.9999999999999991`, initial load plus inference `18554 ms`.
- A second fresh process with both artifacts cached produced the same dimensions, finite values, and norms in `1883 ms` for EmbeddingGemma and `1636 ms` for Qwen3. The first Qwen timing therefore included download/preparation overhead and is not representative of cached startup plus inference.
- This supplementary evidence reduces the Oracle-noted host compatibility risk; it does not alter the independent PASS verdict or replace the focused/full automated checks.

## Next action

Validate closeout and archive the passing change.
