# Data Model: Stable Import Recall Cohorts

## Revision boundary

Schema revision 9 adds one authoritative import-audit table and does not rewrite `memories`, `memory_fts`, or existing revision-8 receipts.

## Entity: `legacy_import_cohorts`

| Field | Contract |
| --- | --- |
| `import_id` | Text primary key and foreign key to one committed `legacy_imports.id`. |
| `cohort_sequence` | Positive integer, globally unique, allocated monotonically as the transactional maximum plus one. |

The table has immutable update/delete triggers. Every `legacy_imports` row has exactly one cohort row, sequences are the gap-free set `1..count(legacy_imports)`, and no cohort exists without its committed import.

## Migration from revision 8

1. Create and verify a recoverable pre-revision backup using the existing migration boundary.
2. Create `legacy_import_cohorts` and its immutability triggers.
3. Insert existing committed imports in deterministic `(created_at,id)` order with sequences `1..N`.
4. Verify one-to-one, positive, unique, gap-free coverage plus unchanged authoritative and FTS counts/content.
5. Commit revision 9 atomically; reopen is idempotent.

The migration order is a deterministic bootstrap for databases that already contain multiple revision-8 imports. After revision 9, supplied timestamps never participate in cohort order.

## New import transition

Inside the candidate import transaction:

1. Detect exact replay before allocating state.
2. Insert the committed `legacy_imports` header.
3. Allocate `cohort_sequence = coalesce(max(cohort_sequence),0)+1` and insert its one-to-one cohort row.
4. Insert mappings, authoritative rows, and immutable row receipts.
5. Verify complete cohort and receipt invariants before candidate publication.

A rolled-back import consumes no sequence. Exact replay returns the existing import/cohort and produces zero delta.

## Derived memory cohort

- Cohort `0`: a memory with no `legacy_import_rows` receipt having `disposition='imported'`; exact-linked legacy evidence does not change it.
- Cohort `N > 0`: the minimum `cohort_sequence` among imported receipts that materialized that memory.

The minimum rule handles later exact-link receipts and protects the first materialization order. Quarantined, skipped, evidence-only, or linked-only rows cannot create memory cohort membership.

## Retrieval invariants

- `memory_fts` remains one-to-one with authoritative memories under the existing schema contract.
- Eligibility still comes from FTS `MATCH`, project, status, history, exact ID/topic, and caller bounds.
- Cohort precedence is ascending numeric order; corpus-independent score, creation time, and ID break ties only inside a cohort.
- A later cohort cannot displace or reorder an earlier cohort's complete Top-K list.
- Exact ID/topic lookup bypasses lexical cohort capacity and remains first.
