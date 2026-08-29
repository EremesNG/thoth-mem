# Archive Report: Promote E0 as the Lexical Default

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-08-28-promote-e0-lexical-default/`

Resolved target for this closeout: `openspec/changes/archive/2026-08-28-promote-e0-lexical-default/`.

## Completed scope

- Promoted `strict-selected-any-cap5-rrf-v1` as the no-override runtime lexical default through one production constant and the existing shared `MemoryService` seam.
- Preserved all explicit strategy identities, immutable reports/hashes, schema revision 5, exact six MCP tools, public schemas, persistence, dependencies, and zero embedding/vector/model/network behavior.
- Recorded the later lexical-only product decision: E0 419/470 exceeds agentmemory BM25-only 409/470; agentmemory BM25+Vector 95.2% is reserved for a future semantic SDD.

## Verification lineage

- `plan-review.md` records fresh pre-implementation Oracle `[OKAY]` against the ready artifact digests.
- `verify-report.md` records a separate fresh Oracle PASS with complete FR-001–FR-004 and SC-001–SC-004 evidence.
- TDD red/green, build, focused 27/27 and 4/4, comparison 18/18, full 41 files/240 tests twice, integrations, packed smoke, fixture, prepublish, hashes, and diff checks passed.

## Canonical specification sync

- Updated: `evals`, `retrieval`.
- Declared targets: canonical `retrieval` and `evals` specifications.

## Deviations and residual warnings

- The immutable v3 report still says `retain_default` under its former hybrid-parity policy by design; the subsequent lexical-only promotion is represented by this SDD, source, tests, and durable documentation without rewriting historical evidence.
- The official v3 report is inherited untracked evidence from the prior archived but uncommitted E0 implementation. Its SHA and validator pass; preserve it with the combined worktree.

## Follow-up

- If embeddings are reconsidered, start a new SDD with agentmemory BM25+Vector `95.2%` as the semantic comparison and explicit latency, model-footprint, database, privacy, and local-operation gates.
