# Deep Research Report: Memory operating model for thoth-mem

**Change ID**: `memory-operating-model`  
**Route**: Full  
**Audience**: thoth-mem maintainers and plugin integrators  
**Date**: 2026-08-26  
**Status**: Research complete; specification pending

## Research question

What should thoth-mem persist, when should it persist it, how should native hooks capture and recover it, and how should coding agents explore it while minimizing context cost and avoiding another feature-heavy architecture?

The investigation compares the current repository and `master` with AgentMemory, Engram, ArcRift, claude-mem, Mem0, Hindsight, Supermemory, and the Agent Memory Benchmark. First-party repositories and documentation are treated as evidence of design and self-reported results, not as independent proof of quality. Generic chat-memory metrics are not treated as coding-agent outcomes.

## Direct answer

thoth-mem should keep its current SQLite-first foundation and formalize a two-layer operating model:

1. **Evidence ledger**: automatically capture a small set of immutable, source-attributed root lifecycle events. This layer preserves what happened without claiming that every event deserves future context.
2. **Promoted memory**: deliberately create concise, typed, temporal records only when a fact will change future coding work. This layer carries decisions, conventions, architecture, project structure, corrected failures, preferences, and actionable handoffs.

Native hooks should be fast, idempotent, root-scoped, and fail open. They should not capture arbitrary tool results, assistant reasoning, delegated-agent streams, or entire transcripts. They should recover a **continuation capsule**, not a generic search result: one actionable handoff first, then the smallest useful set of current decisions, conventions, failure lessons, and project structure. The capsule should contain useful text before metadata, identify retrieved content as untrusted data, include only memory IDs needed for progressive disclosure, and omit evidence IDs from the model-visible block.

The agent-facing exploration path should remain the exact six-tool MCP surface. Use `mem_project`/`mem_context` for a project briefing, `mem_recall` for compact query-specific search, and `mem_get` only for selected full records and provenance. SQLite FTS5/BM25 and structured filters stay always operational. Dense retrieval, graph/entity projections, reranking, and LLM consolidation remain optional experiments until equal-budget external and coding-continuity evaluations show material gain.

## Evidence synthesis

### The useful consensus

The strongest common pattern across the systems is:

```text
verified event
  -> immutable evidence
  -> selective/asynchronous promotion
  -> project-scoped compact retrieval
  -> small actionable bootstrap
  -> full detail only on demand
```

- AgentMemory and claude-mem demonstrate broad lifecycle coverage, nonblocking capture, asynchronous processing, and bounded session-start context.
- Engram demonstrates the value of agent-curated durable records, topic identity, compact search followed by timeline/detail retrieval, and explicit project scope.
- ArcRift demonstrates relevance abstention, exact scope filtering, sentence-level trimming, and the operational cost of making embeddings/LLM extraction central.
- Mem0 demonstrates identity-scoped durable-fact extraction and useful coding-memory categories, but its LLM/vector-default architecture conflicts with the deterministic offline core.
- Hindsight argues for retaining rich source evidence and stable document identity, which supports an immutable ledger, while its extraction model remains an optional projection rather than a core dependency.
- The Agent Memory Benchmark demonstrates why retrieval metrics alone are insufficient: dumping a large corpus into context can look good on answer accuracy while violating the product objective of reducing tokens and latency.

### The central disagreement: capture everything or curate everything

Broad automatic capture improves recall but creates privacy exposure, noise, queue lag, and a consolidation burden. Pure agent-directed saving creates cleaner memory but can omit failed attempts and other useful evidence. The two-layer model resolves this without requiring an LLM:

| Layer | Automatic | Indexed for normal recall | Purpose |
| --- | --- | --- | --- |
| Immutable evidence | Yes, only at verified root lifecycle boundaries | No, unless promoted | Audit, provenance, correction, later rebuild |
| Promoted memory | Explicit or deterministic semantic-boundary promotion | Yes, FTS5 plus structured fields | Future action and token-efficient continuity |
| Optional projection | Asynchronous and rebuildable | Never required | Experiment with dense/entity/rerank/consolidation value |

