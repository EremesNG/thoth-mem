# Data Model: Observation Promotion Pipeline

## Authority layers

1. `evidence` and `session_events` remain immutable authoritative capture/order.
2. Observation, review, and promotion submissions are canonical evidence payloads produced outside the core and validated inside it.
3. Candidate/review/promotion records are rebuildable derived state. They are inspectable but not normal recall truth.
4. `memories`, `memory_evidence`, validity, outcome, topic supersession/retraction, and `memory_fts` remain the only durable cross-session recall authority.

## Closed taxonomies

- Observation kind: `decision`, `constraint`, `fact`, `procedure`, `result`, `failure`, `preference`.
- Scope: `session`, `project`.
- Derived state: `pending`, `accepted`, `rejected`, `promoted`.
- Review verdict: `accepted`, `rejected`.
- Review basis: `root_user_confirmed`, `observable_validation`, `independent_review`.
- Support relation: `supports`.
- Generator kind: reuse `root_agent`, `harness`, `model`; generator identity never grants authority.
- Evidence kinds added: `observation`, `observation_review`, `observation_promotion`.

Unknown values fail in contracts, service canonicalization, SQL checks/triggers, and rebuild parsing.

## Candidate projection

`observations` represents one immutable atomic candidate:

- stable ID derived from canonical submission evidence;
- project ID and nullable root-session ID;
- unique submission evidence ID;
- optional predecessor observation ID for correction lineage;
- scope and optional inclusive source sequence coverage;
- observation kind, title, atomic claim content;
- exact proposed memory kind/title/content/topic key/outcome;
- generator kind/name/version/config hash;
- created timestamp.

The promoted memory content is copied from the proposed representation. Promotion accepts no replacement title/content/outcome. Any changed claim or proposed interpretation creates a new predecessor-linked candidate.

Correction lineage is a non-branching chain. A candidate has at most one direct predecessor and at most one direct successor; the predecessor must belong to the same project, must predate the successor, and cycles fail closed. A `current` candidate is the unique leaf with no successor. A `history` candidate has a successor and is therefore no longer the current interpretation. An omitted queue temporal filter defaults to `current`; `current` and `history` are disjoint.

## Facets and supports

`observation_facets` stores ordered, sanitized `concept` or `file` strings with bounded count/length. Facets are advisory filters only.

`observation_supports` links every candidate to one or more original evidence IDs:

- every support belongs to the same project;
- session-scoped candidates require the same session and declared coverage when present;
- project-scoped candidates may span sessions but store no fabricated session/coverage;
- candidate submission evidence cannot support its own claim;
- raw support content is fetched only through an explicit evidence path, never queue/get/recall output.

## Terminal reviews

`observation_reviews` stores at most one terminal verdict per candidate:

- stable review ID and unique canonical review evidence ID;
- reviewer session, actor, authority, verdict, basis, policy ID/version, bounded reason, timestamp;
- review support IDs proving confirmation/validation/review basis;
- immutable content and no verdict overwrite.

Accepted policy matrix:

- `decision`, `constraint`, `preference`: only `root_user_confirmed`.
- `fact`, `procedure`, `result`, `failure`: `root_user_confirmed`, `observable_validation`, or `independent_review`.
- Acceptance and rejection use the same kind/basis admissibility. Rejection additionally requires a non-empty bounded reason; it does not waive identity or support checks.

Every review call resolves the supplied `root_session_key` + `harness` through the existing non-import root/session identity path in the candidate's project. The service writes the review event as actor `agent`, authority `root_user`, bound to that resolved session; neither field is caller input. Missing, partial, import, project-mismatched, or degraded identity fails before sequence allocation.

The required review-support matrix is exact:

| Basis | Allowed candidate kinds | Required support evidence | Event/identity rule | Payload rule |
| --- | --- | --- | --- | --- |
| `root_user_confirmed` | all kinds | at least one `root_prompt` | same project and same resolved reviewer session; actor `user`, authority `root_user` | the support content is the attributable confirmation; no caller-supplied authority metadata is read |
| `observable_validation` | `fact`, `procedure`, `result`, `failure` | at least one `explicit_save` | same project and same resolved reviewer session; actor `agent`, authority `root_user` | metadata contains exactly one bounded `observation_validation` object with this `observation_id`, `result=passed` for acceptance or `result=failed` for rejection, and non-empty `method` |
| `independent_review` | `fact`, `procedure`, `result`, `failure` | at least one `handoff` | same project; actor `agent`, authority `harness`; source session is non-import and differs from the resolved reviewer session | metadata contains exactly one bounded `observation_review_attestation` object with this `observation_id`, the same `verdict`, and non-empty `reviewer` and `method` |

