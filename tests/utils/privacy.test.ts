import { describe, it, expect } from 'vitest';
import { stripPrivateTags, stripPrivateTagsStrict } from '../../src/utils/privacy.js';

describe('stripPrivateTags', () => {
  it('returns unchanged text when there are no tags', () => {
    expect(stripPrivateTags('hello world')).toBe('hello world');
  });

  it('strips a single private tag block', () => {
    expect(stripPrivateTags('hello <private>secret</private> world')).toBe('hello  world');
  });

  it('strips multi-line content inside a private tag', () => {
    expect(stripPrivateTags('start\n<private>line 1\nline 2\nline 3</private>\nend')).toBe('start\n\nend');
  });

  it('strips multiple private tags', () => {
    expect(stripPrivateTags('a <private>one</private> b <private>two</private> c')).toBe('a  b  c');
  });

  it('matches private tags case-insensitively', () => {
    expect(stripPrivateTags('x <PRIVATE>a</PRIVATE> y <Private>b</Private> z <pRiVaTe>c</pRiVaTe>')).toBe('x  y  z ');
  });

  it('leaves unclosed tags as-is', () => {
    expect(stripPrivateTags('keep <private>open tag')).toBe('keep <private>open tag');
  });

  it('strips empty private tag content', () => {
    expect(stripPrivateTags('before<private></private>after')).toBe('beforeafter');
  });

  it('preserves surrounding text around private tags', () => {
    expect(stripPrivateTags('before <private>hide this</private> after')).toBe('before  after');
  });

  it('collapses excessive newlines after stripping', () => {
    expect(stripPrivateTags('line 1\n\n\n<private>hidden</private>\n\n\nline 2')).toBe('line 1\n\nline 2');
  });

  it('sanitizes root prompt capture privacy tags fail closed', () => {
    expect(stripPrivateTagsStrict('public <private>secret</private> tail')).toEqual({
      text: 'public  tail',
      malformed: false,
      rejected: false,
      removedPrivateContent: true,
    });
    expect(stripPrivateTagsStrict('public prefix<private>secret suffix')).toEqual({
      text: 'public prefix',
      malformed: true,
      rejected: false,
      removedPrivateContent: true,
    });
    expect(stripPrivateTagsStrict('public </private> ambiguous')).toEqual({
      text: '',
      malformed: true,
      rejected: true,
      removedPrivateContent: true,
    });
    expect(stripPrivateTagsStrict('safe prefix<private data-kind="secret">ambiguous suffix')).toEqual({
      text: 'safe prefix',
      malformed: true,
      rejected: false,
      removedPrivateContent: true,
    });
  });
});
