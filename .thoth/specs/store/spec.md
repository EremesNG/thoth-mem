# Store

## Requirements

### Requirement: SQLite Memory Ledger MUST Be the Sole Source of Truth

The system MUST preserve canonical observation, review, and promotion submissions as immutable local evidence and materialize rebuildable candidate, verdict, support, and promotion state without treating derived observations as authoritative truth.

#### Scenario: US1 - Preserve a source-supported observation candidate 1

- **GIVEN** a verified project or root session and one or more eligible source-evidence IDs
- **WHEN** `mem_save` receives a valid atomic observation candidate
- **THEN** it records a canonical immutable submission, generator identity, scope, supports, advisory file/concept facets, proposed memory interpretation, and one pending derived record before reporting success

#### Scenario: US1 - Preserve a source-supported observation candidate 2

- **GIVEN** a session-scoped candidate
- **WHEN** a support belongs to another project/session or falls outside declared ordered coverage
- **THEN** the entire transaction fails without evidence, event, observation, receipt, relationship, watermark, or FTS side effects

#### Scenario: US1 - Preserve a source-supported observation candidate 3

- **GIVEN** a project-scoped candidate supported by evidence from multiple sessions in the same project
- **WHEN** validation succeeds
- **THEN** it preserves every support ID without fabricating one session identity or sequence range

#### Scenario: US1 - Preserve a source-supported observation candidate 4

- **GIVEN** the same stable event identity and payload
- **WHEN** the submission is replayed
- **THEN** it returns the original candidate and durable IDs; a changed payload under that identity fails closed

#### Scenario: US2 - Review and explicitly promote a candidate 1

- **GIVEN** a pending candidate
- **WHEN** a verified root reviewer accepts it using a canonical policy basis appropriate to the claim
- **THEN** an immutable review event records reviewer actor/authority, reason, policy identifier/version, and source support without mutating candidate content

#### Scenario: US2 - Review and explicitly promote a candidate 2

- **GIVEN** a pending candidate
- **WHEN** it is rejected
- **THEN** the rejection remains inspectable and the candidate can never be promoted by similarity, confidence, lifecycle, replay, or a later conflicting verdict

#### Scenario: US2 - Review and explicitly promote a candidate 3

- **GIVEN** an accepted candidate
- **WHEN** explicit promotion succeeds
- **THEN** candidate, review, promotion evidence, resulting memory, original supports, receipt, topic supersession, and FTS visibility commit atomically and a replay returns the same memory

#### Scenario: US2 - Review and explicitly promote a candidate 4

- **GIVEN** a pending/rejected candidate, degraded/delegated identity, unsupported policy basis, or promoted content that adds an unsupported claim
- **WHEN** promotion is attempted
- **THEN** it fails with zero durable or FTS side effects

#### Scenario: US2 - Review and explicitly promote a candidate 5

- **GIVEN** a later correction or contradiction
- **WHEN** it is recorded
- **THEN** it creates a new supported candidate and uses existing memory supersession/retraction semantics after review rather than rewriting the prior observation or verdict

#### Scenario: US4 - Upgrade and rebuild without inventing observations 1

- **GIVEN** a valid file-backed current database
- **WHEN** the observation schema upgrade starts
- **THEN** a verified recoverable backup exists before the forward transaction commits and all prior authoritative rows and memory FTS state remain intact

#### Scenario: US4 - Upgrade and rebuild without inventing observations 2

- **GIVEN** legacy observations, imported `legacy_observation` evidence, summaries, handoffs, or promoted memories
- **WHEN** migration completes
- **THEN** no candidate, support, review, policy basis, or promotion is inferred for historical data

#### Scenario: US4 - Upgrade and rebuild without inventing observations 3

- **GIVEN** canonical observation/review/promotion submission evidence
- **WHEN** projection rebuild runs
- **THEN** it deterministically recreates the same candidates, verdicts, promotion mappings, and current states or fails closed without replacing a valid projection

#### Scenario: US4 - Upgrade and rebuild without inventing observations 4

