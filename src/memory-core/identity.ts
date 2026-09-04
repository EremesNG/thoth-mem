import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

export function resolveProjectIdentity(input: { name: string; root?: string; verifiedKey?: string }): { key: string; name: string; rootHint: string | null; degraded: boolean } {
  if (input.verifiedKey?.trim()) return { key: input.verifiedKey.trim(), name: input.name.trim(), rootHint: input.root ? resolve(input.root) : null, degraded: false };
  if (!input.root?.trim()) throw new Error('Project identity cannot be verified');
  const normalized = resolve(input.root).toLocaleLowerCase();
  return { key: `path:${createHash('sha256').update(normalized).digest('hex')}`, name: input.name.trim(), rootHint: normalized, degraded: true };
}
