import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

function hashTree(root: string): string {
  if (!existsSync(root) || lstatSync(root).isSymbolicLink() || !statSync(root).isDirectory()) return 'invalid';
  const hash = createHash('sha256');
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Managed OpenCode Skill trees cannot contain symbolic links');
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) hash.update(relative(root, path).replaceAll('\\', '/')).update('\0').update(statSync(path).size.toString()).update('\0').update(readFileSync(path));
      else throw new Error('Managed OpenCode Skill trees may contain only regular files and directories');
    }
  };
  visit(root);
  return hash.digest('hex');
}

/** Only a V1 receipt's exact tree hash grants permission to remove a copied Skill. */
export function inspectOpenCodeSkill(destination: string, receiptPath: string): { remove: boolean; warnings: string[] } {
  let exists = false;
  try { lstatSync(destination); exists = true; } catch { /* No copied Skill. */ }
  if (!exists) return { remove: false, warnings: [] };
  try {
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8')) as Record<string, unknown>;
    if (receipt.schemaVersion === 1 && receipt.host === 'opencode' && receipt.result === 'complete' &&
        receipt.skillPath === destination && typeof receipt.skillHash === 'string' &&
        /^[a-f0-9]{64}$/u.test(receipt.skillHash) && hashTree(destination) === receipt.skillHash) {
      return { remove: true, warnings: [] };
    }
  } catch { /* Unowned, malformed receipt, linked or modified tree: leave untouched. */ }
  return { remove: false, warnings: ['Existing thoth-mem Skill was left untouched (unowned or modified); review and remove it manually to avoid duplicate packaged Skill discovery.'] };
}

export function restoreOpenCodeSkill(destination: string, backup: string, existed: boolean): void {
  if (existsSync(backup)) {
    rmSync(destination, { recursive: true, force: true });
    renameSync(backup, destination);
    return;
  }
  if (!existed) rmSync(destination, { recursive: true, force: true });
}
