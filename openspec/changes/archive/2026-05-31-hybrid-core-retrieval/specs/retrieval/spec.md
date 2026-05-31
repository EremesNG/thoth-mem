# Delta for Retrieval

## ADDED Requirements
### Requirement: Hybrid Retrieval MUST Fuse Four Lanes
The retrieval engine MUST execute sentence-semantic, chunk-semantic, lexical FTS5, and graph/KG lanes and fuse them into one ranked result set.

#### Scenario: Fused output contains all available lanes
- GIVEN sentence vectors, chunk vectors, FTS5, and graph/KG retrieval are available
- WHEN a retrieval query executes
- THEN final ranked results MUST include fused evidence from all four lanes

### Requirement: Semantic Retrieval MUST Use sqlite-vec KNN Defaults
Sentence and chunk semantic retrieval lanes MUST execute KNN via sqlite-vec `vec0` virtual tables using `MATCH`, `distance`, and bounded top-k queries. Unless explicitly reconfigured, sentence top-k MUST be `100`, chunk top-k MUST be `20`, and semantic evidence below score `0.30` MUST be filtered out.

#### Scenario: Sentence lane uses vec0 MATCH query with default k
- GIVEN sentence vectors are indexed in sqlite-vec
- WHEN sentence semantic retrieval runs
- THEN the query MUST use sqlite-vec `MATCH`, rank by `distance`, and request default top-k `100`

#### Scenario: Chunk lane uses vec0 MATCH query with default k
- GIVEN chunk vectors are indexed in sqlite-vec
- WHEN chunk semantic retrieval runs
- THEN the query MUST use sqlite-vec `MATCH`, rank by `distance`, and request default top-k `20`

#### Scenario: Low-score semantic evidence is filtered
- GIVEN semantic evidence has converted score below `0.30`
- WHEN retrieval candidates are filtered
- THEN that evidence MUST NOT contribute to final ranked output

### Requirement: sqlite-vec Distance MUST Be Converted to Comparable Scores
The retrieval engine MUST convert sqlite-vec semantic distance into normalized scores before thresholding/fusion. For default L2 distance, conversion MUST be `score = exp(-distance / 20)` unless a future metric explicitly defines and tests another conversion.

#### Scenario: L2 distance is converted consistently
- GIVEN sqlite-vec returns an L2 distance for semantic evidence
- WHEN the score is computed
- THEN the default conversion MUST use `exp(-distance / 20)` and produce monotonically lower scores for larger distances

### Requirement: HyDE MUST Use Raw Query and Hypothetical Answer Embeddings
HyDE retrieval MUST always embed the raw query. When HyDE is enabled and generation succeeds, the system MUST also embed the generated hypothetical answer as a separate semantic input and fuse raw-query and HyDE semantic candidates. HyDE failure, timeout, or disablement MUST leave raw-query semantic retrieval available.

#### Scenario: Raw query and HyDE answer both contribute
- GIVEN HyDE is enabled and returns a hypothetical answer
- WHEN semantic retrieval executes
- THEN sentence and chunk semantic lanes MUST consider both raw-query embedding results and hypothetical-answer embedding results during fusion

#### Scenario: HyDE failure falls back to raw query only
- GIVEN HyDE is enabled and generation fails or times out
- WHEN retrieval proceeds
- THEN semantic lanes MUST continue using the raw-query embedding without failing overall retrieval

### Requirement: FTS5 Lexical Retrieval MUST Use Sanitized Prefix Matching
The lexical lane MUST build a sanitized FTS5 prefix query from eligible query tokens, using `token*` terms joined by `OR`, and MUST use a default lexical limit of `20` unless explicitly reconfigured.

#### Scenario: Prefix query catches lexical variants
- GIVEN a query token such as `encrypt`
- WHEN the FTS5 lexical query is built
- THEN the query MUST include a sanitized prefix term like `encrypt*` so variants such as `encryption` can be recalled

#### Scenario: FTS5 tokenization avoids unsafe or low-value terms
- GIVEN a query contains punctuation or very short tokens
- WHEN the FTS5 prefix query is built
- THEN punctuation MUST be stripped and ineligible short tokens MUST be omitted before joining prefix terms with `OR`

### Requirement: Sentence-Level Precision MUST Use Surgical Trimming Under Clear Conditions
When one or more sentence semantic evidence items for a result meet or exceed the sentence score threshold (`0.30` by default), the primary returned evidence for that result MUST be the matching sentence text rather than the full parent chunk. Parent chunk/observation context MAY be promoted separately by small-to-big retrieval when broader context is required.

#### Scenario: Strong sentence hit returns trimmed evidence
- GIVEN a sentence semantic hit has score at or above the configured sentence threshold
- WHEN retrieval output is assembled
- THEN the primary evidence text MUST include the matching sentence text and MUST NOT replace it with the entire parent chunk by default

#### Scenario: Parent context is promoted separately
- GIVEN trimmed sentence evidence is precise but insufficient for answerability
- WHEN small-to-big promotion is triggered
- THEN parent chunk or observation context MUST be attached with lineage while preserving the trimmed sentence as sentence evidence

### Requirement: Retrieval MUST Degrade by Lane, Not Globally
If sqlite-vec cannot load, vec tables are unavailable, semantic index state is stale/rebuilding, or semantic providers time out, semantic lanes MUST be degraded while lexical FTS5 + graph/KG lanes continue.

#### Scenario: Semantic degraded, lexical and graph/KG remain available
- GIVEN semantic retrieval cannot execute due to sqlite-vec or index state issues
- WHEN retrieval is requested
- THEN the system MUST return lexical + graph/KG results with explicit degraded-state signaling and no global hard-failure

### Requirement: Recent Saves MUST Have Explicit Eventual Semantic Consistency
A newly saved or updated memory item MUST be available through primary persistence and lexical/graph-compatible paths immediately, while sentence/chunk semantic recall MAY remain pending until background indexing completes. Retrieval output MUST be able to signal that semantic coverage is pending or degraded for such content.

#### Scenario: Newly saved content is lexical before semantic indexing completes
- GIVEN content has just been saved and semantic background jobs are still pending
- WHEN retrieval is requested for that content
- THEN lexical FTS5 and graph/KG-compatible results MUST remain available and semantic state MUST indicate pending or degraded coverage

## MODIFIED Requirements

## REMOVED Requirements