- **GIVEN** an injected backup, taxonomy, lineage, rebuild, or transaction failure
- **WHEN** startup reports the error
- **THEN** the source database remains recoverable at its prior revision with no partial observation state

### Requirement: Raw Evidence and Promoted Memory MUST Remain Distinct

Observation candidates and reviews MUST remain distinct from both raw evidence and promoted memories; no candidate may enter normal recall or become memory without a verified terminal acceptance and explicit promotion.

#### Scenario: US1 - Preserve a source-supported observation candidate 1

- **GIVEN** a verified project or root session and one or more eligible source-evidence IDs
- **WHEN** `mem_save` receives a valid atomic observation candidate
- **THEN** it records a canonical immutable submission, generator identity, scope, supports, advisory file/concept facets, proposed memory interpretation, and one pending derived record before reporting success

#### Scenario: US1 - Preserve a source-supported observation candidate 2

- **GIVEN** a session-scoped candidate
- **WHEN** a support belongs to another project/session or falls outside declared ordered coverage
- **THEN** the entire transaction fails without evidence, event, observation, receipt, relationship, watermark, or FTS side effects

#### Scenario: US1 - Preserve a source-supported observation candidate 3

- **GIVEN** a project-scoped candidate supported by evidence from multiple sessions in the same project
- **WHEN** validation succeeds
- **THEN** it preserves every support ID without fabricating one session identity or sequence range

#### Scenario: US1 - Preserve a source-supported observation candidate 4

- **GIVEN** the same stable event identity and payload
- **WHEN** the submission is replayed
- **THEN** it returns the original candidate and durable IDs; a changed payload under that identity fails closed

#### Scenario: US2 - Review and explicitly promote a candidate 1

- **GIVEN** a pending candidate
- **WHEN** a verified root reviewer accepts it using a canonical policy basis appropriate to the claim
- **THEN** an immutable review event records reviewer actor/authority, reason, policy identifier/version, and source support without mutating candidate content

#### Scenario: US2 - Review and explicitly promote a candidate 2

- **GIVEN** a pending candidate
- **WHEN** it is rejected
- **THEN** the rejection remains inspectable and the candidate can never be promoted by similarity, confidence, lifecycle, replay, or a later conflicting verdict

#### Scenario: US2 - Review and explicitly promote a candidate 3

- **GIVEN** an accepted candidate
- **WHEN** explicit promotion succeeds
- **THEN** candidate, review, promotion evidence, resulting memory, original supports, receipt, topic supersession, and FTS visibility commit atomically and a replay returns the same memory

#### Scenario: US2 - Review and explicitly promote a candidate 4

- **GIVEN** a pending/rejected candidate, degraded/delegated identity, unsupported policy basis, or promoted content that adds an unsupported claim
- **WHEN** promotion is attempted
- **THEN** it fails with zero durable or FTS side effects

#### Scenario: US2 - Review and explicitly promote a candidate 5

- **GIVEN** a later correction or contradiction
- **WHEN** it is recorded
- **THEN** it creates a new supported candidate and uses existing memory supersession/retraction semantics after review rather than rewriting the prior observation or verdict

### Requirement: Memory Records MUST Preserve Provenance and Temporal State

A memory promoted from an observation MUST preserve provenance to the accepted candidate, immutable review/promotion evidence, original supporting evidence, outcome, validity, and existing topic supersession/retraction lineage.

#### Scenario: US2 - Review and explicitly promote a candidate 1

- **GIVEN** a pending candidate
- **WHEN** a verified root reviewer accepts it using a canonical policy basis appropriate to the claim
- **THEN** an immutable review event records reviewer actor/authority, reason, policy identifier/version, and source support without mutating candidate content

#### Scenario: US2 - Review and explicitly promote a candidate 2

- **GIVEN** a pending candidate
- **WHEN** it is rejected
- **THEN** the rejection remains inspectable and the candidate can never be promoted by similarity, confidence, lifecycle, replay, or a later conflicting verdict