This preserves missed information in the ledger without forcing raw prompts or tool output into every retrieval result.

## Recommended operating model

### What to persist automatically

Persist these events after verified project and root-session identity:

- Each non-synthetic root user prompt as `root_prompt` evidence, with a stable host event key.
- A bounded pre-compaction checkpoint as `checkpoint` evidence.
- An explicit handoff/finalization payload when the root agent provides one.
- Explicit saves requested through the Skill or MCP as `explicit_save` evidence linked to any promoted memory.
- Lifecycle receipts and capability facts needed to distinguish hook execution, storage confirmation, context delivery, and model consumption.

Do not automatically persist:

- Assistant chain-of-thought or hidden reasoning.
- Arbitrary tool inputs/outputs or filesystem contents.
- Delegated/subagent streams under root authorization.
- Complete transcripts merely because they are available.
- Secrets or content inside explicit private markers.
- Guessed summaries at session end when the host supplies no authoritative handoff.

High-signal tool events are not a first-release capture category. A future typed adapter may add a narrow event only if it is host-neutral, privacy-bounded, and benchmarked against the simpler root-prompt/checkpoint baseline.

### What deserves promotion

A promoted memory must answer: **Will this materially change how a future coding agent acts?** Promote only when the answer is yes and supporting evidence exists.

| Kind | Persist when | Required useful content |
| --- | --- | --- |
| `decision` | A choice closes alternatives or changes implementation direction | decision, rationale, rejected alternative when material, consequences |
| `convention` | A reusable project rule is established or corrected | rule, scope, concrete example or verification seam |
| `architecture` | A durable boundary or responsibility changes | components, direction of dependency, constraints, affected surfaces |
| `discovery` | A non-obvious fact will prevent repeated investigation | fact, evidence location, implication |
| `failure` | An attempt failed and the lesson affects future choices | attempted action, observed failure, root cause or current hypothesis, safe next step, outcome |
| `project_structure` | Stable navigation/ownership information saves rediscovery | path/symbol ownership and when to use it |
| `handoff` | Work must resume across session/host/compaction | objective, completed, first pending action, blockers, key files/checks |
| `preference` | An explicit user preference should govern future work | preference, scope, exceptions if stated |

Do not add a generic observation type or expand the taxonomy now. The current types cover the coding continuity goal. Use `topicKey` for an evolving durable fact; a correction appends a new memory, supersedes the old record, and preserves both the successful and failed history.

### When promotion occurs

- **Immediately and explicitly** when the user asks to remember something or the root agent reaches a meaningful semantic boundary.
- **Before compaction** when an actionable handoff is needed; the handoff is deterministic content supplied by the current root context, not an LLM-generated retrospective.
- **At finalization** only when an authoritative handoff/session summary is available. Otherwise close the session without fabricating memory.
- **Never as a blocking LLM step** in a native hook.

An optional background consolidation lane may later propose promotions, but proposals must be source-linked, reviewable, independently rebuildable, and invisible to the core when disabled or degraded.

### Canonical scope and identity

The durable scope tuple should be:

```text
project_identity_key + harness + verified_root_session_key + optional_topic_key
```

- Project is the durable retrieval boundary. Prefer a host-verified repository/workspace identity; use the normalized absolute root hash only as an explicit degraded fallback.
- Harness plus root session identifies lifecycle ownership and idempotency, not a separate memory silo.
- Topic identifies the temporal lineage of an evolving fact.
- Branch, worktree, file path, and commit may be metadata or query filters later, but should not partition the core by default; doing so would fragment cross-branch project decisions.
- Unverified or delegated identity fails closed for lifecycle writes and automatic recovery.

### Hook behavior

| Lifecycle boundary | Core action | Model-visible behavior |
| --- | --- | --- |
| Session enroll/start | Upsert verified project/session and receipt | None by itself |
| First system transform / SessionStart | Retrieve the project continuation capsule | Inject once for that start/resume event |
| Root user prompt | Append idempotent evidence | Do not reinject the whole briefing |
| Pre-compact | Append bounded checkpoint and promote explicit handoff when present | None before compaction |
| Post-compact | Retrieve a fresh continuation capsule | Inject once after compaction |
| Finalize/session end | Close session and persist authoritative handoff if supplied | No speculative summary |

