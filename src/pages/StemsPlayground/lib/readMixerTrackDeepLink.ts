export type MixerTrackDeepLinkTarget = {
  albumId: string;
  trackId: string;
};

/** True when URL targets a specific mixer track (`?artist=&album=&track=`), not a shared mix route. */
export function readMixerTrackDeepLinkFromSearchParams(
  params: URLSearchParams,
  options?: { mixId?: string | null; artistSlug?: string | null }
): MixerTrackDeepLinkTarget | null {
  if (options?.mixId) return null;
  const artist = options?.artistSlug?.trim() || params.get('artist')?.trim() || '';
  const albumId = params.get('album')?.trim() || '';
  const trackId = params.get('track')?.trim() || '';
  if (!artist || !albumId || !trackId) return null;
  return { albumId, trackId };
}
