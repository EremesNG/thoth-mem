# Project Constitution — thoth-mem

Version: 1.0.0
Status: Ratified
Ratified: 2026-06-29
Last-Amended: 2026-06-29

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
MAJOR spec change with explicit deprecation notice.

---

### P2 — Deterministic-First Retrieval With Safe Degradation

**Statement:** Core retrieval MUST produce deterministic, reproducible results from
lexical (FTS5) and knowledge-graph lanes without requiring any embedding model or
remote service. Semantic (vector) lanes are additive enhancements that MUST degrade
gracefully to lexical + KG fallback when `sqlite-vec` is unavailable or semantic
indexing is pending. Degraded state MUST be signaled explicitly in retrieval output,
never silently dropped.

**Rationale:** Thoth-mem is designed for CI and offline environments where model
downloads or remote APIs may not be available. Deterministic fallback ensures
correctness guarantees independent of optional infrastructure.

**Gate Implications:** Retrieval changes that remove the lexical/KG fallback path,
suppress degraded-state signaling, or make semantic availability load-bearing for
basic recall MUST be rejected at plan-review. Semantic-only improvements that
preserve fallback are MINOR changes.

---

### P3 — Harness-Agnostic Memory Contract

**Statement:** The memory model (SQLite schema, sync format, observation type
taxonomy, topic_key upsert semantics, sync_id deduplication) MUST be designed so
that any conforming MCP client or CLI consumer can read and write memory without
harness-specific knowledge. The HTTP REST API MUST expose the same operations
available through the MCP and CLI surfaces.

**Rationale:** Thoth-mem serves Claude Code, OpenCode, Gemini CLI, and any future
MCP-compatible harness. Lock-in to a single harness's conventions would undermine
the project's portability goal. The observation type taxonomy is enforced at the
database level precisely to keep consumers interoperable.

**Gate Implications:** Changes that introduce harness-specific field semantics,
encoding assumptions, or tool shapes not expressible in plain MCP MUST be flagged.
Schema migrations MUST be additive or backward-compatible; destructive migrations
require a MAJOR version bump and archive warn in config.yaml.

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

### P5 — Stable Public Contract With Explicit Deprecation Discipline

**Statement:** The MCP tool surface, HTTP REST API routes, CLI command names, and
observation type taxonomy constitute the public contract of thoth-mem. Breaking
changes to any public-contract element MUST be signaled with a deprecation notice
in a MINOR release before removal in a MAJOR release. Legacy tool names (e.g.
`mem_search`, `mem_get_observation`) MUST remain explicitly excluded, not merely
unregistered, so they cannot re-emerge accidentally.

**Rationale:** Downstream harness configurations, agent scripts, and CI pipelines
bind to these names. Silent renames or removals break consumers without warning.
Explicit deprecation gives a defined migration window.

**Gate Implications:** Any proposal that renames, removes, or incompatibly alters
a public-contract element without a prior deprecation notice in a shipped version
MUST be rejected at proposal-review. The archive rule ("Warn before merging
destructive deltas") in config.yaml applies here.

---

## Sync-Impact Report

| Date | Version | Change | Author |
|---|---|---|---|
| 2026-06-29 | 1.0.0 → 1.0.0 | Initial baseline ratified from README + specs at v0.3.6 | sdd-init |
