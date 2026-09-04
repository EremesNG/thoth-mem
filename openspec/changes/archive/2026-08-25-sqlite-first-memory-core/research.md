# Research: SQLite-first memory core v2

## Question

Which ideas from current coding-agent memory systems should thoth-mem adopt, and which should remain outside the reliable first product?

The comparison used current source or official project documentation, inspected local checkouts where available, and separated retrieval metrics from answer/agent outcomes. Popularity was useful for discovering product patterns, but it was not treated as evidence of retrieval quality.

## Reference findings

| Reference | Adopt | Do not make core |
| --- | --- | --- |
| [agentmemory](https://github.com/rohitg00/agentmemory) | Normalized event pipeline; explicit memories with provenance, supersession, and TTL/outcome concepts; BM25-first retrieval; candid retrieval benchmark | iii-engine deployment, many ports/modules/tools/endpoints/connectors, or optional vectors in the reliable path |
| [Engram](https://github.com/Gentleman-Programming/engram) | Single local binary/service shape, SQLite+FTS5 baseline, structured saves, progressive retrieval | Treating minimalism as a reason to omit provenance, temporal history, or cross-host lifecycle evidence |
| [claude-mem](https://github.com/thedotmack/claude-mem) | Lifecycle coverage, queue/retry/recovery discipline, bounded context reinjection | Bun+uv+worker+vector-service+LLM stack as the default operating model; automatic capture of every activity stream |
| [ArcRift](https://github.com/Eshaan-Nair/ArcRift) | Retrieval ablations and rich candidate ideas | Shipping the full hybrid/graph stack before equal-budget evidence |
| [Mem0](https://github.com/mem0ai/mem0) | Scope, provenance/history, additive fact extraction ideas, entity linking as an experiment | Mandatory LLM/embeddings, vector-store-first truth, provider matrix, hosted infrastructure, or destructive update/delete as the only temporal model |
| [OpenViking](https://github.com/volcengine/OpenViking) | Canonical source versus index separation; L0/L1/L2 progressive loading | Server/filesystem/model stack as a prerequisite |
| [Supermemory](https://github.com/supermemoryai/supermemory) | Profiles, temporal metadata, atomic fact versioning | Hosted or opaque graph dependency |
| [Hindsight](https://github.com/vectorize-io/hindsight) | Recall/retain aligned to lifecycle hooks; stable identifiers | Postgres/vector/reranker/LLM default deployment |
| [MemOS](https://github.com/MemTensor/MemOS) | Tiered deterministic hybrid experiments and provenance | Neo4j/Qdrant or multi-service storage as baseline |
| [Cognee](https://github.com/topoteretes/cognee) | Shared IDs and provenance across derived stores | Three-store deployment and pipeline breadth in the first product |
| [Graphiti](https://github.com/getzep/graphiti) | Immutable episodes, `valid_at`/`invalid_at`, contradiction/supersession instead of destructive replacement | A graph database as authoritative storage |
| [Memoirs](https://github.com/Spico197/Memoirs) | One-file local hybrid architecture, append-only sources, provenance, and clearly named retrieval metrics | Promoting vector/graph/RAPTOR/reranking without thoth-mem-specific evidence |
| [memU](https://github.com/NevaMind-AI/memU) | Returning bounded source material and entity-linking experiments | Cloud/install assumptions or implicit graph complexity |

## Host feasibility

- Current Codex plugin documentation supports plugin-bundled hooks, MCP, and Skills. Lifecycle events include session start, root prompt submission, pre/post compact, stop, and session end. Session-start can occur before MCP connection, so runners need a command/core fallback and must not claim injection success without evidence. See [Codex plugins](https://developers.openai.com/codex/plugins/) and [Codex hooks](https://developers.openai.com/codex/hooks/).
- Claude Code plugins support hooks, MCP servers, and Skills with broad lifecycle coverage. See [Claude Code plugins](https://docs.anthropic.com/en/docs/claude-code/plugins).
- OpenCode exposes a native plugin API and lifecycle/compaction events; capability mapping must be versioned because the newer plugin API is still evolving. See [OpenCode plugins](https://opencode.ai/docs/plugins/).

This makes three native plugin packages feasible. It does not make their payloads identical; host-specific adapters remain necessary around one host-neutral lifecycle contract.

## Benchmark decision

The minimum equal-budget evaluation program is:

| Lane | Purpose | Metrics kept separate |
| --- | --- | --- |
| LongMemEval-S | Durable-memory retrieval and answer quality | MRR/Recall/Hit where published; answer accuracy separately |
| LoCoMo | Long conversational memory | Deterministic answer F1/accuracy and evidence recall separately |
| AMB BEAM (100K, 1M) | Long-context memory scaling | Published retrieval/answer metrics at named context sizes |
| AMB PersonaMem (32K, 1M) | Personal/temporal memory scaling | Published retrieval/answer metrics at named context sizes |
| SDEBench | Coding-agent product value | Hidden-test or equivalent task success, tokens, latency, errors |

Every candidate receives the same corpus, query order, candidate count, final injected-token budget, reader/agent, and scoring procedure. `recall_any@K`/Hit@K is not relabeled as classical Recall@K, and “Top-50 answer accuracy” is not reported as Recall@50.

## Decisions

1. SQLite is the only authoritative store; FTS5 and structured filters are the always-on retrieval core.
2. Captured evidence and promoted memory are separate. Automatic capture records clean root-user intent and lifecycle checkpoints, not every tool call or subagent stream.
3. Memories are append-oriented and temporal: a correction supersedes or retracts prior guidance but never erases the evidence or failed outcome.
4. The hot path performs no LLM call, embedding generation, graph extraction, or remote request.
5. Dense, entity, graph, reranking, summarization, and query-expansion candidates are rebuildable projections that remain off until a complete equal-budget report passes a fail-closed promotion gate.
6. The six current workflow tool names remain; v2 schemas and semantics may break deliberately.
7. OpenCode, Codex, and Claude Code each ship a native bundle containing hooks, MCP registration, and Skills over one shared core.
8. Dashboard, observatory, HTTP, graph product, hosted service, and multi-user control plane remain outside the first product and default package/startup path.
9. Legacy data migration is one-way into a new database. The old database is never opened writable by v2, and old runtime behavior is not emulated.
10. Token reduction is evaluated together with answer/coding outcomes and resource cost; retrieval quality alone cannot promote complexity.