#### Scenario: US2 - Review and explicitly promote a candidate 3

- **GIVEN** an accepted candidate
- **WHEN** explicit promotion succeeds
- **THEN** candidate, review, promotion evidence, resulting memory, original supports, receipt, topic supersession, and FTS visibility commit atomically and a replay returns the same memory

#### Scenario: US2 - Review and explicitly promote a candidate 4

- **GIVEN** a pending/rejected candidate, degraded/delegated identity, unsupported policy basis, or promoted content that adds an unsupported claim
- **WHEN** promotion is attempted
- **THEN** it fails with zero durable or FTS side effects

#### Scenario: US2 - Review and explicitly promote a candidate 5

- **GIVEN** a later correction or contradiction
- **WHEN** it is recorded
- **THEN** it creates a new supported candidate and uses existing memory supersession/retraction semantics after review rather than rewriting the prior observation or verdict

### Requirement: SQLite Ledger MUST Enforce Canonical Taxonomies

Public, service, rebuild, and SQLite boundaries MUST enforce the same closed observation kinds, scopes, states, generator kinds, support relations, review verdicts, policy bases, actors, authorities, and promotion transitions before committing state.

#### Scenario: US1 - Preserve a source-supported observation candidate 1

- **GIVEN** a verified project or root session and one or more eligible source-evidence IDs
- **WHEN** `mem_save` receives a valid atomic observation candidate
- **THEN** it records a canonical immutable submission, generator identity, scope, supports, advisory file/concept facets, proposed memory interpretation, and one pending derived record before reporting success

#### Scenario: US1 - Preserve a source-supported observation candidate 2

- **GIVEN** a session-scoped candidate
- **WHEN** a support belongs to another project/session or falls outside declared ordered coverage
- **THEN** the entire transaction fails without evidence, event, observation, receipt, relationship, watermark, or FTS side effects

#### Scenario: US1 - Preserve a source-supported observation candidate 3

- **GIVEN** a project-scoped candidate supported by evidence from multiple sessions in the same project
- **WHEN** validation succeeds
- **THEN** it preserves every support ID without fabricating one session identity or sequence range

#### Scenario: US1 - Preserve a source-supported observation candidate 4

- **GIVEN** the same stable event identity and payload
- **WHEN** the submission is replayed
- **THEN** it returns the original candidate and durable IDs; a changed payload under that identity fails closed

#### Scenario: US2 - Review and explicitly promote a candidate 1

- **GIVEN** a pending candidate
- **WHEN** a verified root reviewer accepts it using a canonical policy basis appropriate to the claim
- **THEN** an immutable review event records reviewer actor/authority, reason, policy identifier/version, and source support without mutating candidate content

#### Scenario: US2 - Review and explicitly promote a candidate 2

- **GIVEN** a pending candidate
- **WHEN** it is rejected
- **THEN** the rejection remains inspectable and the candidate can never be promoted by similarity, confidence, lifecycle, replay, or a later conflicting verdict

#### Scenario: US2 - Review and explicitly promote a candidate 3

- **GIVEN** an accepted candidate
- **WHEN** explicit promotion succeeds
- **THEN** candidate, review, promotion evidence, resulting memory, original supports, receipt, topic supersession, and FTS visibility commit atomically and a replay returns the same memory

#### Scenario: US2 - Review and explicitly promote a candidate 4

- **GIVEN** a pending/rejected candidate, degraded/delegated identity, unsupported policy basis, or promoted content that adds an unsupported claim
- **WHEN** promotion is attempted
- **THEN** it fails with zero durable or FTS side effects

#### Scenario: US2 - Review and explicitly promote a candidate 5

- **GIVEN** a later correction or contradiction
- **WHEN** it is recorded
- **THEN** it creates a new supported candidate and uses existing memory supersession/retraction semantics after review rather than rewriting the prior observation or verdict

#### Scenario: US4 - Upgrade and rebuild without inventing observations 1

