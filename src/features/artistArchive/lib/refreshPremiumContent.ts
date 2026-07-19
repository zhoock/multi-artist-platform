/**
 * Invalidate/refetch public catalog after premium subscription or archive changes.
 */
import type { AppDispatch, RootState } from '@shared/model/appStore/types';
import { getStore } from '@shared/model/appStore';
import {
  fetchAlbums,
  fetchAlbumDetailsPage,
  selectAlbumById,
  selectAlbumDetailsData,
} from '@entities/album';
import { fetchArticles } from '@entities/article';
import { playerActions, toPlayerTracks } from '@features/player';
import { getUserAudioUrl } from '@shared/api/albums';
import { emptyStringMediaSrc } from '@shared/lib/media/optionalMediaUrl';
import { fallbackAlbumClientId } from '@shared/lib/albumClientId';
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

function resolvePlaylistTracksForSync(state: RootState): {
  tracks: PlayerTrack[];
  userId?: string;
} | null {
  const { player } = state;
  if (!player.albumId) return null;

  const details = selectAlbumDetailsData(state);
  if (
    details?.tracks?.length &&
    (details.albumId === player.albumId || details.slug === player.albumId)
  ) {
    const mapped = toPlayerTracks(
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
      player.albumId
    );
    return { tracks: mapped, userId: details.userId };
  }

  const fromFat =
    selectAlbumById(state, player.albumId) ??
    state.albums.data.find((item) => fallbackAlbumClientId(item) === player.albumId);
  if (!fromFat?.tracks?.length) return null;

  const mapped = toPlayerTracks(
    fromFat.tracks.map((track) => {
      if (isTrackPlaybackBlocked(track)) {
        return { ...track, src: '' };
      }
      return {
        ...track,
        src: emptyStringMediaSrc(
          getUserAudioUrl(track.src, undefined, fromFat.userId),
          'refreshPremiumContent:syncPlayerPlaylist',
          { trackId: track.id, albumUserId: fromFat.userId }
        ),
      };
    }),
    player.albumId
  );
  return { tracks: mapped, userId: fromFat.userId };
}

function syncPlayerPlaylistWithAlbumEntitlements(): void {
  const store = getStore();
  const state = store.getState();
  const { player } = state;

  if (!player.albumId || player.playlist.length === 0) return;

  const resolved = resolvePlaylistTracksForSync(state);
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
      dispatch(fetchAlbums({ force: true, forcePublicCatalog: true, publicArtistSlug: slug }))
        .unwrap()
        .catch(() => undefined),
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

  syncPlayerPlaylistWithAlbumEntitlements();
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
    const slug = pendingArtistSlug;
    const runImmediate = pendingImmediate;
    pendingArtistSlug = undefined;
    pendingImmediate = false;
    void executePremiumEntitlementsRefresh(dispatch, slug);
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
