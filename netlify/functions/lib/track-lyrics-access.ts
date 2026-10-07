/**
 * GET /api/track-lyrics read decision.
 * Public artist requests (`?artist=`) match album-details: lyrics are embedded for
 * every viewer who already passed the publication gate — not premium-gated.
 * (Playback / locked tracks remain gated elsewhere.)
 */
export type TrackLyricsReadDecision = 'allow' | 'omit';

export function decideTrackLyricsRead(input: {
  /** Public catalog request (`?artist=`). Absent → authenticated own catalog. */
  hasArtistQuery: boolean;
  authUserId: string | null;
  artistUserId: string;
  monetizationEnabled: boolean;
  hasPremiumAccess: boolean;
}): TrackLyricsReadDecision {
  void input.monetizationEnabled;
  void input.hasPremiumAccess;
  void input.authUserId;
  void input.artistUserId;

  if (!input.hasArtistQuery) {
    return 'allow';
  }

  return 'allow';
}
