import { hasArticleCover } from '../articleCoverUrl';

describe('hasArticleCover', () => {
  test('returns false for null, undefined, empty, and legacy keys', () => {
    expect(hasArticleCover(null)).toBe(false);
    expect(hasArticleCover(undefined)).toBe(false);
    expect(hasArticleCover('')).toBe(false);
    expect(hasArticleCover('   ')).toBe(false);
    expect(hasArticleCover('recording_album_legacy.jpg')).toBe(false);
  });

  test('returns true for article_cover storage keys', () => {
    expect(hasArticleCover('article_cover_abc_photo.jpg')).toBe(true);
    expect(hasArticleCover('  article_cover_abc_photo.jpg  ')).toBe(true);
  });
});
