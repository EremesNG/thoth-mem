# Contract: legacy database importer v2

## Command boundary

The importer is a CLI-only operation that requires explicit source and target paths. It refuses:

- identical or resolving-to-identical source/target paths;
- a writable open of the source;
- a non-empty target unless an explicit fresh-target policy allows it;
- an unknown/newer legacy schema without a supported mapping;
- a target that is not a clean v2 database.

## Processing

1. Resolve and verify absolute source/target paths.
2. Hash or otherwise record immutable source identity before import.
3. Open source read-only and validate the recognized legacy schema.
4. Create a clean target or transactional staging database.
5. Import authoritative sessions, prompts, and observations according to `data-model.md`.
6. Ignore derived/operational tables and count them by category.
7. Validate v2 foreign keys, FTS coverage, lineage, counts, and target integrity.
8. Commit/rename the target and verify source identity is unchanged.

The v2 runtime contains no legacy reads after this command exits.

## Report

The command writes a versioned JSON report containing source/target schema versions and identities, start/end timestamps, imported/skipped/quarantined/failed counts by source type, ignored-derived counts, identity disposition classes, bounded error codes, target integrity checks, and source-unchanged evidence. Raw private content is excluded.

Repeated imports into fresh targets from the same frozen source must produce the same logical records and disposition counts even if target row ordering differs.

## Rollback

Import failure leaves the source untouched and removes or clearly marks only the incomplete target/staging artifact. Product rollback means reinstalling the previous release and continuing to use the untouched legacy database; v2 never attempts a reverse migration.

