# Feature Specification: Reconcile Legacy Memory Database

**Change ID**: `reconcile-legacy-memory-database`<br>
**Route**: Full<br>
**Status**: Draft

## Intent and scope

**Why**: Existing users must be able to carry the durable, recallable history in a legacy `thoth.db` into the current SQLite ledger without erasing memories already captured by the current product.<br>
**Impact**: `import-legacy` becomes a planned, auditable reconciliation workflow that can merge into a populated current database through an isolated candidate copy. It preserves supported legacy history, keeps existing current truth authoritative on conflicts, and never requires legacy vector, graph, FTS, or operational extensions.<br>
**Affected capabilities**: `store`, `cli`

## User stories

### US1 - Inspect a migration without changing either database (Priority: P1)

As an operator, I can generate a deterministic reconciliation plan so that I know what will be imported, ignored, isolated, or blocked before any durable change.

**Independent test**: Run planning against a populated current fixture and a legacy fixture containing authoritative, derived, virtual, private, malformed, and unsupported rows; prove both input hashes remain unchanged and inspect the bounded plan.

**Covers**: FR-001, FR-002, SC-001, SC-002

**Acceptance scenarios**:

1. **Given** distinct readable legacy and current databases, **When** planning runs, **Then** it performs zero input writes and reports source/target fingerprints, supported schema, authoritative row counts, ignored derived inventory, project dispositions, privacy transformations, and blocking errors.
2. **Given** legacy virtual tables whose modules are unavailable, **When** planning inventories derived state, **Then** it classifies them from schema metadata without querying or loading those modules.
3. **Given** an unsupported source schema, aliased paths, unreadable input, or a source/target that changes during planning, **When** planning completes, **Then** it fails closed with no candidate or input mutation.

### US2 - Reconcile project identities without guessing (Priority: P1)

As an operator, I can review and override exact project mappings so that imported history becomes visible under the right current project without merging unrelated repositories.

**Independent test**: Plan a fixture with exact path aliases, explicit mappings, unmatched names, placeholders, and ambiguous collisions; verify one deterministic disposition per source project and zero fuzzy matches.

**Covers**: FR-001, FR-002, SC-003

**Acceptance scenarios**:

1. **Given** an explicit source-project mapping to one exact current project key or alias, **When** it validates, **Then** every mapped legacy row uses that canonical project and the mapping is bound into the import receipt.
2. **Given** one unambiguous exact canonical key or exact path alias, **When** no explicit override conflicts, **Then** the plan may propose that mapping and reports the evidence used.
3. **Given** a non-placeholder legacy project that has no safe current match, **When** planning runs, **Then** it assigns one deterministic isolated legacy project identity rather than dropping its history or guessing a current project.
4. **Given** placeholder identity, contradictory row/session identity, ambiguous aliases, or a conflicting explicit mapping, **When** reconciliation cannot resolve it safely, **Then** affected rows are quarantined or the plan is blocked with bounded reasons and no invented verified identity.

### US3 - Preserve authoritative legacy history without rewriting current truth (Priority: P1)

As an operator, I can import supported historical sessions, prompts, summaries, observation revisions, and observations so that old memories remain inspectable and recallable while current memories keep their meaning.

**Independent test**: Apply a planned merge to a candidate fixture with overlapping current and legacy topic lineages; verify all supported source rows reconcile to durable destination IDs, existing destination IDs/content remain intact, and current topic winners do not change merely because history was imported.

**Covers**: FR-001, SC-004, SC-005, SC-006, SC-010

**Acceptance scenarios**:

1. **Given** supported legacy sessions, prompts, session summaries, prior observation versions, and active observations, **When** apply succeeds, **Then** their original source identity, project/session association, timestamps, kind, title/content after declared privacy filtering, topic key, revision order, and disposition remain auditable.
2. **Given** a legacy observation that was recallable as product memory, **When** it is imported, **Then** it becomes immutable `legacy_observation` evidence plus a linked historical memory without fabricating a current observation candidate, review, support policy, or promotion event.
3. **Given** a legacy session summary that is not valid current structured-summary input, **When** it is imported, **Then** it is preserved as legacy evidence and recallable handoff history without fabricating summary claims or ordered event coverage.
4. **Given** a deleted legacy observation, an unsafe row that becomes empty after privacy filtering, or an unsupported authoritative row, **When** apply runs, **Then** it is skipped or quarantined explicitly and is never resurrected into recall.
5. **Given** an existing current memory with the same mapped project and topic, **When** older or overlapping legacy lineage is imported, **Then** the existing current winner remains current and imported versions remain reachable as historical provenance.
6. **Given** exact equivalent current memory content in the same mapped project, **When** import reconciles it, **Then** it records legacy provenance without creating a duplicate recall entry.

