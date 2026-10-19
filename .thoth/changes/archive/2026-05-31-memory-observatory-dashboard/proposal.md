# Proposal: Memory Observatory Dashboard

## Intent
Define a full, from-scratch product rethink of the dashboard as a memory observatory that exposes the full depth of thoth-mem data and relationships, not a cosmetic evolution of `arcrift-dashboard-vector-map`.

## Scope
### In Scope
- Replace the current dashboard interaction model with a connected observatory model that treats recall, relationships, chronology, provenance, and health as first-class.
- Reframe the UI around five connected product surfaces:
  - **Recall Workspace** for hybrid retrieval lanes (semantic sentence/chunk, lexical, KG/facts) with explicit lane evidence and pivot controls.
  - **Memory Map** for relationship-native exploration across observations, sessions, projects, topic keys, taxonomy, and fact edges.
  - **Timeline** for session/project chronology, observation evolution, and context-preserving playback.
  - **Knowledge Ledger** for structured What/Why/Where/Learned extraction, triples/facts, provenance, confidence, and source traceability.
  - **Health & Indexing** for semantic indexing state, lane coverage, degraded/stale signals, and ingestion/index operational status.
- Define cross-surface navigation contracts so pivots preserve context (filters, focus node, lane evidence, time window, project/session scope).
- Specify read-only, local-first interaction boundaries for this phase so exploration depth increases without introducing mutation risk.
- Identify and retire legacy list/table-first information architecture that fails to exploit relationship density.

### Out of Scope
- Any memory mutation UI (create/update/delete prompts/observations/sessions) unless separately approved in later specs.
- Remote-first, multi-user, auth, tenancy, or synchronization UX redesign.
- Replacing the SQLite persistence core; only read-model shaping is eligible if later specs justify it.
- Shipping implementation code in this phase.

## Approach
1. Baseline and gap framing
   - Treat existing `arcrift-dashboard-vector-map` as a diagnostic baseline, not a target architecture.
   - Explicitly address known issues: inert depth, weak expand-neighbors behavior, broken context-preserving pivots, underused taxonomy/facts/vectors, and legacy list/table surfaces that flatten relationships.
2. Product model definition
   - Define the observatory as connected modes over shared state, not isolated pages.
   - Anchor every mode to existing memory primitives (observations, sessions, projects, topic keys, facts, triples, retrieval lanes, index state).
3. Navigation and state contracts
   - Specify canonical pivot behaviors (node -> recall, recall hit -> map neighborhood, timeline event -> ledger provenance, ledger fact -> map/timeline context).
   - Preserve user context across pivots to prevent state resets and exploration dead-ends.
4. Evidence and provenance first
   - Require all surfaced claims to include source/provenance affordances and confidence framing where available.
   - Expose hybrid lane contributions instead of returning opaque ranked results.
5. Health observability integration
   - Make indexing/coverage health always visible and link degradations to affected surfaces and expected UX impact.

## Affected Areas
- `openspec/changes/memory-observatory-dashboard/proposal.md` (new proposal artifact).
- Future implementation scope likely touching:
  - `dashboard/src/components/map/*` (current map substrate to be superseded or heavily reworked).
  - `dashboard/src/components/*` legacy views (`Overview`, `SearchExplorer`, `GraphLiteView`, `TopicKeyBrowser`, `ProjectDetail`, `ObservationDetail`) to be reorganized into observatory modes.
  - `src/store/index.ts` visualization/retrieval/query interfaces and health endpoints consumed by dashboard.
  - `src/store/schema.ts` data model affordances already available for facts, vectors, sessions, projects, topic keys, and indexing metadata.
  - `openspec/specs/*` alignment updates in later SDD phases.

## Risks
- Product complexity risk: ambitious connected navigation can overwhelm without disciplined interaction contracts.
- Performance risk: deeper cross-surface pivots may increase query fan-out and rendering load.
- Trust risk: mixed-confidence retrieval and KG evidence can confuse users if provenance is not explicit.
- Migration risk: replacing legacy surfaces may temporarily reduce discoverability for existing workflows.
- Scope creep risk: dashboard rethink can accidentally absorb backend architecture changes outside read-model needs.

## Rollback Plan
1. Keep existing archived dashboard direction (`arcrift-dashboard-vector-map`) as a fallback reference until new specs and implementation validate parity-plus outcomes.
2. Phase observatory rollout behind modular surfaces so individual modes can be disabled without reverting the full dashboard.
3. Preserve read-only/local-first constraints as a safety boundary; if uncertainty grows, defer mutation-oriented capabilities to separate approved changes.
4. If cross-surface model proves unstable, revert to a bounded subset (Recall Workspace + Memory Map + Health) while keeping timeline/ledger as staged follow-ons.

## Success Criteria
- Proposal establishes a clearly non-conservative product direction distinct from arcrift-era map polish.
- Observatory model explicitly integrates hybrid recall lanes, vectors, KG/facts, observation taxonomy, What/Why/Where/Learned, topic keys, sessions, projects, timelines, provenance/source, and indexing health.
- Context-preserving pivots are defined as a first-class requirement across all major surfaces.
- Out-of-scope boundaries prevent accidental mutation UI, auth/multi-user redesign, or premature storage-core replacement.
- Proposal is ready to drive `sdd-spec` without requiring re-interpretation of product intent.
