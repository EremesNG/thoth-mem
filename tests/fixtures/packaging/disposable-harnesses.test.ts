import { describe, expect, it } from 'vitest';
import {
  HARNESSES,
  buildDisposableHarnesses,
  createPackedTarballInput,
  selectNativeStdoutEnvelope,
} from './disposable-harnesses.js';

describe('disposable packaging harness fixtures', () => {
  it('builds independent deterministic homes for every supported harness', () => {
    const fixtures = buildDisposableHarnesses('fixture-run');

    expect(fixtures.map((fixture) => fixture.harness)).toEqual(HARNESSES);
    expect(new Set(fixtures.map((fixture) => fixture.home.root)).size).toBe(3);
    expect(fixtures.every((fixture) => fixture.home.root.includes('thoth-disposable-fixture-run'))).toBe(true);
    expect(fixtures.every((fixture) => fixture.home.isRealHome === false)).toBe(true);
    expect(fixtures.every((fixture) => fixture.home.externalServerStarted === false)).toBe(true);
    expect(fixtures.every((fixture) => fixture.guards.usesCheckout === false)).toBe(true);
    expect(fixtures.every((fixture) => fixture.guards.usesCredentials === false)).toBe(true);
  });

  it('provides packed tarball input without a source checkout dependency', () => {
    const input = createPackedTarballInput('fixture-run');

    expect(input.archiveName).toBe('thoth-mem-fixture-run.tgz');
    expect(input.bytes.length).toBeGreaterThan(0);
    expect(input.sourceCheckoutPath).toBeUndefined();
    expect(input.requiresCredentials).toBe(false);
  });

  it('selects bounded native stdout envelopes from harness facts', () => {
    const fixtures = buildDisposableHarnesses('fixture-run');

    for (const fixture of fixtures) {
      const envelope = selectNativeStdoutEnvelope(fixture.facts);
      expect(envelope.harness).toBe(fixture.harness);
      expect(envelope.channel).toBe(fixture.facts.nativeStdoutChannel);
      expect(envelope.json).toEqual(expect.objectContaining({
        event: 'thoth-mem',
        harness: fixture.harness,
      }));
      expect(JSON.stringify(envelope.json)).not.toContain('rawPayload');
    }
  });

  it('cleans every disposable home deterministically through registered hooks', () => {
    const fixtures = buildDisposableHarnesses('fixture-run');
    const cleanup = fixtures.map((fixture) => fixture.cleanup);

    expect(cleanup).toHaveLength(HARNESSES.length);
    cleanup.forEach((hook) => expect(hook()).toBe(true));
    cleanup.forEach((hook) => expect(hook()).toBe(false));
  });
});