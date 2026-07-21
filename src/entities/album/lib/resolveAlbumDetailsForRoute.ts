import type { AlbumDetails } from '../model/albumDetails';

export type ResolveAlbumDetailsForRouteInput = {
  resolvedDetails: AlbumDetails | null;
  routeAlbumId: string;
  artistSlug: string | null | undefined;
  slotArtistSlug: string | null;
  slotAlbumId: string | null;
};

/**
 * Album page payload is renderable only when Redux slot identity and payload slug
 * both match the current route. Stale-while-revalidate applies to the same album
 * (refetch / rename after adoptAlbumDetailsAlbumId), not when navigating A → B.
 */
export function resolveAlbumDetailsForRoute(
  input: ResolveAlbumDetailsForRouteInput
): AlbumDetails | undefined {
  const routeAlbumId = input.routeAlbumId.trim();
  const artistSlug = input.artistSlug?.trim() ?? '';
  const resolvedDetails = input.resolvedDetails;

  if (!routeAlbumId || !artistSlug || !resolvedDetails) {
    return undefined;
  }

  const detailsArtistMatches = input.slotArtistSlug === artistSlug;
  const payloadMatchesRoute = resolvedDetails.albumId === routeAlbumId;
  const slotMatchesRoute = input.slotAlbumId === routeAlbumId;

  if (!detailsArtistMatches || !payloadMatchesRoute || !slotMatchesRoute) {
    return undefined;
  }

  return resolvedDetails;
}

export function albumDetailsMatchRoute(input: ResolveAlbumDetailsForRouteInput): boolean {
  return resolveAlbumDetailsForRoute(input) != null;
}
