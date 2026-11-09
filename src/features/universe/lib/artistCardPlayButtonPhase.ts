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

  // Playing state wins over stale "starting" slug (Redux can update before Home clears starting slug).
  if (input.hasActiveQueue && input.activeArtistSlug?.trim() === slug && input.isPlaying) {
    return 'pause';
  }

  if (input.startingArtistSlug?.trim() === slug) {
    return 'starting';
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
