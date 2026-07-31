import { buildDynamicSitemapEntries } from '../seo/buildDynamicSitemapEntries';

describe('buildDynamicSitemapEntries', () => {
  it('includes platform routes and public artist content URLs', () => {
    const entries = buildDynamicSitemapEntries({
      artists: [
        {
          public_slug: 'my-band',
          updated_at: '2026-07-01T00:00:00.000Z',
          has_public_albums: true,
          has_public_articles: true,
        },
      ],
      albums: [
        {
          public_slug: 'my-band',
          album_id: 'debut',
          updated_at: '2026-07-10T00:00:00.000Z',
        },
      ],
      articles: [
        {
          public_slug: 'my-band',
          article_id: 'hello-world',
          updated_at: '2026-07-15T00:00:00.000Z',
        },
      ],
    });

    const paths = entries.map((entry) => entry.path);

    expect(paths).toContain('/');
    expect(paths).toContain('/albums');
    expect(paths).toContain('/articles');
    expect(paths).toContain('/stems');
    expect(paths).toContain('/offer');
    expect(paths).toContain('/privacy');
    expect(paths).toContain('/?artist=my-band');
    expect(paths).toContain('/albums?artist=my-band');
    expect(paths).toContain('/albums/debut?artist=my-band');
    expect(paths).toContain('/articles?artist=my-band');
    expect(paths).toContain('/articles/hello-world?artist=my-band');
  });

  it('skips artist catalog URLs when artist has no public albums or articles', () => {
    const entries = buildDynamicSitemapEntries({
      artists: [
        {
          public_slug: 'profile-only',
          updated_at: null,
          has_public_albums: false,
          has_public_articles: false,
        },
      ],
      albums: [],
      articles: [],
    });

    const paths = entries.map((entry) => entry.path);

    expect(paths).toContain('/?artist=profile-only');
    expect(paths).not.toContain('/albums?artist=profile-only');
    expect(paths).not.toContain('/articles?artist=profile-only');
  });

  it('deduplicates paths and keeps the newest lastmod', () => {
    const entries = buildDynamicSitemapEntries({
      artists: [
        {
          public_slug: 'dup',
          updated_at: '2026-01-01T00:00:00.000Z',
          has_public_albums: true,
          has_public_articles: false,
        },
      ],
      albums: [
        {
          public_slug: 'dup',
          album_id: 'same',
          updated_at: '2026-02-01T00:00:00.000Z',
        },
        {
          public_slug: 'dup',
          album_id: 'same',
          updated_at: '2026-03-01T00:00:00.000Z',
        },
      ],
      articles: [],
    });

    const albumEntries = entries.filter((entry) => entry.path === '/albums/same?artist=dup');
    expect(albumEntries).toHaveLength(1);
    expect(albumEntries[0]?.lastmod).toBe('2026-03-01');
  });
});
