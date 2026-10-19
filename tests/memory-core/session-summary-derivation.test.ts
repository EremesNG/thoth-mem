import { describe, expect, it } from 'vitest';

import type { MemoryKind, SessionSummaryInput } from '../../src/memory-core/contracts.js';
import { MemoryService } from '../../src/memory-core/service.js';
import { canonicalizeSessionSummary } from '../../src/memory-core/session-summaries.js';
import { parseHostCompactionClaims } from '../../src/memory-core/session-summary-derivation.js';

describe('host compaction claims', () => {
  it('parses Pi headings and the installed host modified-files block, ignoring unrelated sections', () => {
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
</modified-files>`);
    expect(claims).toEqual([
      { kind: 'objective', content: 'Ship summaries.' },
      { kind: 'completed', content: '- [x] Added storage.' },
      { kind: 'pending', content: '- [ ] Add derivation.' },
      { kind: 'blocker', content: '- Waiting for review.' },
      { kind: 'decision', content: '- Use SQLite.' },
      { kind: 'next_action', content: '1. Run tests.' },
      { kind: 'changed_surface', content: 'src/memory-core/service.ts\ntests/integration/lifecycle.test.ts' },
    ]);
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
    expect(parseHostCompactionClaims(`# REQUEST\n${text}<private>secret</private>`)).toEqual([{ kind: 'objective', content: '😀'.repeat(2_000) }]);
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

  it('uses the latest distinct prompt occurrence rather than the last first-seen prompt', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:prompt-order', name: 'prompts' };
    const session = { harness: 'codex' as const, rootSessionKey: 'root' };
    try {
      const first = service.save({ project, session, eventKey: 'first', evidence: { kind: 'root_prompt', content: 'First.' } });
      service.save({ project, session, eventKey: 'second', evidence: { kind: 'root_prompt', content: 'Second.' } });
      service.save({ project, session, eventKey: 'third', evidence: { kind: 'root_prompt', content: 'Third.' } });
      const latest = service.save({ project, session, eventKey: 'latest', evidence: { kind: 'root_prompt', content: 'Second.' } });
      expect(service.deriveAndPersistSessionSummary(first.sessionId!, 'checkpoint')?.claims).toEqual([
        expect.objectContaining({ kind: 'objective', content: 'First.', supportIds: [first.evidence.id] }),
        expect.objectContaining({ kind: 'objective', content: 'Second.', supportIds: [latest.evidence.id] }),
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
      const later = service.save({ project, session, eventKey: 'later', evidence: { kind: 'root_prompt', content: 'Later objective.' } });
      expect(later.event?.sequence).toBe(3);
      const refreshed = service.deriveAndPersistSessionSummary(first.sessionId!, 'checkpoint')!;
      expect(refreshed).toMatchObject({ version: 2, supersedesId: initial.id, coverage: { fromSequence: 1, toSequence: 3 } });
      expect(refreshed.claims).toContainEqual(expect.objectContaining({ content: 'Later objective.', supportIds: [later.evidence.id] }));
      expect(service.deriveAndPersistSessionSummary(first.sessionId!, 'checkpoint')).toEqual(refreshed);
      const final = service.deriveAndPersistSessionSummary(first.sessionId!, 'final')!;
      expect(final.coverage.toSequence).toBe(3);
      expect(service.deriveAndPersistSessionSummary(first.sessionId!, 'final')).toEqual(final);
      const history = service.projectSummaries({ projectKey: project.key, history: true, budgetChars: 20_000 });
      expect(history.items.map((summary) => summary.id).sort()).toEqual([initial.id, refreshed.id, final.id].sort());
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
        expect.objectContaining({ kind: 'next_action', content: 'New plan.', supportIds: [next.evidence.id] }),
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
      expect(summary.claims.every((claim) => [...claim.content].length <= 2_000)).toBe(true);
      expect(summary.claims).toContainEqual(expect.objectContaining({ kind: 'objective', content: 'p'.repeat(500) }));
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
      const first = service.save({ project, session, eventKey: 'first', evidence: { kind: 'root_prompt', content: 'First request.' } });
      service.save({ project, session, eventKey: 'middle', evidence: { kind: 'root_prompt', content: 'Middle request.' } });
      const latest = service.save({ project, session, eventKey: 'latest', evidence: { kind: 'root_prompt', content: 'Latest request.' } });
      service.save({ project, session, eventKey: 'repeat', evidence: { kind: 'root_prompt', content: 'First request.' } });
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
      expect(summary).toMatchObject({ kind: 'final', coverage: { fromSequence: 1, toSequence: 14 }, generator: { kind: 'harness', name: 'thoth-mem.session-evidence.v1' } });
      expect(summary.claims.filter((claim) => claim.kind === 'objective').map((claim) => [claim.content, claim.supportIds])).toEqual([
        ['First request.', [first.evidence.id]], ['Latest request.', [latest.evidence.id]],
      ]);
      for (const saved of [decision, convention, architecture, preference]) {
        expect(summary.claims).toContainEqual(expect.objectContaining({ kind: 'decision', content: saved.memory!.content, supportIds: [saved.evidence.id] }));
      }
      for (const saved of [discovery, structure]) {
        expect(summary.claims).toContainEqual(expect.objectContaining({ kind: 'completed', content: saved.memory!.content, supportIds: [saved.evidence.id] }));
      }
      expect(summary.claims).toContainEqual(expect.objectContaining({ kind: 'completed', content: failure.memory!.content, outcome: 'failed', supportIds: [failure.evidence.id] }));
      expect(summary.claims).toContainEqual(expect.objectContaining({ kind: 'next_action', content: open.memory!.content, supportIds: [open.evidence.id] }));
      expect(summary.claims).toContainEqual(expect.objectContaining({ kind: 'decision', content: closure.memory!.content, supportIds: [closure.evidence.id] }));
      expect(summary.claims).toContainEqual(expect.objectContaining({ kind: 'completed', content: closure.memory!.content, supportIds: [closed.evidence.id, closure.evidence.id].sort() }));
      expect(summary.claims.map((claim) => claim.content)).not.toContain('Run the migration.');
      const ownSupportIds = [first, latest, decision, convention, architecture, preference, discovery, structure, failure, open, closed, closure].map((saved) => saved.evidence.id);
      expect(summary.claims.every((claim) => claim.supportIds.every((id) => ownSupportIds.includes(id)))).toBe(true);
    } finally { service.close(); }
  });
});