- **GIVEN** a valid file-backed current database
- **WHEN** the observation schema upgrade starts
- **THEN** a verified recoverable backup exists before the forward transaction commits and all prior authoritative rows and memory FTS state remain intact

#### Scenario: US4 - Upgrade and rebuild without inventing observations 2

- **GIVEN** legacy observations, imported `legacy_observation` evidence, summaries, handoffs, or promoted memories
- **WHEN** migration completes
- **THEN** no candidate, support, review, policy basis, or promotion is inferred for historical data

#### Scenario: US4 - Upgrade and rebuild without inventing observations 3

- **GIVEN** canonical observation/review/promotion submission evidence
- **WHEN** projection rebuild runs
- **THEN** it deterministically recreates the same candidates, verdicts, promotion mappings, and current states or fails closed without replacing a valid projection

#### Scenario: US4 - Upgrade and rebuild without inventing observations 4

- **GIVEN** an injected backup, taxonomy, lineage, rebuild, or transaction failure
- **WHEN** startup reports the error
- **THEN** the source database remains recoverable at its prior revision with no partial observation state

### Requirement: Save Paths MUST Use One Explicit Identity Contract

All save, lifecycle, recall, context, project, and session paths MUST resolve canonical keys and exact aliases deterministically, prefer an alias binding over a superseded path-key row, adopt at most one deterministic existing path project for a newly resolved Git UUID, and MUST NOT perform fuzzy, basename, remote, branch, or automatic duplicate-content merging.

#### Scenario: US1 - Keep one project across moves, renames, and worktrees 1

- **GIVEN** a Git repository without a thoth-mem identity
- **WHEN** verified native identity resolves concurrently for the first time
- **THEN** exactly one fully written UUID marker is published atomically without replacement in the Git common directory and every caller returns `git:<uuid>`

#### Scenario: US1 - Keep one project across moves, renames, and worktrees 2

- **GIVEN** a repository with an existing local UUID
- **WHEN** its working directory is moved from one path or drive to another
- **THEN** the UUID-backed project key remains unchanged and the new path is recorded as an alias

#### Scenario: US1 - Keep one project across moves, renames, and worktrees 3

- **GIVEN** a repository folder renamed from `thoth-mem` to `thoth-memory`
- **WHEN** lifecycle resumes
- **THEN** the project key remains unchanged and its persisted display name changes only through the explicit rename CLI

#### Scenario: US1 - Keep one project across moves, renames, and worktrees 4

- **GIVEN** a main worktree and linked worktrees such as `thoth-mem-imp-size`
- **WHEN** any worktree runs lifecycle, save, or recall
- **THEN** all use the same canonical project while their exact paths remain separately observable aliases

#### Scenario: US1 - Keep one project across moves, renames, and worktrees 5

- **GIVEN** two independent clones of the same remote
- **WHEN** each resolves identity
- **THEN** each receives a different local UUID unless a future explicit linking operation is requested

#### Scenario: US3 - Adopt existing path projects without destructive merging 1

- **GIVEN** a file-backed revision-6 database
- **WHEN** revision 7 starts
- **THEN** a verified recoverable backup is created before project-alias schema changes commit

#### Scenario: US3 - Adopt existing path projects without destructive merging 2

- **GIVEN** an existing project whose key exactly matches the Git main-worktree path
- **WHEN** the local UUID is first resolved
- **THEN** that project is transactionally re-keyed to the UUID and its prior path plus known worktree paths become aliases

#### Scenario: US3 - Adopt existing path projects without destructive merging 3

- **GIVEN** multiple existing project rows matching worktrees of the same repository
- **WHEN** adoption runs
- **THEN** the main-worktree match wins deterministically, future exact aliases resolve to it, and the other rows remain untouched and reportable for later reconciliation

#### Scenario: US3 - Adopt existing path projects without destructive merging 4

- **GIVEN** an alias already bound to another canonical project or an injected migration/adoption failure
- **WHEN** the operation runs
- **THEN** it fails closed without partial keys, aliases, row moves, or FTS changes

### Requirement: Startup Migrations MUST Be Structured and Idempotent

