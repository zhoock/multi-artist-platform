import { buildReplyDraftWithMention, splitCommentBodyIntoSegments } from '../commentMentions';

describe('commentMentions', () => {
  describe('buildReplyDraftWithMention', () => {
    test('prefixes @handle and trailing space when handle exists', () => {
      expect(buildReplyDraftWithMention('beatles')).toBe('@beatles ');
    });

    test('returns empty string when handle missing', () => {
      expect(buildReplyDraftWithMention(null)).toBe('');
      expect(buildReplyDraftWithMention('  ')).toBe('');
    });
  });

  describe('splitCommentBodyIntoSegments', () => {
    test('splits leading mention from reply body', () => {
      expect(splitCommentBodyIntoSegments('@jane Great track!')).toEqual([
        { kind: 'mention', value: '@jane' },
        { kind: 'text', value: ' Great track!' },
      ]);
    });

    test('keeps plain text as single segment', () => {
      expect(splitCommentBodyIntoSegments('No mention')).toEqual([
        { kind: 'text', value: 'No mention' },
      ]);
    });
  });
});
