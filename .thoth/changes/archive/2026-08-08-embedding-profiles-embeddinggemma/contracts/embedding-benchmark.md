# Three-model embedding comparison contract

## Purpose

Compare Nomic, EmbeddingGemma, and Qwen3-Embedding-0.6B as asymmetric retrieval models on identical committed evidence. The contract controls only the shipped `transformers_local` default decision; it does not change production hybrid fusion or sqlite-vec score conversion.

## Inputs

- Provider mode: `lmstudio` or `transformers_local`.
- Explicit Nomic, EmbeddingGemma, and Qwen3-Embedding-0.6B model identifiers.
- Base URL when provider mode is remote.
- The committed benchmark corpus and its stable case/document identifiers.
- Resolved built-in profile for each model; raw fallback is invalid for the gate.
- Native output dimensions with provider-neutral normalization enabled: 768 for Nomic/EmbeddingGemma and 1024 for Qwen3-Embedding-0.6B.
- An explicit `--output` path. A default-decision run MUST use `openspec/changes/embedding-profiles-embeddinggemma/benchmark-result.json`.

Missing model/provider input, request failure, malformed response, raw fallback, unexpected dimensions, non-finite/zero vectors, or failure to persist the complete report makes the decision evidence incomplete. A missing model is fail-closed and does not authorize automatic download or loading.

## Corpus acceptance thresholds

Every eligible candidate MUST satisfy all thresholds:

- Recall@1 >= `0.80`.
- Recall@5 >= `0.95`.
- MRR >= `0.85`.

Each candidate is evaluated independently. To be eligible, EmbeddingGemma or Qwen3-Embedding MUST be no worse than Nomic on Recall@1, Recall@5, and MRR using an equality tolerance of `1e-12` and MUST satisfy every absolute threshold. Nomic is the relative comparator and is not required to satisfy these candidate thresholds. An ineligible candidate remains fully reported and does not prevent another complete eligible candidate from winning.

## Winner selection

The gate can pass only when all three runs are complete and at least one candidate is eligible. For each eligible candidate:

`qualityScore = (recallAt1 + recallAt5 + mrr) / 3`

The winner is selected by the following descending comparison with equality tolerance `1e-12`:

1. `qualityScore`;
2. MRR;
3. Recall@1;
4. Recall@5;
5. lexical profile ID ascending as the final stable tie-break.

Latency, dimensions, and model bytes are reported but never alter eligibility or winner selection in this change.

## Required report

The machine-readable workflow report uses `version: 1` and contains:

- provider mode and corpus case/document counts;
- per model: stable candidate key, requested model ID, resolved profile ID/version, complete/error state, expected/observed dimensions, minimum/maximum/mean vector norm, Recall@1, Recall@5, MRR, quality score, request count, elapsed milliseconds, median latency, p95 latency, model bytes when available, and errors;
- gate: thresholds, equality tolerance, per-candidate eligibility and per-metric comparisons, winner comparison/tie-break trace, `passed`, reasons, and `defaultDecision` equal to `embeddinggemma`, `qwen3`, or `nomic`;
- timestamp and a corpus identity hash so evidence cannot be mistaken for a different fixture set.

The human-readable report MUST render the same values without omitting incomplete runs, candidate rejections, tie-breaks, or gate failures. The command MUST write the complete JSON report atomically to `--output` before it renders the final exit status. A write failure is a failing run and cannot authorize a default change. This artifact is pre-archive workflow evidence only: product runtime and permanent tests MUST NOT import or read its active OpenSpec path.

## Exit and decision semantics

- Exit `0` only after all three runs are complete, at least one candidate is eligible, a deterministic winner is selected, and the complete report is persisted successfully.
- Exit non-zero for incomplete evidence, invalid vectors, no eligible candidate, ambiguous/unselectable winner, or persistence failure.
- Persist and render the complete report before setting a failing process exit code whenever report construction completed.
- During implementation, change the shipped static local-default constant only when the durable artifact has `gate.passed: true`, selecting exactly its `gate.defaultDecision` winner; independently compare the resulting constant to the artifact before archive.
- Keep Nomic as the shipped local default for `gate.passed: false`, missing/incomplete evidence, or any artifact/schema inconsistency.

Latency and footprint are reported for operator judgment but are not gate conditions in this change.
