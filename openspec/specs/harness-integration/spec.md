# Harness Integration

## Requirements

### Requirement: Every Native Plugin MUST Bundle Hooks, MCP, and Skills

Each host bundle MUST continue to package its supported hooks, one registration path for the shared six-tool MCP server, and the same memory Skill, with no transitional product-generation wording or stale copied contract.

#### Scenario: US2 - Treat the replacement architecture as the normal product base 1

- **GIVEN** a clean installation
- **WHEN** the MCP and native lifecycle paths execute
- **THEN** their public envelopes and commands use the current unversioned thoth-mem contract and persist to `memory.sqlite`

#### Scenario: US2 - Treat the replacement architecture as the normal product base 2

- **GIVEN** an invocation using a removed transitional command or namespace
- **WHEN** it reaches the current package
- **THEN** it fails explicitly instead of entering a compatibility shim

#### Scenario: US2 - Treat the replacement architecture as the normal product base 3

- **GIVEN** a legacy database selected for import
- **WHEN** the operator runs the current importer
- **THEN** `import-legacy` writes a distinct current database and preserves the source without describing the target as a replacement generation

### Requirement: Runtime Lifecycle MUST Preserve the Core Contract

OpenCode, Codex, and Claude lifecycle adapters MUST normalize only fields their supported native contracts actually provide, MUST accept Claude Code `UserPromptSubmit` without `event_id`, MUST preserve OpenCode's native per-message identity, and MUST apply shared privacy sanitation before content-derived identity.

#### Scenario: US1 - Capture messages submitted during an active agent turn 1

- **GIVEN** two Codex `UserPromptSubmit` payloads with the same `turn_id` and different prompts
- **WHEN** both are normalized and captured
- **THEN** they receive different stable event keys, neither lifecycle call throws, and each produces one ordered root-prompt evidence event

#### Scenario: US1 - Capture messages submitted during an active agent turn 2

- **GIVEN** an official Claude Code `UserPromptSubmit` payload without a synthetic `event_id`
- **WHEN** it is normalized
- **THEN** capture succeeds using only documented native fields and a different sanitized prompt receives a different stable event key

#### Scenario: US1 - Capture messages submitted during an active agent turn 3

- **GIVEN** two OpenCode root-user messages admitted during the same active cycle
- **WHEN** the native plugin captures them
- **THEN** each uses its immutable native message ID and neither is collapsed into the other

#### Scenario: US1 - Capture messages submitted during an active agent turn 4

- **GIVEN** the same sanitized native prompt payload is retried
- **WHEN** lifecycle receives it again
- **THEN** it resolves to the same event key and returns the original receipt as a duplicate without appending evidence

### Requirement: Root Session Identity MUST Be Verified and Host-Specific Only at the Adapter

Native adapters MUST resolve the Git common-directory UUID or explicit non-Git path identity, pass an initial display-name hint for creation, and preserve the exact canonical key with root session identity; the database-persisted display name becomes authoritative after adoption, while delegated, ambiguous, incomplete, or child-key-mismatched identity MUST NOT receive root authority.

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

#### Scenario: US2 - Propagate exact identity through every native and MCP boundary 1

- **GIVEN** a verified Git project and root session
- **WHEN** native recovery renders
- **THEN** it exposes `root_session_id`, `project_key=git:<uuid>`, and the database-persisted `project_name` as separate bounded values

#### Scenario: US2 - Propagate exact identity through every native and MCP boundary 2

- **GIVEN** the OpenCode read-only identity helper before lifecycle adoption
- **WHEN** it verifies a root caller
- **THEN** its versioned result returns the exact UUID-backed key plus a non-authoritative `project_name_hint`; after lifecycle, the persisted name in the verified recovery block prevails

#### Scenario: US2 - Propagate exact identity through every native and MCP boundary 3

- **GIVEN** a save, recall, context, project, or session MCP call
- **WHEN** the agent maps verified identity
- **THEN** it copies the key verbatim, treats `project_name` as creation/display metadata only, and never substitutes the display name, current path, Git remote, branch, worktree name, host project ID, or recalled content for the key

#### Scenario: US2 - Propagate exact identity through every native and MCP boundary 4