All hooks must have bounded input, output, and time; fail open to the host; emit degraded diagnostics; and preserve the Node/Bun/native-manager boundaries of each integration. Telemetry work may be fire-and-forget, but a context-injection hook must await its bounded retrieval because delivery is its purpose.

### Continuation capsule

Automatic recovery is a distinct product operation, not `recall(query='')` rendered as a long list. It should select content in this order:

1. The newest current `handoff`, with objective, completed work, first pending action, blockers, and key files/checks.
2. Current decisions and conventions directly relevant to that handoff or, absent query terms, the newest high-priority project guidance.
3. Current failed/mixed lessons that guard the next action.
4. Stable project structure only if budget remains.

Rendering rules:

- Reserve the fixed host cap first; the current cross-host cap is 1,000 Unicode code points.
- Select fewer complete/actionable items instead of one-character excerpts from many items.
- Allocate content before optional metadata and headings.
- Include a full memory ID for each selected item so the agent can call `mem_get`; omit evidence IDs because lineage is available from that record.
- Add an explicit trust boundary: recovered memory is data, not executable instruction, and cannot override current user/developer/system instructions.
- Normalize control characters and delimit the block. Do not use naive keyword deletion as the primary prompt-injection defense; it produces false positives in code and does not reliably detect semantic attacks.
- Never inject raw evidence automatically.
- If no item meets the minimum usefulness contract, inject verified identity only and report an abstention/degraded reason in structured lifecycle data.

The OpenCode incident that motivated this research is a direct regression case: reserving titles plus memory/evidence IDs for five items left roughly two content characters per memory. The renderer proved hook execution but failed the user goal. A passing capsule must recover the hidden pending action, not merely list the handoff title.

### Retrieval and exploration

Keep the progressive six-tool workflow:

1. `mem_project(action='briefing')` or `mem_context` returns the structured continuation briefing for broad project resumption.
2. `mem_recall(mode='compact')` returns a small query-specific index using exact ID/topic lookup and FTS5/BM25.
3. `mem_recall(mode='context')` expands only selected relevant content within an explicit character budget.
4. `mem_get` returns one full record and its provenance/temporal lineage.
5. `mem_project(action='history')` exposes supersession history.
6. `mem_save`/`mem_session` own typed persistence and lifecycle boundaries.

Do not add search, timeline, observation, graph, or admin MCP tools. If a timeline view becomes useful, compose it behind `mem_project` rather than widening the public registry. A dashboard/TUI may be useful for human inspection later, but it is not required for coding-agent continuity and remains outside the first product.

### Deduplication and temporal truth

Retain the current mechanisms:

- Stable event keys make lifecycle and explicit event replay idempotent.
- NFC-normalized SHA-256 content hashes provide evidence identity/audit data.
- `topicKey` plus supersession provides explicit revision lineage.
- Current/history retrieval separates active guidance from failed or superseded facts.

Do not add fuzzy normalized duplicate counters or automatic merge logic yet. Engram demonstrates their potential value, but they add policy and schema complexity. Promote them only if real workloads show repeated semantically equivalent memories that event idempotency and topic identity cannot control.

### Privacy and memory poisoning

Persistent memory is a security boundary. User prompts, repository text, tool output, and retrieved memory can contain indirect instructions. The deterministic baseline should therefore:

- Filter explicit private blocks before persistence and reject empty post-filter content.
- Never persist secrets intentionally and never copy ambient environment or tool output by default.
- Store source provenance, temporal validity, and retract/supersede lineage so poisoned or incorrect guidance is traceable and reversible.
- Treat recovered content as untrusted data inside explicit delimiters, even when the host only offers a system-context injection API.
- Keep automatic recovery limited to promoted typed memories rather than raw evidence.
- Test poisoned-memory strings, cross-project leakage, control-character handling, and unauthorized/delegated writes.

