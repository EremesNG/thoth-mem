# Requirements Quality Checklist — kg-supersedes-edges (B3)

"Unit tests for English." Each delta domain is checked across completeness,
clarity, measurability, and testability. The spec→tasks transition is gated on
every item being `- [x]` or explicitly waived.

## Domain: knowledge-graph
- [x] completeness: covers `SUPERSEDES` vocabulary add, deterministic ON-UPDATE
  DIFF detection (per-observation prior-vs-new diff primary + gated content
  patterns), false-supersession guards, and supersede-not-delete history
  preservation
- [x] completeness: all CLs touching detection (CL-1..CL-4, CL-7) recorded as
  RESOLVED Assumptions; the re-scope (removed cross-observation scan, added diff)
  is documented in CL-3 with zero open markers
- [x] clarity: primary diff signal vs secondary content-pattern signal, HIGH vs
  LOWER confidence, replacement (same subject+relation, different object) vs pure
  removal, and the threshold gate are stated unambiguously with RFC 2119 keywords
- [x] clarity: code anchors are accurate (shared writer `writeDeterministicKgFacts`
  → `persistKgExtraction` `jobs.ts:483,502`; blind delete `jobs.ts:537`;
  `triple_hash` `jobs.ts:552`; `refreshGraphFacts` `index.ts:1119-1126`)
- [x] measurability: scenarios assert binary outcomes (marked superseded / not;
  replacing-pointer set / NULL; present-as-history / deleted; duplicate / no
  duplicate)
- [x] measurability: model-free determinism is an explicit, checkable condition
  (no embedding model, no remote service)
- [x] testability: each requirement has ≥1 GWT; idempotency-on-identical-re-extract
  and no-cross-observation-supersession are independently testable
- [x] testability: flag-off byte-identical (delete+reinsert) behavior is asserted

## Domain: store
- [x] completeness: additive nullable columns, idempotent `addColumnIfMissing`
  migration in the live runner, the DIFF-and-mark-superseded write (replacing the
  blind delete+reinsert), `queryKnowledgeLane` deprioritize+flag, and
  export/import non-impact are all covered
- [x] clarity: "additive nullable only, no drops, backward-compatible" stated;
  live-runner placement (not the inert `MIGRATIONS_SQL`) called out per B1 CL-6
- [x] clarity: the diff write (prior-vs-new per `source_id`; supersede absent/
  replaced, keep both-present, insert new) and flag-off revert to delete+reinsert
  are stated unambiguously
- [x] measurability: migration idempotency, NULL-means-current, no-blind-delete,
  and flag-off byte-identical candidates are concrete assertions
- [x] measurability: export `version` unchanged and supersession columns absent
  from export are explicit
- [x] testability: migration re-run no-op, immediate post-save queryability,
  identical-re-extract convergence, and current-above-superseded ranking are each
  testable
- [x] clarity: shared-writer location (`persistKgExtraction`, also used by
  `extract_kg`/`rebuild-graph`), the `triple_hash` re-assert revive wrinkle, the
  storage-growth tradeoff, and dangling `superseded_by_triple_id` (no-error
  history) are all addressed
- [x] completeness: write call sites (`:1515`/`:1545`/`:1664`/`:3416`) and the
  `queryKnowledgeLane` emit point (`:2112-2130`) are anchored
- [x] testability: P5 (history preserved, no blind delete) and P2 (deterministic)
  are both checkable

## Domain: retrieval
- [x] completeness: fusion deprioritization AND multi-hop traversal preference,
  four-lane contract preservation, and flag-off baseline-identity all covered
- [x] clarity: "deprioritize, not drop/hide" and "B2 bounds unchanged" stated
  explicitly with the deprioritize-vs-skip default resolved (deprioritize)
- [x] measurability: current-above-superseded after fusion, lane set invariant
  (`sentence/chunk/lexical/kg`), and direct-above-multi-hop weighting are concrete
- [x] measurability: lane-weight constants are code-accurate (`kg=0.9`,
  multi-hop `0.7`)
- [x] testability: flag-off identical retrieval output and B2-bound preservation
  are independently testable
- [x] clarity: "Fuse Four Lanes" and "Degrade by Lane" are named as preserved

## Domain: config
- [x] completeness: four knobs (master enable, content-pattern flag, confidence
  threshold, deprioritize weight) with types, defaults, env names, and schema
  documentation
- [x] clarity: env > persisted > default precedence and `parseBoolean`/`parseNumber`
  parsing stated; master-flag gating of all B3 behavior is explicit
- [x] measurability: each default value is concrete (`true`/`false`/`0.8`/`0.5`)
  and asserted in scenarios
- [x] measurability: default-ON-gated-by-eval and content-pattern independence are
  checkable conditions
- [x] testability: env-wins, persisted-when-unset, defaults-when-unset, and
  schema-validation scenarios are each runnable
- [x] clarity: working-name disclaimer prevents over-constraining the design

## Domain: evals
- [x] completeness: supersession-wins case (built via SAVE-then-UPDATE on the same
  `topic_key` so the diff fires) AND OFF-vs-ON no-regression gate (including B2
  multi-hop re-validation) are covered
- [x] clarity: the no-regression gate is named as the default-ON acceptance
  condition (B2 precedent), with the regression→flip-default rule stated; the
  fixture explicitly uses on-update diff, not the removed cross-observation scan
- [x] measurability: "updated fact ranks above the replaced fact", "no worse on
  pass/rank", and "replaced fact still present (flagged), not deleted" are concrete
- [x] testability: OFF and ON runs are explicit, comparable, and fixture-seeded via
  the KG path (`src/evals/retrieval.ts`)
- [x] completeness: B2 multi-hop cases explicitly re-validated under supersession ON

## Domain: tools
- [x] completeness: `action=graph` current-state default, history reachability,
  flag-off byte-identity, unchanged `max_chars` budget, and unchanged MCP surface
- [x] clarity: the one intentional default-view change is scoped to `action=graph`
  and conditioned on the flag; `mem_recall` annotation is cross-referenced to the
  retrieval delta
- [x] measurability: byte-for-byte flag-off ledger, `max_chars` min `200`, no
  unbounded sentinel, and exact six-tool registry are concrete assertions
- [x] testability: current-state default, history-reachable, flag-off parity, and
  registry-unchanged scenarios are each runnable
- [x] clarity: constitution **P1** (no tool surface change) and **P5** (history
  preserved) are explicitly tied to scenarios

## Final Implementation Gate
- [x] full suite passed on 2026-07-01: `pnpm test` reported 46 files and 529
  tests passing.
- [x] retrieval eval passed on 2026-07-01: `pnpm run eval:retrieval` reported 23
  passing cases, including `supersession current fact wins`, with Recall@5 100.0%
  and MRR 0.978; supersession OFF/ON no-regression and flag-off behavior gates
  both reported 100.0%.
- [x] build passed on 2026-07-01: `pnpm run build` completed TypeScript and
  dashboard builds successfully.
- [x] shipped default: `DEFAULT_KNOWLEDGE_GRAPH_CONFIG.kgSupersedeEnabled`
  remains `true` because the default-ON eval gate passed without regression.
- [x] version bump label: MINOR, because the change is additive and
  backward-compatible with no portable export/import contract expansion.
