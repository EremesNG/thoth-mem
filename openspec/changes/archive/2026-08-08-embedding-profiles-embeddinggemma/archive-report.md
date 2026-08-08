# Archive Report: Embedding profiles, EmbeddingGemma, and Qwen3

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-08-08-embedding-profiles-embeddinggemma/`

## Completed scope

- Added versioned asymmetric embedding profiles for Nomic, EmbeddingGemma, Qwen3-Embedding, and raw fallback across remote and local providers.
- Added validated, normalized local Q8 inference for EmbeddingGemma and Qwen3 plus stable structured-input handling, title-aware indexing, and semantic-failure degradation.
- Added a durable three-model benchmark whose candidate-only absolute/no-regression gate selected EmbeddingGemma as the shipped local default.

## Verification lineage

- `verify-report.md` records independent Oracle PASS for FR-001 through FR-012 and SC-001 through SC-008 after convergence.
- Focused tests, TypeScript, package/dashboard build, full Vitest, retrieval eval, durable LM Studio benchmark, and diff hygiene all passed.
- Post-verdict real Transformers.js smoke loaded and inferred with both published Q8 candidate artifacts at native dimensions with finite normalized vectors.

## Canonical specification sync

- Updated: `config`, `evals`, `indexing`, `retrieval`.
## Deviations and residual warnings

- No scope deviations. Other host/runtime combinations retain ordinary operational variability; no known critical issue remains.

## Follow-up

- None.