Revision 7 MUST create and verify a recoverable pre-upgrade backup for file-backed databases, add closed project-alias state transactionally, preserve every authoritative/FTS row, perform no automatic project-content merge, roll back cleanly, and reopen idempotently.

#### Scenario: US3 - Adopt existing path projects without destructive merging 1

- **GIVEN** a file-backed revision-6 database
- **WHEN** revision 7 starts
- **THEN** a verified recoverable backup is created before project-alias schema changes commit

#### Scenario: US3 - Adopt existing path projects without destructive merging 2

- **GIVEN** an existing project whose key exactly matches the Git main-worktree path
- **WHEN** the local UUID is first resolved
- **THEN** that project is transactionally re-keyed to the UUID and its prior path plus known worktree paths become aliases

#### Scenario: US3 - Adopt existing path projects without destructive merging 3

- **GIVEN** multiple existing project rows matching worktrees of the same repository
- **WHEN** adoption runs
- **THEN** the main-worktree match wins deterministically, future exact aliases resolve to it, and the other rows remain untouched and reportable for later reconciliation

#### Scenario: US3 - Adopt existing path projects without destructive merging 4

- **GIVEN** an alias already bound to another canonical project or an injected migration/adoption failure
- **WHEN** the operation runs
- **THEN** it fails closed without partial keys, aliases, row moves, or FTS changes

### Requirement: Confirmed Saves and FTS Visibility MUST Commit Atomically

Candidate submission, terminal review, and explicit promotion MUST report success only after their evidence, events, receipts, lineage, state, resulting memory, topic transition, and memory FTS visibility commit atomically as applicable.

#### Scenario: US1 - Preserve a source-supported observation candidate 1

- **GIVEN** a verified project or root session and one or more eligible source-evidence IDs
- **WHEN** `mem_save` receives a valid atomic observation candidate
- **THEN** it records a canonical immutable submission, generator identity, scope, supports, advisory file/concept facets, proposed memory interpretation, and one pending derived record before reporting success

#### Scenario: US1 - Preserve a source-supported observation candidate 2

- **GIVEN** a session-scoped candidate
- **WHEN** a support belongs to another project/session or falls outside declared ordered coverage
- **THEN** the entire transaction fails without evidence, event, observation, receipt, relationship, watermark, or FTS side effects

#### Scenario: US1 - Preserve a source-supported observation candidate 3

- **GIVEN** a project-scoped candidate supported by evidence from multiple sessions in the same project
- **WHEN** validation succeeds
- **THEN** it preserves every support ID without fabricating one session identity or sequence range

#### Scenario: US1 - Preserve a source-supported observation candidate 4

- **GIVEN** the same stable event identity and payload
- **WHEN** the submission is replayed
- **THEN** it returns the original candidate and durable IDs; a changed payload under that identity fails closed

#### Scenario: US2 - Review and explicitly promote a candidate 1

- **GIVEN** a pending candidate
- **WHEN** a verified root reviewer accepts it using a canonical policy basis appropriate to the claim
- **THEN** an immutable review event records reviewer actor/authority, reason, policy identifier/version, and source support without mutating candidate content

#### Scenario: US2 - Review and explicitly promote a candidate 2

- **GIVEN** a pending candidate
- **WHEN** it is rejected
- **THEN** the rejection remains inspectable and the candidate can never be promoted by similarity, confidence, lifecycle, replay, or a later conflicting verdict

#### Scenario: US2 - Review and explicitly promote a candidate 3

- **GIVEN** an accepted candidate
- **WHEN** explicit promotion succeeds
- **THEN** candidate, review, promotion evidence, resulting memory, original supports, receipt, topic supersession, and FTS visibility commit atomically and a replay returns the same memory

#### Scenario: US2 - Review and explicitly promote a candidate 4

- **GIVEN** a pending/rejected candidate, degraded/delegated identity, unsupported policy basis, or promoted content that adds an unsupported claim
- **WHEN** promotion is attempted
- **THEN** it fails with zero durable or FTS side effects

