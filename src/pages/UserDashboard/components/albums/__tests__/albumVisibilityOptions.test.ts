import {
  albumVisibilityToIsPublic,
  buildAlbumVisibilityMenuOptions,
  getAlbumVisibilityFromIsPublic,
} from '../albumVisibilityOptions';

describe('albumVisibilityOptions', () => {
  it('maps isPublic to track visibility', () => {
    expect(getAlbumVisibilityFromIsPublic(true)).toBe('public');
    expect(getAlbumVisibilityFromIsPublic(false)).toBe('hidden');
    expect(getAlbumVisibilityFromIsPublic(undefined)).toBe('public');
  });

  it('maps visibility back to isPublic', () => {
    expect(albumVisibilityToIsPublic('public')).toBe(true);
    expect(albumVisibilityToIsPublic('hidden')).toBe(false);
  });

  it('builds only visible and hidden menu options', () => {
    const options = buildAlbumVisibilityMenuOptions(undefined, 'en');

    expect(options).toHaveLength(2);
    expect(options.map((o) => o.value)).toEqual(['public', 'hidden']);
    expect(options[0]?.label).toBe('Visible');
    expect(options[1]?.label).toBe('Hidden');
  });
});
