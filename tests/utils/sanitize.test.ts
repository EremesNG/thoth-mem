import { describe, it, expect } from 'vitest';
import { sanitizeFTS, normalizeForHash } from '../../src/utils/sanitize.js';

describe('sanitizeFTS', () => {
  it('quotes simple words', () => {
    expect(sanitizeFTS('fix auth bug')).toBe('"fix" "auth" "bug"');
  });

  it('returns empty string for empty or whitespace input', () => {
    expect(sanitizeFTS('')).toBe('');
    expect(sanitizeFTS('  \t \n ')).toBe('');
  });

  it('quotes FTS5 operators safely', () => {
    expect(sanitizeFTS('AND OR NOT - *')).toBe('"AND" "OR" "NOT" "-" "*"');
  });

  it('escapes quotes in input', () => {
    expect(sanitizeFTS('user\'s "email"')).toBe('"user\'s" "\"\"email\"\""');
  });

  it('preserves unicode', () => {
    expect(sanitizeFTS('café 北京')).toBe('"café" "北京"');
  });

  it('quotes parentheses safely', () => {
    expect(sanitizeFTS('(draft)')).toBe('"(draft)"');
  });

  it('handles a single token', () => {
    expect(sanitizeFTS('hello')).toBe('"hello"');
  });
});

describe('normalizeForHash', () => {
  it('trims whitespace', () => {
    expect(normalizeForHash('  Hello world  ')).toBe('hello world');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeForHash('hello   world')).toBe('hello world');
  });

  it('lowercases', () => {
    expect(normalizeForHash('MiXeD CaSe')).toBe('mixed case');
  });

  it('collapses tabs and newlines', () => {
    expect(normalizeForHash('line1\t\nline2\r\nline3')).toBe('line1 line2 line3');
  });

  it('is deterministic', () => {
    const input = '  Same\nInput  ';
    expect(normalizeForHash(input)).toBe(normalizeForHash(input));
  });

  it('returns empty string for empty input', () => {
    expect(normalizeForHash('')).toBe('');
    expect(normalizeForHash('   ')).toBe('');
  });
});
