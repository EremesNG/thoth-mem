# Feature Specification: SQLite-first persistent memory core v2

**Change ID**: `sqlite-first-memory-core`<br>
**Route**: Full<br>
**Status**: Draft

## Intent and scope

**Why**: Give OpenCode, Codex, and Claude Code coding agents durable project memory that reduces repeated explanation and context consumption without making embeddings, graph infrastructure, an LLM, or an auxiliary service part of the reliable core.<br>
**Impact**: This is an intentional major product reset. The default product becomes a local SQLite/FTS5 memory ledger plus three native plugins that each package hooks, MCP, and Skills over one shared core. Runtime and MCP behavior may break from the previous implementation; the supported legacy path is a one-way, non-destructive database importer rather than compatibility shims, dual reads, or dual writes.<br>
**Affected capabilities**: `store`, `retrieval`, `indexing`, `tools`, `harness-integration`, `packaging`, `evals`

## User stories

### US1 - Resume useful project context in any supported coding agent (Priority: P1)

As a developer, I can start, resume, compact, and finish work in OpenCode, Codex, or Claude Code and receive the same bounded project-memory behavior so that I do not have to reconstruct prior context in every session.

**Independent test**: Install each packed native plugin in an isolated host home, execute its supported lifecycle fixtures, and compare the resulting shared-core operations and bounded recovery output.

**Covers**: FR-039, FR-040, FR-041, FR-042, FR-043, FR-050, FR-051, FR-052, SC-005, SC-006, SC-007

**Acceptance scenarios**:

1. **Given** a project with prior durable memories and a supported host version, **When** a root session starts or resumes, **Then** the plugin supplies bounded, source-attributed recovery context through the shared lifecycle contract.
2. **Given** a host event that cannot be mapped safely, **When** the event is received, **Then** the plugin reports that capability as degraded without inventing success or disabling explicit MCP memory operations.

### US2 - Preserve decisions, mistakes, and their outcomes (Priority: P1)

As a coding agent, I can retain evidence, decisions, conventions, project structure, failed approaches, and later corrections with provenance so that future sessions can learn from history without confusing an obsolete decision with current guidance.

**Independent test**: Save a decision, record a failed outcome, supersede it with a correction, and verify that current recall prefers the correction while historical retrieval can still reach the original evidence and failure.

**Covers**: FR-001, FR-002, FR-003, FR-008, FR-019, FR-020, SC-001, SC-009

**Acceptance scenarios**:

1. **Given** a memory whose conclusion is later corrected, **When** current-state recall runs, **Then** the correction ranks as current and the original remains reachable as superseded history.
2. **Given** a failed implementation attempt with source-session evidence, **When** a related task is recalled later, **Then** the failure and its outcome can be returned with provenance instead of being silently deleted or rewritten.

### US3 - Rely on a small offline core (Priority: P1)

As a developer, I can save and retrieve memory with only Node.js and SQLite available so that the product remains fast, local, inspectable, and useful without model downloads or external services.

**Independent test**: Run the core contract suite with embedding, vector, graph, reranker, HTTP, dashboard, and LLM components absent and verify immediate FTS5 save/recall plus bounded progressive expansion.

**Covers**: FR-004, FR-005, FR-006, FR-011, FR-012, FR-013, FR-014, FR-015, FR-016, FR-017, FR-018, FR-021, FR-022, FR-023, FR-024, FR-025, FR-026, FR-027, FR-028, FR-029, FR-030, SC-002, SC-003, SC-004, SC-008, SC-010

**Acceptance scenarios**:

1. **Given** a clean installation with no optional retrieval provider, **When** a memory is saved and immediately queried, **Then** lexical and structured retrieval returns it without waiting for background work.
2. **Given** an enabled optional projection that is missing, stale, or failing, **When** recall runs, **Then** the lexical core remains available and the response truthfully identifies the optional projection state.

### US4 - Move useful legacy data without carrying legacy behavior (Priority: P1)

As an existing project operator, I can import a previous thoth-mem database into a clean v2 database so that valuable history is retained without making the new runtime understand the old schema or mutate my source database.

