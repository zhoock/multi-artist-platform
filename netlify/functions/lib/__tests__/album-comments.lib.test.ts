import {
  MAX_COMMENT_BODY_CHARS,
  normalizeCommentBody,
  resolveCommentDisplayName,
} from '../album-comment-text';
import { isArtistAccountType } from '../account-type';

describe('album-comments lib', () => {
  describe('normalizeCommentBody', () => {
    test('rejects empty and whitespace-only bodies', () => {
      expect(normalizeCommentBody('').ok).toBe(false);
      expect(normalizeCommentBody('   \n\t  ').ok).toBe(false);
    });

    test('accepts text with surrounding whitespace trimmed logically', () => {
      const result = normalizeCommentBody('  Hello 🔥\n');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.body).toBe('  Hello 🔥\n');
      }
    });

    test('rejects bodies longer than max', () => {
      expect(normalizeCommentBody('x'.repeat(MAX_COMMENT_BODY_CHARS + 1)).ok).toBe(false);
    });
  });

  describe('author.isArtist (users.account_type via isArtistAccountType)', () => {
    test('artist account shows artist badge on own or foreign album', () => {
      expect(isArtistAccountType('artist')).toBe(true);
    });

    test('listener account has no artist badge', () => {
      expect(isArtistAccountType('listener')).toBe(false);
    });
  });

  describe('resolveCommentDisplayName', () => {
    test('prefers site_name then name then username', () => {
      expect(
        resolveCommentDisplayName({
          site_name: ' Band ',
          name: 'Person',
          username: 'slug',
        })
      ).toBe('Band');

      expect(
        resolveCommentDisplayName({
          site_name: '',
          name: ' Person ',
          username: 'slug',
        })
      ).toBe('Person');

      expect(
        resolveCommentDisplayName({
          site_name: null,
          name: null,
          username: 'slug',
        })
      ).toBe('slug');
    });
  });
});