### US4 - Commit a verified candidate atomically (Priority: P1)

As an operator, I can apply an approved plan through a recoverable candidate database so that failure never leaves the active database partially merged.

**Independent test**: Inject failures during candidate copy, row mapping, privacy filtering, FTS reconciliation, integrity checks, source-change detection, and final publication; verify the active target and source hashes remain at their pre-apply values.

**Covers**: FR-001, FR-002, SC-007, SC-008, SC-011

**Acceptance scenarios**:

1. **Given** an approved plan bound to exact source and target fingerprints, **When** apply starts, **Then** it creates a recoverable verified backup and a private candidate copy rather than mutating the active target in place.
2. **Given** a fully reconciled candidate, **When** foreign keys, schema revision, import lineage, row dispositions, memory provenance, and FTS checks pass and both inputs are unchanged, **Then** publication replaces the target atomically and emits a bounded durable report.
3. **Given** any failed check, changed input, target lock, write error, or interrupted candidate build, **When** apply exits, **Then** the prior target remains recoverable and no partial candidate is reported as committed.

### US5 - Repeat or audit the import safely (Priority: P2)

As an operator, I can replay the same approved import or inspect its receipt so that recovery and verification do not create duplicates.

**Independent test**: Re-run the same source fingerprint, mapping manifest, privacy policy, and target lineage; prove stable destination mappings and zero logical row changes.

**Covers**: FR-001, FR-002, SC-009

**Acceptance scenarios**:

1. **Given** a previously committed import with the same source fingerprint, mapping, policy, and target lineage, **When** it is replayed, **Then** it returns the original import and row mappings as an idempotent no-op.
2. **Given** the same source under a changed mapping or policy, **When** replay is attempted, **Then** it requires a new explicit plan and cannot silently reuse prior receipts.

## Edge cases

- The source contains FTS5 and `vec0` virtual tables plus shadow tables, but the current runtime does not load the legacy vector extension.
- The current target is populated and may overlap the legacy capture period.
- A legacy observation may have zero or many immutable prior versions; version timestamps may tie.
- Session-level project and row-level project values may disagree.
- Legacy project values may be names rather than canonical keys or paths.
- Multiple current projects may expose the same normalized root/path evidence; ambiguity must not auto-resolve.
- Privacy delimiters may be complete, malformed, unmatched, or leave empty title/content after filtering.
- Existing topic lineages may contain current and superseded memories, while imported legacy rows may be older or temporally overlapping.
- The source or target may use WAL sidecars, change during a long plan/apply, or be held open by a host process.
- A report, backup, or candidate path may already exist; owned artifacts must not overwrite unrelated files.

## Functional requirements

- **FR-001 — Legacy Import MUST Preserve Source Data and Report Disposition**: `[MODIFIED store]` The system MUST reconcile every supported authoritative legacy session, prompt, session summary, observation version, and active observation against a distinct current target; preserve source data byte-for-byte; ignore derived graph/vector/FTS/operational state without requiring its extensions; preserve declared identity, timestamp, revision, topic, privacy-transformation, provenance, and temporal dispositions; keep existing current memory authoritative on mapped-project conflicts; avoid duplicate recall entries for exact equivalents; persist deterministic import and per-row lineage for idempotent audit; quarantine or skip every unsupported/unsafe row explicitly; and verify foreign keys, schema, provenance, temporal lineage, and FTS before reporting commit.
- **FR-002 — Legacy Import MUST Be Explicit and Non-Destructive**: `[MODIFIED cli]` `import-legacy` MUST separate zero-write planning from explicit apply; require distinct explicit source and current-target paths plus a plan bound to their fingerprints and exact mapping/privacy policy; support a populated current target by building from a verified backup into an isolated candidate; reject fuzzy or ambiguous project matching, changed/locked inputs, unsafe artifact paths, and stale plans; publish only a completely verified candidate through an atomic target replacement; retain bounded recovery/report artifacts; and make an identical replay a no-op.