#### Scenario: US2 - Review and explicitly promote a candidate 5

- **GIVEN** a later correction or contradiction
- **WHEN** it is recorded
- **THEN** it creates a new supported candidate and uses existing memory supersession/retraction semantics after review rather than rewriting the prior observation or verdict

### Requirement: Optional Projection Lineage MUST Be Rebuildable and Traceable

Observation candidates, supports, terminal reviews, and promotion mappings MUST be deterministically rebuildable from canonical immutable submission evidence with generator, scope, policy, predecessor, and source lineage preserved.

#### Scenario: US1 - Preserve a source-supported observation candidate 1

- **GIVEN** a verified project or root session and one or more eligible source-evidence IDs
- **WHEN** `mem_save` receives a valid atomic observation candidate
- **THEN** it records a canonical immutable submission, generator identity, scope, supports, advisory file/concept facets, proposed memory interpretation, and one pending derived record before reporting success

#### Scenario: US1 - Preserve a source-supported observation candidate 2

- **GIVEN** a session-scoped candidate
- **WHEN** a support belongs to another project/session or falls outside declared ordered coverage
- **THEN** the entire transaction fails without evidence, event, observation, receipt, relationship, watermark, or FTS side effects

#### Scenario: US1 - Preserve a source-supported observation candidate 3

- **GIVEN** a project-scoped candidate supported by evidence from multiple sessions in the same project
- **WHEN** validation succeeds
- **THEN** it preserves every support ID without fabricating one session identity or sequence range

#### Scenario: US1 - Preserve a source-supported observation candidate 4

- **GIVEN** the same stable event identity and payload
- **WHEN** the submission is replayed
- **THEN** it returns the original candidate and durable IDs; a changed payload under that identity fails closed

#### Scenario: US2 - Review and explicitly promote a candidate 1

- **GIVEN** a pending candidate
- **WHEN** a verified root reviewer accepts it using a canonical policy basis appropriate to the claim
- **THEN** an immutable review event records reviewer actor/authority, reason, policy identifier/version, and source support without mutating candidate content

#### Scenario: US2 - Review and explicitly promote a candidate 2

- **GIVEN** a pending candidate
- **WHEN** it is rejected
- **THEN** the rejection remains inspectable and the candidate can never be promoted by similarity, confidence, lifecycle, replay, or a later conflicting verdict

#### Scenario: US2 - Review and explicitly promote a candidate 3

- **GIVEN** an accepted candidate
- **WHEN** explicit promotion succeeds
- **THEN** candidate, review, promotion evidence, resulting memory, original supports, receipt, topic supersession, and FTS visibility commit atomically and a replay returns the same memory

#### Scenario: US2 - Review and explicitly promote a candidate 4

- **GIVEN** a pending/rejected candidate, degraded/delegated identity, unsupported policy basis, or promoted content that adds an unsupported claim
- **WHEN** promotion is attempted
- **THEN** it fails with zero durable or FTS side effects

#### Scenario: US2 - Review and explicitly promote a candidate 5

- **GIVEN** a later correction or contradiction
- **WHEN** it is recorded
- **THEN** it creates a new supported candidate and uses existing memory supersession/retraction semantics after review rather than rewriting the prior observation or verdict

#### Scenario: US4 - Upgrade and rebuild without inventing observations 1

- **GIVEN** a valid file-backed current database
- **WHEN** the observation schema upgrade starts
- **THEN** a verified recoverable backup exists before the forward transaction commits and all prior authoritative rows and memory FTS state remain intact

#### Scenario: US4 - Upgrade and rebuild without inventing observations 2

- **GIVEN** legacy observations, imported `legacy_observation` evidence, summaries, handoffs, or promoted memories
- **WHEN** migration completes
- **THEN** no candidate, support, review, policy basis, or promotion is inferred for historical data

#### Scenario: US4 - Upgrade and rebuild without inventing observations 3

- **GIVEN** canonical observation/review/promotion submission evidence
- **WHEN** projection rebuild runs
- **THEN** it deterministically recreates the same candidates, verdicts, promotion mappings, and current states or fails closed without replacing a valid projection

