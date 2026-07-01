# Requirements Quality Checklist — kg-superseded-pruning (C1)

"Unit tests for English." Each delta domain is checked across completeness,
clarity, measurability, and testability. The spec→tasks transition is gated on
every item being `- [x]` or explicitly waived. The four items formerly BLOCKED on
`[NEEDS CLARIFICATION]` markers (slot key, hook point, master-flag default, keep-N
default + scope) were RESOLVED in the clarify phase and are now `- [x]`; the delta
specs carry the decisions in their `## Decisions (resolved in clarify)` sections.
No `[NEEDS CLARIFICATION]` markers remain.

## Domain: knowledge-graph
- [x] completeness: covers keep-N-most-recent-per-slot retention, deterministic
  ordering (`superseded_at` DESC, `id` DESC), current-never-pruned invariant,
  automatic incremental enforcement gated by the master flag composed with B3, and
  no-cross-slot / no-current-deletion safety
- [x] clarity: bounded-retention vs supersede-not-delete P5 tension is stated
  explicitly; current = both supersession columns NULL is unambiguous with RFC 2119
  keywords
- [x] measurability: scenarios assert binary/countable outcomes (exactly N
  retained, `k` pruned, zero current pruned, tie broken by id, idempotent re-prune)
- [x] measurability: model-free determinism (no embedding model, no remote service)
  is an explicit checkable condition
- [x] testability: keep-N boundary (exactly N, N+1, N+k), keep-N=0, tie-on-
  `superseded_at`, and flag-off byte-identity are each independently testable
- [x] clarity: exact slot key RESOLVED (clarify) as
  `(source_id, subject_entity_id, relation)`, per-observation, non-cross-observation
  — see knowledge-graph delta Decisions (slot-key fork)
- [x] clarity: automatic-trigger hook point RESOLVED (clarify) — enforcement inside
  the shared writer `persistKgExtraction` after B3 supersede-marking, scoped to
  touched slots, entered only when both flags ON; byte-identity proof detailed in
  design — see knowledge-graph delta Decisions (hook-point fork)

## Domain: store
- [x] completeness: deterministic transactional `pruneSupersededTriples`
  (`project`/`dryRun`), keep-N prune-set computation, dangling-ref NULLing, orphan-
  entity cleanup (gated), delete-path non-interference, and export/import non-impact
  are all covered
- [x] clarity: FK cascade is entity→triple only (so orphan cleanup is explicit),
  and the same-transaction ordering (NULL refs → delete → clean orphans) are stated
  unambiguously
- [x] clarity: reuses B3's NULL-dangling idiom (`index.ts:1151-1158`) and the
  `rebuildObservationFacts` count idiom (`index.ts:3469-3497`); anchors accurate
- [x] measurability: all-or-nothing on failure, dry-run mutates nothing, dry-run
  preview == real prune set, deterministic prune set, and integrity-holds-after-
  prune are concrete assertions
- [x] measurability: export `version` unchanged and pruning state absent from
  export are explicit (Success Criterion 6)
- [x] testability: keep-N enforcement, project scope, dry-run/real equivalence,
  dangling-ref NULLing, orphan cleanup on/off, and delete-path interaction are each
  testable
- [x] testability: P5 (only superseded pruned; current preserved) and P2
  (deterministic, no model) are both checkable

## Domain: indexing
- [x] completeness: `prune-graph` as CLI (`--project`/`--all`/`--dry-run`) + HTTP
  `POST /graph/prune`, dry-run preview + count reporting, delegation to the shared
  store method, and safe no-op when supersession is off are all covered
- [x] clarity: admin-ops-are-not-MCP boundary (constitution **P1**) is explicit;
  `prune-graph` mirrors `rebuild-graph` entry points with accurate anchors
  (`cli.ts:569-588/:34/:700`; `http-routes.ts:61/:71/:573-581`)