**Independent test**: Import a frozen legacy fixture twice into fresh targets and verify source-file integrity, deterministic record disposition, stable v2 identities, and a bounded migration report.

**Covers**: FR-007, FR-009, FR-010, SC-011

**Acceptance scenarios**:

1. **Given** a readable legacy database, **When** the importer runs, **Then** it creates or populates a separate v2 target, leaves the source byte-for-byte unchanged, and reports imported, skipped, quarantined, and failed records.
2. **Given** legacy rows with placeholder or missing identity, **When** they cannot be mapped safely, **Then** the importer applies a documented deterministic disposition and reports it rather than presenting fabricated identity as trusted fact.

### US5 - Keep the MCP workflow compact while resetting semantics deliberately (Priority: P1)

As a coding agent, I can use six workflow-level MCP tools with bounded progressive results so that internal storage and retrieval changes do not expand the model-visible tool surface.

**Independent test**: Inspect the registry and exercise save, recall, context, full fetch, project briefing, and session lifecycle against v2 fixtures, including optional-projection degradation.

**Covers**: FR-031, FR-032, FR-033, FR-034, FR-035, FR-036, FR-037, FR-038, FR-044, FR-045, FR-046, FR-047, FR-048, FR-049, SC-003, SC-006

**Acceptance scenarios**:

