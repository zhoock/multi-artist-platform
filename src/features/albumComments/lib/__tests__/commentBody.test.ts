import { isSubmittableCommentBody, MAX_ALBUM_COMMENT_CHARS } from '../commentBody';

describe('commentBody', () => {
  test('rejects whitespace-only', () => {
    expect(isSubmittableCommentBody('  ')).toBe(false);
  });

  test('accepts within limit', () => {
    expect(isSubmittableCommentBody('Hello')).toBe(true);
    expect(isSubmittableCommentBody('x'.repeat(MAX_ALBUM_COMMENT_CHARS))).toBe(true);
    expect(isSubmittableCommentBody('x'.repeat(MAX_ALBUM_COMMENT_CHARS + 1))).toBe(false);
  });
});
