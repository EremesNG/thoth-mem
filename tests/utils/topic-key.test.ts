import { describe, it, expect } from 'vitest';
import { suggestTopicKey } from '../../src/utils/topic-key.js';

describe('suggestTopicKey', () => {
  it('uses architecture prefix', () => {
    expect(suggestTopicKey('JWT auth middleware', 'architecture')).toBe('architecture/jwt-auth-middleware');
  });

  it('uses bug prefix for bugfix', () => {
    expect(suggestTopicKey('Fixed N+1 in user list', 'bugfix')).toBe('bug/fixed-n-1-in-user-list');
  });

  it('uses decision, pattern, config, discovery, learning, and session prefixes', () => {
    expect(suggestTopicKey('Pick cache strategy', 'decision')).toBe('decision/pick-cache-strategy');
    expect(suggestTopicKey('Validate input shape', 'pattern')).toBe('pattern/validate-input-shape');
    expect(suggestTopicKey('Tune config defaults', 'config')).toBe('config/tune-config-defaults');
    expect(suggestTopicKey('Found edge case', 'discovery')).toBe('discovery/found-edge-case');
    expect(suggestTopicKey('Learned retries', 'learning')).toBe('learning/learned-retries');
    expect(suggestTopicKey('Session recap', 'session_summary')).toBe('session/session-recap');
  });

  it('does not add a prefix for manual or undefined types', () => {
    expect(suggestTopicKey('Manual topic', 'manual')).toBe('manual-topic');
    expect(suggestTopicKey('Manual topic')).toBe('manual-topic');
  });

  it('replaces special chars with hyphens and collapses them', () => {
    expect(suggestTopicKey('Hello, world! @ 2026')).toBe('hello-world-2026');
    expect(suggestTopicKey('Hello --- world')).toBe('hello-world');
  });

  it('trims leading and trailing hyphens', () => {
    expect(suggestTopicKey('---Topic---')).toBe('topic');
  });

  it('falls back to the first content line when title is empty', () => {
    expect(suggestTopicKey('', undefined, 'Some content here\nMore lines')).toBe('some-content-here');
  });

  it('returns empty string when title and content are empty', () => {
    expect(suggestTopicKey('', undefined, '')).toBe('');
    expect(suggestTopicKey('   ', 'manual', '   ')).toBe('');
  });

  it('caps the key at 100 characters', () => {
    const key = suggestTopicKey('a'.repeat(200), 'architecture');
    expect(key.length).toBe(100);
  });

  it('turns unicode into hyphens', () => {
    expect(suggestTopicKey('Café déjà vu')).toBe('caf-d-j-vu');
  });
});
