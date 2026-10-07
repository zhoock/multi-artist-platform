export type ArtistCardPlayButtonPhase = 'starting' | 'pause' | 'play';

export type ArtistCardPlayPlayerSnapshot = {
  startingArtistSlug: string | null;
  activeArtistSlug: string | null;
  isPlaying: boolean;
  hasActiveQueue: boolean;
};

export function resolveArtistCardPlayButtonPhase(
  input: {
    cardArtistSlug: string;
  } & ArtistCardPlayPlayerSnapshot
): ArtistCardPlayButtonPhase {
  const slug = input.cardArtistSlug.trim();
  if (!slug) return 'play';

  if (input.startingArtistSlug?.trim() === slug) {
    return 'starting';
  }

  if (input.hasActiveQueue && input.activeArtistSlug?.trim() === slug && input.isPlaying) {
    return 'pause';
  }

  return 'play';
}

/** Same artist session paused — resume without Artist Play bootstrap. */
export function isArtistCardPlayResume(
  cardArtistSlug: string,
  snapshot: ArtistCardPlayPlayerSnapshot
): boolean {
  const slug = cardArtistSlug.trim();
  const active = snapshot.activeArtistSlug?.trim();
  return Boolean(
    slug &&
      active === slug &&
      snapshot.hasActiveQueue &&
      !snapshot.isPlaying &&
      snapshot.startingArtistSlug?.trim() !== slug
  );
}
