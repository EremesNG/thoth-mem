export const TOOL_OUTPUT_MAX_CHARS = 20_000;
const TRUNCATION_WARNING = 'payload_truncated';

interface BoundedJson {
  text: string;
  structuredContent: Record<string, unknown>;
  isError?: true;
}
interface Container {
  value: Record<string, unknown>;
  array: unknown[] | null;
  parent?: Container;
  size: number;
  active: boolean;
}
interface StringSlot {
  parent: Container;
  key: string;
  value: string;
  length: number;
  size: number;
  order: number;
}

function tooLarge(): BoundedJson {
  const structuredContent = {
    schema: 'thoth-mem.mcp.error',
    error: { code: 'output_too_large', message: 'Tool output cannot fit within 20000 characters; narrow the request.', retryable: false },
    warnings: [TRUNCATION_WARNING],
  };
  return { text: JSON.stringify(structuredContent), structuredContent, isError: true };
}

function resize(node: Container | undefined, delta: number): void {
  for (; node; node = node.parent) node.size += delta;
}

function compareStrings(left: StringSlot, right: StringSlot): number {
  return right.length - left.length || left.order - right.order;
}

/** Bound one JSON envelope without mutating it; lengths are serialized UTF-16 units. */
export function boundedJson(envelope: Record<string, unknown>): BoundedJson {
  let original: string;
  try { original = JSON.stringify(envelope); } catch { return tooLarge(); }
  if (typeof original !== 'string') return tooLarge();
  if (original.length <= TOOL_OUTPUT_MAX_CHARS) return { text: original, structuredContent: envelope };

  const parsed: unknown = JSON.parse(original);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return tooLarge();
  const structuredContent = parsed as Record<string, unknown>;
  // Keep the required marker first so trailing warning removal cannot discard it.
  const warnings = [TRUNCATION_WARNING, ...(Array.isArray(structuredContent.warnings) ? structuredContent.warnings.filter((warning) => warning !== TRUNCATION_WARNING) : [])];
  structuredContent.warnings = warnings;
  const containers: Container[] = [];
  const byValue = new WeakMap<object, Container>();
  const strings: StringSlot[] = [];
  const pending: Array<{ value: unknown; parent?: Container; key: string }> = [{ value: structuredContent, key: '' }];
  while (pending.length > 0) {
    const slot = pending.pop()!;
    if (typeof slot.value !== 'object' || slot.value === null) {
      const size = JSON.stringify(slot.value).length;
      slot.parent!.size += size;
      if (typeof slot.value === 'string') {
        const length = Array.from(slot.value).length;
        if (length > 64) strings.push({ parent: slot.parent!, key: slot.key, value: slot.value, length, size, order: strings.length });
      }
      continue;
    }
    const value = slot.value as Record<string, unknown>;
    const keys = Object.keys(value);
    const array = Array.isArray(slot.value) ? slot.value : null;
    const node: Container = { value, array, parent: slot.parent, size: 2 + Math.max(0, keys.length - 1), active: true };
    if (!array) node.size += keys.reduce((size, key) => size + JSON.stringify(key).length + 1, 0);
    containers.push(node);
    byValue.set(value, node);
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index]!;
      pending.push({ value: value[key], parent: node, key });
    }
  }
  for (let index = containers.length - 1; index > 0; index -= 1) {
    const node = containers[index]!;
    node.parent!.size += node.size;
  }
  const root = containers[0]!;
  strings.sort(compareStrings);
  while (root.size > TOOL_OUTPUT_MAX_CHARS && strings.length > 0) {
    const slot = strings.shift()!;
    const length = Math.max(64, Math.floor(slot.length / 2));
    const value = `${Array.from(slot.value).slice(0, length - 1).join('')}…`;
    const size = JSON.stringify(value).length;
    slot.parent.value[slot.key] = value;
    resize(slot.parent, size - slot.size);
    slot.value = value;
    slot.length = length;
    slot.size = size;
    if (length > 64) {
      let low = 0;
      let high = strings.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (compareStrings(slot, strings[middle]!) < 0) high = middle;
        else low = middle + 1;
      }
      strings.splice(low, 0, slot);
    }
  }

  const arrays = containers.filter((node) => node.array);
  while (root.size > TOOL_OUTPUT_MAX_CHARS) {
    let largest: Container | undefined;
    for (const node of arrays) {
      if (!node.active || node.array!.length === 0 || (node.array === warnings && warnings.length === 1)) continue;
      if (!largest || node.size > largest.size) largest = node;
    }
    if (!largest) return tooLarge();
    const array = largest.array!;
    const removed = array.pop();
    const child = typeof removed === 'object' && removed !== null ? byValue.get(removed) : undefined;
    resize(largest, -(child?.size ?? JSON.stringify(removed).length) - (array.length > 0 ? 1 : 0));
    // Detached nested arrays must never win a later largest-array selection.
    if (child) {
      const detached = [child];
      while (detached.length > 0) {
        const node = detached.pop()!;
        node.active = false;
        for (const value of Object.values(node.value)) {
          if (typeof value === 'object' && value !== null) detached.push(byValue.get(value)!);
        }
      }
    }
  }
  return { text: JSON.stringify(structuredContent), structuredContent };
}
