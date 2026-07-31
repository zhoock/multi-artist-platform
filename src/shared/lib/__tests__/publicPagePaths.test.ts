import {
  buildArtistAlbumsCatalogPath,
  buildArtistArticlesCatalogPath,
  buildArtistPagePath,
  buildLocalizedPublicPathWithArtist,
  buildPublicAlbumPagePath,
  buildPublicArticlePagePath,
  buildSharedMixPagePath,
} from '../seo/publicPagePaths';

describe('publicPagePaths — localized semantic builders', () => {
  test('buildArtistPagePath', () => {
    expect(buildArtistPagePath('en', 'my-band')).toBe('/en?artist=my-band');
    expect(buildArtistPagePath('ru', 'my-band')).toBe('/ru?artist=my-band');
    expect(buildArtistPagePath('en', 'a b')).toBe('/en?artist=a+b');
  });

  test('artist-scoped catalog paths', () => {
    expect(buildArtistAlbumsCatalogPath('en', 'my-band')).toBe('/en/albums?artist=my-band');
    expect(buildArtistArticlesCatalogPath('ru', 'my-band')).toBe('/ru/articles?artist=my-band');
  });

  test('detail page paths', () => {
    expect(buildPublicAlbumPagePath('en', 'debut', 'my-band')).toBe(
      '/en/albums/debut?artist=my-band'
    );
    expect(buildPublicArticlePagePath('ru', 'post-1', 'my-band')).toBe(
      '/ru/articles/post-1?artist=my-band'
    );
    expect(buildPublicArticlePagePath('en', 'post/id', 'my-band')).toBe(
      '/en/articles/post%2Fid?artist=my-band'
    );
    expect(buildSharedMixPagePath('ru', 'mix-uuid')).toBe('/ru/stems/mix/mix-uuid');
  });

  test('buildLocalizedPublicPathWithArtist', () => {
    expect(buildLocalizedPublicPathWithArtist('en', '/stems', 'my-band')).toBe(
      '/en/stems?artist=my-band'
    );
  });
});
