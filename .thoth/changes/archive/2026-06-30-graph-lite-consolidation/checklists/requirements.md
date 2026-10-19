# Requirements Quality Checklist — graph-lite-consolidation

> "Unit tests for English." One section per authored delta domain, scored across
> completeness, clarity, measurability, testability. The spec → tasks transition
> is gated on every item being `- [x]` or explicitly waived.
>
> All three cross-cutting clarification markers are now RESOLVED by
> `sdd-clarify`: KG-RELATION-PARITY → CL-4 (preserve legacy labels via a
> hybrid-source adapter; B1 changes no observable output), VERSION-BUMP-LABEL →
> CL-5 (MINOR; confirmed at release), MIGRATION-HELPER-STYLE → CL-6 (use the
> existing `MIGRATIONS_SQL` try/catch mechanism). Residual clarification-marker
> count across the delta specs is 0; the checklist is clear for `sdd-design`.

## Domain: knowledge-graph

### Completeness
- [x] Single-source-of-truth requirement covers both read (no `observation_facts` reads) and write (no `observation_facts` writes)
- [x] Synchronous deterministic write-on-save requirement covers save, update, and upsert
- [x] Graceful-degrade-before-backfill requirement is stated with empty-but-valid (non-crash) behavior
- [x] Deterministic `inferred`-entity backfill for legacy string subjects/objects is specified and idempotent
- [x] Retired `observation_facts` fallback requirement is explicitly REMOVED with reason + migration
- [x] Relation-label parity for the three metadata-derived relations (`IN_PROJECT`/`HAS_TOPIC_KEY`/`HAS_TYPE`) is fully resolved — RESOLVED by CL-4 (adapter synthesizes them from observation columns with legacy labels; content relations from `kg_triples`)

### Clarity
- [x] Synchronous-vs-eventual boundary is unambiguous (graph synchronous; semantic eventual)
- [x] "Optional LLM enrichment only" role of `extract_kg` is stated without ambiguity
- [x] RFC 2119 keywords used throughout
- [x] Final semver label for the destructive drop is unambiguous — RESOLVED by CL-5 (MINOR: internal destructive drop, reconstructable backfill, no public-contract breakage; confirmed at release)

### Measurability
- [x] "Immediately queryable after save" is observable (queryable without background-job completion)
- [x] Idempotency is measurable (no duplicate equivalent triples; dedup by `triple_hash`)
- [x] Provenance/confidence parity between sync and background writes is inspectable

### Testability
- [x] Each requirement has at least one Given/When/Then scenario
- [x] Pre-backfill degraded behavior has a dedicated, executable scenario
- [x] Convergence of synchronous + background paths for one observation is a discrete scenario

## Domain: store

### Completeness
- [x] Adapter requirement specifies exact field mapping and accepted filters
- [x] Adapter parity requirement covers content-section relations, synthesized metadata relations (CL-4), and per-observation coverage
- [x] `getObservationFacts` redirect + indirect-reader inheritance is covered
- [x] All four direct `observation_facts` readers are enumerated and migrated
- [x] Synchronous writer removal covers all three call sites and the delete path
- [x] Rebuild repoint covers store method + CLI + HTTP
- [x] Portable export/import format preservation is covered (incl. unchanged `version`)
- [x] Table + 3 indexes removal is specified with ordered + reversible migration and rollback

### Clarity
- [x] Adapter mapping leaves no field underspecified
- [x] Ordering ("drop is the final, gated step") is explicit
- [x] Reversible flag-guarded cutover (`graphFactsSource`) semantics are stated for both flag values
- [x] Migration mechanism (structured helper vs. existing try/catch ALTER list) is decided — RESOLVED by CL-6 (use the existing `MIGRATIONS_SQL` try/catch ALTER/DDL list; no structured helper assumed)

### Measurability
- [x] Deterministic adapter ordering is assertable (identical input → identical order)
- [x] "No query against `observation_facts`" is observable per migrated reader
- [x] Drop idempotency (`DROP TABLE IF EXISTS`, no error on rerun) is measurable
- [x] Post-drop rollback "no data loss" is measurable (table derivable + repopulatable)

### Testability
- [x] Each requirement has at least one Given/When/Then scenario
- [x] Deleted-observation / non-`observation` source exclusion has a dedicated scenario
- [x] Flag-guarded rollback has discrete scenarios for both flag directions

## Domain: tools

### Completeness
- [x] Compact six-tool surface invariance under the consolidation is covered
- [x] `mem_project action=graph` KG-backed behavior-preservation is covered
- [x] `action=graph` output-budget preservation (`max_chars` min 200, no `0` sentinel) is covered
- [x] Pre-backfill graceful degradation for `action=graph` is covered

### Clarity
- [x] "Behavior-preserving" scope is defined (which relations / contributing observations)
- [x] No tool add/remove/rename/split — stated explicitly

### Measurability
- [x] Registry equality to the exact six tools is directly assertable
- [x] Output-budget minimum is a concrete numeric bound (200)

### Testability
- [x] Each requirement has at least one Given/When/Then scenario
- [x] Equivalence-to-pre-consolidation has an executable comparison scenario

## Domain: evals

### Completeness
- [x] `factsSourceChecks` redefinition to assert on `kg_triples` is covered
- [x] Fixture migration (`graph-lite`, `graph-rank`) off `observation_facts` is covered
- [x] "No eval path inserts into / filters on `observation_facts`" is covered

### Clarity
- [x] The check's new pass condition (KG evidence present + source-attributed) is unambiguous
- [x] kg-quality eval no-change assumption is recorded

### Measurability
- [x] Pass/fail of the facts-source check is observable from candidate sources
- [x] Absence of `observation_facts` inserts/filters is statically checkable

### Testability
- [x] Each requirement has at least one Given/When/Then scenario
- [x] Non-regression on the removed source is a discrete scenario

## Domain: indexing

### Completeness
- [x] Synchronous deterministic write-on-save requirement (CL-1) is covered with idempotency
- [x] `extract_kg` retained-as-enrichment requirement is covered, incl. failure isolation
- [x] `rebuild-graph` repoint covers CLI + store method + HTTP and operator backfill (CL-2)
- [x] Eventual-semantic vs. synchronous-graph distinction is captured (modified requirement)

### Clarity
- [x] Non-normative implementation note flags the needed factoring without over-specifying
- [x] "Optional, non-blocking" enrichment role is unambiguous

### Measurability
- [x] "Persisted before save returns, without LLM/remote service" is observable
- [x] Rebuild convergence (no duplicate triples on rerun) is measurable

### Testability
- [x] Each requirement has at least one Given/When/Then scenario
- [x] Enrichment-failure-preserves-deterministic-facts is a discrete scenario
