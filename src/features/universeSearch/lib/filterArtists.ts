import type { SceneArtist } from '@components/view/universe3dTypes';

export const UNIVERSE_SEARCH_SUGGESTION_LIMIT = 8;

export function filterArtistsForSearch(
  artists: SceneArtist[],
  query: string,
  lang: 'ru' | 'en'
): SceneArtist[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return artists.filter((artist) => {
    const name = artist.name.toLowerCase();
    const slug = artist.publicSlug.toLowerCase();
    const genre = (artist.genreLabel?.[lang] ?? artist.genreCode).toLowerCase();
    return name.includes(q) || slug.includes(q) || genre.includes(q);
  });
}

export function matchedSlugsFromQuery(
  artists: SceneArtist[],
  query: string,
  lang: 'ru' | 'en'
): string[] {
  return filterArtistsForSearch(artists, query, lang).map((a) => a.publicSlug);
}
