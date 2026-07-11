# Delta for Knowledge Graph

> Sub-change **B3** (`kg-supersedes-edges`) of Change B. Builds on shipped B1
> (`graph-lite-consolidation`, `kg_triples` is the single graph-fact source) and
> B2 (`kg-multi-hop-recall`). Adds deterministic supersession (current-vs-stale)
> over `kg_triples` without deleting history (constitution **P5**).
>
> **RE-SCOPED MECHANISM (supersede-on-update / diff-based).** The prior detection
> mechanism — a deterministic CROSS-OBSERVATION `topic_key`-succession scan — was
> INERT in normal usage: a `topic_key` upsert updates the existing observation IN
> PLACE (`src/store/index.ts:1504`), and the shared deterministic writer DELETEs +
> reinserts that observation's own triples by `source_id`
> (`persistKgExtraction`, `src/indexing/jobs.ts:537`), so distinct observations
> never share `(topic_key, project, scope)` except via import/sync, and the
> per-observation `triple_hash` (`observation:${obs.id}:${tripleHash}`,
> `src/indexing/jobs.ts:552`) is wiped on every re-extract. The blind delete also
> violates **P5** (supersede-not-delete) at the graph layer. B3 now detects
> supersession by DIFFING an observation's PRIOR triple set against its
> NEWLY-EXTRACTED triple set on every re-extraction.

## ADDED Requirements

### Requirement: `SUPERSEDES` MUST Be Added to the KG Relation Vocabulary
The KG relation vocabulary (`KG_RELATION_TYPES`, `src/indexing/kg-extractor.ts:11-15`)
MUST include a `SUPERSEDES` relation name that is reserved for marking a newer
fact as superseding an older fact. `SUPERSEDES` is a META-relation kept distinct
from the structural traversal allow-list: it MUST NOT be a member of the default
multi-hop relation allow-list (`DEFAULT_KG_RELATION_ALLOW_LIST`, `src/config.ts`,
the 18 structural relations) so it never acts as an ordinary bridge edge in B2
traversal. Only `SUPERSEDES` is added in B3; `CONTRADICTS` and `REPLACES` are
explicitly deferred (CL-2).

#### Scenario: SUPERSEDES is a recognized relation
- GIVEN the KG relation vocabulary is initialized
- WHEN the relation set is inspected by tests or diagnostics
- THEN `SUPERSEDES` MUST be a recognized relation type

#### Scenario: SUPERSEDES is excluded from the structural traversal allow-list
- GIVEN the default multi-hop relation allow-list is resolved
- WHEN its members are inspected
- THEN `SUPERSEDES` MUST NOT be present in the default allow-list
- AND B2 multi-hop traversal MUST NOT follow `SUPERSEDES` as a bridge edge under
  the default allow-list

### Requirement: Supersession MUST Be Detected by Diffing an Observation's Re-Extracted Facts
On every re-extraction of an observation's deterministic facts (the shared writer
`writeDeterministicKgFacts` → `persistKgExtraction`, `src/indexing/jobs.ts:483,502`,
reached synchronously via `refreshGraphFacts`, `src/store/index.ts:1119-1126`, and
by the background `extract_kg` job and `rebuild-graph`), the system MUST detect
supersession DETERMINISTICALLY, with no embedding model and no remote service
(constitution **P2**), by DIFFING the observation's PRIOR triple set (the rows
already stored for that `source_id`) against the NEWLY-EXTRACTED triple set FOR
THAT SAME observation:

- A prior triple that is ABSENT from or CHANGED in the new set (a removed or
  replaced fact) MUST be MARKED superseded (see the store delta:
  `superseded_at` is set; `superseded_by_triple_id` is set to the replacing
  triple when one exists, else left NULL) and MUST be KEPT (NOT deleted).
- A triple present in BOTH sets (unchanged) MUST be left as-is — neither
  duplicated nor marked superseded.
- A triple NEW in the new set (no prior counterpart) MUST be inserted as a
  current (non-superseded) triple.

A triple's IDENTITY for the diff is its content identity (subject + relation +
object, as captured by the per-observation `triple_hash`), scoped to that one
observation's `source_id`. A REPLACEMENT is a prior triple whose SUBJECT and
RELATION match a new triple but whose OBJECT differs. The optional LLM path
(`kgLlm`, the background `extract_kg` job) MUST NOT be required for, and MUST NOT
gate, this deterministic diff supersession (CL-4); LLM enrichment MAY only add
supersession markings later, never remove deterministic ones.

#### Scenario: Updating a topic_key observation replaces a fact
- GIVEN an observation under a `topic_key` whose stored facts include `X`
- WHEN the observation is updated/upserted and its re-extracted facts replace `X`
  with `Y` (same subject + relation, different object)