1. **Given** the v2 MCP server, **When** its registry is listed, **Then** it exposes exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`.
2. **Given** a client that depends on an old request, response, graph action, or storage behavior, **When** it calls v2, **Then** v2 follows its documented contract and does not activate a hidden compatibility shim.

### US6 - Promote complexity only with reproducible evidence (Priority: P2)

As a maintainer, I can compare lexical, dense, hybrid, entity, graph, and reranking candidates under identical budgets so that optional complexity enters the default product only when it provides a material measured benefit.

**Independent test**: Run the committed benchmark adapter and manifest over the required retrieval, conversational-memory, long-context, and coding-agent lanes and inspect a durable report with comparable quality, token, latency, memory, and storage metrics.

**Covers**: FR-053, FR-054, FR-055, FR-056, FR-057, FR-058, FR-059, FR-060, FR-061, FR-062, FR-063, SC-012, SC-013, SC-014

**Acceptance scenarios**:

1. **Given** two retrieval candidates, **When** they are benchmarked, **Then** they receive the same corpus, query order, candidate limit, final context-token budget, reader or agent, and scoring procedure.
2. **Given** an optional candidate that fails the declared quality/resource promotion gate or has incomplete evidence, **When** defaults are selected, **Then** the candidate remains off by default and the lexical core remains the product baseline.

### US7 - Ship only the first product boundary (Priority: P2)

As an operator, I can install a focused native-memory package whose runtime inventory does not pull in deferred product surfaces so that setup and failure modes remain understandable.

**Independent test**: Pack the release artifact, verify its canonical inventory, and prove that no dashboard, observatory, HTTP service, graph engine, external database, or model runtime is required or automatically started.

**Covers**: FR-050, FR-051, FR-052, SC-005, SC-007, SC-008

**Acceptance scenarios**:

1. **Given** the packed first-product artifact, **When** its required runtime inventory is validated, **Then** each of the three harnesses has hooks, MCP registration, and Skills that resolve to the same core.
2. **Given** the installed first product, **When** it starts and serves MCP lifecycle operations, **Then** deferred dashboard, observatory, HTTP, and graph surfaces are neither required nor started.

## Edge cases

- A root prompt is delivered more than once, lacks a stable native event id, or arrives after process restart.
- A host invokes session-start hooks before its MCP connection is ready.
- A compaction hook succeeds in checkpointing but cannot inject post-compaction guidance, or the inverse ordering is attempted.
- A memory is corrected repeatedly, retracted without a replacement, or has an outcome that contradicts its original conclusion.
- A project is moved, opened through a symlink, or has an ambiguous host-supplied project identifier.
- FTS5 input contains only punctuation, operators, very short tokens, code symbols, or text that requires exact topic lookup.
- An optional projection is partially built, built for a different source watermark/configuration, or fails during rebuild.
- The legacy database is locked, corrupt, newer than the supported importer, contains duplicate identifiers, or contains rows whose identity cannot be trusted.
- A benchmark adapter returns `Top-K answer accuracy`, `Hit@K`, evidence recall, or judge scores that could be mislabeled as classical `Recall@K`.
- A packed plugin is discoverable but its hooks, MCP server, or Skills are not actually active in the target host.

## Functional requirements

- **FR-001 — SQLite Memory Ledger MUST Be the Sole Source of Truth**: `[ADDED store]` The system MUST persist authoritative evidence, promoted memories, lifecycle state, and source relationships in one local SQLite database; every optional index or projection MUST be disposable and derivable from that database.
- **FR-002 — Raw Evidence and Promoted Memory MUST Remain Distinct**: `[ADDED store]` The system MUST distinguish immutable captured evidence from curated memory records and MUST link every promoted memory to its supporting evidence instead of rewriting the evidence into a new untraceable fact.
- **FR-003 — Memory Records MUST Preserve Provenance and Temporal State**: `[ADDED store]` The system MUST store stable identity, project and session provenance, creation time, validity state, outcome, and supersession or retraction links so that current guidance and historical mistakes are both queryable without destructive overwrite.
- **FR-004 — sqlite-vec MUST Be a Required Semantic Dependency**: `[REMOVED store]` The v2 core MUST NOT require sqlite-vec, an embedding provider, or vector tables to initialize, save, search, migrate, or serve its MCP lifecycle.
- **FR-005 — vec0 Virtual Tables MUST Store Sentence and Chunk Embeddings**: `[REMOVED store]` The v2 authoritative schema MUST NOT require sentence or chunk `vec0` tables; an evaluated vector implementation MAY create rebuildable projection tables outside the source-of-truth contract.
- **FR-006 — Optional Projection Lineage MUST Be Rebuildable and Traceable**: `[RENAMED store FROM Deterministic Rowid Mapping and Lineage MUST Be Persisted]` Every enabled optional projection MUST map its records deterministically to stable source IDs, record its configuration and source watermark, and be safe to discard and rebuild without changing authoritative memory.
- **FR-007 — Startup Migrations MUST Be Structured and Idempotent**: `[MODIFIED store]` Startup MUST apply only ordered migrations for the clean v2 schema and repeated runs SHALL converge; startup MUST NOT inspect, mutate, dual-read, or silently upgrade a legacy database.
- **FR-008 — V2 Save Paths MUST Use One Explicit Identity Contract**: `[RENAMED store FROM Store Save Paths MUST Retain Nullable Prompt and Observation Project Compatibility]` All v2 save paths MUST preserve a supplied stable root session and project identity or apply one shared deterministic resolver whose degraded result is explicit; v2 MUST NOT retain nullable legacy behavior solely for compatibility.
- **FR-009 — Legacy Import MUST Be One-Way and Non-Destructive**: `[RENAMED store FROM Import and ApplyV2Chunk MUST Preserve or Degrade Identity Explicitly]` The supported legacy migration MUST read a declared old database, write a distinct clean v2 target, preserve the source unchanged, and emit deterministic imported, skipped, quarantined, and failed counts plus bounded reasons.
- **FR-010 — Legacy Identity Defects MUST Be Reported Without Source Mutation**: `[RENAMED store FROM Historical Placeholder Records MUST Not Be Silently Rewritten]` The importer MUST map, quarantine, or reject missing and placeholder legacy identities by documented deterministic rules, MUST report each disposition class, and MUST NOT repair the source database or present an invented identity as verified.

- **FR-011 — Core Retrieval MUST Be Lexical-First and Projection-Aware**: `[RENAMED retrieval FROM Hybrid Retrieval MUST Fuse Four Lanes]` The default retrieval path MUST rank FTS5/BM25 and structured SQLite candidates first and MAY fuse only optional lanes that are enabled, healthy, source-current, source-attributed, and admitted by the benchmark promotion gate.
- **FR-012 — Semantic Retrieval MUST Use sqlite-vec KNN Defaults**: `[REMOVED retrieval]` V2 recall MUST NOT depend on sqlite-vec KNN, fixed sentence/chunk top-k values, or a semantic score threshold; any future dense lane MUST declare and evaluate its own bounded contract.
- **FR-013 — sqlite-vec Distance MUST Be Converted to Comparable Scores**: `[REMOVED retrieval]` The core ranking contract MUST NOT prescribe a sqlite-vec distance conversion; every optional lane MUST expose normalized comparable scores and retain its raw score and lane identity for evaluation and diagnostics.
- **FR-014 — HyDE MUST Use Raw Query and Hypothetical Answer Embeddings**: `[REMOVED retrieval]` The v2 hot path MUST NOT generate hypothetical answers or require an LLM; a future query-expansion experiment MUST remain optional, off by default, and subject to the same promotion gate.
- **FR-015 — FTS5 Lexical Retrieval MUST Use Sanitized Prefix Matching**: `[MODIFIED retrieval]` Lexical retrieval MUST sanitize untrusted FTS syntax and combine exact identifiers or topic keys, phrase-capable BM25 search, and bounded prefix expansion without allowing punctuation-only input or query operators to fail global recall.
- **FR-016 — Core Retrieval MUST Remain Available When Optional Projections Degrade**: `[RENAMED retrieval FROM Retrieval MUST Degrade by Lane, Not Globally]` Missing, stale, rebuilding, disabled, or failed optional projections MUST NOT prevent lexical and structured recall; responses MUST identify each requested optional lane as ready, pending, stale, degraded, or disabled without overstating participation.
- **FR-017 — Recent Saves MUST Be Immediately Searchable by Core Retrieval**: `[RENAMED retrieval FROM Recent Saves MUST Have Explicit Eventual Semantic Consistency]` A confirmed save MUST be queryable through authoritative lookup and FTS5 before success is returned, while optional projections MAY converge asynchronously and MUST expose their coverage state.
- **FR-018 — Progressive Retrieval MUST Use Stable IDs and Bounded Escalation**: `[ADDED retrieval]` Recall MUST return compact ranked evidence with stable IDs and source attribution, context expansion MUST remain within a caller-visible budget, and full record content MUST require explicit `mem_get` escalation.
- **FR-019 — Current Recall MUST Prefer Valid Guidance Without Hiding History**: `[ADDED retrieval]` Default ranking MUST prefer currently valid memory over otherwise comparable superseded, retracted, or failed guidance, while an explicit historical mode MUST be able to return the complete linked lineage.
- **FR-020 — Project Briefing MUST Be Deterministic and Bounded**: `[ADDED retrieval]` Project context MUST assemble a deterministic bounded briefing from durable decisions, conventions, project structure, unresolved outcomes, and recent session handoffs without synthesizing unsupported facts.
- **FR-021 — Recall and Context Paths MUST Emit Token-Savings Measurement Metadata**: `[MODIFIED retrieval]` Recall and context responses MUST report privacy-safe source, evidence, returned, truncated, and budget measurements sufficient to compute payload savings without claiming that characters equal model tokens.
- **FR-022 — Retrieval MUST Measure Compact/Context Answers Versus mem_get Escalation**: `[MODIFIED retrieval]` The retrieval funnel MUST correlate bounded recall/context with later full fetches so an avoided `mem_get` is credited only when no full fetch was required for the same answer path.
- **FR-023 — Recall-After-Compaction Evidence MUST Be Measurable**: `[MODIFIED retrieval]` Lifecycle and eval instrumentation MUST measure whether compact handoff plus bounded recall recover source-attributed evidence after context loss and MUST report payload, quality, and full-fetch escalation separately.

- **FR-024 — Optional Projection Indexing MUST Be Asynchronous and Non-Blocking**: `[RENAMED indexing FROM Indexing MUST Run Asynchronously and Preserve Save Responsiveness]` Dense, entity, graph, reranking, summarization, and other optional projection work MUST run outside the authoritative save transaction and MUST NOT be required for save success or immediate core recall.
- **FR-025 — Sentence and Chunk Vectors MUST Be Indexed into sqlite-vec**: `[REMOVED indexing]` The v2 indexer MUST NOT require sentence or chunk embeddings or sqlite-vec writes; an admitted dense projection MAY choose its own replaceable storage behind the projection contract.
- **FR-026 — Enabled Projections MUST Rebuild From Authoritative SQLite State**: `[RENAMED indexing FROM Automatic Rebuild MUST Trigger on Embedding Config Hash Mismatch]` An enabled optional projection MUST detect source or configuration mismatch, mark itself non-current, and rebuild idempotently from authoritative SQLite records without mutating those records.
- **FR-027 — Jobs MUST Be Idempotent and Retryable**: `[MODIFIED indexing]` Optional projection jobs MUST use stable source identities and checkpoints so duplicate delivery, interruption, and restart converge without duplicate authoritative memory or false readiness.
- **FR-028 — Deterministic KG Facts MUST Be Written Synchronously on Save**: `[REMOVED indexing]` The v2 save transaction MUST NOT write graph entities or triples; any graph projection MUST be asynchronous, rebuildable, non-authoritative, and absent from the first-product runtime.
- **FR-029 — `extract_kg` Background Job MUST Be Retained for Optional LLM Enrichment**: `[REMOVED indexing]` The first product MUST NOT retain an LLM extraction job as a required or preconfigured lifecycle component; later enrichment experiments MUST be separate optional projections.
- **FR-030 — Optional Projection Consistency MUST Be Eventual and Explicit**: `[RENAMED indexing FROM Post-Save Semantic Consistency MUST Be Eventual and Explicit]` Each enabled optional projection MAY converge after save but MUST publish a source watermark and readiness state; authoritative and FTS5 retrieval MUST be immediate.

- **FR-031 — MCP Surface MUST Be Compact and Workflow-Level**: `[MODIFIED tools]` The v2 server MUST expose exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`; internal migration, indexing, evaluation, setup, diagnostics, and deferred graph operations MUST remain outside the model-visible MCP registry.
- **FR-032 — Recall Surface MUST Expose Ranked Core Retrieval With Optional Lane Truth**: `[RENAMED tools FROM Recall Surface MUST Expose Four-Lane Fused Retrieval]` `mem_recall` MUST return ranked lexical/structured evidence and MAY include promoted optional evidence only when response metadata identifies the contributing lanes and their readiness truthfully.
- **FR-033 — Tooling MUST Signal Optional Projection State Without Degrading Core**: `[RENAMED tools FROM Tooling MUST Signal Semantic Degraded or Pending States Explicitly]` Tool responses MUST expose requested optional projection states as bounded metadata while continuing to return usable core results when optional components are unavailable.
- **FR-034 — Native Integrations MUST Use the Documented V2 Tool Contracts**: `[RENAMED tools FROM Native Integration MUST Preserve Existing Tool Request and Response Contracts]` Every native plugin MUST call the shared v2 tools and schemas; the release MAY break old inputs, actions, and response shapes and MUST NOT add compatibility shims unless a separate change explicitly requires them.
- **FR-035 — Native Integrations MUST Share V2 Storage and Retrieval Semantics**: `[RENAMED tools FROM Native Integration MUST Preserve Storage and Retrieval Semantics]` Enabling any native plugin MUST use the same authoritative ledger, identity, privacy, idempotency, ranking, temporal, and bounded-output rules as direct v2 MCP use.
- **FR-036 — `mem_project action=graph` MUST Be KG-Backed and Behavior-Preserving**: `[REMOVED tools]` The first-product `mem_project` contract MUST NOT require a graph action or KG-backed result; project briefing and deterministic record navigation MUST remain available without graph state.
- **FR-037 — `mem_project action=graph` MUST Default to a Current-State View With History Reachable**: `[REMOVED tools]` Current-versus-historical memory navigation MUST use ledger lineage and MUST NOT depend on a graph action in the first product.
- **FR-038 — Graph Navigation MUST Be Additive Within the Existing `mem_project` Tool**: `[REMOVED tools]` Neighborhood, community, and graph-frontier navigation MUST be outside the first-product MCP contract and MAY return only through a future separately evaluated surface.

