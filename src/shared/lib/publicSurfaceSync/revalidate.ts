import {
  fetchAlbumDetailsPage,
  fetchArtistAlbumCatalog,
  markAlbumDetailsStaleMany,
  selectAlbumDetailsState,
} from '@entities/album';
import { fetchArticles } from '@entities/article';
import { getStore } from '@shared/model/appStore';
import { invalidateArtistHeroHeaderImagesCache } from '@shared/lib/artistHeroHeaderImages';
import { invalidatePublicProfileDisplayCache } from '@shared/lib/profileDisplayName';
import {
  patchCachedPublicArtistHeaderImages,
  reloadPublicArtists,
} from '@shared/lib/publicArtistsCache';
import {
  clearPublicArtistUserProfileInflight,
  invalidatePublicArtistUserProfileCache,
  setCachedPublicArtistUserProfileHeaderImages,
} from '@shared/lib/publicArtistUserProfile';
import { dispatchArtistMonetizationChanged } from '@shared/lib/payment/artistMonetizationEvents';
import type { PublicSurfaceScope, ResolvedPublicSurfacePlan } from './types';

export type ExecutePublicSurfaceRevalidateInput = ResolvedPublicSurfacePlan & {
  artistSlug: string;
};

function dispatchArtistUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('artist:updated'));
}

function dispatchStemsUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('stems-manifest-updated'));
  window.dispatchEvent(new CustomEvent('stems-visibility-updated'));
}

function dispatchProfileNameUpdated(name: string, publicSlug: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('profile-name-updated', {
      detail: { name, publicSlug },
    })
  );
}

function dispatchHeaderImagesUpdated(images: string[]): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('header-images-updated', {
      detail: { images },
    })
  );
}

/**
 * Invalidate AlbumDetails for edited album id(s).
 *
 * Single-slot cache rules:
 * - Always mark ids stale so a later `/albums/:id` visit cannot reuse last-good without force.
 * - If the slot currently holds an invalidated album, soft force-revalidate in place (SWR).
 * - Never replace the slot with a different album while another album page is showing.
 */
function revalidateAlbumDetails(
  artistSlug: string,
  albumId: string | null,
  previousAlbumId: string | null
): void {
  const targetIds = [albumId, previousAlbumId].map((id) => id?.trim() || '').filter(Boolean);
  markAlbumDetailsStaleMany(targetIds);

  const dispatch = getStore().dispatch;
  const details = selectAlbumDetailsState(getStore().getState());
  const currentAlbumId = details.albumId?.trim() || '';
  const slug = artistSlug.trim() || details.artistSlug?.trim() || '';
  if (!slug) return;

  if (currentAlbumId && targetIds.includes(currentAlbumId)) {
    const fetchId =
      previousAlbumId?.trim() === currentAlbumId && albumId?.trim()
        ? albumId.trim()
        : currentAlbumId;
    void dispatch(
      fetchAlbumDetailsPage({
        force: true,
        artistSlug: slug,
        albumId: fetchId,
      })
    );
    return;
  }

  // No conflicting album in the slot — warm the edited album so close→navigate is fresh.
  if (!currentAlbumId && albumId?.trim()) {
    void dispatch(
      fetchAlbumDetailsPage({
        force: true,
        artistSlug: slug,
        albumId: albumId.trim(),
      })
    );
  }
}

/**
 * Run SWR revalidation for resolved scopes: keep last-good UI, force background fetch, replace.
 */
export function executePublicSurfaceRevalidate(input: ExecutePublicSurfaceRevalidateInput): void {
  const { artistSlug, scopes, albumId, previousAlbumId } = input;
  const slug = artistSlug.trim();
  if (!slug || scopes.length === 0) return;

  const dispatch = getStore().dispatch;
  const scopeSet = new Set<PublicSurfaceScope>(scopes);

  if (scopeSet.has('catalog')) {
    void dispatch(
      fetchArtistAlbumCatalog({
        force: true,
        publicArtistSlug: slug,
      })
    );
  }

  if (scopeSet.has('articles')) {
    void dispatch(
      fetchArticles({
        force: true,
        forcePublicCatalog: true,
        publicArtistSlug: slug,
      })
    );
  }

  if (scopeSet.has('albumDetails')) {
    revalidateAlbumDetails(slug, albumId, previousAlbumId);
  }

  if (scopeSet.has('displayName')) {
    invalidatePublicProfileDisplayCache(slug);
    if (input.displayName) {
      dispatchProfileNameUpdated(input.displayName, slug);
    }
  }

  if (scopeSet.has('heroImages')) {
    clearPublicArtistUserProfileInflight(slug);
    invalidateArtistHeroHeaderImagesCache(slug);
    if (Array.isArray(input.headerImages)) {
      setCachedPublicArtistUserProfileHeaderImages(slug, input.headerImages);
      patchCachedPublicArtistHeaderImages(slug, input.headerImages);
      dispatchHeaderImagesUpdated(input.headerImages);
    } else {
      invalidatePublicArtistUserProfileCache(slug);
    }
  }

  if (scopeSet.has('publicArtists')) {
    void reloadPublicArtists();
  }

  if (scopeSet.has('monetization') && input.monetizationEnabled !== null) {
    dispatchArtistMonetizationChanged(input.monetizationEnabled);
  }

  if (scopeSet.has('stems') || input.broadcastStems) {
    dispatchStemsUpdated();
  }

  if (scopeSet.has('profileChrome') || input.broadcastArtistUpdated) {
    dispatchArtistUpdated();
  }
}
