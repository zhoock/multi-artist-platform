/**
 * Invalidate/refetch premium-gated public surfaces after subscription or archive changes.
 * Uses AlbumDetails + Articles + PlayerTrack — never fat `/api/albums` / AlbumEditable.
 */
import type { AppDispatch, RootState } from '@shared/model/appStore/types';
import { getStore } from '@shared/model/appStore';
import {
  fetchAlbumDetailsPage,
  selectAlbumDetailsData,
  type AlbumDetailsData,
} from '@entities/album';
import { fetchAlbumDetails } from '@entities/album/api/fetchAlbumDetails';
import { fetchArticles } from '@entities/article';
import { playerActions, toPlayerTracks } from '@features/player';
import { getUserAudioUrl } from '@shared/api/albums';
import { emptyStringMediaSrc } from '@shared/lib/media/optionalMediaUrl';
import { isTrackPlaybackBlocked } from '@shared/lib/tracks/trackPlayback';
import { setPublicArtistSlug, selectPublicArtistSlug } from '@shared/model/currentArtist';
import { readPublicArtistSlugFromDashboardModalBackground } from '@shared/lib/dashboardModalBackground';
import { readPremiumCheckoutArtistSlug } from '@features/premiumSubscription/lib/premiumSuccessModalStorage';
import type { PlayerTrack } from '@features/player/model/types/playerSchema';

const REFRESH_DEBOUNCE_MS = 50;

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshRunId = 0;
let pendingArtistSlug: string | undefined;
let pendingImmediate = false;

export type RefreshPremiumEntitlementsOptions = {
  /** Skip debounce — use after login/logout or subscription activation. */
  immediate?: boolean;
};

export type EntitlementChangeDetail = {
  artistUserId?: string;
  publicArtistSlug?: string;
  type?: 'added' | 'removed' | 'subscription';
};

function resolveRefreshArtistSlug(explicit?: string | null): string | undefined {
  const trimmed = explicit?.trim();
  if (trimmed) return trimmed;

  if (typeof window !== 'undefined') {
    const fromModalBg = readPublicArtistSlugFromDashboardModalBackground();
    if (fromModalBg) return fromModalBg;

    const params = new URLSearchParams(window.location.search);
    const fromArtist = params.get('artist')?.trim();
    if (fromArtist) return fromArtist;

    const returnTo = params.get('returnTo')?.trim();
    if (returnTo?.startsWith('/')) {
      try {
        const fromReturn = new URL(returnTo, window.location.origin).searchParams
          .get('artist')
          ?.trim();
        if (fromReturn) return fromReturn;
      } catch {
        /* ignore */
      }
    }
  }

  const checkoutSlug = readPremiumCheckoutArtistSlug().trim();
  if (checkoutSlug) return checkoutSlug;

  const storeSlug = selectPublicArtistSlug(getStore().getState());
  return storeSlug?.trim() || undefined;
}

function albumDetailsMatchesPlayerAlbum(
  details: AlbumDetailsData | null | undefined,
  playerAlbumId: string
): details is AlbumDetailsData {
  if (!details?.tracks?.length) return false;
  return details.albumId === playerAlbumId || details.slug === playerAlbumId;
}

function mapAlbumDetailsToPlayerTracks(
  details: AlbumDetailsData,
  playerAlbumId: string
): PlayerTrack[] {
  return toPlayerTracks(
    details.tracks.map((track) => {
      if (isTrackPlaybackBlocked(track)) {
        return { ...track, src: '' };
      }
      return {
        ...track,
        src: emptyStringMediaSrc(
          getUserAudioUrl(track.src, undefined, details.userId),
          'refreshPremiumContent:syncPlayerPlaylist',
          { trackId: track.id, albumUserId: details.userId }
        ),
      };
    }),
    playerAlbumId
  );
}

/**
 * Resolve fresh queue rows from AlbumDetails only.
 * Uses Redux AlbumDetails when it matches the playing album; otherwise fetches
 * mid-weight details for `player.albumMeta.publicSlug` + `player.albumId`
 * (Universe play / mini-player without an open album page).
 */
async function resolvePlaylistTracksForSync(state: RootState): Promise<{
  tracks: PlayerTrack[];
  userId?: string;
} | null> {
  const { player } = state;
  const playerAlbumId = player.albumId?.trim();
  if (!playerAlbumId) return null;

  const cached = selectAlbumDetailsData(state);
  if (albumDetailsMatchesPlayerAlbum(cached, playerAlbumId)) {
    return {
      tracks: mapAlbumDetailsToPlayerTracks(cached, playerAlbumId),
      userId: cached.userId,
    };
  }

  const slug =
    player.albumMeta?.publicSlug?.trim() ||
    selectPublicArtistSlug(state)?.trim() ||
    resolveRefreshArtistSlug();
  if (!slug) return null;

  try {
    const details = await fetchAlbumDetails(slug, playerAlbumId);
    if (!details.tracks.length) return null;
    return {
      tracks: mapAlbumDetailsToPlayerTracks(details, playerAlbumId),
      userId: details.userId,
    };
  } catch {
    return null;
  }
}

