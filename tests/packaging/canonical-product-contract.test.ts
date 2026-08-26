import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const expectedCapabilities = [
  'cli',
  'config',
  'evals',
  'harness-integration',
  'packaging',
  'retrieval',
  'store',
  'tools',
];

const retiredCapabilities = [
  'dashboard-control-room',
  'dashboard-design-system',
  'dashboard-memory-navigation',
  'dashboard',
  'http-api',
  'indexing',
  'knowledge-graph',
  'observability',
  'sync',
  'visualization-api',
];

const requiredTitles = [
  'SQLite Memory Ledger MUST Be the Sole Source of Truth',
  'Progressive Retrieval MUST Use Stable IDs and Bounded Escalation',
  'MCP Surface MUST Be Compact and Workflow-Level',
  'Every Native Plugin MUST Bundle Hooks, MCP, and Skills',
  'Published Package MUST Contain Native Assets for All Three Harnesses',
  'Evals MUST Compare Equal-Budget Retrieval Lanes Against the Lexical Baseline',
];

const forbiddenAffirmativeRequirements = [
  /### Requirement: .*Dashboard/i,
  /### Requirement: .*HTTP/i,
  /### Requirement: .*Knowledge Graph/i,
  /### Requirement: .*sqlite-vec/i,
  /### Requirement: .*HyDE/i,
  /### Requirement: .*Sync/i,
  /### Requirement: .*Observability/i,
];

describe('canonical product contract', () => {
  it('contains exactly the eight current capabilities', () => {
    const capabilities = readdirSync('openspec/specs', { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(capabilities).toEqual(expectedCapabilities);
    expect(capabilities).not.toEqual(expect.arrayContaining(retiredCapabilities));
  });

  it('keeps current invariants and no affirmative retired requirements', () => {
    const canonical = expectedCapabilities
      .map((capability) => readFileSync(join('openspec', 'specs', capability, 'spec.md'), 'utf8'))
      .join('\n');
    const transitionalGeneration = `v${2}`;
    const transitionalLabel = new RegExp(String.raw`\b${transitionalGeneration}\b|[-_.]${transitionalGeneration}\b|${transitionalGeneration}[-_.]`, 'i');

    for (const title of requiredTitles) expect(canonical).toContain(`### Requirement: ${title}`);
    for (const pattern of forbiddenAffirmativeRequirements) expect(canonical).not.toMatch(pattern);
    expect(canonical).not.toMatch(transitionalLabel);
  });

  it('describes the actual current repository context', () => {
    const context = readFileSync('openspec/config.yaml', 'utf8');

    expect(context).toContain('Node.js >=22.12.0');
    expect(context).toContain('src/memory-core/');
    expect(context).toContain('exactly six MCP tools');
    expect(context).not.toContain('src/ with store/, tools/, utils/, sync/, http-* modules');
    expect(context).not.toContain('CI: none configured');
  });
});
