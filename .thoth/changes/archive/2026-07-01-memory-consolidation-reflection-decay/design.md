# Design: Memory Consolidation, Reflection, and Decay

## Technical Approach

Add a store-owned maintenance layer that records deterministic, reversible maintenance outcomes beside the existing portable memory records. The implementation keeps `observations`, `user_prompts`, `sessions`, `kg_entities`, and `kg_triples` as the source records; it adds internal maintenance metadata for runs, consolidation clusters, source links, reflections, and decay scores. Retrieval and context assembly consume that metadata only when the read-path maintenance switch is enabled.

The baseline path is deterministic-first: exact hash, topic key, project/scope, title/content lexical overlap, chronology, observation type, and KG-compatible evidence are enough to produce dry-run/apply results. Semantic vectors, sqlite-vec, and optional model-assisted wording may add candidate signals later in the run, but degraded optional signals must be reported per run and cannot block source saves, lexical retrieval, or KG retrieval.

Reflected learnings are stored as ordinary portable observations, using the existing observation taxonomy, preferably `type: 'learning'`, a stable maintenance topic key, and `tool_name: 'maintenance-reflection'`. Their source lineage, synthesis reason, maintenance run, and deterministic source-set hash live in internal maintenance metadata. Because the reflected record is an ordinary observation, existing export/import includes it without a format bump, while consolidation and decay metadata remain internal and regenerable after import.

Manual maintenance is exposed through the existing admin boundary pattern: CLI plus HTTP routes, not MCP tools. The initial scope model is intentionally small: all records, one project, one exact topic key, or one topic-key prefix. Dry-run must compute the same selected outcomes as apply and return counts, degraded signal state, review-required candidates, and planned reflected records without writing. Apply wraps the selected consolidation, reflection, and decay writes in one SQLite transaction.

Retrieval continues to use the existing four lanes (`sentence`, `chunk`, `lexical`, `kg`) and `fuseCandidates()` ranking flow. Maintenance metadata is applied as a post-candidate ranking/evidence transform, not as a fifth lane: duplicate cluster members are collapsed to the store-selected canonical record by default, reflected records may receive a configured boost, and decayed records receive a configured down-weight. Full-record retrieval by id remains the recovery path for every source record.

Handoff hints preserved:
- Ordinary portable reflected-record storage is preserved by storing reflections as normal observations.
- Read-path consumption and baseline rollback are separate config behavior.
- Consolidation canonical ownership is recorded in store maintenance metadata.
- First admin scope model is limited to all, project, topic key, or topic-key prefix.
- Eval signal classes are fixture-defined and never inferred from the decay or maintenance score being tested.

## Architecture Decisions

### Decision: Store-Owned Maintenance Metadata
**Choice**: Add internal tables for `maintenance_runs`, `maintenance_consolidations`, `maintenance_consolidation_members`, `maintenance_reflections`, `maintenance_reflection_sources`, and `maintenance_decay`, managed by `Store`.

**Alternatives considered**: Encode maintenance state directly on `observations`; store consolidation/decay inside `kg_triples`; export all maintenance state as portable data.

**Rationale**: Separate metadata keeps source records intact, keeps `kg_triples` as the only graph-derived fact source, supports deterministic dry-run/apply parity, and makes rollback config-only. It also keeps internal regenerable state out of the portable export format while allowing reflected records to remain portable.

### Decision: Reflections Are Ordinary Observations
**Choice**: Store reflected durable learnings as ordinary `observations` with stable `topic_key`, `type: 'learning'`, and maintenance provenance in internal tables.

**Alternatives considered**: Add a new portable record kind; store reflections as session summaries; keep reflections only in internal metadata.

**Rationale**: Ordinary observations preserve harness-agnostic portability, work with existing FTS, semantic indexing, KG extraction, `mem_get`, export/import, and sync behavior, and avoid expanding the observation taxonomy or export schema.

### Decision: Read-Path Consumption Is Independently Disableable
**Choice**: Add separate config switches for maintenance execution, automatic jobs, and read-path consumption. Disabling read-path consumption ignores consolidation/decay metadata and special reflection promotion while leaving stored records and metadata untouched.

**Alternatives considered**: One global maintenance flag; migration-based rollback; deleting generated metadata on disable.

**Rationale**: The specs require post-C1 baseline rollback without migration. Separate switches let operators stop new maintenance while still auditing old runs, or disable ranking effects while preserving provenance.

