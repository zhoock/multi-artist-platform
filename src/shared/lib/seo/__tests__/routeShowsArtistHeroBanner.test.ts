import { routeShowsArtistHeroBanner } from '../routeShowsArtistHeroBanner';

describe('routeShowsArtistHeroBanner', () => {
  test('shows hero on artist profile hub', () => {
    expect(routeShowsArtistHeroBanner('/')).toBe(true);
  });

  test('shows hero on artist-scoped catalogs', () => {
    expect(routeShowsArtistHeroBanner('/albums')).toBe(true);
    expect(routeShowsArtistHeroBanner('/articles')).toBe(true);
  });

  test('hides hero on album, article, and stems detail routes', () => {
    expect(routeShowsArtistHeroBanner('/albums/rubber-soul')).toBe(false);
    expect(routeShowsArtistHeroBanner('/articles/post-1')).toBe(false);
    expect(routeShowsArtistHeroBanner('/stems')).toBe(false);
    expect(routeShowsArtistHeroBanner('/stems/mix/abc')).toBe(false);
  });

  test('shows hero on unrelated public routes', () => {
    expect(routeShowsArtistHeroBanner('/help')).toBe(true);
    expect(routeShowsArtistHeroBanner('/offer')).toBe(true);
    expect(routeShowsArtistHeroBanner('/privacy')).toBe(true);
  });
});