- [x] measurability: "not registered as an MCP tool", "dry-run mutates nothing",
  and "reports before/after counts" are concrete assertions
- [x] testability: CLI + HTTP dry-run vs real, MCP-registry-unchanged, and no-op-
  when-supersession-off scenarios are each runnable
- [x] clarity: manual op availability is decoupled from `kgPruneEnabled` (which
  gates only the automatic path) and stated explicitly

## Domain: retrieval
- [x] completeness: retrieval read path unchanged by pruning, output-depends-only-
  on-surviving-rows, B3 deprioritization + B2 bounds preserved, and flag-off byte-
  identity are all covered
- [x] clarity: "pruning removes rows, not scoring logic" and "retrieval reads no C1
  knob" are stated explicitly, making flag-off byte-identity trivial-but-asserted
- [x] measurability: identical output over surviving rows, current-fact rank
  unchanged, four-lane invariant, and flag-off identical output are concrete
- [x] testability: pruned-vs-unpruned equivalence over surviving rows and flag-off
  identity are independently testable
- [x] clarity: no point-in-time mode is (re)confirmed out of scope; supersession
  stays a B3 down-weight + flag

## Domain: config
- [x] completeness: three knobs (`kgPruneEnabled`, `kgSupersededKeepN`,
  `kgPruneOrphanEntities`) with types, defaults, env names, schema documentation,
  and master-flag gating composed with B3
- [x] clarity: env > persisted > default precedence and `parseBoolean`/`parseNumber`
  parsing stated; automatic-vs-manual gating boundary is explicit
- [x] measurability: default values are concrete (`false`/`10`/`true`), keep-N=0 is
  a valid non-substituted value, and schema accept/reject are checkable
- [x] testability: env-wins, persisted-when-unset, defaults-when-unset, keep-N=0,
  schema-validate, and schema-reject-unknown scenarios are each runnable
- [x] clarity: working-name disclaimer prevents over-constraining the design
- [x] measurability: shipped master-flag DEFAULT RESOLVED (clarify) — `kgPruneEnabled`
  default `true` gated by the eval no-regression gate, fallback `false` if the gate
  regresses — see config delta Decisions (default-ON-gated-by-eval fork)
- [x] measurability: shipped keep-N default + scope RESOLVED (clarify) —
  `kgSupersededKeepN` default `10`, global default overridable per project — see
  config delta Decisions (N default + scope fork)

## Domain: tools
- [x] completeness: unchanged six-tool MCP surface, `prune-graph` not an MCP tool,
  and `mem_project action=graph` behavior unaffected by pruning are all covered
- [x] clarity: the admin-op (CLI/HTTP) vs MCP boundary is the tools-side
  counterpart of the indexing requirement; constitution **P1** tied to scenarios
- [x] measurability: exact six-tool registry and "no pruning MCP tool" are concrete
- [x] testability: registry-unchanged and `action=graph`-unaffected scenarios are
  runnable
- [x] clarity: the bounded-history reachability caveat (retained window, not full
  chain) is disclosed and framed as intended behavior, not a surface change

## Domain: evals
- [x] completeness: keep-N retention case (built via SAVE-then-UPDATE so the B3
  diff fires) with dry-run/real equivalence, AND OFF-vs-ON no-regression gate
  (including B2 multi-hop + B3 supersession re-validation) are covered
- [x] clarity: the no-regression gate is named as the acceptance condition for any
  default-ON decision; the fixture explicitly uses the on-update diff, not a removed
  cross-observation scan
- [x] measurability: "at most N superseded retained", "current not pruned", "no
  worse on pass/rank", and "dry-run == real prune set" are concrete
- [x] testability: OFF and ON runs are explicit and comparable; fixtures seed via
  the KG path (`src/evals/retrieval.ts`) with a small keep-N for deterministic
  outcomes
- [x] completeness: B2 multi-hop and B3 supersession cases explicitly re-validated
  under pruning ON