#### Scenario: US4 - Upgrade and rebuild without inventing observations 4

- **GIVEN** an injected backup, taxonomy, lineage, rebuild, or transaction failure
- **WHEN** startup reports the error
- **THEN** the source database remains recoverable at its prior revision with no partial observation state

### Requirement: Legacy Import MUST Preserve Source Data and Report Disposition

The importer and retrieval path MUST keep every eligible imported current/history memory indexed in its resolved project, guarantee access by exact memory ID or topic key, return textual matches when protected older cohorts leave caller capacity, preserve exact-dedup provenance without duplicate indexing, and retain temporal status and lineage behavior.

#### Scenario: US2 - Keep imported history genuinely retrievable 1

- **GIVEN** imported current memories whose queries have fewer pre-existing matches than the caller limit
- **WHEN** normal recall runs
- **THEN** deterministic imported results fill the remaining positions without displacing the established pre-existing Top-K sequence

#### Scenario: US2 - Keep imported history genuinely retrievable 2

- **GIVEN** a distinctive imported title or content phrase and fewer older-cohort matches than the caller limit
- **WHEN** recall runs
- **THEN** the corresponding imported memory fills protected capacity; exact imported ID/topic lookup remains guaranteed and retains structured precedence regardless of lexical capacity

#### Scenario: US2 - Keep imported history genuinely retrievable 3

- **GIVEN** imported superseded or historical lineage
- **WHEN** recall runs with history enabled and the selected memory is expanded
- **THEN** the expected revisions remain searchable and linked without entering current-only recall

### Requirement: Git Repositories MUST Use One Stable Local Project Identity

The system MUST publish one fully written UUID marker atomically without replacing an existing marker in the verified Git common directory, make concurrent losers reread the complete winner, ignore crash-left unpublished temporary files, use `git:<uuid>` as the opaque canonical key for every worktree, preserve it across directory moves/renames, and keep independent clones distinct by default; malformed or unavailable marker state MUST fail closed without a path fallback.

#### Scenario: US1 - Keep one project across moves, renames, and worktrees 1

- **GIVEN** a Git repository without a thoth-mem identity
- **WHEN** verified native identity resolves concurrently for the first time
- **THEN** exactly one fully written UUID marker is published atomically without replacement in the Git common directory and every caller returns `git:<uuid>`

#### Scenario: US1 - Keep one project across moves, renames, and worktrees 2

- **GIVEN** a repository with an existing local UUID
- **WHEN** its working directory is moved from one path or drive to another
- **THEN** the UUID-backed project key remains unchanged and the new path is recorded as an alias

#### Scenario: US1 - Keep one project across moves, renames, and worktrees 3

- **GIVEN** a repository folder renamed from `thoth-mem` to `thoth-memory`
- **WHEN** lifecycle resumes
- **THEN** the project key remains unchanged and its persisted display name changes only through the explicit rename CLI

#### Scenario: US1 - Keep one project across moves, renames, and worktrees 4

- **GIVEN** a main worktree and linked worktrees such as `thoth-mem-imp-size`
- **WHEN** any worktree runs lifecycle, save, or recall
- **THEN** all use the same canonical project while their exact paths remain separately observable aliases

#### Scenario: US1 - Keep one project across moves, renames, and worktrees 5

- **GIVEN** two independent clones of the same remote
- **WHEN** each resolves identity
- **THEN** each receives a different local UUID unless a future explicit linking operation is requested

### Requirement: Session Summaries MUST Be Derived Deterministically When Not Supplied