### Decision: Four Retrieval Lanes Stay Canonical
**Choice**: Apply consolidation, reflection, and decay as a ranking/evidence transform around existing hybrid retrieval, preserving `sentence`, `chunk`, `lexical`, and `kg` lanes.

**Alternatives considered**: Add a maintenance lane; pre-filter decayed records globally; rewrite lane candidates to synthetic maintenance candidates.

**Rationale**: The constitution requires deterministic degradation and bounded recall. Keeping the lane set unchanged avoids contract churn, preserves existing eval semantics, and keeps degraded-state reporting attached to existing lexical, semantic, and KG paths.

### Decision: Manual Admin First, Automatic Work Bounded
**Choice**: Implement manual dry-run/apply through CLI and HTTP first, then optional automatic jobs using the existing `semantic_jobs` style or a dedicated maintenance job kind when enabled.

**Alternatives considered**: Run maintenance inline after every save; expose maintenance through MCP; make automatic maintenance default-on.

**Rationale**: Inline maintenance risks save latency and false-positive consolidation. CLI/HTTP matches existing `rebuild-graph`, `prune-graph`, and `rebuild-index` boundaries, while preserving the compact six-tool MCP surface.

### Decision: Fixture-Defined Eval Signals
**Choice**: Extend retrieval eval fixtures with explicit roles such as high-signal, low-value, stale, duplicate-source, canonical-expected, and reflected-expected.

**Alternatives considered**: Infer eval classes from maintenance scores; assert only aggregate score movement.

**Rationale**: The eval must test the maintenance score, not define expected truth from that same score. Fixture-defined labels make duplicate suppression, reflection promotion, and decay down-weighting measurable and reproducible.

## Data Flow

Manual dry-run:
1. CLI or HTTP parses scope: all, project, topic key, or topic-key prefix.
2. `Store.evaluateMaintenance()` loads eligible live records and effective maintenance config.
3. Deterministic candidate generation produces consolidation clusters, reflection candidates, and decay decisions with reason classes.
4. Optional semantic/model signals are appended when available; unavailable optional signals are reported as degraded.
5. The store returns a preview result with stable candidate keys, canonical ids, source ids, proposed reflected observation payloads, decay states, counts, and warnings.
6. No source records or maintenance metadata are written.

Manual apply:
1. CLI or HTTP calls the same evaluation path with `dryRun: false`.
2. `Store.runMaintenance()` opens one transaction.
3. The store inserts a `maintenance_runs` row and selected consolidation, reflection, and decay metadata.
4. For reflections, the store upserts one ordinary observation per stable reflection key, then records source links in `maintenance_reflections` and `maintenance_reflection_sources`.
5. The transaction commits all selected outcomes or rolls back all maintenance writes.
6. The result returns counts, run id, degraded signals, review-required candidates, and reflected observation ids.

Read path:
1. `hybridRetrieve()` gathers candidates from the existing sentence, chunk, lexical, and KG lanes.
2. If `maintenance.readPath.enabled` is false, the result follows post-C1 baseline rules over the same portable records.
3. If enabled, the store loads active consolidation canonical mappings, reflection lineage, and decay scores for candidate ids.
4. Consolidated cluster members are suppressed behind the store-recorded canonical id, with provenance metadata attached.
5. Reflection boost and decay down-weight are applied deterministically within existing fusion/ranking data.
6. `mem_recall`, `mem_context`, observatory recall, and project summary render annotations for consolidation, reflection lineage, and decay state when those effects are present.
7. `mem_get` remains id-based and bypasses suppression, returning any live source observation or prompt directly.

Export/import:
1. `exportData()` continues exporting sessions, observations, and prompts only.
2. Reflected observations are included because they are normal observations.
3. Internal consolidation and decay tables are not exported.
4. `importData()` accepts existing exports without maintenance metadata.
5. Maintenance can be rerun after import to regenerate internal consolidation and decay state.

## File Changes

Created:
- `openspec/changes/memory-consolidation-reflection-decay/design.md`

