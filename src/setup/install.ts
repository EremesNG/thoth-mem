import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

import { validateIntegrationInventory } from '../integration/package-inventory.js';

export type SetupHarness = 'opencode' | 'codex' | 'claude-code';
export interface SetupReceipt { schemaVersion: 2; harness: SetupHarness; packageVersion: string; installedAt: string; target: string; runtimeEntry: string; assets: string[]; hashes: Record<string, string> }
function fileHash(path: string): string { return createHash('sha256').update(readFileSync(path)).digest('hex'); }

export function installPlugin(input: { harness: SetupHarness; targetRoot: string; force?: boolean; packageRoot?: string; beforeActivate?: () => void }): SetupReceipt {
  const targetRoot = resolve(input.targetRoot); const packageRoot = resolve(input.packageRoot ?? dirname(dirname(fileURLToPath(import.meta.url))));
  const inventory = validateIntegrationInventory(JSON.parse(readFileSync(join(packageRoot, 'integrations', 'inventory.json'), 'utf8')));
  const assets = inventory.harnesses[input.harness]; if (!assets) throw new Error(`Unsupported harness: ${input.harness}`);
  const source = join(packageRoot, 'integrations', input.harness); const destination = join(targetRoot, 'thoth-mem'); const receiptPath = join(destination, '.thoth-mem-managed-v2.json');
  if (existsSync(destination) && !input.force) {
    if (existsSync(receiptPath)) { const existing = JSON.parse(readFileSync(receiptPath, 'utf8')) as SetupReceipt; if (existing.schemaVersion === 2 && existing.harness === input.harness && existing.packageVersion === inventory.coreVersion) { const drift = existing.assets.some((asset) => !existsSync(join(destination, asset)) || existing.hashes?.[asset] !== fileHash(join(destination, asset))); if (!drift) return existing; throw new Error('Managed v2 plugin drift detected; use force to replace owned assets'); } }
    throw new Error('Target exists without a matching managed v2 receipt');
  }
  mkdirSync(targetRoot, { recursive: true }); const operationId = randomUUID(); const staging = join(targetRoot, `.thoth-mem-staging-${operationId}`); const backup = join(targetRoot, `.thoth-mem-backup-${operationId}`); let backedUp = false;
  try {
    cpSync(source, staging, { recursive: true, errorOnExist: true });
    const receipt: SetupReceipt = { schemaVersion: 2, harness: input.harness, packageVersion: inventory.coreVersion, installedAt: new Date().toISOString(), target: destination, runtimeEntry: join(packageRoot, 'dist', 'index.js'), assets, hashes: Object.fromEntries(assets.map((asset) => [asset, fileHash(join(staging, asset))])) };
    writeFileSync(join(staging, '.thoth-mem-managed-v2.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
    if (existsSync(destination)) { renameSync(destination, backup); backedUp = true; }
    input.beforeActivate?.();
    renameSync(staging, destination); if (backedUp) rmSync(backup, { recursive: true, force: true }); return receipt;
  } catch (error) { if (existsSync(staging)) rmSync(staging, { recursive: true, force: true }); if (backedUp && !existsSync(destination) && existsSync(backup)) renameSync(backup, destination); throw error; }
}
