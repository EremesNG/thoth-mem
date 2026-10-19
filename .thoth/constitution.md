<!--
Sync Impact Report
- Version change: 1.1.0 -> 2.0.0
- Modified principles: P1 gate implications; P2 deterministic retrieval boundary;
  P3 schema and harness compatibility boundary; P5 public-contract governance.
- Added sections: Governance.
- Removed sections: None.
- Templates: ✅ AGENTS.md already aligned; ✅ docs/agent/persistence-retrieval.md
  updated; ✅ docs/agent/surfaces.md updated; ✅ thoth-sdd templates compatible;
  ✅ openspec/config.yaml destructive-delta warning remains applicable.
- Follow-up TODOs: None. The selected Full SDD product reset owns canonical-spec
  reconciliation before implementation.
-->
# Project Constitution — thoth-mem

**Version**: 2.0.0<br>
**Ratified**: 2026-06-29<br>
**Last amended**: 2026-08-24

Status: Ratified

> This is an initial baseline constitution derived from README.md, openspec/config.yaml, and
> openspec/specs/ at version 0.3.6. It captures engineering invariants that are already
> demonstrated by the project. Additions or redefinitions are governed by sdd-constitution;
> see Semver Bump Policy below.

---

## Semver Bump Policy

| Change | Bump |
|---|---|
| Principle removed or its core statement redefined | MAJOR |
| Principle added or guidance materially expanded | MINOR |
| Wording clarification, example added | PATCH |

Each edit appends an entry to the Sync-Impact Report section below. No automated bump exists.

## Governance

- Amendments require explicit user direction and propagation to every affected
  template, instruction, and durable workflow surface.
- MAJOR versions remove or redefine a principle or governance compatibility boundary.
- MINOR versions add a principle or materially expand governance guidance.
- PATCH versions clarify wording without changing governance meaning.

---

## Principles

### P1 — Compact, Workflow-Level MCP Surface

