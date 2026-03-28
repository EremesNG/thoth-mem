# Delta for Config

## ADDED Requirements
### Requirement: Runtime Version Source MUST Be Unified
The system MUST treat `package.json` version metadata as the single source of truth for runtime-facing version reporting.

#### Scenario: Version is resolved from package metadata
- GIVEN a valid package metadata version value
- WHEN runtime version information is requested
- THEN the reported version MUST equal the package metadata version

### Requirement: Public Version Surfaces MUST Stay Consistent
All public version surfaces (CLI, MCP server identity, and OpenAPI info) MUST report the same version value.

#### Scenario: CLI version output
- GIVEN the CLI `version` command is executed
- WHEN output is produced
- THEN the value SHALL match package metadata exactly

#### Scenario: MCP server identity version
- GIVEN MCP server initialization metadata is exposed to a client
- WHEN the server identity is read
- THEN the identity version SHALL match package metadata exactly

#### Scenario: OpenAPI info version
- GIVEN the OpenAPI document is requested
- WHEN `info.version` is emitted
- THEN the value SHALL match package metadata exactly

### Requirement: Hardcoded Runtime Version Literals MUST NOT Drift
The system SHOULD avoid independent hardcoded semantic version literals in runtime version surfaces to prevent drift between interfaces.

#### Scenario: Package version changes
- GIVEN package metadata version is updated for a release
- WHEN runtime components start without additional manual version edits
- THEN CLI, MCP, and OpenAPI version surfaces MUST remain aligned with the updated package version

## MODIFIED Requirements

## REMOVED Requirements
