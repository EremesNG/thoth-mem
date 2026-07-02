# Proposal: Community Summaries LazyGraphRAG

## Intent

This Full SDD change advances roadmap item C3 for `thoth-mem`: add community
summaries inspired by LazyGraphRAG / community-report retrieval over the existing
knowledge graph, with `openspec` as the persistence mode for the SDD artifacts.

The goal is hierarchical, cheap high-level recall from the mature KG without
forcing agents to re-read many low-level observations. Community summaries should
give `mem_recall`, project summaries, and operator inspection a bounded,
high-signal view of related memory clusters while preserving the current
deterministic-first, compact-output contract.

## Scope

### In Scope

- Project-scoped KG community partitioning derived from the existing
  `kg_entities` + `kg_triples` graph.
- Bounded community-summary artifacts that are derived from KG structure and
  source observations, with deterministic extractive fallback as the required
  baseline.
- Optional future LLM enrichment hooks only where they are non-blocking,
  additive, and safely degradable.
- Storage and maintenance metadata needed to track community versions, source
  graph coverage, rebuild status, and degraded/fallback state.
- CLI and HTTP admin/rebuild/inspection surfaces for building or refreshing
  community summaries, following the existing admin-operation boundary.
- Retrieval integration that uses community summaries to improve KG evidence,
  ranking, or project-level summary context while preserving the existing four
  retrieval lanes: `sentence`, `chunk`, `lexical`, and `kg`.
- Evaluation coverage for deterministic community-summary quality,
  no-regression retrieval behavior, and degraded-state behavior when optional
  enrichment or community construction is unavailable.

### Deferred / Needs Discovery

- Exact clustering algorithm and dependency choice. The MVP should prefer
  deterministic, dependency-light, Node-friendly graph algorithms such as
  connected-components fallback and Louvain-style clustering. Exact Leiden
  clustering remains a discovery item because mature JavaScript support and
  native/toolchain risk need validation before it becomes load-bearing.
- Final persistence schema shape for community partitions and summaries,
  including whether summaries live in dedicated tables or as derived
  maintenance artifacts.
- Incremental rebuild strategy after graph updates, including how much work can
  be maintained automatically versus operator-triggered.
- Summary ranking/scoring details inside the KG lane and how community evidence
  interacts with B2 multi-hop, B3 superseded evidence, and C1 pruning.
- Optional LLM enrichment contract, provider configuration, timeout/cost limits,
  and explicit fallback output when enrichment is disabled or fails.

### Out of Scope

