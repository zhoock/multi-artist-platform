import {
  getArticleListDraftBadge,
  hasArticleDraftChanges,
  isArticleNeverPublished,
  isArticlePublished,
} from '../articleVisibilityOptions';

describe('articleVisibilityOptions', () => {
  it('detects never-published articles', () => {
    expect(isArticleNeverPublished({ isDraft: true })).toBe(true);
    expect(isArticlePublished({ isDraft: true })).toBe(false);
  });

  it('detects published articles and draft changes', () => {
    expect(isArticlePublished({ isDraft: false })).toBe(true);
    expect(hasArticleDraftChanges({ isDraft: false, hasDraftChanges: true })).toBe(true);
    expect(hasArticleDraftChanges({ isDraft: false, hasDraftChanges: false })).toBe(false);
    expect(hasArticleDraftChanges({ isDraft: true, hasDraftChanges: true })).toBe(false);
  });

  it('returns correct list draft badge', () => {
    expect(getArticleListDraftBadge({ isDraft: true })).toBe('draft');
    expect(getArticleListDraftBadge({ isDraft: false, hasDraftChanges: true })).toBe(
      'draft-changes'
    );
    expect(getArticleListDraftBadge({ isDraft: false, hasDraftChanges: false })).toBeNull();
  });
});
