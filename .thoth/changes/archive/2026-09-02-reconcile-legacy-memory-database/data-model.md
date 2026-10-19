# Data Model: Legacy Reconciliation Audit

## Revision 8 additions

Revision 8 adds import audit state only. Existing projects, aliases, sessions, evidence, events, summaries, observations, reviews, promotions, memories, FTS rows, projections, receipts, and watermarks remain byte/logically unchanged by the migration itself.

### `legacy_imports`

One committed reconciliation identity.

| Column | Contract |
| --- | --- |
| `id` | Stable UUID derived from canonical `plan_hash`. Primary key. |
| `source_fingerprint` | SHA-256 canonical logical source fingerprint. |
| `source_file_fingerprint` | Canonical JSON/hash of source main/WAL file observations. |
| `target_base_fingerprint` | Canonical logical fingerprint of the target snapshot before import, or the closed absent-target marker. |
| `plan_hash` | Unique SHA-256 of the canonical plan excluding its self-hash. |
| `mapping_hash` | SHA-256 of sorted canonical project mappings. |
| `policy_hash` | SHA-256 of schema/type/privacy/temporal policy versions. |
| `source_schema` | Closed legacy source schema identifier. |
| `status` | `committed` only; in-progress state exists only in the disposable candidate/filesystem. |
| `created_at` | Apply/import boundary timestamp bound into the report. |

Uniqueness prevents a second committed mapping for the same source fingerprint without a separately designed reconciliation operation. Replaying the same plan resolves the existing row and verifies every child receipt.

### `legacy_project_mappings`

One disposition per distinct normalized legacy project value referenced by authoritative rows.

| Column | Contract |
| --- | --- |
| `import_id` | Parent `legacy_imports.id`. |
| `source_project_hash` | SHA-256 of the normalized source project value. |
| `source_project` | Exact normalized legacy value required for durable audit; never emitted in bounded errors. |
| `disposition` | `mapped`, `isolated`, or `quarantined`. |
| `basis` | `explicit`, `exact_identity`, `exact_path_alias`, `isolated_legacy`, or a closed quarantine reason. |
| `project_id` | Resolved current/isolated project ID, null only for quarantine. |

Primary key: `(import_id, source_project_hash)`. The exact value must hash to the declared hash and one destination project must match the approved plan.

### `legacy_import_rows`

One receipt per logical authoritative source entity, including each observation revision.

| Column | Contract |
| --- | --- |
| `import_id` | Parent reconciliation. |
| `source_entity` | `session`, `prompt`, `session_summary`, `observation_version`, or `observation`. |
| `source_key` | Stable text primary key from the legacy row. |
| `source_version` | Positive observation revision number; `0` for non-versioned entities. |
| `source_hash` | SHA-256 of the canonical supported source fields before privacy filtering. |
| `transformed_hash` | SHA-256 after declared normalization/filtering, null for skipped/quarantined rows. |
| `disposition` | `imported`, `linked`, `skipped`, or `quarantined`. |
| `reason` | Closed reason code, including `deleted`, `placeholder_identity`, `ambiguous_identity`, `project_conflict`, `privacy_malformed`, `empty_after_filter`, `unsupported_kind`, or `exact_existing`. |
| `project_id` | Resolved destination project when applicable. |
| `session_id` | Destination import session when applicable. |
| `evidence_id` | Inserted legacy evidence when applicable. |
| `memory_id` | Inserted or exactly linked memory when applicable. |
| `captured_at` | Preserved effective source timestamp. |

Primary key: `(import_id, source_entity, source_key, source_version)`. Foreign keys point to existing destination rows with restrictive deletion. Candidate verification proves that every planned authoritative logical entity has exactly one receipt and that every imported/linked ID exists in the same resolved project.

## Stable identities

- Import: `stableUuid("legacy-import:" + planHash)`.
- Isolated project: canonical key `legacy:<normalized-source-project>` and the existing stable project UUID derivation. Placeholder values never create projects.
- Session: existing stable session derivation over resolved project, harness `import`, and legacy root session key.
- Evidence: `stableUuid("legacy-evidence:" + sourceFingerprint + ":" + entity + ":" + key + ":" + version + ":" + projectId)`.
- Memory: the corresponding `legacy-memory:` namespace. Exact existing matches reuse the current memory ID and add only a provenance relation/receipt.

IDs include the source fingerprint so two independent legacy databases with overlapping integer IDs cannot collide. The target project participates so a plan cannot replay a row under another project without producing a different expected ID and failing the committed-source uniqueness rule.

## Temporal reconciliation

1. Build each legacy observation's revision sequence from version `1..revision_count-1` plus the current head at `revision_count`.
2. Preserve version `created_at`; use head `updated_at` when revisioned and `created_at` otherwise.
3. For each resolved `(project, topic_key)` with no pre-existing current target memory, link imported memories oldest→newest and leave only the newest imported head current.
4. If a pre-existing current target memory exists, do not change it. Link legacy versions only among themselves and close the imported head at the import boundary.
5. For `topic_key IS NULL`, prior versions of one source observation still form a local chain, but independent observations do not supersede each other.
6. Exact-match linking never changes the matched memory's status, validity interval, or supersession pointers.

## Candidate invariants

- Revision is current and one committed `legacy_imports` row matches the plan.
- Every project mapping and authoritative logical source entity has one closed receipt.
- Imported evidence is immutable, has preserved timestamp/source reference, and belongs to the receipt project/session.
- Every imported/linked memory has at least one evidence relationship; imported revision chains are non-branching and acyclic.
- Existing target row IDs and payload hashes match the target-base manifest.
- `count(memories) = count(memory_fts)` and exact FTS IDs match memory IDs.
- `integrity_check = ok` and `foreign_key_check` is empty before and after publication.