- Adding, removing, renaming, or splitting MCP tools. The public MCP surface MUST
  remain exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`,
  `mem_project`, and `mem_session`.
- Adding a fifth retrieval lane. Community summaries may influence KG evidence
  or project-summary context, but they MUST NOT create a new lane beside
  `sentence`, `chunk`, `lexical`, and `kg`.
- Creating a parallel graph-fact store. `kg_entities` + `kg_triples` remain the
  source of truth; the retired `observation_facts` model MUST NOT return.
- Full GraphRAG global answer synthesis, query-time subquery generation, or new
  claim extraction pipelines.
- Deleting source memories or weakening C1/C2 behavior. Supersession/pruning
  semantics, maintenance metadata behavior, and portable export/import stability
  must be preserved unless a later spec explicitly justifies an additive change.
- Making LLM summarization required for correctness, recall availability, or
  rebuild success.

## Approach

Use the existing KG as the only graph substrate, then layer a deterministic
community-summary maintenance artifact over it. A rebuild or refresh operation
will partition the project-scoped KG into bounded communities, derive summary
content from source observations and entity/relation evidence, and record enough
metadata to explain freshness, source coverage, algorithm version, and degraded
state.

Material behavior changes:

| Area | From | To | Reason | Impact |
| --- | --- | --- | --- | --- |
| High-level graph recall | KG retrieval surfaces direct and multi-hop evidence from individual triples/observations | KG retrieval and project summaries may also surface bounded community-level summaries | Reduce token cost for broad questions over related memory clusters | Better compact recall without changing the four-lane contract |
| Graph maintenance | Rebuild/admin surfaces operate on KG and indexes, plus shipped maintenance/prune flows | CLI/HTTP may add community-summary rebuild and inspection operations | Community summaries are derived artifacts that need operator visibility | Admin surfaces expand; MCP registry stays unchanged |
| Summary generation | No community-level artifact exists | Deterministic extractive summaries are required; optional LLM enrichment is additive | Keep offline/CI behavior correct and predictable | Safe degradation when models/providers are unavailable |
| Graph source of truth | `kg_entities` + `kg_triples` are authoritative; `observation_facts` is retired | Same source of truth; community artifacts reference KG/source observations | Avoid duplicate fact stores and preserve B1 consolidation | No parallel graph-fact persistence |

The full pipeline will next define RFC 2119 delta specs for the KG,
retrieval, store, tools/admin surfaces, evals, and any configuration domain
needed by the selected MVP. Clarify/design should validate the graph algorithm
choice, persistence shape, rebuild semantics, and exact retrieval scoring before
implementation tasks are produced.

## Affected Areas

- `openspec/specs/knowledge-graph/spec.md`: community partition semantics,
  summary provenance, deterministic fallback, supersession/pruning interaction.
- `openspec/specs/retrieval/spec.md`: KG-lane integration, ranking/degradation,
  no fifth retrieval lane, no regression to direct KG/multi-hop behavior.
- `openspec/specs/store/spec.md`: derived-artifact storage, rebuild metadata,
  export/import stability, transactional maintenance behavior.
- `openspec/specs/tools/spec.md`: unchanged six-tool MCP registry and any
  CLI/HTTP-only admin/inspection boundaries.
- `openspec/specs/evals/spec.md`: community-summary recall cases, no-regression
  gates, deterministic degraded fallback checks.
- Likely implementation areas for later phases: `src/store/`, `src/retrieval/`,
  `src/cli.ts`, `src/http-routes.ts`, `src/config.ts`, and retrieval evals.

## Risks

- Clustering dependency risk: exact Leiden may introduce immature JavaScript,
  native binary, or build-toolchain risk; the MVP should not make it
  load-bearing without evidence.
- Token-budget risk: community summaries could become another unbounded output
  source unless character limits, result caps, and compression metadata are
  specified from the start.
- Ranking risk: community evidence could swamp direct evidence or B2 multi-hop
  results if it is not constrained inside the existing KG lane.
- Freshness risk: stale community artifacts could mislead recall after graph
  updates unless rebuild/version metadata and degraded-state signaling are clear.
- Governance risk: exposing rebuild/inspection through MCP would violate the
  compact six-tool constitution; admin surfaces must stay CLI/HTTP.
- Data-model risk: storing derived communities must not reintroduce a parallel
  fact source or destabilize portable export/import.

## Rollback Plan

- Gate community-summary use behind configuration so retrieval can ignore the
  derived artifacts and return to the current four-lane baseline.
- Keep source observations, `kg_entities`, and `kg_triples` untouched by
  community-summary rollback; derived community rows/artifacts may be dropped or
  rebuilt from the KG.
- If optional LLM enrichment regresses reliability or cost, disable enrichment
  while retaining deterministic extractive summaries.
- If ranking regresses, disable community evidence in KG retrieval while leaving
  CLI/HTTP inspection and rebuild artifacts available for diagnosis.
- Avoid portable export/import format changes by default; if later specs justify
  one, include an explicit compatibility and rollback path.

## Success Criteria

- Community summaries are derived from `kg_entities` + `kg_triples` and do not
  read or recreate `observation_facts`.
- The MCP registry remains exactly six tools; any rebuild or inspection controls
  are CLI/HTTP only.
- Retrieval still exposes exactly four lanes and degrades deterministically when
  community summaries are missing, stale, disabled, or enrichment fails.
- The deterministic MVP can build bounded, project-scoped community summaries
  without remote services, embeddings, or LLMs.
- C1 supersession/pruning and C2 maintenance metadata behavior remain stable;
  no source memory is deleted.
- Retrieval evals pass with no unacceptable regression, including existing KG,
  multi-hop, supersession, pruning, and maintenance cases plus new community
  summary cases.