- **FR-039 — Every Native Plugin MUST Bundle Hooks, MCP, and Skills**: `[ADDED harness-integration]` The OpenCode, Codex, and Claude Code plugin packages MUST each contain host-native lifecycle hooks, one registration path for the shared six-tool MCP server, and Skills that teach the host when and how to use the memory workflow.
- **FR-040 — Passive Subagent Learning MUST Remain Isolated From Root-User Intent**: `[REMOVED harness-integration]` The first product MUST NOT auto-persist arbitrary subagent output or tool-call streams; automatic capture MUST be limited to privacy-safe root-user prompts and verified lifecycle checkpoints, while other learning requires an explicit save decision.
- **FR-041 — Runtime Lifecycle MUST Preserve the V2 Core Contract**: `[RENAMED harness-integration FROM Runtime Enrichment MUST Preserve Existing Memory Contracts]` Start/resume recovery, prompt capture, compaction, finalization, and degraded diagnostics MUST use the shared v2 identity, privacy, idempotency, temporal, and bounded-output contracts without direct storage access.
- **FR-042 — Shared Skills MUST Route to One Host-Specific Lifecycle Contract**: `[RENAMED harness-integration FROM Progressive harness routing]` Each packaged Skill MUST preserve shared memory rules, detect its verified host context, load only the relevant host reference, and avoid claiming unavailable lifecycle or injection capabilities.
- **FR-043 — Every Harness Setup MUST Install Its Packaged Skill Asset**: `[RENAMED harness-integration FROM Install packaged skill asset]` Managed setup for OpenCode, Codex, and Claude Code MUST install the complete receipt-owned Skill asset and references for that harness without overwriting unrelated user Skills.
- **FR-044 — Native OpenCode identity tool**: `[REMOVED harness-integration]` The OpenCode plugin MUST NOT add a model-callable identity-only tool; verified root identity MUST be resolved inside the host adapter and passed to the shared lifecycle contract.
- **FR-045 — Versioned identity result**: `[REMOVED harness-integration]` The first-product model-visible surface MUST NOT expose a separate OpenCode identity-result schema outside the six MCP tools.
- **FR-046 — Bounded parent-chain resolution**: `[REMOVED harness-integration]` Parent-chain resolution MAY remain an internal bounded adapter operation but MUST NOT define a standalone model tool contract.
- **FR-047 — Delegated authority remains denied**: `[REMOVED harness-integration]` Delegated-authority enforcement MUST be part of the shared adapter identity contract rather than a separate OpenCode model-tool requirement.
- **FR-048 — Identity-only execution**: `[REMOVED harness-integration]` The first product MUST NOT ship an identity-only model tool whose sole purpose is to compensate for adapter limitations.
- **FR-049 — Fail-closed bounded output**: `[REMOVED harness-integration]` Identity failure MUST remain fail-closed and bounded inside lifecycle diagnostics, but MUST NOT require a separate model-visible identity tool output.

