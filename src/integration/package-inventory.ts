export type PackageHarness = 'opencode' | 'codex' | 'claude-code';
export interface PublicDistributionInventory { marketplaces: Record<'codex' | 'claude-code', string>; assets: string[] }
export interface IntegrationInventory { schemaVersion: number; coreVersion: string; shared: string[]; harnesses: Record<string, string[]>; publicDistribution: PublicDistributionInventory }

export const CANONICAL_PLUGIN_INVENTORY: Record<PackageHarness, string[]> = {
  opencode: ['skills/thoth-mem/SKILL.md','skills/thoth-mem/references/opencode.md'],
  codex: ['manifest.json','.codex-plugin/plugin.json','mcp.json','hooks/hooks.json','runner.mjs','skills/thoth-mem/SKILL.md','skills/thoth-mem/references/codex.md'],
  'claude-code': ['manifest.json','.claude-plugin/plugin.json','.mcp.json','hooks/hooks.json','runner.mjs','skills/thoth-mem/SKILL.md','skills/thoth-mem/references/claude-code.md'],
};

export const CANONICAL_PUBLIC_PLUGIN_INVENTORY = [
  '.codex-plugin/plugin.json',
  '.claude-plugin/plugin.json',
  '.mcp.json',
  'hooks/hooks.json',
  'hooks/claude-hooks.json',
  'runners/public-runner.mjs',
  'runtime.json',
  'distribution-lock.json',
  'skills/thoth-mem/SKILL.md',
  'skills/thoth-mem/references/codex.md',
  'skills/thoth-mem/references/claude-code.md',
];

export function validateIntegrationInventory(value: unknown): IntegrationInventory {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Integration inventory must be an object');
  const inventory = value as IntegrationInventory;
  if (inventory.schemaVersion !== 2 || typeof inventory.coreVersion !== 'string' || !inventory.coreVersion) throw new Error('Integration inventory version is invalid');
  if (!Array.isArray(inventory.shared) || inventory.shared.length !== 1 || inventory.shared[0] !== 'hook-runner.mjs') throw new Error('Integration inventory must own the exact shared runner');
  if (!inventory.harnesses || Object.keys(inventory.harnesses).sort().join(',') !== ['claude-code','codex','opencode'].join(',')) throw new Error('Integration inventory must own exactly three harnesses');
  for (const harness of Object.keys(CANONICAL_PLUGIN_INVENTORY) as PackageHarness[]) {
    const assets = inventory.harnesses[harness]; if (!Array.isArray(assets)) throw new Error(`Missing ${harness} assets`);
    if (new Set(assets).size !== assets.length) throw new Error(`Duplicate ${harness} asset ownership`);
    if (assets.some((path) => path.includes('..') || path.startsWith('/') || path.includes('identity-tool') || /dashboard|http|graph|vector|hyde/i.test(path))) throw new Error(`Invalid or deferred ${harness} asset`);
    if ([...assets].sort().join('\0') !== [...CANONICAL_PLUGIN_INVENTORY[harness]].sort().join('\0')) throw new Error(`Incomplete ${harness} inventory`);
  }
  const distribution = inventory.publicDistribution;
  if (!distribution || typeof distribution !== 'object') throw new Error('Missing public plugin distribution');
  if (JSON.stringify(distribution.marketplaces) !== JSON.stringify({ codex: '.agents/plugins/marketplace.json', 'claude-code': '.claude-plugin/marketplace.json' })) throw new Error('Public marketplace anchors are invalid');
  if (!Array.isArray(distribution.assets) || new Set(distribution.assets).size !== distribution.assets.length) throw new Error('Public plugin assets are missing or duplicate');
  if (distribution.assets.some((path) => path.includes('..') || path.startsWith('/') || /dashboard|http|graph|vector|hyde/i.test(path))) throw new Error('Invalid or deferred public plugin asset');
  if ([...distribution.assets].sort().join('\0') !== [...CANONICAL_PUBLIC_PLUGIN_INVENTORY].sort().join('\0')) throw new Error('Incomplete public plugin inventory');
  return inventory;
}
