import { matchPath } from 'react-router-dom';

/** Detail / tool routes where the large artist hero is omitted (content-first layout). */
const ARTIST_HERO_BANNER_HIDDEN_ROUTES = [
  '/albums/:albumId',
  '/articles/:articleId',
  '/stems/mix/:mixId',
  '/stems',
] as const;

export function routeShowsArtistHeroBanner(pathnameWithoutLang: string): boolean {
  return !ARTIST_HERO_BANNER_HIDDEN_ROUTES.some((path) =>
    matchPath({ path, end: true }, pathnameWithoutLang)
  );
}
