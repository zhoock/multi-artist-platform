import {
  buildArtistPageCanonicalPath,
  buildArtistPageSeo,
  platformSeoForLang,
  truncateSeoDescription,
} from '@shared/constants/platformBranding';

describe('platformBranding artist SEO', () => {
  const origin = 'https://example.com';

  it('buildArtistPageCanonicalPath encodes slug', () => {
    expect(buildArtistPageCanonicalPath('my-artist')).toBe('/?artist=my-artist');
    expect(buildArtistPageCanonicalPath('a b')).toBe('/?artist=a%20b');
  });

  it('truncateSeoDescription trims and ellipsizes long text', () => {
    const long = 'word '.repeat(40).trim();
    const truncated = truncateSeoDescription(long, 50);
    expect(truncated.length).toBeLessThanOrEqual(50);
    expect(truncated.endsWith('…')).toBe(true);
  });

  it('buildArtistPageSeo uses platform fallback when artist name is missing', () => {
    const seo = buildArtistPageSeo(
      { lang: 'ru', artistSlug: 'demo', artistName: '', aboutText: null },
      `${origin}/?artist=demo`
    );

    expect(seo.title).toBe(platformSeoForLang('ru').title);
    expect(seo.description).toBe(platformSeoForLang('ru').description);
    expect(seo.canonical).toBe(`${origin}/?artist=demo`);
    expect(seo.isArtistSpecific).toBe(false);
  });

  it('buildArtistPageSeo uses platform fallback when forced', () => {
    const seo = buildArtistPageSeo(
      {
        lang: 'en',
        artistSlug: 'demo',
        artistName: 'Band X',
        aboutText: 'Bio',
        forcePlatformFallback: true,
      },
      `${origin}/?artist=demo`
    );

    expect(seo.title).toBe(platformSeoForLang('en').title);
    expect(seo.isArtistSpecific).toBe(false);
    expect(seo.canonical).toBe(`${origin}/?artist=demo`);
  });

  it('buildArtistPageSeo builds artist-specific title and about description', () => {
    const seo = buildArtistPageSeo(
      {
        lang: 'ru',
        artistSlug: 'demo',
        artistName: 'Артист',
        aboutText: '  Короткое описание артиста.  ',
      },
      `${origin}/?artist=demo`
    );

    expect(seo.title).toBe('Артист — Название сайта');
    expect(seo.description).toBe('Короткое описание артиста.');
    expect(seo.isArtistSpecific).toBe(true);
  });

  it('buildArtistPageSeo uses template description without about text', () => {
    const seo = buildArtistPageSeo(
      {
        lang: 'en',
        artistSlug: 'demo',
        artistName: 'Artist X',
        aboutText: null,
      },
      `${origin}/?artist=demo`
    );

    expect(seo.title).toBe('Artist X — Site Name');
    expect(seo.description).toBe('Artist X: albums, articles, and music on Site Name.');
    expect(seo.isArtistSpecific).toBe(true);
  });
});