async function syncPlayerPlaylistWithAlbumEntitlements(): Promise<void> {
  const store = getStore();
  const state = store.getState();
  const { player } = state;

  if (!player.albumId || player.playlist.length === 0) return;

  const resolved = await resolvePlaylistTracksForSync(state);
  if (!resolved?.tracks.length) return;

  const updatedPlaylist = resolved.tracks;

  const currentTrackId = player.playlist[player.currentTrackIndex]?.id;
  store.dispatch(playerActions.setPlaylist(updatedPlaylist));

  if (currentTrackId) {
    const nextIndex = updatedPlaylist.findIndex((track) => track.id === currentTrackId);
    if (nextIndex >= 0 && nextIndex !== player.currentTrackIndex) {
      store.dispatch(playerActions.setCurrentTrackIndex(nextIndex));
    }
  }
}

async function executePremiumEntitlementsRefresh(
  dispatch: AppDispatch,
  publicArtistSlug?: string
): Promise<void> {
  const runId = ++refreshRunId;

  const slug = resolveRefreshArtistSlug(publicArtistSlug);
  if (slug) {
    dispatch(setPublicArtistSlug(slug));
  }

  const albumDetailsState = getStore().getState().albumDetails;
  const detailsArtistSlug = albumDetailsState.artistSlug?.trim() || slug;
  const detailsAlbumId = albumDetailsState.albumId?.trim();

  try {
    await Promise.all([
      dispatch(fetchArticles({ force: true, publicArtistSlug: slug, forcePublicCatalog: true }))
        .unwrap()
        .catch(() => undefined),
      detailsArtistSlug && detailsAlbumId
        ? dispatch(
            fetchAlbumDetailsPage({
              artistSlug: detailsArtistSlug,
              albumId: detailsAlbumId,
              force: true,
            })
          )
            .unwrap()
            .catch(() => undefined)
        : Promise.resolve(),
    ]);
  } catch {
    /* keep going */
  }
  if (runId !== refreshRunId) return;

  await syncPlayerPlaylistWithAlbumEntitlements();
}

function schedulePremiumEntitlementsRefresh(
  dispatch: AppDispatch,
  publicArtistSlug?: string,
  immediate = false
): void {
  pendingArtistSlug = resolveRefreshArtistSlug(publicArtistSlug ?? pendingArtistSlug);
  pendingImmediate = pendingImmediate || immediate;

  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  const run = () => {
    refreshTimer = null;
    const nextSlug = pendingArtistSlug;
    pendingArtistSlug = undefined;
    pendingImmediate = false;
    void executePremiumEntitlementsRefresh(dispatch, nextSlug);
  };

  if (pendingImmediate) {
    run();
    return;
  }

  refreshTimer = setTimeout(run, REFRESH_DEBOUNCE_MS);
}

export async function awaitPremiumContentRefresh(
  dispatch: AppDispatch,
  publicArtistSlug?: string | null
): Promise<void> {
  await executePremiumEntitlementsRefresh(
    dispatch,
    resolveRefreshArtistSlug(publicArtistSlug?.trim() || undefined)
  );
}

export function refreshPremiumContentForArchiveChange(
  dispatch: AppDispatch,
  publicArtistSlug?: string | null,
  options?: RefreshPremiumEntitlementsOptions
): void {
  schedulePremiumEntitlementsRefresh(
    dispatch,
    publicArtistSlug?.trim() || undefined,
    options?.immediate === true
  );
}

/** @deprecated use refreshPremiumContentForArchiveChange */
export const refreshPremiumContentAfterArchiveUnlock = refreshPremiumContentForArchiveChange;

export const ARCHIVE_ARTIST_ADDED_EVENT = 'archive:artist-added';
export const ARCHIVE_ARTIST_REMOVED_EVENT = 'archive:artist-removed';
export const ARCHIVE_CHANGED_EVENT = 'archive:changed';

export function dispatchArchiveArtistAdded(artistUserId: string, publicArtistSlug?: string): void {
  if (typeof window === 'undefined') return;
  const detail: EntitlementChangeDetail = {
    artistUserId,
    publicArtistSlug: publicArtistSlug?.trim() || resolveRefreshArtistSlug(),
  };
  window.dispatchEvent(new CustomEvent(ARCHIVE_ARTIST_ADDED_EVENT, { detail }));
  window.dispatchEvent(
    new CustomEvent(ARCHIVE_CHANGED_EVENT, { detail: { ...detail, type: 'added' } })
  );
}

export function dispatchArchiveArtistRemoved(
  artistUserId: string,
  publicArtistSlug?: string
): void {
  if (typeof window === 'undefined') return;
  const detail: EntitlementChangeDetail = {
    artistUserId,
    publicArtistSlug: publicArtistSlug?.trim() || resolveRefreshArtistSlug(),
  };
  window.dispatchEvent(new CustomEvent(ARCHIVE_ARTIST_REMOVED_EVENT, { detail }));
  window.dispatchEvent(
    new CustomEvent(ARCHIVE_CHANGED_EVENT, { detail: { ...detail, type: 'removed' } })
  );
}

export const SUBSCRIPTION_ACTIVATED_EVENT = 'subscription:activated';

export function dispatchSubscriptionActivated(publicArtistSlug?: string): void {
  if (typeof window === 'undefined') return;
  const detail: EntitlementChangeDetail = {
    publicArtistSlug: resolveRefreshArtistSlug(publicArtistSlug),
    type: 'subscription',
  };
  window.dispatchEvent(new CustomEvent(SUBSCRIPTION_ACTIVATED_EVENT, { detail }));
  window.dispatchEvent(new CustomEvent(ARCHIVE_CHANGED_EVENT, { detail }));
}
