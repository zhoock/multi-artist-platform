import {
  buildArtistAlbumsCatalogPath,
  buildArtistArticlesCatalogPath,
  buildArtistPagePath,
  buildPublicAlbumPagePath,
  buildPublicArticlePagePath,
} from '../seo/publicPagePaths';

describe('publicPagePaths', () => {
  it('builds artist-scoped public URLs', () => {
    expect(buildArtistPagePath('my-band')).toBe('/?artist=my-band');
    expect(buildArtistAlbumsCatalogPath('my-band')).toBe('/albums?artist=my-band');
    expect(buildArtistArticlesCatalogPath('my-band')).toBe('/articles?artist=my-band');
    expect(buildPublicAlbumPagePath('debut', 'my-band')).toBe('/albums/debut?artist=my-band');
    expect(buildPublicArticlePagePath('post-1', 'my-band')).toBe('/articles/post-1?artist=my-band');
  });

  it('encodes unsafe slug and id segments', () => {
    expect(buildArtistPagePath('a b')).toBe('/?artist=a%20b');
    expect(buildPublicArticlePagePath('post/id', 'my-band')).toBe(
      '/articles/post%2Fid?artist=my-band'
    );
  });
});
