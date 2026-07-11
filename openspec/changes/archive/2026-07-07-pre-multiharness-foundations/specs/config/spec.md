# Delta for Config

## ADDED Requirements
### Requirement: Project Identity Resolver v2 MUST Resolve Stable Project Identity Deterministically
The system MUST provide a shared project identity resolver v2 that derives the effective project identity in this precedence order: explicit caller input, centralized configured project default when present, current working directory workspace identity, git worktree or remote identity, package/workspace metadata when available, then a deterministic compatibility default. Explicit caller input MUST always win and MUST NOT be replaced by a derived value. Derived or compatibility identities MUST expose the selected source and any degraded reason.

#### Scenario: Explicit project identity wins
- GIVEN a caller supplies a non-empty explicit project identity
- WHEN project identity is resolved
- THEN the explicit value MUST be used as the effective project identity
- AND no configured, cwd, git, package, or compatibility value MUST replace it

#### Scenario: Configured project identity precedes workspace inference
- GIVEN no explicit project identity is supplied
- AND centralized configuration provides a project identity
- AND cwd or git metadata would produce a different project identity
- WHEN project identity is resolved
- THEN the configured project identity MUST be used
- AND the resolution metadata MUST identify configuration as the source

#### Scenario: Workspace and git inference are deterministic
- GIVEN no explicit or configured project identity is available
- AND equivalent cwd and git metadata are observed across repeated resolver calls
- WHEN project identity is resolved
- THEN the same normalized project identity MUST be returned each time
- AND the resolution metadata MUST identify the selected workspace or git source

#### Scenario: Compatibility default is visible and degraded
- GIVEN no explicit, configured, cwd, git, or package metadata can produce a stable project identity
- WHEN project identity is resolved
- THEN a deterministic compatibility default MUST be returned or preserved according to the existing storage contract
- AND degraded metadata MUST identify the missing project identity and the fallback value

### Requirement: Session Identity Normalization MUST Distinguish Explicit Stable IDs From Missing or Placeholder IDs
The identity resolver MUST normalize incoming `session_id` values enough to distinguish stable explicit IDs from missing, blank, known placeholder, and synthesized compatibility IDs. The resolver MUST preserve stable explicit IDs, MUST synthesize deterministic compatibility IDs only when required for existing storage behavior, and MUST report degraded metadata for missing, blank, placeholder, or synthesized session identities.

#### Scenario: Explicit session id is preserved
- GIVEN a caller supplies a non-empty session id that is not recognized as a compatibility placeholder
- WHEN session identity is resolved
- THEN the supplied session id MUST be used unchanged
- AND no degraded session warning MUST be emitted

#### Scenario: Blank session id is degraded
- GIVEN a caller supplies a blank session id
- WHEN session identity is resolved for a path that requires a session id
- THEN a deterministic compatibility session id MUST be synthesized
- AND degraded metadata MUST report that the submitted value was blank

#### Scenario: Placeholder session id remains query-stable
- GIVEN a caller or historical row uses a known placeholder session id such as `manual-save-*`
- WHEN identity normalization or reads run
- THEN the placeholder value MUST remain query-stable
- AND the system MUST report placeholder/degraded status where the current operation surfaces identity metadata

### Requirement: Identity Resolver v2 MUST Preserve Historical Data Without Silent Repair
Project/session identity resolver v2 MUST NOT silently rewrite historical placeholder records. Historical records containing placeholders such as `manual-save-*` or `unknown` MUST remain filterable by their stored values unless a separately specified, opt-in repair operation is introduced.

#### Scenario: Historical placeholder project is not repaired implicitly
- GIVEN existing records are stored under project `unknown`
- WHEN the resolver, Store reads, imports, sync, recall, or project views run
- THEN those records MUST NOT be reassigned to a derived project identity
- AND filters targeting `unknown` MUST continue to find those records

#### Scenario: New derived identity does not mutate old sessions
- GIVEN a database contains historical `manual-save-*` sessions
- AND resolver v2 can now derive a stable project identity from cwd or git
- WHEN a new save or session operation runs
- THEN the new operation MAY use the newly resolved identity according to precedence
- AND existing historical session ids MUST remain unchanged

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- `project_id` is specified behaviorally as the stable project identity; design may represent it as the existing `project` string plus source/degraded metadata or as an additive field if schema evidence justifies it.
- Cwd/git/package derivation order is fixed here to avoid a clarification fork: cwd/workspace identity precedes git identity, and git precedes package metadata because local workspace naming is the closest adapter-independent signal after explicit/config values.
- Git-derived identity should use normalized repository/worktree metadata and should not include credentials, tokens, or user-specific path fragments.

## Handoff Hints
- Design must keep `getConfig` as the centralized configuration source and must avoid a second data-dir bootstrap path.
- Design must define the concrete normalization rules for cwd/git/package strings and the exact degraded metadata fields shared by MCP, HTTP, CLI, import, and sync paths.
- Tests should cover explicit/config/cwd/git/default precedence, blank and placeholder session ids, deterministic repeated resolution, and no historical repair.