- **GIVEN** a lifecycle child response with a changed/missing key or a name that is unsafe or inconsistent with its recovery header
- **WHEN** the host validates it
- **THEN** no unverified memory context is injected and the host continues with bounded degradation

### Requirement: Automatic Capture MUST Remain Privacy-Safe and Minimal

Native adapters MUST continue their root allowlists and privacy filtering and MUST NOT automatically convert arbitrary prompts, assistant text, tool output, delegated output, summaries, or lifecycle content into observation candidates or memories.

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

#### Scenario: US3 - Inspect candidates without contaminating recall 1

- **GIVEN** pending, accepted, rejected, and promoted observations
- **WHEN** `mem_project` requests observations with project/session/status bounds
- **THEN** it returns a deterministic capped queue with stable IDs, compact metadata, and no raw support payloads

#### Scenario: US3 - Inspect candidates without contaminating recall 2

- **GIVEN** one selected observation ID
- **WHEN** `mem_get` expands it
- **THEN** it returns only that candidate, generator, scope, supports, immutable review lineage, promotion mapping, and related temporal memory IDs

#### Scenario: US3 - Inspect candidates without contaminating recall 3

- **GIVEN** any unpromoted observation
- **WHEN** compact recall, context, briefing, or native recovery runs
- **THEN** the observation is absent and existing memory/summary ordering, payload budget, trust boundary, and FTS rows remain unchanged

#### Scenario: US3 - Inspect candidates without contaminating recall 4

- **GIVEN** candidate similarity or related-memory surfacing during explicit review
- **WHEN** lexical scoring runs
- **THEN** the bounded scores are advisory diagnostics only and cannot accept, reject, supersede, or promote any record

### Requirement: Model-Visible Recovery Context MUST Be Bounded and Source-Attributed

Model-visible verified identity MUST carry the exact canonical `project_key` plus the database-persisted `project_name` within the existing host cap; parent validators MUST require key equality with local dispatch and require the returned name to be safe and identical between lifecycle envelope and recovery header, but MUST NOT compare it to a pre-adoption folder-name hint.

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

#### Scenario: US2 - Propagate exact identity through every native and MCP boundary 1

- **GIVEN** a verified Git project and root session
- **WHEN** native recovery renders
- **THEN** it exposes `root_session_id`, `project_key=git:<uuid>`, and the database-persisted `project_name` as separate bounded values

#### Scenario: US2 - Propagate exact identity through every native and MCP boundary 2

- **GIVEN** the OpenCode read-only identity helper before lifecycle adoption
- **WHEN** it verifies a root caller
- **THEN** its versioned result returns the exact UUID-backed key plus a non-authoritative `project_name_hint`; after lifecycle, the persisted name in the verified recovery block prevails

#### Scenario: US2 - Propagate exact identity through every native and MCP boundary 3

- **GIVEN** a save, recall, context, project, or session MCP call
- **WHEN** the agent maps verified identity
- **THEN** it copies the key verbatim, treats `project_name` as creation/display metadata only, and never substitutes the display name, current path, Git remote, branch, worktree name, host project ID, or recalled content for the key

#### Scenario: US2 - Propagate exact identity through every native and MCP boundary 4

- **GIVEN** a lifecycle child response with a changed/missing key or a name that is unsafe or inconsistent with its recovery header
- **WHEN** the host validates it
- **THEN** no unverified memory context is injected and the host continues with bounded degradation

### Requirement: Lifecycle Events MUST Be Idempotent and Truthful

Stable capture keys MUST identify distinct sanitized root-user submissions rather than only their enclosing turn. A native immutable message ID MUST be used when available; otherwise a deterministic key MUST include the documented stable session/turn fields and the sanitized prompt fingerprint. Different sanitized prompts in one active turn MUST NOT reuse a lifecycle key, and an exact retry MUST remain idempotent.

#### Scenario: US1 - Capture messages submitted during an active agent turn 1

- **GIVEN** two Codex `UserPromptSubmit` payloads with the same `turn_id` and different prompts
- **WHEN** both are normalized and captured
- **THEN** they receive different stable event keys, neither lifecycle call throws, and each produces one ordered root-prompt evidence event

