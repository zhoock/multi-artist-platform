const ARTIST_TITLE_SEPARATORS = [' — ', ' – ', ' - '] as const;

/**
 * When the queue row title already includes the artist prefix (e.g. "Beatles - Song"),
 * drop it for the mobile mini-player second line where the artist is shown above.
 */
export function stripRedundantArtistPrefixFromTrackTitle(artist: string, title: string): string {
  const artistTrimmed = artist.trim();
  const titleTrimmed = title.trim();
  if (!artistTrimmed || !titleTrimmed) return titleTrimmed;

  const artistLower = artistTrimmed.toLocaleLowerCase();
  const titleLower = titleTrimmed.toLocaleLowerCase();
  if (!titleLower.startsWith(artistLower)) return titleTrimmed;

  const suffix = titleTrimmed.slice(artistTrimmed.length);
  for (const separator of ARTIST_TITLE_SEPARATORS) {
    if (suffix.startsWith(separator)) {
      const stripped = suffix.slice(separator.length).trim();
      return stripped || titleTrimmed;
    }
  }

  return titleTrimmed;
}