When `checkpoint_pre_compact` or `finalize` carries no submitted summary, or the previous session needed by automatic recovery has no current summary covering its latest non-summary evidence, the service MUST derive a harness-generated summary under the current harness generator identity, distinct from the identity used before these derivation rules, without any model or network call from that session's own evidence: substantive root prompts (at least 40 code points after whitespace normalization; the first and the latest distinct one, or only the first prompt when none is substantive) as objective bounded to 300 code points; promoted decision, convention, architecture, and preference memories as decision; discovery and project-structure memories as completed; failure memories as completed with outcome failed; open handoffs as next action; closed handoffs as completed; and the newest parsed host compaction claims, omitting its objective, next-action, pending, and blocker claims when a later evidence event of the session is a substantive root prompt or supports a memory-derived claim; each memory-derived claim MUST state the memory title with its primary labeled line (Result for direct memories, First pending action for open handoffs, the closing Result for closed handoffs, otherwise the first line) bounded to 300 code points, claims with identical kind and content MUST collapse into one claim citing their combined supports within the support limit, every claim MUST cite in-session evidence inside its coverage and respect the existing claim and size limits, a session without citable evidence MUST receive no summary, and a lazily derived summary MUST be final only when the session has ended and checkpoint otherwise.

#### Scenario: Session Summaries MUST Be Derived Deterministically When Not Supplied

- **GIVEN** an ended Pi session whose compaction listed a goal, a next step, a pending checklist, decisions, and modified files, followed by a substantive root prompt and a newly saved open handoff
- **WHEN** its final summary is derived
- **THEN** it keeps the compaction's decision, completed, and changed-surface claims, takes its objectives only from root prompts and its next action only from the open handoff, and contains no compaction pending claim

### Requirement: Schema Migration MUST Remove Empty Host Sessions

The schema migration that introduces lazy session creation MUST, after the standard pre-migration backup, delete every session of a non-import harness that no session event, evidence, summary, memory, observation, receipt citing evidence or summary, or other row references, together with that root session's lifecycle receipts that cite no evidence or summary, and MUST keep import-harness sessions and every referenced session unchanged; it MUST select candidates in set-based passes and delete them without scanning any referencing table once per session, and MUST verify foreign-key validity before recording the revision.

#### Scenario: Schema Migration MUST Remove Empty Host Sessions

- **GIVEN** a revision-10 database with about 8,000 sessions, 25,000 evidence rows, and 30,000 legacy import rows, including an empty Pi session with only enroll, recover, and finalize receipts, an empty import session, and a Codex session with one root prompt
- **WHEN** the migration runs
- **THEN** only the unreferenced non-import sessions and their lifecycle-only receipts are removed, its query plan contains no per-session scan of a referencing table, it completes within the test bound, a backup exists, and rerunning it changes nothing

### Requirement: Concurrent Schema Migrations MUST Be Safe Across Processes

When several processes open the same database while a migration is pending, each pre-migration backup MUST be written to a process-unique temporary file and published only if no backup exists yet, a process that loses publication MUST verify the existing backup without deleting or overwriting another process's file, a process that acquires the migration lock after another process applied that revision MUST treat it as complete, and exactly one process MUST apply each revision; `migrateCurrentSchema` MUST report the starting and resulting revisions, the backups created or verified, and the sessions and receipts removed.

#### Scenario: Concurrent Schema Migrations MUST Be Safe Across Processes

- **GIVEN** two processes opening the same revision-10 database at the same time
- **WHEN** both run startup migrations
- **THEN** exactly one applies revision 11, the published backup is intact and verified, neither deletes the other's temporary file, and the other either opens the revision-11 database or fails with a bounded busy error without partial changes

### Requirement: Session Activity MUST Reopen an Ended Session

Appending any non-summary session evidence to a session in state `ended` MUST, in the same transaction, set its state to `active` and clear its end time; summary-submission evidence and lifecycle operations that write no evidence MUST NOT reopen a session; a reopened session MUST receive checkpoint lazy summaries until it is finalized again, and a later finalize MUST end it and supersede its earlier final summary.

#### Scenario: Session Activity MUST Reopen an Ended Session

- **GIVEN** an ended Codex session with a final summary
- **WHEN** a new root prompt is captured and the session is later finalized again
- **THEN** the session is active between the two events, any lazy summary in between is a checkpoint, and the second finalize ends it with a new current final summary
