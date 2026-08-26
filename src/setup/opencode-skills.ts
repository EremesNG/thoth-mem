import { createHash, randomUUID } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

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

export function inspectOpenCodeSkill(source: string, destination: string): { sourceHash: string; destinationHash: string; current: boolean } {
  const sourceHash = hashTree(source);
  if (sourceHash === 'invalid') throw new Error('Packaged OpenCode Skill source is missing or invalid');
  const destinationHash = hashTree(destination);
  return { sourceHash, destinationHash, current: sourceHash === destinationHash };
}

export function stageOpenCodeSkill(source: string, destination: string, backup: string): void {
  const staging = join(dirname(destination), `.thoth-mem-skill-staging-${randomUUID()}`);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, staging, { recursive: true, errorOnExist: true, dereference: false });
  if (existsSync(destination)) renameSync(destination, backup);
  try {
    renameSync(staging, destination);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    if (existsSync(backup) && !existsSync(destination)) renameSync(backup, destination);
    throw error;
  }
}

export function restoreOpenCodeSkill(destination: string, backup: string, existed: boolean): void {
  if (existsSync(backup)) {
    rmSync(destination, { recursive: true, force: true });
    renameSync(backup, destination);
    return;
  }
  if (!existed) rmSync(destination, { recursive: true, force: true });
}