- **FR-050 — Published Package MUST Contain Native Assets for All Three Harnesses**: `[MODIFIED packaging]` The packed release MUST contain independently installable OpenCode, Codex, and Claude Code plugin inventories, and each inventory MUST include the harness's hooks, MCP registration, Skills, adapter, portable runner, and managed setup metadata for the same shared core version.
- **FR-051 — NPM Tarball MUST Include the Complete Integration Inventory**: `[MODIFIED packaging]` Packed-artifact verification MUST prove that every declared native hook, MCP registration, Skill/reference, adapter, runner, and setup receipt path exists exactly once under one harness owner and resolves inside the tarball.
- **FR-052 — First Product Package MUST Exclude Deferred Runtime Surfaces**: `[ADDED packaging]` The default package and startup path MUST NOT require or automatically start a dashboard, observatory, HTTP service, graph engine, external database, embedding model, reranker, or LLM; experimental packages MAY be added later without becoming core dependencies.

- **FR-053 — Evals MUST Compare Equal-Budget Retrieval Lanes Against the Lexical Baseline**: `[RENAMED evals FROM Evals MUST Compare Hybrid Against Lexical Baseline]` Evaluation MUST compare lexical, dense, hybrid, entity, graph, reranking, and query-expansion candidates only when they use the same corpus, query order, candidate budget, final context-token budget, reader or coding agent, and scoring procedure.
- **FR-054 — Provenance MUST Be Verified Across Every Enabled Lane**: `[RENAMED evals FROM Citation and Lineage MUST Be Verified Across Lanes]` Every evaluated result MUST retain stable source IDs and evidence lineage, and a lane MUST fail its gate when relevant output cannot be traced to authoritative SQLite evidence.
- **FR-055 — Bounded Progressive Context Quality MUST Be Measured**: `[RENAMED evals FROM Context Compression Quality MUST Be Measured]` Evals MUST measure compact recall, context expansion, and full-fetch escalation at fixed budgets so a smaller payload is not credited when it removes evidence required for a correct answer or task.
- **FR-056 — Optional Projection Fallback MUST Be Measured**: `[RENAMED evals FROM Degraded and Pending Semantic Fallback MUST Be Measured]` Evals MUST cover disabled, missing, stale, rebuilding, failed, and source-mismatched optional projections and MUST prove that the lexical baseline remains non-empty whenever its control run is non-empty.
- **FR-057 — External Benchmark Metrics MUST Retain Their Published Meaning**: `[ADDED evals]` Benchmark adapters MUST keep retrieval metrics such as MRR, Recall@1, Recall@5, and Hit@K separate from evidence recall, answer F1 or accuracy, judge scores, and agent task outcomes, and MUST label Top-K as a retrieval budget rather than a score.
- **FR-058 — Benchmark Reports MUST Include Quality and Resource Envelopes**: `[ADDED evals]` Durable reports MUST include dataset/version and corpus hashes, candidate configuration, quality metrics, p50/p95 query latency, ingestion/index time, startup time, peak memory, database and model bytes, injected context tokens, truncation, errors, and unavailable evidence.
- **FR-059 — Optional Lanes MUST Pass a Fail-Closed Promotion Gate**: `[ADDED evals]` A candidate MAY become a default only when a complete same-budget report meets predeclared quality, token, latency, memory, footprint, and provenance thresholds; incomplete, incomparable, or regressing evidence MUST leave it disabled by default.
- **FR-060 — Coding-Agent Evaluation MUST Measure Hidden-Test Outcomes**: `[ADDED evals]` The benchmark suite MUST include coding tasks whose success is measured by hidden-test or equivalent task outcomes in addition to retrieval and answer metrics, so improved recall alone cannot establish product value.
- **FR-061 — Evals MUST Report Runtime Token-Savings Telemetry**: `[MODIFIED evals]` Eval reports MUST distinguish source, evidence, returned, truncated, and injected model-token payloads and MUST compare them with answer or task quality under the same budget.
- **FR-062 — Evals MUST Measure mem_get Avoided and Escalated Paths**: `[MODIFIED evals]` Evals MUST report compact/context paths that finish without full fetch separately from paths that require `mem_get`, and MUST not credit an avoided fetch when later escalation occurs for the same answer path.
- **FR-063 — Evals MUST Include Recall-After-Compaction Evidence**: `[MODIFIED evals]` Evals MUST simulate context loss and report recovered source evidence, answer or task quality, injected payload, and full-fetch escalation for each compared retrieval configuration.