Semantic prompt-attack classifiers and DLP services may be optional policy layers, but cannot be required for offline save or recall. Regex-only “sanitization” is not sufficient as a security claim.

## Adopt, adapt, reject

| Reference pattern | Decision | Reason |
| --- | --- | --- |
| Immutable evidence plus promoted memory | **Adopt** | Preserves truth without flooding recall |
| Engram durable `what/why/learned` records | **Adapt** | Map into current typed content rather than a new schema now |
| claude-mem/AgentMemory nonblocking lifecycle hooks | **Adopt** | Correct operational boundary; context injection remains bounded/awaited |
| AgentMemory broad PostToolUse firehose | **Reject for core** | Privacy/noise/consolidation cost exceeds proven value |
| Engram agent-only capture | **Reject as sole source** | Can miss failures and evidence; combine with minimal automatic ledger |
| Compact index -> detail retrieval | **Adopt** | Directly supports token savings and six-tool funnel |
| IDs and provenance in every bootstrap line | **Adapt** | Keep memory ID, omit evidence IDs from constrained host output |
| Vector/hybrid retrieval by default | **Reject** | FTS5 baseline is deterministic; no equal-budget proof yet |
| LLM extraction/consolidation on hot path | **Reject** | Violates offline, latency, and failure-isolation requirements |
| Optional async projections | **Retain as gate** | Valid experiment only when rebuildable and benchmark-backed |
| Numeric universal relevance threshold | **Reject** | Repository docs drift and task distributions differ; test abstention behavior instead |
| Dashboard/graph viewer | **Defer** | Human observability is useful but not needed for first product continuity |

## Evaluation contract

No optional module deserves promotion because of fixtures tailored to that module. Every comparison must hold the final Top-K and final token/character budget constant and report the exact models, prompts, embedding/rerank configuration, dataset version, hardware, latency, and cost.

### External suites

- **LongMemEval-S**: retrieval ranking and long-session evidence, with Recall@K/Hit@K semantics labeled correctly.
- **LoCoMo**: long-conversation answer correctness; do not label Top-K answer accuracy as Recall@K.
- **BEAM/PersonaMem**: durable facts, preference/persona consistency, and temporal updates.
- **SDEBench or an equivalent coding-agent benchmark**: coding-task continuity and repository-grounded outcomes.
- **Agent Memory Benchmark**: ingest -> retrieve -> answer/judge with token cost and latency, guarding against dump-all strategies.

### Product-specific fixtures

The minimum deterministic suite must cover:

- Hidden handoff objective, archive path, first pending action, blockers, and key files recovered after host restart and post-compaction.
- Current versus superseded/failed history and an explicit correction.
- Exact cross-project isolation and delegated-session rejection.
- Irrelevant-query abstention.
- Prompt-injection/control-character content rendered as untrusted data.
- Hook execution, memory confirmation, context delivery, and model consumption reported as separate facts.
- Injected characters/tokens, useful-content ratio, latency, and full-fetch avoidance.
- The regression where multiple metadata-heavy items starve all useful content.

### Promotion rule for optional modules

Evaluate `BM25 -> dense -> hybrid -> each additional module` under the same final budget. An optional module may enter the supported product only if it provides a predeclared material gain on both retrieval/correctness and coding-continuity outcomes without unacceptable latency, footprint, privacy, or operational regression. A vendor-reported benchmark is a hypothesis, not the promotion decision.

## Risks and limitations

- Root-prompt evidence still accumulates and requires a future explicit retention/export policy; destructive automatic expiry is not justified by this research.
- A 1,000-code-point host cap may not fit every complex handoff. Progressive disclosure is therefore part of the contract, not a workaround.
- Generic chat-memory suites remain imperfect proxies for real coding work; product-specific host fixtures and coding outcomes are mandatory.
- No independent apples-to-apples benchmark currently compares all referenced repositories under one protocol.
- Self-reported versions, thresholds, latency, and accuracy drift. The report adopts patterns, not vendor constants.
- Claude Code cannot be certified against a paid real model in the current environment; its contract must be verified from first-party host behavior, local packed fixtures, `master`, AgentMemory, and Engram until a real-host run is available.
- Treating promoted memory as untrusted data reduces but cannot eliminate indirect prompt injection. High-risk tool actions still require the host's normal authorization model.

