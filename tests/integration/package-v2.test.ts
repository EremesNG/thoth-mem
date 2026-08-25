import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { validateIntegrationInventory, type IntegrationInventory } from '../../src/integration/package-inventory.js';

describe('canonical v2 integration package inventory', () => {
  const inventory = JSON.parse(readFileSync('integrations/inventory.json', 'utf8')) as IntegrationInventory;

  it('owns one exact hook, MCP, Skill/reference, adapter runner, and manifest bundle per harness', () => {
    const valid = validateIntegrationInventory(inventory);
    expect(valid.shared).toEqual(['hook-runner.mjs']);
    expect(existsSync(join('integrations', 'shared', valid.shared[0]!))).toBe(true);
    for (const [harness, assets] of Object.entries(valid.harnesses)) {
      for (const asset of assets) expect(existsSync(join('integrations', harness, asset)), `${harness}:${asset}`).toBe(true);
      const combined = assets.map((asset) => readFileSync(join('integrations', harness, asset), 'utf8')).join('\n');
      expect(combined).not.toMatch(/thoth_mem_root_identity|dashboard|observatory|sqlite-vec|hyde/i);
    }
  });

  it('rejects missing, duplicate, cross-owner, identity-tool, and deferred inventory entries', () => {
    const clone = (): IntegrationInventory => structuredClone(inventory);
    const missing = clone(); missing.harnesses.codex.pop(); expect(() => validateIntegrationInventory(missing)).toThrow(/incomplete/i);
    const duplicate = clone(); duplicate.harnesses.opencode.push(duplicate.harnesses.opencode[0]!); expect(() => validateIntegrationInventory(duplicate)).toThrow(/duplicate/i);
    const identity = clone(); identity.harnesses.opencode[0] = 'identity-tool.mjs'; expect(() => validateIntegrationInventory(identity)).toThrow(/invalid|deferred/i);
    const deferred = clone(); deferred.harnesses.codex[0] = 'dashboard/manifest.json'; expect(() => validateIntegrationInventory(deferred)).toThrow(/invalid|deferred/i);
    const extraOwner = clone(); extraOwner.harnesses.shared = []; expect(() => validateIntegrationInventory(extraOwner)).toThrow(/exactly three/i);
    const duplicateShared = clone(); duplicateShared.shared.push('hook-runner.mjs'); expect(() => validateIntegrationInventory(duplicateShared)).toThrow(/shared runner/i);
  });
});