#### Scenario: US1 - Capture messages submitted during an active agent turn 2

- **GIVEN** an official Claude Code `UserPromptSubmit` payload without a synthetic `event_id`
- **WHEN** it is normalized
- **THEN** capture succeeds using only documented native fields and a different sanitized prompt receives a different stable event key

#### Scenario: US1 - Capture messages submitted during an active agent turn 3

- **GIVEN** two OpenCode root-user messages admitted during the same active cycle
- **WHEN** the native plugin captures them
- **THEN** each uses its immutable native message ID and neither is collapsed into the other

#### Scenario: US1 - Capture messages submitted during an active agent turn 4

- **GIVEN** the same sanitized native prompt payload is retried
- **WHEN** lifecycle receives it again
- **THEN** it resolves to the same event key and returns the original receipt as a duplicate without appending evidence

### Requirement: Native Failures MUST Degrade Without Blocking the Host Prompt

Child launch, timeout, nonzero exit, oversized output, invalid envelope, or unverifiable identity MUST produce bounded safe diagnostics, inject no unverified memory, and MUST NOT reject an otherwise valid host prompt.

#### Scenario: OpenCode Node lifecycle child fails

- **GIVEN** the Bun adapter cannot obtain a valid Node lifecycle envelope
- **WHEN** the host hook completes
- **THEN** the user prompt continues with no recovery block and one bounded diagnostic

### Requirement: Shared Skills MUST Preserve Semantic-Boundary Memory Practice

The shared Skill MUST front-load recall, save, and handoff applicability in its discovery description; MUST provide a concise default cadence for pre-action recall, durable in-task saves, and pre-final continuation handoffs; and MUST preserve verified identity, privacy, confirmation, root ownership, noise exclusion, and exact-key requirements. The canonical shared Skill and every supported host/plugin copy MUST also add concise routing for chronological exploration using `mem_project action=timeline` followed by selective `mem_get` without displacing those practices.

#### Scenario: US3 - Teach every packaged agent to use the timeline 1

- **GIVEN** the canonical `thoth-mem` Skill
- **WHEN** an agent needs chronological project context rather than relevance-ranked recall
- **THEN** the guidance directs it to bounded `mem_project action=timeline` exploration and subsequent `mem_get` expansion of selected IDs

#### Scenario: US3 - Teach every packaged agent to use the timeline 2

- **GIVEN** the OpenCode, Codex, and Claude Code plugin bundles
- **WHEN** packaging verification compares their Skills
- **THEN** all copies contain equivalent timeline guidance and retain the established identity, privacy, save, and handoff rules

#### Scenario: US3 - Teach every packaged agent to use the timeline 3

- **GIVEN** the timeline action is added
- **WHEN** MCP and packed integration tests enumerate tools
- **THEN** the server still exposes exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`

#### Scenario: US6 - Preserve semantic-boundary memory cadence 1

- **GIVEN** prior project work may affect a task
- **WHEN** the agent selects workflows from the Skill description and common path
- **THEN** it is prompted to start with bounded compact recall and expand only selected evidence

#### Scenario: US6 - Preserve semantic-boundary memory cadence 2

- **GIVEN** a verified reusable decision, root cause, discovery, convention, or completed change
- **WHEN** the agent reaches that semantic boundary
- **THEN** the common path directs a deliberate confirmed `mem_save` without requiring the user to say “remember this”

#### Scenario: US6 - Preserve semantic-boundary memory cadence 3

- **GIVEN** meaningful work ends with continuation-critical state
- **WHEN** the agent prepares its final response
- **THEN** it saves one concise handoff with the established actionable fields if future work benefits

#### Scenario: US6 - Preserve semantic-boundary memory cadence 4

- **GIVEN** work is transient, speculative, already canonical, private, delegated, or explicitly excluded by the user
- **WHEN** the agent evaluates persistence
- **THEN** it does not create a promoted memory or invent attribution

#### Scenario: US6 - Preserve semantic-boundary memory cadence 5

- **GIVEN** a reusable claim lacks direct authority
- **WHEN** policy review is actually needed
- **THEN** the Skill loads the conditional observation-review reference and preserves candidate, review, and promotion requirements without burdening ordinary recall or direct authorized saves