## Specification anchors

The specification produced from this report should make these requirements normative:

1. Two-layer persistence with immutable evidence and source-linked promoted memory.
2. Closed automatic capture allowlist and explicit non-capture boundaries.
3. Deterministic semantic-boundary promotion with no LLM hot path.
4. Verified project/root identity, project isolation, idempotency, and temporal supersession.
5. A dedicated continuation-capsule selection contract separate from generic recall.
6. Content-first cross-host rendering with useful minimum content, memory-only progressive references, and untrusted-data delimiters.
7. Exact six-tool progressive exploration and no new MCP tools.
8. Separate capability facts for execution, persistence, delivery, and model consumption.
9. Privacy, poisoning, abstention, and cross-project regression tests.
10. Equal-budget external and coding-agent evaluation before optional complexity is promoted.

## Source ledger

All sources were accessed on 2026-08-26. “Current” means the repository default branch at access time; repository claims are not independent validation.

| Source | Maintainer/author | Version/date context | Material claim used | URL |
| --- | --- | --- | --- | --- |
| AgentMemory README | Rohit Goyal / project maintainers | current main; package 0.9.29 observed | hook pipeline, dedup/privacy, async optional processing, session context, module breadth | https://github.com/rohitg00/agentmemory |
| AgentMemory OpenCode plugin README | AgentMemory maintainers | current main | OpenCode hooks, direct system injection, memory/file enrichment, manual recall/save | https://github.com/rohitg00/agentmemory/blob/main/plugin/opencode/README.md |
| AgentMemory changelog | AgentMemory maintainers | current main | injection default-off regression; oversized block starvation changed from break to continue | https://github.com/rohitg00/agentmemory/blob/main/CHANGELOG.md |
| AgentMemory LongMemEval documentation | AgentMemory maintainers | current main | vendor-reported lexical/hybrid metrics and protocol caveats | https://github.com/rohitg00/agentmemory/blob/main/benchmark/LONGMEMEVAL.md |
| Engram intended usage | Gentleman Programming / Engram maintainers | current main | agent-curated durable records, no raw tool firehose | https://github.com/Gentleman-Programming/engram/blob/main/docs/intended-usage.md |
| Engram architecture | Engram maintainers | current main | topic identity, normalized dedup, sessions/observations, progressive retrieval | https://github.com/Gentleman-Programming/engram/blob/main/docs/ARCHITECTURE.md |
| Engram documentation | Engram maintainers | current main | structured save protocol and prompt-context attachment | https://github.com/Gentleman-Programming/engram/blob/main/DOCS.md |
| Engram agent setup | Engram maintainers | current main | working-directory/project-bucket failure mode and explicit project pinning | https://github.com/Gentleman-Programming/engram/blob/main/docs/AGENT-SETUP.md |
| ArcRift architecture and RAG pipeline | Eshaan Nair / ArcRift maintainers | v1.6.3 observed | project scoping, hybrid retrieval, relevance abstention, surgical trimming, background complexity | https://github.com/Eshaan-Nair/ArcRift/blob/main/ARCHITECTURE.md |
| ArcRift RAG pipeline | ArcRift maintainers | current main | threshold and retrieval pipeline details; inconsistent numeric threshold versus README | https://github.com/Eshaan-Nair/ArcRift/blob/main/RAG_PIPELINE.md |
| ArcRift security policy | ArcRift maintainers | current main | prompt-injection sanitization and privacy boundary | https://github.com/Eshaan-Nair/ArcRift/blob/main/SECURITY.md |
| claude-mem hooks architecture | thedotmack / claude-mem maintainers | package 13.16.1 observed | SessionStart/UserPromptSubmit/PostToolUse/Stop/SessionEnd roles, nonblocking workers | https://github.com/thedotmack/claude-mem/blob/main/docs/public/hooks-architecture.mdx |
| claude-mem search architecture | claude-mem maintainers | current main | compact search, timeline context, batch detail retrieval | https://github.com/thedotmack/claude-mem/blob/main/docs/public/architecture/search-architecture.mdx |
| Mem0 architecture/core concepts | Mem0 maintainers | current main | identity scope, durable-fact extraction, LLM/vector defaults | https://github.com/mem0ai/mem0/blob/main/skills/mem0/references/architecture.md |
| Mem0 Codex integration | Mem0 maintainers | current main | actor attribution, pre-response recall, coding memory categories | https://github.com/mem0ai/mem0/blob/main/docs/integrations/codex.mdx |
| Mem0 automatic capture script | Mem0 maintainers | current main | throttled asynchronous capture and failure-isolated exit | https://github.com/mem0ai/mem0/blob/main/integrations/mem0-plugin/scripts/auto_capture.py |
| Hindsight best practices | Vectorize / Hindsight maintainers | current main | retain rich source data, stable IDs/timestamps, async ingestion, recall vs reflection | https://github.com/vectorize-io/hindsight/blob/main/hindsight-docs/src/pages/best-practices.mdx |
| Agent Memory Benchmark | Vectorize maintainers | current main | end-to-end ingest/retrieve/generate/judge, token/latency accounting, dump-all weakness | https://github.com/vectorize-io/agent-memory-benchmark |
| Mem0 memory benchmarks | Mem0 maintainers | current main | LongMemEval/LoCoMo/BEAM methodology sensitivity to Top-K, models, prompts, context | https://github.com/mem0ai/memory-benchmarks |
| OWASP LLM01 Prompt Injection | OWASP GenAI Security Project | 2025 edition | retrieved/RAG content does not eliminate indirect prompt injection; segregate external content | https://genai.owasp.org/llmrisk/llm01-prompt-injection/ |
| OWASP RAG Security Cheat Sheet | OWASP Cheat Sheet Series | current | delimit untrusted retrieved content, cap chunks, test poisoning and cross-scope leakage | https://cheatsheetseries.owasp.org/cheatsheets/RAG_Security_Cheat_Sheet.html |
| NIST AI 100-2 | NIST | 2023/2025 taxonomy revisions | indirect prompt injection through controlled retrieved resources | https://csrc.nist.gov/glossary/term/indirect_prompt_injection |
| Azure RAG prompt engineering | Microsoft Architecture Center | current at access | defensive instruction, provenance metadata, sanitization and indirect-injection testing | https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/rag/rag-prompt-engineering |