All review supports must exist before the review evidence, may not be the candidate submission or review evidence, and are deduplicated before validation. A support with the wrong kind, project, session, actor, authority, observation ID, verdict/result, metadata shape, or timestamp fails closed. These rules establish attributable local policy evidence; they do not claim semantic truth.

The MCP direct-save evidence union is the only public producer for the two structured support payloads. A validation receipt is `explicit_save` evidence with exact `metadata.observation_validation`; an independent attestation is `handoff` evidence with exact `metadata.observation_review_attestation`. Both require a verified non-import session, stable event key, an already-existing same-project observation, bounded privacy-filtered values, and no simultaneous memory. Canonicalization stores the structured object in evidence metadata and replay hashing; arbitrary public evidence metadata remains forbidden. Support creation does not change observation state.

Confidence and lexical similarity are not transition inputs.

## Promotions

`observation_promotions` is a one-to-one mapping:

- observation ID primary key;
- unique promotion evidence ID;
- unique resulting memory ID;
- timestamp.

Promotion preconditions:

- candidate exists and terminal verdict is accepted;
- no existing promotion mapping;
- caller has verified root identity in the project;
- policy/review support remains valid;
- exact proposed memory passes current memory taxonomy/topic/supersession rules.

One transaction creates promotion evidence/session event/receipt, memory, links from memory to promotion/review/original support evidence, topic transition, change watermark, FTS row, and promotion mapping. Replays return the original IDs; payload drift or partial prior state fails closed.

## Operation receipts

Observation operations use a dedicated receipt keyed by project, operation, and stable event key. It stores payload hash plus operation evidence/candidate/review/memory IDs. Duplicate checks run before sequence allocation or state transition.

Direct `mem_save` receipts remain unchanged and continue owning direct evidence-plus-memory idempotency.

## Derived state

State is computed, not independently authoritative:

```text
candidate only                         -> pending
candidate + accepted review            -> accepted
candidate + rejected review            -> rejected
candidate + accepted review + mapping  -> promoted
```

Impossible combinations fail schema/service/rebuild validation. A rejected candidate never receives a mapping. A promoted candidate cannot receive a second verdict or mapping.

Observation queue order is total and stable: derived-state priority `pending`, `accepted`, `rejected`, `promoted`; then `created_at` ascending (oldest first); then observation ID ascending. State, temporal, and exact-session filters are applied before `limit` and `budget_chars`.

## Canonical submission evidence and rebuild

Each operation stores privacy-filtered canonical JSON with exact keys, sorted object keys where applicable, preserved list order, bounded values, schema discriminator, generator/policy metadata, and referenced IDs. Rebuild:

1. parses candidate evidence in deterministic project/session-event/captured-time/ID order;
2. validates and materializes candidates/facets/supports;
3. parses terminal reviews and validates identity/policy/supports;
4. parses promotions and reconciles their referenced current/historical memory rows;
5. verifies counts, FKs, impossible states, and mappings before swapping the rebuilt projection.

Rebuild never creates memories or changes FTS. It reconstructs observation mappings against already committed authoritative evidence/memory rows. Malformed or missing lineage fails closed and leaves the prior valid projection intact.

## Migration

- Advance current revision 5 to the next revision through `migrateCurrentSchema`.
- Create and verify a deterministic pre-upgrade file backup before the schema transaction.
- Add taxonomy values, projection/receipt structures, indexes, and triggers.
- Leave every new structure empty; do not reinterpret legacy observations, `legacy_observation`, existing evidence, summaries, memories, or handoffs.
- Verify prior table counts, foreign keys, memory FTS contents/integrity, and schema revision before commit/reopen.
- An injected failure preserves the prior database and recoverable backup; no down-migration is added.

## Indexing and budgets

- No observation table or facet participates in `memory_fts`.
- Bounded queue defaults and maxima are declared in contracts and enforced before SQL output rendering.
- `mem_get` returns support IDs but not support contents.
- Any optional explicit-review related-memory lookup uses current memory FTS, a bounded limit, and failure-isolated diagnostics; it cannot change state.
- The outcome fixture compares identical final memory corpora and requires normal-recall p95 and aggregate SQLite bytes no greater than twice control.
