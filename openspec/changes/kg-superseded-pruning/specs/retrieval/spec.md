# Delta for Retrieval

> Change **C1** (`kg-superseded-pruning`). C1 bounds how many superseded
> `kg_triples` rows exist; it does NOT change how retrieval scores or fuses
> candidates. Pruned rows simply stop appearing (they were already deprioritized,
> not surfaced as current, under B3). The four-lane contract, the B3 supersession
> deprioritization, and the B2 multi-hop bounds are all UNCHANGED. This delta
> exists to lock the preserved-contract guarantee: retrieval MUST NOT regress
> because of pruning, and the retrieval read path MUST be byte-identical to pre-C1
> when the C1 master flag is off.

## ADDED Requirements

### Requirement: Retrieval Read Path MUST Be Unchanged by Pruning
C1 MUST NOT add, remove, or alter any predicate, weight, lane, or scoring step in
the retrieval read path (`queryKnowledgeLane`, `src/store/index.ts` ~2107/~2139;
the B3 supersession deprioritization; and the B2 multi-hop traversal
`queryKnowledgeMultiHopLane`, ~2279). Pruning only removes old superseded ROWS;
for any query, the retrieval output over the surviving rows MUST be exactly what
pre-C1 retrieval would have produced over those same surviving rows. Retrieval MUST
NOT read any C1 config knob (`kgPruneEnabled`, `kgSupersededKeepN`,
`kgPruneOrphanEntities`) and MUST NOT branch on pruning state.

#### Scenario: Retrieval output depends only on surviving rows, not on pruning
- GIVEN two databases that are identical except that one has had old superseded
  triples pruned and the other has not, where the pruned rows are all superseded
  (never current)
- WHEN the same query runs against both
- THEN the ranked retrieval output over the CURRENT and RETAINED-superseded rows
  MUST be identical (the only difference is that pruned superseded rows are absent
  from the not-yet-pruned database's history tail)

#### Scenario: Current facts are unaffected in retrieval after pruning
- GIVEN a query whose best answer is a current (non-superseded) fact
- WHEN pruning has removed older superseded triples in that fact's slot
- THEN the current fact MUST still rank and surface exactly as it did pre-prune

#### Scenario: B3 deprioritization and B2 multi-hop bounds are unchanged
- GIVEN the B3 supersession deprioritization and the B2 multi-hop traversal are in
  force
- WHEN retrieval runs after C1 is applied
- THEN the four-lane contract (`sentence`, `chunk`, `lexical`, `kg`), the
  current-above-superseded deprioritization, and the B2 bounds (cycle-guard,
  `kgMaxDepth`, `kgNeighborhoodLimit`, allow-list, bidirectional expansion,
  elapsed-guard degrade) MUST all behave exactly as before C1

### Requirement: Retrieval MUST Be Byte-Identical to Pre-C1 When the Master Flag Is Off
With the C1 master flag (`kgPruneEnabled`) off, the entire retrieval path MUST be
byte-identical to pre-C1 behavior (Success Criterion 4). Because retrieval never
reads C1 knobs, this holds trivially, but it MUST be asserted: no candidate shape,
score, ordering, or degrade signaling MUST differ from pre-C1 as a result of C1
being present in the codebase.

#### Scenario: Flag-off retrieval is byte-identical to pre-C1
- GIVEN `kgPruneEnabled` is off
- WHEN `hybridRetrieve` runs for any query
- THEN the fused output MUST be identical to pre-C1 baseline output

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **Pruning acts only on already-deprioritized rows:** Under B3, superseded
  triples are already deprioritized and flagged in retrieval, never surfaced as
  current truth. C1 removes the OLDEST of those superseded rows, so the practical
  retrieval effect is limited to the deep history tail; current-fact retrieval is
  unaffected.
- **No point-in-time retrieval:** C1 does not add any "as-of"/point-in-time mode
  (that remains deferred, per B3 CL-1). Retrieval continues to treat supersession
  purely as B3's deterministic down-weight + flag.
- **C1 knobs are not retrieval inputs:** `kgPruneEnabled`/`kgSupersededKeepN`/
  `kgPruneOrphanEntities` govern the write/prune path only; retrieval reads none of
  them, which is what makes the flag-off byte-identity trivial and the
  "output-depends-only-on-surviving-rows" guarantee hold.
