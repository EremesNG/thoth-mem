# Import Report Contract

`thoth-mem.import.report.v3` is written create-only after publication succeeds, or as a bounded failed report when the caller supplied an absent report path and apply reached a reportable failure. It contains no imported prose.

Required successful fields:

- `schema`, `version`, `importId`, `planHash`, `committed`, `startedAt`, `finishedAt`;
- source, target-base, backup, candidate, and published fingerprints;
- exact project and per-entity disposition counts with bounded reason aggregates;
- stable counts/IDs for import/project/row receipts without dumping all row receipts;
- integrity results for schema revision, baseline preservation, receipt closure, temporal lineage, provenance, foreign keys, SQLite integrity, memory/FTS equality, source unchanged, and target-base unchanged;
- recovery bundle path/fingerprint and candidate cleanup state.

Failure fields use a closed code such as `SOURCE_CHANGED`, `TARGET_CHANGED`, `PLAN_INVALID`, `PLAN_STALE`, `MAPPING_INVALID`, `TARGET_LOCKED`, `BACKUP_FAILED`, `IMPORT_FAILED`, `RECONCILIATION_FAILED`, `INTEGRITY_FAILED`, or `PUBLICATION_FAILED`, plus a bounded sanitized message. A failed report must never claim `committed=true`; if publication began, it must state whether the prior target was restored and name the verified recovery artifact.

An idempotent replay returns the original import ID and logical fingerprints with `duplicate=true`, zero row deltas, and verification of the existing durable receipts.
