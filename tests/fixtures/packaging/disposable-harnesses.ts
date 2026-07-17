import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const HARNESSES = ['opencode', 'codex', 'claude-code'] as const;
export type HarnessName = (typeof HARNESSES)[number];

export interface DisposableHome {
  root: string;
  isRealHome: false;
  externalServerStarted: false;
}

export interface HarnessFacts {
  harness: HarnessName;
  hostVersion: string;
  payloadMapping: string;
  nativeStdoutChannel: string;
  activationMarker: string;
}

export interface PackedTarballInput {
  archiveName: string;
  bytes: Uint8Array;
  requiresCredentials: false;
  sourceCheckoutPath?: never;
}

export interface NativeStdoutEnvelope {
  harness: HarnessName;
  channel: string;
  json: Record<string, unknown>;
}

export interface DisposableHarness {
  harness: HarnessName;
  home: DisposableHome;
  facts: HarnessFacts;
  guards: { usesCheckout: false; usesCredentials: false };
  cleanup: () => boolean;
}

const FACTS: Record<HarnessName, Omit<HarnessFacts, 'harness'>> = {
  opencode: {
    hostVersion: '1.fixture',
    payloadMapping: 'opencode-session-start-v1',
    nativeStdoutChannel: 'output.context',
    activationMarker: 'opencode.activation.fixture',
  },
  codex: {
    hostVersion: '0.fixture',
    payloadMapping: 'codex-session-start-v1',
    nativeStdoutChannel: 'stdout.context',
    activationMarker: 'codex.activation.fixture',
  },
  'claude-code': {
    hostVersion: '1.fixture',
    payloadMapping: 'claude-session-start-v1',
    nativeStdoutChannel: 'stdout.system',
    activationMarker: 'claude-code.activation.fixture',
  },
};

export function createPackedTarballInput(runId: string): PackedTarballInput {
  const manifest = JSON.stringify({ name: 'thoth-mem', runId, packed: true });
  return {
    archiveName: `thoth-mem-${runId}.tgz`,
    bytes: new TextEncoder().encode(manifest),
    requiresCredentials: false,
  };
}

export function buildDisposableHarnesses(runId: string): DisposableHarness[] {
  return HARNESSES.map((harness) => {
    const root = mkdtempSync(join(tmpdir(), `thoth-disposable-${runId}-`));
    let cleaned = false;
    return {
      harness,
      home: { root, isRealHome: false, externalServerStarted: false },
      facts: { harness, ...FACTS[harness] },
      guards: { usesCheckout: false, usesCredentials: false },
      cleanup: () => {
        if (cleaned) return false;
        rmSync(root, { recursive: true, force: true });
        cleaned = true;
        return true;
      },
    };
  });
}

export function selectNativeStdoutEnvelope(facts: HarnessFacts): NativeStdoutEnvelope {
  return {
    harness: facts.harness,
    channel: facts.nativeStdoutChannel,
    json: {
      event: 'thoth-mem',
      harness: facts.harness,
      channel: facts.nativeStdoutChannel,
      activation: facts.activationMarker,
      mapping: facts.payloadMapping,
    },
  };
}