## Success criteria

- **SC-001** `[buildable]`: One contract test passes every step required to save evidence, promote a memory, record a failed outcome, supersede it, retrieve the correction as current, and retrieve the complete original lineage as history without deleting any authoritative row.
- **SC-002** `[buildable]`: The clean core initializes and passes save, immediate recall, context, full-fetch, project-briefing, and session tests with no vector extension, embedding model, graph module, reranker, LLM, HTTP service, or dashboard installed or enabled.
- **SC-003** `[buildable]`: MCP registry verification returns exactly the six named workflow tools, and every default recall/context response enforces its documented bound and exposes stable IDs for explicit expansion.
- **SC-004** `[buildable]`: Every confirmed save is discoverable through exact or FTS5 core retrieval before the save call returns; optional projection failure does not change that result and is reported as metadata.
- **SC-005** `[buildable]`: Every packed OpenCode, Codex, and Claude Code plugin contains and resolves hooks, one shared-core MCP registration, and Skills/references, with no required runtime path escaping the tarball.
- **SC-006** `[buildable]`: Disposable host fixtures pass every supported start/resume, root-prompt capture, compaction checkpoint/guidance ordering, finalization, duplicate-event idempotency, and truthful degraded-outcome case through the same v2 core contracts.
- **SC-007** `[buildable]`: Installing and starting the packed first product starts or requires zero dashboard, observatory, HTTP server, graph engine, external database, model download, reranker, or LLM credential dependencies.
- **SC-008** `[buildable]`: On the committed reference workload, default lexical save and recall make zero LLM calls, load zero model bytes, make zero external network calls, and commit the measured p95 query latency and peak-memory envelope rather than inferring them.
- **SC-009** `[buildable]`: Automatic capture fixtures persist only one bounded privacy-safe root-user prompt per confirmed event plus verified lifecycle checkpoints; tool-call streams and arbitrary subagent output produce zero automatic memory rows.
- **SC-010** `[buildable]`: Every enabled optional projection can be deleted and rebuilt from the authoritative SQLite database to an equivalent source watermark without changing authoritative row hashes.
- **SC-011** `[buildable]`: Every fresh-target importer run leaves the legacy fixture byte-for-byte unchanged, produces identical deterministic dispositions and counts, and never requires the v2 runtime to read the legacy schema.
- **SC-012** `[buildable]`: One reproducible command produces durable, schema-validated reports for every required lane—LongMemEval-S, deterministic LoCoMo scoring, AMB BEAM at 100K and 1M, AMB PersonaMem at 32K and 1M, and SDEBench—or marks a lane unavailable with a bounded explicit reason rather than fabricating a result.
- **SC-013** `[outcome]`: On the agreed benchmark manifest, the default recovery/recall configuration reduces injected context tokens by at least 75% versus the full-source baseline while losing no more than 5 percentage points on the corresponding answer or hidden-test success metric.
- **SC-014** `[outcome]`: No optional lane becomes default unless its complete same-budget report improves at least one predeclared primary quality metric by 5% relative over lexical-only, causes no statistically or deterministically identified primary-quality regression, and stays within the predeclared token, latency, memory, and package-footprint ceilings.