- THEN the prior triple `X` MUST be marked superseded (kept, deprioritized)
- AND its `superseded_by_triple_id` MUST point at the replacing triple `Y`
- AND `Y` MUST be present as a current (non-superseded) triple

#### Scenario: Unchanged facts are not superseded
- GIVEN an observation whose stored facts include a triple `Z`
- WHEN the observation is re-extracted and `Z` is still present in the new set
- THEN `Z` MUST NOT be marked superseded
- AND `Z` MUST NOT be duplicated

#### Scenario: First-ever extraction supersedes nothing
- GIVEN an observation with no prior stored triples
- WHEN its facts are extracted for the first time
- THEN every extracted triple MUST be inserted as current
- AND no supersession marking MUST be produced (there is no prior fact to
  supersede)

#### Scenario: A removed fact with no replacement is superseded with a null pointer
- GIVEN an observation whose stored facts include a triple `X`
- WHEN the observation is re-extracted and `X` is absent from the new set with no
  same-subject-and-relation replacement
- THEN `X` MUST be marked superseded with `superseded_at` set
- AND `superseded_by_triple_id` MUST be NULL (pure removal, no replacing triple)

#### Scenario: Detection requires no model or remote service
- GIVEN the embedding model and the optional KG LLM are both unavailable
- WHEN an observation is re-extracted with a changed fact set
- THEN the diff supersession MUST still be detected and recorded

### Requirement: Content-Pattern Supersession Hints MUST Be Gated and Lower-Confidence
The system MUST support an OPTIONAL secondary signal that augments the diff:
content-pattern hints (phrases such as "no longer", "replaced by", "deprecated",
"changed to", "superseded by") that mark a fact as superseding a matching prior
fact even when the diff alone would not. Each detected hint MUST emit a
confidence value, and a content-pattern hint MUST contribute a supersession
marking ONLY when (a) the content-pattern detection flag is enabled (see the
config delta) AND (b) the emitted confidence is at or above the configured
supersession confidence threshold. Content-pattern hints MUST be LOWER confidence
than the primary diff signal. When the content-pattern flag is disabled, ONLY the
deterministic diff signal MUST drive supersession.

#### Scenario: Above-threshold content hint contributes a supersession marking
- GIVEN content-pattern detection is enabled and the configured threshold is met
- WHEN re-extracted content contains a recognized supersession phrase that matches
  a prior fact
- THEN that prior fact MUST be marked superseded

#### Scenario: Below-threshold content hint contributes nothing
- GIVEN content-pattern detection is enabled
- WHEN a content-pattern hint's emitted confidence is below the configured
  threshold
- THEN no supersession marking MUST be produced from that hint

#### Scenario: Disabled content-pattern flag uses only the diff signal
- GIVEN content-pattern detection is disabled
- WHEN content containing a supersession phrase is re-extracted
- THEN no content-pattern supersession marking MUST be produced
- AND diff-based supersession MUST still operate

### Requirement: Supersession MUST NOT Falsely Cross Unrelated Facts
Deterministic supersession MUST be scoped so a newer fact supersedes only prior
facts that are genuinely its predecessors. The diff signal MUST operate ONLY
within a SINGLE observation's own triple set (the rows sharing that `source_id`);
re-extracting one observation MUST NOT mark another observation's triples as
superseded. A REPLACEMENT MUST require a same-subject-and-relation match within
that observation; content-pattern supersession MUST require a concrete match
against a prior fact and MUST NOT broadly supersede unrelated facts.

#### Scenario: No supersession across different observations
- GIVEN two observations each with their own stored facts
- WHEN one observation is re-extracted
- THEN facts belonging to the other observation MUST NOT be marked superseded

#### Scenario: Non-matching content does not supersede
- GIVEN content-pattern detection is enabled
- WHEN re-extracted content has no recognized supersession phrase and the diff
  shows no removed or replaced prior fact
- THEN no supersession marking MUST be produced