## Local evidence ledger

| Repository/surface | Inspected anchors | Finding |
| --- | --- | --- |
| thoth-mem current | `src/memory-core/contracts.ts`, `service.ts`, `sqlite/`, `src/integration/`, `src/tools/index.ts`, focused tests and active OpenSpec | already implements most ledger/identity/temporal/six-tool boundaries; continuation rendering and selection are the main product gap |
| thoth-mem `master` | historical `src/store/`, `src/retrieval/`, `src/http-*`, lifecycle/setup history | useful integration archaeology, but its vector/graph/HTTP architecture is intentionally retired and not a current contract |
| AgentMemory local | `C:/DEV/Proyectos/Webstorm/agentmemory/src/hooks`, `src/functions`, `src/state`, tests/benchmark docs | transferable hook/budget/dedup patterns, excessive total surface for thoth-mem |
| Engram local | `C:/DEV/Proyectos/Webstorm/engram/docs`, `cmd/engram` | strongest reference for curated durable memory and progressive exploration |
| ArcRift local | `C:/DEV/Proyectos/Webstorm/ArcRift/ARCHITECTURE.md`, `RAG_PIPELINE.md`, storage/jobs/MCP/sanitizer/tests | useful relevance/privacy tests, but heavy browser/vector/graph pipeline |
| claude-mem local | `C:/DEV/Proyectos/Webstorm/claude-mem/docs`, hooks/search implementation | strongest lifecycle/async worker reference, but broad capture and provider-dependent compression |