Planned implementation changes:
- `src/config.ts`: add `MaintenanceConfig`, defaults, persisted merge, env parsing, and independent execution/read-path/automatic switches.
- `config.schema.json`: document closed-object `maintenance` settings and defaults.
- `src/store/schema.ts`: add internal maintenance tables and indexes.
- `src/store/migrations.ts`: add idempotent migration helpers for maintenance tables/indexes.
- `src/store/types.ts`: add maintenance scope, config-facing result, run, consolidation, reflection, decay, and evidence annotation types.
- `src/store/maintenance.ts` or `src/store/maintenance/*.ts`: implement deterministic candidate generation, reflection payload generation, decay policy, dry-run/apply planning, and result formatting helpers.
- `src/store/index.ts`: expose `evaluateMaintenance()` and `runMaintenance()`, wire transaction ownership, read maintenance metadata during hybrid retrieval/context, and keep export/import portable.
- `src/retrieval/ranking.ts`: extend candidate/hit metadata for maintenance annotations and score multipliers without adding a lane.
- `src/tools/mem-recall.ts`: render maintenance annotations in compact and context modes.
- `src/tools/mem-context.ts`: include annotations in optional fused recall and project/session context where shared formatting returns them.
- `src/tools/mem-get.ts`: show reflected/source lineage and decay state as metadata while preserving direct id fetch.
- `src/tools/mem-project.ts` and `src/tools/project-views.ts`: let project summary consume maintenance-aware context; keep graph KG-backed and not a maintenance dashboard.
- `src/cli.ts`: add `maintain-memory` or equivalent admin command with `--dry-run`, `--apply`, `--all`, `--project`, `--topic-key`, and `--topic-prefix`.
- `src/http-routes.ts`: add HTTP admin handlers for maintenance preview/apply and operation catalog entries.
- `src/http-server.ts`: route maintenance admin endpoints.
- `src/http-openapi.ts`: document maintenance admin endpoints and response shapes.
- `src/evals/retrieval.ts`: add fixture-defined duplicate/reflection/decay cases and disabled/enabled no-regression comparisons.
- `tests/store/*.test.ts`: add maintenance transaction, dry-run/apply parity, provenance, idempotency, rollback, export/import, and KG composition tests.
- `tests/tools/*.test.ts`: verify exact six-tool registry and rendered annotations.
- `tests/cli.test.ts`, `tests/http-server.test.ts`: verify admin dry-run/apply scopes and absence from MCP.
- `tests/config.test.ts` or nearest existing config tests: verify env precedence, schema acceptance, closed unknown properties, and disablement.

Deleted:
- None.

## Interfaces / Contracts

Configuration contract:
- `maintenance.enabled`: enables manual maintenance execution paths; default `true` for manual dry-run availability, but mutating automatic work remains off.
- `maintenance.automatic.enabled`: enables bounded automatic maintenance jobs; default `false`.
- `maintenance.readPath.enabled`: enables retrieval/context consumption of consolidation, reflection promotion, and decay metadata; default `true` for already-recorded reversible metadata, with `false` restoring post-C1 baseline ranking/evidence over the same records.
- `maintenance.defaultMode`: `dry-run` or `apply`; default `dry-run` for admin commands.
- `maintenance.consolidation.enabled`, threshold fields, and review-required thresholds.
- `maintenance.reflection.enabled`, source-count limits, content budget, and optional model-assistance toggle.
- `maintenance.decay.enabled`, reversible ranking weights, age/redundancy/source-type thresholds, and reason classes.
- Env overrides use `THOTH_MAINTENANCE_*` names and must win over persisted config.

Store contract:
- `evaluateMaintenance(input): MaintenanceRunPreview` computes deterministic outcomes without writes.
- `runMaintenance(input): MaintenanceRunResult` applies the same selected outcomes transactionally.
- `MaintenanceScope` supports `{ all: true }`, `{ project }`, `{ topic_key }`, or `{ topic_prefix }`.
- Consolidation metadata records `canonical_kind`, `canonical_id`, `cluster_key`, `reason_class`, `signal_json`, `run_id`, and source members.
- Reflection metadata records `reflection_observation_id`, `source_set_hash`, `reason_class`, `run_id`, and source members.
- Decay metadata records `source_kind`, `source_id`, `score`, `state`, `reason_class`, `policy_json`, and `run_id`.

Retrieval/tool contract:
- No MCP tool is added, removed, renamed, or split. `ALL_TOOLS` remains exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, `mem_session`.
- `HybridHit.evidence` may include maintenance annotations, but `RetrievalLane` remains `sentence | chunk | lexical | kg`.
- `mem_recall` and context outputs must identify consolidation, reflection lineage, and decay state when those effects influence returned evidence.
- `mem_get` by id remains authoritative for source recoverability.
- `mem_project action=graph` remains KG-backed and must not list maintenance run dashboards.

Portable data contract:
- `ExportData.version` does not change for consolidation/decay metadata.
- Reflected observations export/import as normal observations.
- Imports without maintenance metadata remain valid.

## Testing Strategy

