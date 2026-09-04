# Feature Specification: Canonical taxonomy recovery

**Change ID**: `canonical-taxonomy-recovery`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: A real OpenCode no-tools smoke proved that the native hooks and SQLite recovery executed, but an out-of-contract `learning` memory previously accepted by `mem_save` caused the strict Bun-to-Node envelope validator to reject the complete recovery payload. OpenCode therefore received identity without memory and correctly answered `NO_RECUPERADO`.<br>
**Impact**: V2 write paths reject non-canonical taxonomy values before persistence, SQLite enforces the same closed contract, existing known invalid values converge through one deterministic internal migration, and OpenCode automatic recovery cannot report a valid envelope whose items violate the shared V2 taxonomy.<br>
**Affected capabilities**: `tools`, `store`, `harness-integration`

## User stories

### US1 - Reject invalid memory writes before persistence (Priority: P1)

As a coding-agent user, I can trust that accepted memory writes are recoverable by every supported native host because all public and internal write paths enforce one closed V2 taxonomy.

**Independent test**: Call `mem_save` and `MemoryService.save` with valid and invalid evidence kinds, memory kinds, outcomes, and harnesses; valid values commit and invalid values return bounded errors without adding ledger rows.

**Covers**: FR-001, FR-002, FR-006, SC-001, SC-002, SC-006

**Acceptance scenarios**:

1. **Given** a valid V2 save request, **When** it enters through MCP or the shared service, **Then** it persists with canonical evidence, memory, outcome, and session values and remains immediately recallable.
2. **Given** a request containing `learning`, `certification`, `verification`, or another non-canonical taxonomy value, **When** the write boundary validates it, **Then** the request fails with a bounded field-specific error and no evidence, memory, receipt, or FTS row is committed.

### US2 - Converge the pre-constraint V2 ledger safely (Priority: P1)

As an existing local user, I can start the corrected package without discarding valid evidence, stable IDs, lineage, or session history even when earlier V2 code admitted known legacy-shaped taxonomy values.

**Independent test**: Open a version-2 fixture containing the observed invalid values and verify one transactional migration preserves IDs, content hashes, timestamps, relationships, receipts, and FTS visibility while mapping only the declared known values to canonical V2 kinds.

**Covers**: FR-002, FR-003, FR-007, SC-003, SC-004

**Acceptance scenarios**:

1. **Given** an existing V2 database containing memory kind `learning` and evidence kinds `certification` or `verification`, **When** startup migration runs, **Then** it maps `learning` to `convention`, maps `certification` and `verification` to `explicit_save`, preserves stable records and relationships, and records the new internal schema revision atomically.
2. **Given** an existing database containing an unknown non-canonical taxonomy value, **When** migration preflight runs, **Then** startup fails with a bounded diagnostic and leaves the database at its prior revision without partial normalization.
3. **Given** an already-converged database, **When** startup runs repeatedly, **Then** migration is idempotent and performs no further ledger mutation.

### US3 - Deliver automatic OpenCode recovery through the strict shared contract (Priority: P1)

As an OpenCode user, I can begin a new root session and receive bounded prior memory automatically without needing MCP calls or losing all context because one component used a different taxonomy list.

**Independent test**: Seed canonical SC008 memory, execute the packed OpenCode lifecycle path through Bun and literal Node, and verify the tagged system tail contains the marker; separately inject a malformed child envelope and verify a precise degraded diagnostic with no unverified memory injection.

**Covers**: FR-004, FR-005, FR-006, SC-005, SC-006, SC-007

**Acceptance scenarios**:

1. **Given** a project with canonical current memories, **When** OpenCode invokes `experimental.chat.system.transform` for a verified root session, **Then** the Node lifecycle envelope passes the shared taxonomy validator and the bounded tagged recovery block contains source-attributed context.
2. **Given** Node returns an envelope with a non-canonical recovery item, **When** the Bun-side client validates it, **Then** it rejects the envelope, emits a bounded reason-specific diagnostic, injects no unverified memory, and does not reject the user's prompt.
3. **Given** a fresh real OpenCode session and a marker absent from the user prompt, **When** the model is instructed not to call tools, MCP, or Skills, **Then** it can return the marker from automatic context and the export contains no thoth-mem tool calls.

## Edge cases

- A direct `MemoryService` caller bypasses MCP validation.
- A failed save occurs after a project or session identity was supplied but before any evidence row is inserted.
- A known invalid kind participates in a current-topic supersession chain or has linked immutable evidence.
- An unknown invalid value appears alongside known migratable values; the complete migration must roll back.
- The migration is interrupted, retried, or opened concurrently by another process under SQLite serialization.
- A recovery result contains zero items, an oversized item, an invalid kind, or otherwise malformed nested data.
- Several valid recovery items together exceed the host-visible output cap; one long leading item must not silently starve every later recovered item.
- The OpenCode child writes a valid receipt but exits nonzero, exceeds its output bound, or returns a response that the Bun validator rejects.
- Existing private filtering, temporal status, source attribution, FTS visibility, and exact six-tool registry must remain unchanged.

## Functional requirements

