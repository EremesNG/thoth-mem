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

The supported importer MUST read a declared legacy source, write a distinct current target, ignore derived legacy indexes, preserve the source byte-for-byte, and report deterministic mapping, quarantine, skip, and failure counts.

#### Scenario: Legacy identity cannot be trusted

- **GIVEN** a source row with missing or placeholder identity
- **WHEN** import cannot map it safely
- **THEN** the row is quarantined or skipped with a bounded reason and no invented verified identity

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
