# Delta for Config

## ADDED Requirements
### Requirement: Data-Dir Bootstrap MUST Remain Centralized and Semantics-Preserving
Stable memory identity bootstrap MUST preserve the existing centralized data-directory resolution contract. `THOTH_DATA_DIR`, CLI data-dir input, persisted config in the resolved data dir, and built-in defaults MUST continue to resolve according to the existing `getConfig`/data-dir bootstrap semantics; this change MUST NOT introduce a second data-dir resolver or change `THOTH_DATA_DIR` meaning.

#### Scenario: THOTH_DATA_DIR semantics are preserved
- GIVEN `THOTH_DATA_DIR` is configured
- WHEN runtime configuration is resolved
- THEN the resolved data directory MUST continue to follow existing `THOTH_DATA_DIR` semantics
- AND identity-bootstrap behavior MUST NOT redirect storage to a different directory

#### Scenario: Server and CLI continue using centralized config
- GIVEN the server or CLI initializes the Store
- WHEN configuration is resolved
- THEN data-directory identity MUST come from the centralized config path
- AND no per-surface data-dir bootstrap logic MUST be introduced

### Requirement: Identity Bootstrap Defaults MUST Resolve Deterministically Without New Required Configuration
Any identity-bootstrap defaults introduced by this change MUST resolve deterministically from explicit caller input first, then centralized runtime configuration where applicable, then backward-compatible fallback behavior. The system MUST NOT require new environment variables or persisted config keys for existing callers to save, recall, import, export, or start sessions.

#### Scenario: Explicit caller identity wins
- GIVEN a caller supplies session id and project identity
- WHEN identity-bootstrap logic resolves effective identity
- THEN the explicit caller identity MUST take precedence over configured defaults and compatibility fallbacks

#### Scenario: Existing callers continue without new config
- GIVEN no new identity-bootstrap configuration is present
- WHEN existing save, session, import, export, or sync flows run
- THEN the flows MUST remain operational
- AND any missing identity MUST be handled through deterministic visible compatibility fallback rather than a configuration error

#### Scenario: Config-derived identity does not override explicit identity
- GIVEN centralized config can provide a default project or runtime identity hint
- WHEN a caller supplies an explicit project
- THEN the supplied project MUST be used for that operation
- AND the config-derived value MUST NOT overwrite it

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- Existing project/data-dir identity in `src/config.ts` is a foundation, not the broken behavior targeted by this change.
- No new mandatory config key is required; if design introduces optional identity defaults, they must follow explicit input > centralized config > compatibility fallback precedence.
- Config-derived identity is available only from existing centralized runtime/config values or additive optional defaults; absence of such a value is not an error and falls through to visible compatibility fallback behavior.
- CLI sync-dir compatibility is specified in the sync delta rather than by changing data-dir semantics here.

## Handoff Hints
- Design should verify `getConfig` remains the single data-dir bootstrap source for server and CLI.
- Any optional identity default should be additive, documented, and tested without changing `THOTH_DATA_DIR`.
- Tests should cover existing data-dir resolution plus explicit identity precedence over any config-derived default.
