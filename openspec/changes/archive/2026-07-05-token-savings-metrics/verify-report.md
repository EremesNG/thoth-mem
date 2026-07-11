# Verification Report: Token Savings Metrics

## Round

round 1

## Completeness

All tasks in `openspec/changes/token-savings-metrics/tasks.md` are checked complete. Verification used OpenSpec filesystem artifacts only because persistence mode is `openspec`; no thoth-mem save/recovery tools were used.

The implementation is additive and limited to the expected files: `src/evals/retrieval.ts`, `src/tools/mem-recall.ts`, `tests/evals/retrieval.test.ts`, `tests/tools/mem-recall.test.ts`, and `tests/store/community-summaries.test.ts`.

## Build and Test Evidence

- `pnpm exec vitest run tests/evals/retrieval.test.ts tests/tools/mem-recall.test.ts tests/store/community-summaries.test.ts`: pass, 3 files, 53 tests.
- `pnpm run eval:retrieval`: pass; Recall @1 95.7%, Recall @5 100.0%, Context Compression 57.2%, Surgical Compression 98.2%, all community safety/no-regression rates 100.0%.
- `pnpm test`: pass, 50 files, 653 tests.
- `pnpm run build`: pass.

## Compliance Matrix

| Criterion | Status | Evidence |
| --- | --- | --- |
| Canonical metrics envelope exists for retrieval eval aggregate | Compliant | `RetrievalTokenSavingsMetricsEnvelope` defines aggregate savings/recall/lane/community fields in `src/evals/retrieval.ts:48`; `token_savings_metrics` is part of the summary at `src/evals/retrieval.ts:156`; the summary attaches it at `src/evals/retrieval.ts:1964`. |
| Envelope includes deterministic savings fields | Compliant | `full_chars`, `evidence_chars`, `returned_chars`, `saved_chars`, `compression_ratio`, and `compression_basis` are defined at `src/evals/retrieval.ts:51` through `src/evals/retrieval.ts:56` and computed at `src/evals/retrieval.ts:737` through `src/evals/retrieval.ts:742`. |
| Envelope includes recall/lane/community fields | Compliant | Recall fields are defined at `src/evals/retrieval.ts:57` through `src/evals/retrieval.ts:59`; community fields are defined at `src/evals/retrieval.ts:78` through `src/evals/retrieval.ts:82` and mapped at `src/evals/retrieval.ts:764` through `src/evals/retrieval.ts:768`. |
| Existing summary fields and markdown outputs remain backward-compatible | Compliant | Existing recall/compression/community markdown rows remain emitted at `src/evals/retrieval.ts:798` through `src/evals/retrieval.ts:835`; compatibility is covered by `tests/evals/retrieval.test.ts:251` through `tests/evals/retrieval.test.ts:253` and envelope non-replacement coverage at `tests/evals/retrieval.test.ts:276` through `tests/evals/retrieval.test.ts:298`. |
| `mem_recall mode=context` remains backward-compatible and new fields are additive | Compliant | Context output still emits `retrieval_contract`, `compression_ratio`, `evidence_chars`, and `full_chars`, with additive `returned_chars` and `returned_basis`, at `src/tools/mem-recall.ts:84`; tests assert old and new tokens at `tests/tools/mem-recall.test.ts:204` through `tests/tools/mem-recall.test.ts:209`. |
| Community read-path remains default-off; no fifth lane; community evidence remains KG sub-source | Compliant | Default read-path gate remains in `src/store/index.ts:4119`; no production store/config files changed. Tests assert KG source and no community lane in `tests/tools/mem-recall.test.ts:395` through `tests/tools/mem-recall.test.ts:403` and `tests/store/community-summaries.test.ts:486` through `tests/store/community-summaries.test.ts:496`. |
| No new MCP tool, ranking change, schema change, or default-on rollout | Compliant | `git diff --name-only` shows only the five expected implementation/test files. The compact tool list remains the existing six tools in `src/tools/index.ts:23` through `src/tools/index.ts:28`; schema file is unchanged; verification tests show no ranking/safety regression. |

## Issues Found

### Critical

None.

### Warnings

None.

## Verdict

pass

All proposal success criteria are satisfied for round 1. Verification commands pass, the change is additive, compatibility surfaces remain intact, and no community rollout/default-on behavior or MCP surface expansion was introduced.