Store tests:
- Dry-run returns identical candidates on repeated runs and mutates no source or metadata tables.
- Apply writes consolidation, reflection, and decay in one transaction; injected failure rolls back all maintenance writes.
- Consolidation preserves every source row and records canonical/member provenance.
- Ambiguous similar decisions are kept separate or marked review-required.
- Reflection reruns over unchanged inputs reuse/upsert one reflected observation and do not duplicate outputs.
- Decayed records remain live and directly fetchable; disabling decay/read-path consumption restores baseline ranking.
- Export/import includes source and reflected observations and omits/regenerates internal consolidation/decay metadata.
- KG tests prove no `observation_facts` resurrection, no decay-triggered KG pruning, and distinct decay/supersession evidence states.

Retrieval and tool tests:
- Consolidated duplicate clusters return one primary result by default and expose suppressed source ids.
- Reflections can rank above lower-signal sources while exposing lineage.
- Decay down-weights stale/low-value fixture records but does not globally hide them.
- Disabled read-path consumption matches post-C1 baseline rules over the same records.
- `mem_recall`, `mem_context`, and `mem_project action=summary` render annotations within existing budgets.
- `mem_get` fetches suppressed or decayed sources by stable id.
- Tool registry tests assert exactly six compact MCP tools.

Admin/config tests:
- CLI and HTTP maintenance dry-run/apply support all, project, topic-key, and topic-prefix scopes.
- Dry-run reports candidate counts and does not mutate tables.
- HTTP/OpenAPI/catalog describe maintenance admin endpoints outside MCP.
- Env overrides beat persisted config; invalid config values fail safe.
- `config.schema.json` accepts known maintenance settings and rejects unknown properties in closed objects.

Eval tests:
- Duplicate, reflection, and decay scenarios use fixture-defined signal classes and stable ids.
- Existing retrieval fixtures run with maintenance consumption disabled and enabled.
- Enabled results must not regress pass/rank criteria except for expected duplicate suppression where answer reachability and source fetchability are proven.
- Export/import eval proves reflected records survive and internal metadata can be recomputed.

Verification commands:
- Focused first: `pnpm test -- tests/store/<maintenance-test>.test.ts`, `pnpm test -- tests/tools/<maintenance-rendering-test>.test.ts`, and relevant config/admin tests.
- Broader gates after shared behavior changes: `pnpm run build`, `pnpm test`, and `pnpm run eval:retrieval`.

## Migration / Rollout

The schema change is additive. New maintenance tables and indexes are created with idempotent `CREATE TABLE IF NOT EXISTS` / migration helpers. Existing stores require no destructive migration and no rewrite of source records.

Default rollout is conservative:
- Manual dry-run is available through admin surfaces.
- Automatic mutating maintenance defaults off.
- Decay defaults to reversible ranking metadata only.
- Consolidation suppresses duplicate influence but never deletes source records.
- Reflections are normal observations with source-linked metadata.
- Read-path maintenance consumption can be disabled independently for baseline rollback.

Rollback is config-only for ranking effects: disable automatic maintenance and read-path consumption. Reflected observations remain ordinary records; operators can inspect or remove them through existing explicit observation deletion paths if needed, but rollback does not require deletion or schema rollback.

## Open Questions

- Exact numeric defaults for consolidation similarity thresholds, reflection source-count limits, and decay weights should be selected during task implementation based on focused tests and eval evidence.
- Whether automatic maintenance should reuse `semantic_jobs` with new job kinds or use separate `maintenance_jobs` metadata depends on implementation complexity; either path must preserve bounded, retryable, idempotent behavior.
- Optional model-assisted reflection wording is allowed by the spec, but baseline implementation should prioritize deterministic reflection first and leave model wording behind a config flag.

## Constitution Check

Result: pass.

- P1 Compact, Workflow-Level MCP Surface: Pass. Maintenance admin stays CLI/HTTP; no MCP tool changes are planned.
- P2 Deterministic-First Retrieval With Safe Degradation: Pass. Deterministic candidate generation is baseline; optional semantic/model signals degrade explicitly.
- P3 Harness-Agnostic Memory Contract: Pass. Reflections are ordinary portable observations; internal metadata is additive and regenerable; no harness-specific fields are required.
- P4 Token-Efficient, Bounded Recall Outputs: Pass. The compact/context/get funnel remains intact; maintenance annotations are added to existing bounded outputs.
- P5 Stable Public Contract With Explicit Deprecation Discipline: Pass. No public tool, route removal, CLI rename, or taxonomy change is planned; new admin routes/commands are additive.