## Assumptions

- The current six MCP tool names remain a good workflow boundary even though their v2 request/response semantics may change.
- SQLite and FTS5 are available through the supported Node.js runtime and database driver; no network service is required for the reliable core.
- Root-user prompt capture and explicit lifecycle checkpoints are the only automatic capture signals justified for the first product; agents can still call `mem_save` deliberately for durable discoveries and decisions.
- Optional vector, entity, graph, reranking, summarization, and query-expansion experiments are permitted only behind the rebuildable projection and benchmark contracts.
- The initial benchmark promotion thresholds in SC-013 and SC-014 are product gates, not claims that current thoth-mem or any reference repository already satisfies them.

## Dependencies

- Supported host lifecycle/plugin APIs for OpenCode, Codex, and Claude Code, with per-version capability evidence and truthful degradation where an event is unavailable.
- A local SQLite build with FTS5 through the supported `better-sqlite3` runtime.
- Public benchmark datasets and runners whose licenses permit local evaluation, plus thin adapters that preserve their published metric semantics.
- Frozen representative legacy database fixtures for importer development; real user databases are not required for automated verification.

## Out of scope

- Backward-compatible v1 MCP schemas, graph actions, storage APIs, internal libraries, dual reads, dual writes, or runtime compatibility shims.
- A dashboard, memory observatory, visualization API, HTTP service, graph product, hosted service, multi-user control plane, or external database in the first product.
- Automatic ingestion of every tool call, terminal command, file read, subagent message, or assistant response.
- LLM-based extraction, summarization, HyDE, reranking, embeddings, entity linking, graph traversal, or community detection in the default hot path.
- Deleting the source legacy database or performing an in-place upgrade.
- Claiming benchmark leadership before the committed adapters and equal-budget reports exist.
