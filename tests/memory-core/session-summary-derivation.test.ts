import { describe, expect, it } from 'vitest';

import type { MemoryKind, SessionSummaryInput } from '../../src/memory-core/contracts.js';
import { MemoryService } from '../../src/memory-core/service.js';
import { canonicalizeSessionSummary } from '../../src/memory-core/session-summaries.js';
import { parseHostCompactionClaims } from '../../src/memory-core/session-summary-derivation.js';

describe('host compaction claims', () => {
  it('parses Pi split-turn compaction with one Goal objective and one deduplicated changed surface', () => {
    const claims = parseHostCompactionClaims(`## Goal
Ship summaries.
## Constraints & Preferences
Do not include this constraint.
## Progress
### Done
- [x] Added storage.
### In Progress
- [ ] Add derivation.
### Blocked
- Waiting for review.
## Key Decisions
- Use SQLite.
## Next Steps
1. Run tests.
## Critical Context
Do not include this context.

<read-files>
README.md
</read-files>

<modified-files>
src/memory-core/service.ts
tests/integration/lifecycle.test.ts
</modified-files>

---

**Turn Context (split turn):**

## Original Request
No explicit user-typed request is visible in these messages; continue the previously authorized implementation.
## Progress So Far
The parser and storage are ready for verification.
## Context Needed to Continue
Preserve the root session and run the focused checks.

<read-files>
README.md
src/memory-core/contracts.ts
</read-files>

<modified-files>
tests/integration/lifecycle.test.ts
src/memory-core/session-summary-derivation.ts
src/memory-core/service.ts
</modified-files>`);
    expect(claims).toEqual([
      { kind: 'objective', content: 'Ship summaries.' },
      { kind: 'completed', content: '- [x] Added storage.' },
      { kind: 'pending', content: '- [ ] Add derivation.' },
      { kind: 'blocker', content: '- Waiting for review.' },
      { kind: 'decision', content: '- Use SQLite.' },
      { kind: 'next_action', content: '1. Run tests.' },
      { kind: 'changed_surface', content: 'src/memory-core/service.ts\ntests/integration/lifecycle.test.ts\nsrc/memory-core/session-summary-derivation.ts' },
    ]);
  });

  it('merges Markdown modified-files sections and XML blocks in first-seen path order', () => {
    expect(parseHostCompactionClaims(`<modified-files>
src/first.ts
</modified-files>
## Files Modified
- \`src/second.ts\`
- src/first.ts
## Goal
Keep the first objective.
## Original Request
Ignore this split-turn objective.
<modified-files>
src/third.ts
src/second.ts
</modified-files>
## Changed Files
src/fourth.ts
src/third.ts`)).toEqual([
      { kind: 'objective', content: 'Keep the first objective.' },
      { kind: 'changed_surface', content: 'src/first.ts\nsrc/second.ts\nsrc/third.ts\nsrc/fourth.ts' },
    ]);
    expect(parseHostCompactionClaims('## Goal\n(none)\n## Request\nNot the first objective.')).toEqual([]);
  });

  it('recognizes numbered Claude headings, any heading level, and skips empty or none bodies', () => {
    expect(parseHostCompactionClaims(`## 1. Primary Request and Intent
Implement continuity.
## 7. Pending Tasks
Finish adapters.
## 9. Optional Next Step
Run checks.
# Objective
(none)
###### Completed
- None
### Blocker

## Files Modified
src/index.ts`)).toEqual([
      { kind: 'objective', content: 'Implement continuity.' },
      { kind: 'pending', content: 'Finish adapters.' },
      { kind: 'next_action', content: 'Run checks.' },
      { kind: 'changed_surface', content: 'src/index.ts' },
    ]);
  });

  it('bounds and sanitizes each section and recognizes all agreed heading aliases', () => {
    const text = '😀'.repeat(2_100);
    expect(parseHostCompactionClaims(`# REQUEST\n${text}<private>secret</private>`)).toEqual([{ kind: 'objective', content: '😀'.repeat(300) }]);
    for (const heading of ['Goal', 'Done', 'In Progress', 'Blocked', 'Key Decisions', 'Next Steps', 'Modified Files']) {
      expect(parseHostCompactionClaims(`## ${heading}\n${text}`)[0]?.content).toBe('😀'.repeat(300));
    }
    expect(parseHostCompactionClaims('# Intent\nA\n# Accomplished\nB\n# Current Work\nC\n# Decision\nD\n# Blockers\nE\n# Changed Files\nF').map((claim) => claim.kind)).toEqual(['objective', 'completed', 'pending', 'decision', 'blocker', 'changed_surface']);
  });

  it('does not treat unrecognized prose or headings inside code fences as claims', () => {
    expect(parseHostCompactionClaims('Goal: no Markdown heading.\n## Critical Context\nNot a claim.')).toEqual([]);
    expect(parseHostCompactionClaims('```markdown\n## Goal\nExample, not a section.\n```')).toEqual([]);
  });
});