**Statement:** The MCP server MUST expose exactly six workflow-level tools
(`mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, `mem_session`).
No additional MCP tools SHALL be added without a spec change. Legacy granular tools
MUST NOT be re-registered.

**Rationale:** Agent harnesses impose per-tool routing overhead and context cost.
A compact surface keeps prompt injection minimal, prevents tool-sprawl, and makes the
contract stable across harness versions. Admin and sync operations belong on the CLI
and HTTP API, not the MCP surface.

**Gate Implications:** Any proposal that registers a new MCP tool, exposes an admin
operation as an MCP tool, or removes an existing tool from the six MUST go through a
MAJOR spec change with explicit contract and migration impact.

---

### P2 — Deterministic Core With Rebuildable Optional Projections

**Statement:** Core retrieval MUST produce deterministic, reproducible, bounded
results from SQLite FTS5 and structured filters without requiring embeddings, a
knowledge graph, a reranker, an LLM, or a remote service. Vector, entity, graph,
profile, and other semantic lanes MAY exist only as rebuildable projections over the
SQLite source of truth. Optional projection failure or absence MUST preserve lexical
recall and MUST be signaled explicitly rather than silently changing the contract.

**Rationale:** The product must remain useful in offline and CI environments and must
not make operationally expensive features load-bearing before equal-budget external
benchmarks demonstrate their value. Rebuildable projections keep experimentation
separate from durable memory truth.

**Gate Implications:** Plans that make an optional projection necessary for saving,
basic recall, provenance, or temporal history MUST be rejected. Adding an optional
lane requires an ablation against the deterministic baseline, explicit footprint and
latency evidence, deterministic rebuild behavior, and graceful degradation.

---

### P3 — Harness-Agnostic Memory Contract

**Statement:** The memory model (SQLite schema, sync format, observation type
taxonomy, revision semantics, and deduplication) MUST be designed so that any
conforming MCP client or CLI consumer can read and write memory without
harness-specific knowledge. Optional transports MUST delegate to the same core
operations rather than redefine memory behavior.
Native harness integrations MUST translate supported host events through one host-neutral lifecycle contract, keep harness-specific payloads and capability detection at adapter boundaries, and preserve the existing MCP and storage semantics. Unsupported, degraded, or unverified capabilities MUST remain explicit and MUST NOT be simulated as successful.

**Rationale:** Thoth-mem serves Claude Code, OpenCode, Gemini CLI, and any future
MCP-compatible harness. Lock-in to a single harness's conventions would undermine
the project's portability goal. The observation type taxonomy is enforced at the
database level precisely to keep consumers interoperable within the active product
contract.

**Gate Implications:** Changes that introduce harness-specific field semantics,
encoding assumptions, or tool shapes not expressible in plain MCP MUST be flagged.
An explicitly selected major product reset MAY introduce a clean schema and breaking
surface changes without legacy runtime shims, provided the specification declares the
boundary, preserves the old database, and defines a one-way importer when durable data
migration is in scope. Destructive deltas still require the archive warning in
`config.yaml`.
Plans that duplicate lifecycle semantics per harness, allow native payload fields to enter the core memory contract, or claim parity without evidence-backed capability mapping MUST be rejected.

---

### P4 — Token-Efficient, Bounded Recall Outputs

**Statement:** Retrieval responses MUST be bounded and progressive. `mem_recall`
MUST support a compact-first mode (`mode=compact`) followed by context expansion
(`mode=context`) and single-record full fetch (`mem_get`). Surgical trimming
(primary sentence, surrounding chunk when score threshold is met) MUST be applied
before output is returned. Compression ratio and evidence character counts MUST be
reported so noise reduction is measured, not claimed.

**Rationale:** Agent context windows are finite and expensive. Unbounded retrieval
dumps increase token cost and degrade signal-to-noise. The three-tier recall funnel
(compact → context → get) ensures callers pay only for the depth they need.

**Gate Implications:** Retrieval changes that remove compact mode, bypass surgical
trimming, or drop compression-ratio metadata from `mode=context` output MUST be
rejected. Changes that widen default result limits beyond current config defaults
(`sentenceTopK=100`, `chunkTopK=20`, `lexicalLimit=20`) require explicit justification.

---

### P5 — Explicit Product Boundaries Over Legacy Compatibility

**Statement:** Public contracts MUST be stable and testable within an active major
product line. An explicitly selected major reset MAY rename, remove, or incompatibly
change MCP, CLI, HTTP, schema, taxonomy, and packaging contracts without a prior
deprecation release. The change MUST enumerate the new boundary, provide a clean
installation path, and describe durable-data migration separately from runtime
compatibility. Compatibility shims, dual reads/writes, legacy aliases, and dormant
fallback paths MUST NOT be added unless the user explicitly places them in scope.

**Rationale:** Preserving accidental architecture can be more harmful than a clean,
declared break in an experimental product. Explicit boundaries and optional one-way
data import protect user-owned information without forcing the new core to carry old
logic indefinitely.

**Gate Implications:** Hidden breaking changes, undeclared destructive data handling,
and unrequested compatibility code MUST be rejected. Major-reset plans MUST preserve
the source database, make migration one-way and observable when included, and include
a rollback path to the untouched prior installation or data. The archive rule
("Warn before merging destructive deltas") in `config.yaml` remains mandatory.

---

## Sync-Impact Report

- 2.0.0 | MAJOR | P1/P2/P3/P5 product-reset governance | Allows an explicit clean
  major-version core without KG, semantic, HTTP, dashboard, or legacy compatibility
  as load-bearing requirements; requires SQLite lexical operation, rebuildable optional
  projections, declared breaking boundaries, source-database preservation, and bounded
  host-neutral behavior; consumed by the active Full SDD product reset.
- 1.1.0 | MINOR | P3 Harness-Agnostic Memory Contract | Expands P3 from storage/tool interoperability to one host-neutral, evidence-backed native lifecycle across OpenCode, Codex, and Claude Code; consumed live by `sdd-design` and `plan-reviewer`; no in-flight `design.md`/`tasks.md` artifacts flagged.
- 1.0.1 | PATCH | P5 Stable Public Contract With Explicit Deprecation Discipline | Clarifies that bounded keep-N retention of already-superseded KG history is compatible with P5; consumed live by `sdd-design` and `plan-reviewer`; no active design.md/tasks.md artifacts flagged.

| Date | Version | Change | Author |
|---|---|---|---|
| 2026-08-24 | 1.1.0 → 2.0.0 | Redefined retrieval, schema, and public-contract governance for an explicit clean product reset | adaptive root |
| 2026-06-29 | 1.0.0 → 1.0.0 | Initial baseline ratified from README + specs at v0.3.6 | sdd-init |