## Success criteria

- **SC-001** `[buildable]`: Planning a supported adversarial fixture performs zero writes and produces deterministic byte-identical logical output after volatile paths/times are normalized.
- **SC-002** `[buildable]`: Planning succeeds without loading/querying unavailable legacy virtual-table modules and accounts for every source table as authoritative, derived, shadow, or unsupported.
- **SC-003** `[buildable]`: Every distinct legacy project and every authoritative row receives exactly one mapped, isolated, quarantined, skipped, or blocked disposition; ambiguous/fuzzy matching produces zero automatic mappings.
- **SC-004** `[buildable]`: A merge fixture containing sessions, prompts, raw session summaries, active/deleted observations, and multiple prior versions reconciles 100% of supported rows to stable destination or explicit non-import dispositions.
- **SC-005** `[buildable]`: 100% of existing target projects, sessions, evidence, events, summaries, observations, reviews, promotions, memories, receipts, and aliases retain their IDs and payloads after a successful merge, except for import-owned provenance links and required temporal/FTS accounting.
- **SC-006** `[buildable]`: Imported recallable legacy observations and summaries are retrievable in their resolved projects with zero changes to pre-existing current topic winners or normal recall order among pre-existing entries.
- **SC-007** `[buildable]`: Every injected pre-publication failure leaves source and active-target logical hashes unchanged and cleans only importer-owned candidate artifacts.
- **SC-008** `[buildable]`: A committed candidate passes `foreign_key_check`, current schema revision, exact memory/FTS reconciliation, import receipt reconciliation, and source/target fingerprint checks before publication.
- **SC-009** `[buildable]`: Replaying the same committed source, plan, mapping, and policy changes zero logical rows and returns the original stable import/row mappings.
- **SC-010** `[outcome]`: A separately authorized rehearsal against copies of the real legacy and current databases accounts for all authoritative rows, reports zero unexplained loss, preserves both originals byte-for-byte, and yields a candidate that passes all integrity gates.
- **SC-011** `[outcome]`: A separately authorized real cutover preserves 100% of the verified pre-cutover target backup and makes historical legacy memories recallable under approved project mappings with zero regression in current-memory recall.

## Assumptions

- Active legacy observations are product memories already accepted under the legacy product contract; importing them as legacy evidence plus memory preserves that historical state without inventing current observation review/promotion lineage.
- Legacy graph, vector, FTS, maintenance, telemetry, and operational tables are rebuildable or obsolete derivatives and are not authoritative import inputs.
- An exact existing target memory match may receive additional legacy provenance, but fuzzy content deduplication is forbidden.
- Existing current topic winners take precedence over overlapping imported history unless a future explicit review changes them.
- Non-placeholder unmatched projects remain accessible under deterministic isolated legacy identities; those identities are import provenance, not verified Git identity.
- The operator will stop processes using the target before final publication; inability to obtain a safe publication boundary fails closed.

## Dependencies

- Current revision-7 SQLite ledger, FTS triggers, identity/alias resolution, privacy filtering, and stable deterministic ID helpers.
- `better-sqlite3` read-only and backup/transaction capabilities available in the supported Node runtime.
- A user-approved project mapping manifest for any legacy project that should attach to an existing canonical project without exact unambiguous evidence.

## Out of scope

- Importing or retaining legacy embeddings, vector indexes, knowledge graphs, maintenance projections, operation traces, access statistics, or FTS shadow state.
- Fuzzy project matching, remote-based clone merging, basename matching, or automatic merge of unrelated current projects.
- Reconstructing current observation candidates, reviews, promotion policy, ordered session events, or structured session-summary claims from legacy prose.
- Deleting the legacy source or recovery backups after cutover.
- Changing the exact six-tool MCP surface or adding a general-purpose project merge command.