- **FR-001 — Native Integrations MUST Use the Documented V2 Tool Contracts**: `[MODIFIED tools]` The six-tool MCP surface MUST describe and validate nested evidence kind, memory kind, memory outcome, harness, and lifecycle operation values using canonical runtime schemas; TypeScript casts alone MUST NOT admit arbitrary strings, and every native integration MUST consume the same validated V2 contract.
- **FR-002 — SQLite Ledger MUST Enforce Canonical V2 Taxonomies**: `[ADDED store]` Fresh and migrated SQLite ledgers MUST reject non-canonical evidence and memory kinds at the storage boundary, while the shared service MUST validate the same contract before opening a durable write.
- **FR-003 — Startup Migrations MUST Be Structured and Idempotent**: `[MODIFIED store]` Startup MUST transactionally migrate only the declared known mappings `learning -> convention` and `certification|verification -> explicit_save`, preserve authoritative record identity and lineage, fail without partial mutation for unknown values, distinguish the internal SQLite revision from the public V2 protocol version, and remain separate from the one-way legacy-database importer.
- **FR-004 — OpenCode Bun Runtime MUST Keep SQLite Behind the Node Boundary**: `[MODIFIED harness-integration]` The Bun-side lifecycle client MUST continue to accept only a bounded versioned Node envelope, but its nested taxonomy validation MUST consume the same canonical runtime values as the Node core and MUST report a reason-specific safe diagnostic when validation fails.
- **FR-005 — Model-Visible Recovery Context MUST Be Bounded and Capability-Gated**: `[MODIFIED harness-integration]` Confirmed automatic recovery MUST render only canonical, bounded, source-attributed items from the shared lifecycle result; the host-visible budget MUST be allocated at item boundaries so a long leading item cannot consume the complete content allowance while later selected items fit only outside the final block; an invalid envelope MUST inject no memory and MUST remain distinguishable from successful context delivery and model consumption.
- **FR-006 — Public Surface and Host Boundary MUST Remain Compact**: `[INTERNAL]` The change MUST preserve exactly six MCP tools, one OpenCode identity-only native tool, the Bun-to-literal-Node boundary, and the absence of LLM work on the hot path.
- **FR-007 — Migration MUST Preserve Authoritative Ledger Semantics**: `[INTERNAL]` Taxonomy convergence MUST preserve IDs, content, content hashes, timestamps, sessions, evidence links, supersession/retraction state, receipts, FTS content, and foreign-key integrity without rewriting unrelated records.

## Success criteria

- **SC-001** `[buildable]`: Contract-source verification passes when one exported canonical value set drives TypeScript unions, MCP nested schemas, service validation, SQLite DDL/migration checks, and OpenCode lifecycle-envelope validation with zero duplicated divergent string lists.
- **SC-002** `[buildable]`: Focused MCP and service tests pass when every canonical value is accepted and representative invalid values return bounded field-specific errors with zero durable side effects.
- **SC-003** `[buildable]`: Migration verification passes when a version-2 fixture containing the observed invalid values reaches the new internal revision with identical IDs, content hashes, relationships, receipts, row counts, and passing foreign-key/FTS integrity checks.
- **SC-004** `[buildable]`: Rollback and idempotency verification passes when unknown invalid taxonomy values and injected migration failures preserve every fixture row at its prior revision and every repeated successful startup changes zero rows.
- **SC-005** `[buildable]`: Unit, integration, packed-tarball, and Bun-boundary tests pass when a canonical SC008 marker reaches `experimental.chat.system.transform` both alone and after multiple longer recovered items without exceeding the 1,000-code-point host cap, while malformed taxonomy output produces exactly one reason-specific degraded diagnostic and zero injected memory blocks.
- **SC-006** `[buildable]`: Full repository verification passes when `pnpm run build`, `pnpm test`, `pnpm run integration:verify`, `pnpm run integration:smoke`, `pnpm run prepublishOnly`, and `git diff --check` all succeed while the MCP registry remains exactly six tools.
- **SC-007** `[outcome]`: Real-host recovery passes when, after installing/restarting the corrected local bundle, one fresh OpenCode no-tools smoke returns the absent-from-prompt SC008 marker, records `enroll`, `capture_root`, and `recover`, contains zero thoth-mem tool calls, and produces zero `node_lifecycle_invalid_envelope` diagnostics.

## Assumptions

- The observed real-host failure and database audit are authoritative: OpenCode `1.18.23` executed the hooks, Node recovered canonical and non-canonical rows, and Bun rejected the complete envelope because `learning` was outside the V2 validator.
- The existing one-way importer mapping of `learning` to `convention` is the canonical precedent for the V2 migration.
- `certification` and `verification` describe explicit saved evidence rather than new evidence categories and therefore map to `explicit_save`.
- `master` is a pattern reference only: its shared taxonomy constant, Zod enum, SQLite constraint, and direct-SQL regression test are reusable principles, but its larger legacy observation model is not restored.
- AgentMemory and Engram are boundary references only: validation stays in the shared core, the OpenCode adapter stays thin, and their daemons, broad tool registries, and compatibility layers are not adopted.

## Dependencies

- SQLite transactional DDL/DML and `better-sqlite3`.
- Zod already used by the MCP registration surface.
- Existing OpenCode Bun-to-Node lifecycle boundary and packed plugin verifier.
- A user-operated OpenCode restart and exported session for SC-007.

## Out of scope

- Expanding V2 with `learning`, `certification`, `verification`, or legacy master taxonomy values.
- General backward-compatibility shims or support for arbitrary corrupt database values.
- Changing retrieval ranking, vectors, reranking, consolidation, graph, dashboard, or observatory behavior.
- Adding MCP tools, harness-specific memory tools, a daemon, an HTTP service, or an LLM hot path.
- Certifying paid Claude model consumption or changing Codex/Claude distribution.
- Completing pre/post-compaction and finalization real-host smoke coverage; those remain separate certification steps after start recovery passes.
