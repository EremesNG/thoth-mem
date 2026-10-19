# Import Plan Contract

`thoth-mem.import.plan.v3` is a create-only canonical JSON document. Unknown fields or enum values fail closed. Canonical hashing sorts object keys and all set-like arrays, normalizes strings to NFC where specified, and excludes only `planHash` from its own SHA-256 calculation.

Required top-level fields:

- `schema`, `version`, `planHash`, and `createdAt`;
- `source`: absolute path, supported schema, logical/file fingerprints, authoritative inventory, and ignored schema-object inventory;
- `target`: absolute path or absent marker, schema revision/logical/file fingerprints, and baseline authoritative manifest hash;
- `policy`: exact importer, project-resolution, privacy, taxonomy, temporal, and dedup policy versions plus aggregate `policyHash`;
- `projectMappings`: sorted exact source hash/value, disposition, basis, optional destination selector/resolved ID, and aggregate `mappingHash`;
- `plannedDispositions`: per-entity imported/linked/skipped/quarantined counts plus bounded reason counts;
- `integrityExpectations`: expected target revision, baseline preservation hash, receipt count, and FTS/provenance checks.

The plan contains no prompt, observation, summary, title, or memory prose. A mapping file is also closed/create-by-user input; it may name exact legacy project values and exact current selectors but may not request fuzzy matching or row-level content rewriting.

Apply accepts the plan path only. Source, target, mapping, policy, and output report cannot be overridden on the command line because every behavior-affecting value is already hash-bound.
