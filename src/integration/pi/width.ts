// Terminal-cell width helpers without a runtime Pi TUI dependency: setup probes
// load dist/pi.js with plain Node, where only type imports are safe.
const SGR = /\x1b\[[0-9;:]*m/uy;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const ZERO_WIDTH = /^[\p{Mn}\p{Me}\p{Cf}]+$/u;
const WIDE = /\p{Extended_Pictographic}|[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6\u{20000}-\u{3fffd}]/u;

function graphemeWidth(grapheme: string): number {
  if (ZERO_WIDTH.test(grapheme)) return 0;
  return WIDE.test(grapheme) ? 2 : 1;
}

/** Split styled text into SGR escapes (width 0) and graphemes. */
function* tokens(text: string): Generator<{ value: string; width: number; escape: boolean }> {
  let index = 0;
  while (index < text.length) {
    SGR.lastIndex = index;
    const escape = SGR.exec(text);
    if (escape) { yield { value: escape[0], width: 0, escape: true }; index += escape[0].length; continue; }
    const next = text.indexOf('\x1b', index + 1);
    const plain = text.slice(index, next === -1 ? text.length : next);
    for (const { segment } of segmenter.segment(plain)) yield { value: segment, width: graphemeWidth(segment), escape: false };
    index += plain.length;
  }
}

export function visibleWidth(text: string): number {
  let width = 0;
  for (const token of tokens(text)) width += token.width;
  return width;
}

/** Truncate to `maxWidth` cells with an ellipsis, closing any open styling. */
export function truncateToWidth(text: string, maxWidth: number): string {
  const limit = Math.max(0, Math.floor(maxWidth));
  if (visibleWidth(text) <= limit) return text;
  if (limit === 0) return '';
  let output = '';
  let width = 0;
  let styled = false;
  for (const token of tokens(text)) {
    if (token.escape) { output += token.value; styled = true; continue; }
    if (width + token.width > limit - 1) break;
    output += token.value;
    width += token.width;
  }
  return `${output}${styled ? '\x1b[0m' : ''}…`;
}
