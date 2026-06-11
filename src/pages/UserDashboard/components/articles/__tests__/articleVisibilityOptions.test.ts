import { isArticleDraft } from '../articleVisibilityOptions';

describe('isArticleDraft', () => {
  it('returns true only when isDraft is explicitly true', () => {
    expect(isArticleDraft({ isDraft: true })).toBe(true);
    expect(isArticleDraft({ isDraft: false })).toBe(false);
    expect(isArticleDraft({})).toBe(false);
  });
});