### Requirement: Superseded Facts MUST Be Preserved, Not Deleted
Marking a fact as superseded MUST preserve the underlying fact and its history
(constitution **P5**: supersede, don't delete). On re-extraction the writer MUST
NOT blindly delete the observation's prior triples; a superseded triple MUST
remain present in `kg_triples` and MUST remain reachable by readers that request
history; supersession MUST only annotate the prior triple (via the supersession
columns in the store delta), never remove it. Re-extracting the same observation
with the SAME content MUST converge to the same triple set and supersede NOTHING
new (idempotent, reusing B1's `triple_hash` dedup discipline) and MUST NOT
accumulate duplicate triples or duplicate supersession markings.

#### Scenario: Superseded fact remains queryable as history
- GIVEN a fact has been marked superseded by a newer fact
- WHEN history-inclusive graph reads run
- THEN the superseded fact MUST still be present and retrievable
- AND it MUST NOT have been deleted from `kg_triples`

#### Scenario: Re-extracting identical content supersedes nothing
- GIVEN an observation whose triples are already stored
- WHEN the same observation is re-extracted with byte-identical content
- THEN the stored triple set MUST be unchanged
- AND no new supersession marking MUST be produced
- AND no duplicate triple MUST accumulate

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **CL-1 (RESOLVED — OPTION B, explicit supersedes markings, deterministic):** B3
  implements explicit supersession marking with deterministic detection. There
  is NO bi-temporal `valid_at`/`invalid_at`, NO point-in-time/"as-of" queries,
  and NO LLM path. Option C (full bi-temporal + point-in-time + LLM-assisted
  contradiction detection) is deferred to a later sub-change / Change C. User
  confirmed Option B.
- **CL-2 (RESOLVED — only `SUPERSEDES`):** B3 adds ONLY the `SUPERSEDES` relation
  name. `CONTRADICTS` and `REPLACES` are deferred; they are added later only if a
  consumer needs the distinction.
- **CL-3 (RESOLVED — RE-SCOPED to on-update diff + threshold):** The PRIMARY
  signal is the per-observation DIFF of prior vs newly-extracted triples on every
  re-extraction (a prior fact absent/changed in the new set is superseded; a
  same-subject-and-relation, different-object new fact is the replacement),
  treated as HIGH confidence. The prior CROSS-OBSERVATION `topic_key`-succession
  scan is REMOVED because it was inert (in-place upsert + delete-by-`source_id`
  reinsert). The diff naturally fires on the common evolving-memory update case
  (a `topic_key` re-save re-extracts the same `source_id`). An OPTIONAL secondary
  signal is content-pattern hints ("no longer", "replaced by", "deprecated",
  "changed to", "superseded by"), emitted at LOWER confidence, gated by a flag
  AND a configurable confidence threshold (default in the config delta).
  Below-threshold hints contribute nothing.
- **CL-4 (RESOLVED — NO LLM in B3):** Deterministic diff supersession MUST NOT
  depend on the optional `kgLlm` path or the background `extract_kg` job
  (constitution **P2**). The diff applies inside the SHARED writer
  (`persistKgExtraction`) reached by BOTH the synchronous write and the
  `extract_kg` job, so behavior is consistent across both paths. LLM enrichment
  MAY only enrich (add) supersession markings later; it MUST NOT gate or remove
  deterministic supersession.
- **CL-7 (RESOLVED — MINOR version bump):** B3 is additive and backward-compatible
  (additive nullable columns, new relation name in the vocabulary, flag-gated
  behavior). Following the B1 CL-5 precedent, this is a MINOR bump; the
  constitution **P3** "destructive migrations require MAJOR" clause targets
  data-losing / contract-breaking migrations, which B3 is not. Confirmed at
  release.
- **FLAG-GATING (RESOLVED):** All B3 behavior is gated behind a master enable
  flag in the `knowledgeGraph` config block (env > persisted > default, the B2
  pattern). The flag DEFAULTS ON, gated by the eval no-regression gate (see the
  evals delta): if supersession-ON regresses the existing retrieval suite
  (including B2 multi-hop), the documented default flips OFF. With the flag OFF,
  the writer reverts to the pre-B3 delete-by-`source_id` + reinsert behavior and
  output is byte-identical to pre-B3.
- **Shared writer is `writeDeterministicKgFacts` / `persistKgExtraction`
  (code-accurate):** The proposal's `refreshObservationFacts` /
  `extractKnowledgeTriples` references are partial. Post-B1 the synchronous graph
  writer is `refreshGraphFacts` (`src/store/index.ts:1119-1126`) delegating to
  `writeDeterministicKgFacts` (`src/indexing/jobs.ts:483`), which calls
  `persistKgExtraction` (`src/indexing/jobs.ts:502`). `persistKgExtraction`
  currently does a blind `DELETE FROM kg_triples WHERE source_type='observation'
  AND source_id=?` (`:537`) then reinserts; B3 replaces that delete+reinsert with
  the diff-and-mark-superseded write. The legacy `observation_facts` writer is
  used only when `graphFactsSource = 'legacy'` and is out of scope for
  supersession.
- **Diff identity reuses `triple_hash` (code-accurate):** Triple content identity
  for the diff is the existing per-observation `triple_hash`
  (`observation:${obs.id}:${tripleHash}`, `src/indexing/jobs.ts:552`), which
  already encodes subject+relation+object content. The diff compares prior
  `triple_hash` set vs new `triple_hash` set for the same `source_id`;
  same-subject-and-relation/different-object replacement detection uses the
  resolved entity names + relation.
- **Confidence convention reuse:** Detection confidence reuses the existing
  extractor confidence convention (`RELATION_PATTERNS` confidences,
  `src/indexing/kg-extractor.ts:55-103`): the diff signal is high-confidence;
  content-pattern hints sit below it and are gated by the threshold.