describe('deterministic session summary derivation', () => {
  it('returns none for sessions without citable claims, including unordered legacy and foreign evidence', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:empty', name: 'empty' };
    try {
      const enrolled = service.lifecycle({ operation: 'enroll', project, harness: 'pi', rootSessionKey: 'empty', eventKey: 'enroll' });
      service.save({ project, session: { harness: 'pi', rootSessionKey: 'other' }, evidence: { kind: 'root_prompt', content: 'Foreign objective.' } });
      service.save({ project, session: { harness: 'pi', rootSessionKey: 'empty' }, evidence: { kind: 'checkpoint', content: 'Unstructured checkpoint.' } });
      expect(service.deriveAndPersistSessionSummary(enrolled.sessionId, 'final')).toBeNull();
      const legacy = service.save({ project, session: { harness: 'import', rootSessionKey: 'legacy' }, evidence: { kind: 'legacy_prompt', content: 'Unordered legacy objective.' } });
      expect(service.deriveAndPersistSessionSummary(legacy.sessionId!, 'final')).toBeNull();
      expect(service.projectSummaries({ projectKey: project.key }).items).toEqual([]);
    } finally { service.close(); }
  });

  it('uses only substantive normalized objectives, bounded by code points', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:substantive', name: 'substantive' };
    const session = { harness: 'pi' as const, rootSessionKey: 'root' };
    try {
      service.save({ project, session, eventKey: 'reload', evidence: { kind: 'root_prompt', content: 'Ya hice /reload' } });
      service.save({ project, session, eventKey: 'short', evidence: { kind: 'root_prompt', content: `  ${'😀'.repeat(39)}  ` } });
      service.save({ project, session, eventKey: 'whitespace', evidence: { kind: 'root_prompt', content: `small${' \n\t'.repeat(40)}prompt` } });
      const first = service.save({ project, session, eventKey: 'first', evidence: { kind: 'root_prompt', content: ` \n${'😀'.repeat(40)}\t ` } });
      service.save({ project, session, eventKey: 'middle', evidence: { kind: 'root_prompt', content: 'An intermediate substantive request to validate storage.' } });
      const latest = service.save({ project, session, eventKey: 'latest', evidence: { kind: 'root_prompt', content: '🚀'.repeat(301) } });
      service.save({ project, session, eventKey: 'repeat', evidence: { kind: 'root_prompt', content: '😀'.repeat(40) } });
      service.save({ project, session, eventKey: 'trivial-latest', evidence: { kind: 'root_prompt', content: 'Done.' } });
      expect(service.deriveAndPersistSessionSummary(first.sessionId!, 'checkpoint')?.claims).toEqual([
        expect.objectContaining({ kind: 'objective', content: '😀'.repeat(40), supportIds: [first.evidence.id] }),
        expect.objectContaining({ kind: 'objective', content: '🚀'.repeat(300), supportIds: [latest.evidence.id] }),
      ]);
    } finally { service.close(); }
  });

  it('counts substantive prompt code points after whitespace normalization before canonical NFC rendering', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:combining-prompt', name: 'combining' };
    const session = { harness: 'pi' as const, rootSessionKey: 'root' };
    try {
      service.save({ project, session, evidence: { kind: 'root_prompt', content: 'Trivial.' } });
      const prompt = service.save({ project, session, evidence: { kind: 'root_prompt', content: ` \n${'e\u0301'.repeat(20)}\t ` } });
      expect(service.deriveAndPersistSessionSummary(prompt.sessionId!, 'checkpoint')?.claims).toEqual([
        expect.objectContaining({ kind: 'objective', content: 'é'.repeat(20), supportIds: [prompt.evidence.id] }),
      ]);
    } finally { service.close(); }
  });

  it('falls back to only the first prompt when none is substantive', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:trivial', name: 'trivial' };
    const session = { harness: 'pi' as const, rootSessionKey: 'root' };
    try {
      const first = service.save({ project, session, evidence: { kind: 'root_prompt', content: 'Ya hice /reload' } });
      service.save({ project, session, evidence: { kind: 'root_prompt', content: 'Continue.' } });
      expect(service.deriveAndPersistSessionSummary(first.sessionId!, 'checkpoint')?.claims).toEqual([
        expect.objectContaining({ kind: 'objective', content: 'Ya hice /reload', supportIds: [first.evidence.id] }),
      ]);
    } finally { service.close(); }
  });

  it('uses the latest distinct prompt occurrence rather than the last first-seen prompt', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:prompt-order', name: 'prompts' };
    const session = { harness: 'codex' as const, rootSessionKey: 'root' };
    try {
      const first = service.save({ project, session, eventKey: 'first', evidence: { kind: 'root_prompt', content: 'Implement the first part of the summary pipeline.' } });
      service.save({ project, session, eventKey: 'second', evidence: { kind: 'root_prompt', content: 'Implement the second part of the summary pipeline.' } });
      service.save({ project, session, eventKey: 'third', evidence: { kind: 'root_prompt', content: 'Implement the third part of the summary pipeline.' } });
      const latest = service.save({ project, session, eventKey: 'latest', evidence: { kind: 'root_prompt', content: 'Implement the second part of the summary pipeline.' } });
      expect(service.deriveAndPersistSessionSummary(first.sessionId!, 'checkpoint')?.claims).toEqual([
        expect.objectContaining({ kind: 'objective', content: 'Implement the first part of the summary pipeline.', supportIds: [first.evidence.id] }),
        expect.objectContaining({ kind: 'objective', content: 'Implement the second part of the summary pipeline.', supportIds: [latest.evidence.id] }),
      ]);
    } finally { service.close(); }
  });

  it('uses the non-summary activity watermark, with citable events after an earlier summary and no loop', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:watermark', name: 'watermark' };
    const session = { harness: 'codex' as const, rootSessionKey: 'root' };
    try {
      const first = service.save({ project, session, eventKey: 'first', evidence: { kind: 'root_prompt', content: 'First objective.' } });
      const initial = service.deriveAndPersistSessionSummary(first.sessionId!, 'checkpoint')!;
      expect(initial.coverage.toSequence).toBe(1);
      expect(service.deriveAndPersistSessionSummary(first.sessionId!, 'checkpoint')).toEqual(initial);
      const later = service.save({ project, session, eventKey: 'later', evidence: { kind: 'root_prompt', content: 'Implement a later objective with citable session events.' } });
      expect(later.event?.sequence).toBe(3);
      const refreshed = service.deriveAndPersistSessionSummary(first.sessionId!, 'checkpoint')!;
      expect(refreshed).toMatchObject({ version: 2, supersedesId: initial.id, coverage: { fromSequence: 1, toSequence: 3 } });
      expect(refreshed.claims).toContainEqual(expect.objectContaining({ content: 'Implement a later objective with citable session events.', supportIds: [later.evidence.id] }));
      expect(service.deriveAndPersistSessionSummary(first.sessionId!, 'checkpoint')).toEqual(refreshed);
      const final = service.deriveAndPersistSessionSummary(first.sessionId!, 'final')!;
      expect(final.coverage.toSequence).toBe(3);
      expect(service.deriveAndPersistSessionSummary(first.sessionId!, 'final')).toEqual(final);
      const history = service.projectSummaries({ projectKey: project.key, history: true, budgetChars: 20_000 });
      expect(history.items.map((summary) => summary.id).sort()).toEqual([initial.id, refreshed.id, final.id].sort());
    } finally { service.close(); }
  });

  it('reuses a persisted v1 summary at the same watermark and emits v2 only after new activity', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:summary-upgrade', name: 'upgrade' };
    const session = { harness: 'pi' as const, rootSessionKey: 'root' };
    try {
      const prompt = service.save({ project, session, evidence: { kind: 'root_prompt', content: 'Implement the summary pipeline with immutable citations.' } });
      const persisted = service.lifecycle({ ...session, project, operation: 'checkpoint_pre_compact', eventKey: 'old-summary', summary: {
        kind: 'checkpoint', coverage: { fromSequence: 1, toSequence: 1 },
        generator: { kind: 'harness', name: 'thoth-mem.session-evidence.v1' },
        claims: [{ kind: 'objective', content: 'Original persisted summary.', supportIds: [prompt.evidence.id] }],
      } });
      expect(service.deriveAndPersistSessionSummary(prompt.sessionId!, 'checkpoint')).toEqual(service.get({ id: persisted.summaryId! }).record);
      service.save({ project, session, evidence: { kind: 'root_prompt', content: 'Verify that new activity derives a compact v2 summary.' } });
      expect(service.deriveAndPersistSessionSummary(prompt.sessionId!, 'checkpoint')).toMatchObject({ version: 2, supersedesId: persisted.summaryId, generator: { name: 'thoth-mem.session-evidence.v2' } });
    } finally { service.close(); }
  });

  it('derives compact title-plus-primary-line claims for direct memories and open or closed handoffs', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:primary-lines', name: 'primary-lines' };
    const session = { harness: 'pi' as const, rootSessionKey: 'root' };
    const save = (kind: MemoryKind, title: string, content: string, topicKey?: string) => service.save({
      project, session, evidence: { kind: 'explicit_save', content },
      memory: { kind, title, content, ...(topicKey ? { topicKey } : {}) },
    });
    try {
      const direct = save('decision', 'SQLite ledger', 'Rationale: Keep durable evidence separate.\nResult: SQLite remains authoritative.\nNext: Verify ordering.');
      const fallback = save('discovery', 'Parser fallback', '\nFirst useful line.\nExtra detail not needed.');
      const failed = save('failure', 'Rejected runtime', `Attempt: Native SQLite in Bun.\nResult: ${'😀'.repeat(400)}\nLesson: Use Node.`);
      const open = save('handoff', 'Native recovery', 'Objective: Finish native recovery.\nFirst pending action: Run the Pi lifecycle checks.\nBlockers: None.', 'work/open');
      const closed = save('handoff', 'Old migration plan', 'First pending action: Apply the migration.', 'work/closed');
      const closure = save('decision', 'Migration verified', 'Rationale: Backups protect existing data.\nResult: Revision 11 retained every referenced session.\nChecks: Passed.', 'work/closed');
      const summary = service.deriveAndPersistSessionSummary(direct.sessionId!, 'final')!;
      expect(summary.generator).toEqual({ kind: 'harness', name: 'thoth-mem.session-evidence.v2' });
      expect(summary.claims).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'decision', content: 'SQLite ledger: SQLite remains authoritative.', supportIds: [direct.evidence.id] }),
        expect.objectContaining({ kind: 'completed', content: 'Parser fallback: First useful line.', supportIds: [fallback.evidence.id] }),
        expect.objectContaining({ kind: 'completed', content: `Rejected runtime: ${'😀'.repeat(282)}`, outcome: 'failed', supportIds: [failed.evidence.id] }),
        expect.objectContaining({ kind: 'next_action', content: 'Native recovery: Run the Pi lifecycle checks.', supportIds: [open.evidence.id] }),
        expect.objectContaining({ kind: 'completed', content: 'Migration verified: Revision 11 retained every referenced session.', supportIds: [closed.evidence.id, closure.evidence.id].sort() }),
      ]));
      expect(summary.claims.every((claim) => Array.from(claim.content).length <= 300)).toBe(true);
      expect(summary.claims.some((claim) => claim.content.includes('Old migration plan'))).toBe(false);
    } finally { service.close(); }
  });

  it('collapses identical kind and content with canonical supports capped at sixteen', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:dedup', name: 'dedup' };
    const session = { harness: 'pi' as const, rootSessionKey: 'root' };
    try {
      const saved = Array.from({ length: 20 }, (_, index) => service.save({
        project, session, eventKey: `duplicate-${index}`, evidence: { kind: 'explicit_save', content: `Independent evidence ${index}.` },
        memory: { kind: index % 2 ? 'failure' : 'discovery', title: 'Native SQLite', content: `Result: Node owns the native driver.\nDetail: Run ${index}.` },
      }));
      const decision = service.save({ project, session, evidence: { kind: 'explicit_save', content: 'Separate decision evidence.' }, memory: { kind: 'decision', title: 'Native SQLite', content: 'Result: Node owns the native driver.' } });
      const summary = service.deriveAndPersistSessionSummary(saved[0]!.sessionId!, 'checkpoint')!;
      expect(summary.claims).toEqual([
        expect.objectContaining({ kind: 'decision', content: 'Native SQLite: Node owns the native driver.', supportIds: [decision.evidence.id] }),
        expect.objectContaining({ kind: 'completed', content: 'Native SQLite: Node owns the native driver.', outcome: 'failed', supportIds: saved.map((result) => result.evidence.id).sort().slice(0, 16) }),
      ]);
    } finally { service.close(); }
  });

  it('keeps replacement handoffs open rather than treating them as closures', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:replacement', name: 'replacement' };
    const session = { harness: 'pi' as const, rootSessionKey: 'root' };
    try {
      service.save({ project, session, eventKey: 'old', evidence: { kind: 'handoff', content: 'Old plan.' }, memory: { kind: 'handoff', title: 'Old', content: 'Old plan.', topicKey: 'work' } });
      const next = service.save({ project, session, eventKey: 'new', evidence: { kind: 'handoff', content: 'New plan.' }, memory: { kind: 'handoff', title: 'New', content: 'New plan.', topicKey: 'work' } });
      expect(service.deriveAndPersistSessionSummary(next.sessionId!, 'checkpoint')?.claims).toEqual([
        expect.objectContaining({ kind: 'next_action', content: 'New: New plan.', supportIds: [next.evidence.id] }),
      ]);
    } finally { service.close(); }
  });

  it.each([['short', 'x'], ['astral', '😀'], ['escaped', '"\\\\\n']])('deterministically drops low-priority claims to respect all limits (%s)', (_label, unit) => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:limits', name: 'limits' };
    const session = { harness: 'codex' as const, rootSessionKey: 'root' };
    try {
      const prompt = service.save({ project, session, eventKey: 'prompt', evidence: { kind: 'root_prompt', content: 'p'.repeat(1_000) } });
      for (let i = 0; i < 40; i++) {
        service.save({ project, session, eventKey: `memory-${i}`, evidence: { kind: 'explicit_save', content: 'Evidence.' }, memory: { kind: 'discovery', title: `Discovery ${i}`, content: `${i}: ${unit.repeat(unit === 'x' ? 5 : 2_100)}` } });
      }
      const handoff = service.save({ project, session, eventKey: 'handoff', evidence: { kind: 'handoff', content: 'Pending action.' }, memory: { kind: 'handoff', title: 'Continue', content: 'Pending action.', topicKey: 'pending' } });
      const summary = service.deriveAndPersistSessionSummary(prompt.sessionId!, 'checkpoint')!;
      expect(summary.claims.length).toBeGreaterThan(0);
      expect(summary.claims.length).toBeLessThanOrEqual(32);
      expect(summary.claims.every((claim) => [...claim.content].length <= 300)).toBe(true);
      expect(summary.claims).toContainEqual(expect.objectContaining({ kind: 'objective', content: 'p'.repeat(300) }));
      expect(summary.claims).toContainEqual(expect.objectContaining({ kind: 'next_action', supportIds: [handoff.evidence.id] }));
      const input: SessionSummaryInput = { kind: summary.kind, coverage: summary.coverage, generator: summary.generator, claims: summary.claims.map(({ kind, content, outcome, supportIds }) => ({ kind, content, ...(outcome ? { outcome } : {}), supportIds })) };
      expect(canonicalizeSessionSummary(input).canonicalJson.length).toBeLessThanOrEqual(20_000);
      expect(service.deriveAndPersistSessionSummary(prompt.sessionId!, 'checkpoint')).toEqual(summary);
    } finally { service.close(); }
  });

  it('maps only cited session prompts and promoted memories, including closed handoffs', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:derive', name: 'derive' };
    const session = { harness: 'codex' as const, rootSessionKey: 'root' };
    const save = (kind: MemoryKind, content: string, topicKey?: string) => service.save({
      project, session, eventKey: content,
      evidence: { kind: 'explicit_save', content: `Evidence for ${content}` },
      memory: { kind, title: content, content, ...(topicKey ? { topicKey } : {}) },
    });
    try {
      const first = service.save({ project, session, eventKey: 'first', evidence: { kind: 'root_prompt', content: 'Implement the first requested feature with cited evidence.' } });
      service.save({ project, session, eventKey: 'middle', evidence: { kind: 'root_prompt', content: 'Implement the middle requested feature with cited evidence.' } });
      const latest = service.save({ project, session, eventKey: 'latest', evidence: { kind: 'root_prompt', content: 'Implement the latest requested feature with cited evidence.' } });
      service.save({ project, session, eventKey: 'repeat', evidence: { kind: 'root_prompt', content: 'Implement the first requested feature with cited evidence.' } });
      const decision = save('decision', 'Use SQLite.');
      const convention = save('convention', 'Use ESM.');
      const architecture = save('architecture', 'Keep the core inward.');
      const preference = save('preference', 'Prefer focused checks.');
      const discovery = save('discovery', 'Found the parser.');
      const structure = save('project_structure', 'The ledger owns ordering.');
      const failure = save('failure', 'The old run failed.');
      const open = save('handoff', 'Continue adapters.', 'handoff/open');
      const closed = save('handoff', 'Run the migration.', 'handoff/closed');
      const closure = save('decision', 'Migration verified complete.', 'handoff/closed');
      service.save({ project, eventKey: 'project-only', evidence: { kind: 'explicit_save', content: 'Unordered evidence.' }, memory: { kind: 'decision', title: 'Project only', content: 'Do not include project-only memory.' } });
      service.save({ project, session: { ...session, rootSessionKey: 'other' }, eventKey: 'other', evidence: { kind: 'root_prompt', content: 'Foreign request.' } });

      const summary = service.deriveAndPersistSessionSummary(first.sessionId!, 'final')!;
      expect(summary).toMatchObject({ kind: 'final', coverage: { fromSequence: 1, toSequence: 14 }, generator: { kind: 'harness', name: 'thoth-mem.session-evidence.v2' } });
      expect(summary.claims.filter((claim) => claim.kind === 'objective').map((claim) => [claim.content, claim.supportIds])).toEqual([
        ['Implement the first requested feature with cited evidence.', [first.evidence.id]], ['Implement the latest requested feature with cited evidence.', [latest.evidence.id]],
      ]);
      for (const saved of [decision, convention, architecture, preference]) {
        expect(summary.claims).toContainEqual(expect.objectContaining({ kind: 'decision', content: `${saved.memory!.title}: ${saved.memory!.content}`, supportIds: [saved.evidence.id] }));
      }
      for (const saved of [discovery, structure]) {
        expect(summary.claims).toContainEqual(expect.objectContaining({ kind: 'completed', content: `${saved.memory!.title}: ${saved.memory!.content}`, supportIds: [saved.evidence.id] }));
      }
      expect(summary.claims).toContainEqual(expect.objectContaining({ kind: 'completed', content: 'The old run failed.: The old run failed.', outcome: 'failed', supportIds: [failure.evidence.id] }));
      expect(summary.claims).toContainEqual(expect.objectContaining({ kind: 'next_action', content: 'Continue adapters.: Continue adapters.', supportIds: [open.evidence.id] }));
      expect(summary.claims).toContainEqual(expect.objectContaining({ kind: 'decision', content: 'Migration verified complete.: Migration verified complete.', supportIds: [closure.evidence.id] }));
      expect(summary.claims).toContainEqual(expect.objectContaining({ kind: 'completed', content: 'Migration verified complete.: Migration verified complete.', supportIds: [closed.evidence.id, closure.evidence.id].sort() }));
      expect(summary.claims.map((claim) => claim.content)).not.toContain('Run the migration.');
      const ownSupportIds = [first, latest, decision, convention, architecture, preference, discovery, structure, failure, open, closed, closure].map((saved) => saved.evidence.id);
      expect(summary.claims.every((claim) => claim.supportIds.every((id) => ownSupportIds.includes(id)))).toBe(true);
    } finally { service.close(); }
  });
});
