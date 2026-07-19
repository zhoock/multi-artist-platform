import { enqueuePendingPublicSurfaceSync, takePendingPublicSurfaceSync } from './pending';
import { executePublicSurfaceRevalidate } from './revalidate';
import { resolvePublicSurfaceArtistSlug } from './resolveArtistSlug';
import { resolvePublicSurfacePlan } from './resolvePlan';
import type { NotifyPublicSurfaceOptions, PublicSurfaceChange } from './types';

/**
 * After a successful Dashboard mutation that can affect the public artist page,
 * call this once with the typed change. Resolves scopes and soft-revalidates now.
 *
 * If the public artist slug cannot be resolved yet, scopes are queued and flushed
 * via `flushPendingPublicSurfaceSync(slug)` on Dashboard close — not a global refresh.
 */
export function notifyPublicSurfaceChanged(
  change: PublicSurfaceChange,
  options: NotifyPublicSurfaceOptions = {}
): void {
  const plan = resolvePublicSurfacePlan(change, options);
  if (plan.scopes.length === 0) return;

  const artistSlug = resolvePublicSurfaceArtistSlug(options.artistSlug);
  if (!artistSlug) {
    enqueuePendingPublicSurfaceSync(plan);
    return;
  }

  executePublicSurfaceRevalidate({
    ...plan,
    artistSlug,
  });
}

/**
 * Flush scopes that could not run at mutation time (missing slug).
 * Call from Dashboard close with the background artist slug — never a full-app revalidate.
 */
export function flushPendingPublicSurfaceSync(artistSlug?: string | null): void {
  const pending = takePendingPublicSurfaceSync();
  if (!pending || pending.scopes.size === 0) return;

  const slug = resolvePublicSurfaceArtistSlug(artistSlug);
  if (!slug) {
    enqueuePendingPublicSurfaceSync({
      scopes: [...pending.scopes],
      albumId: [...pending.albumIds][0] ?? null,
      previousAlbumId: [...pending.previousAlbumIds][0] ?? null,
      broadcastArtistUpdated: pending.broadcastArtistUpdated,
      broadcastStems: pending.broadcastStems,
      monetizationEnabled: pending.monetizationEnabled,
      displayName: pending.displayName,
      headerImages: pending.headerImages,
    });
    return;
  }

  const albumIds = [...pending.albumIds];
  const previousAlbumIds = [...pending.previousAlbumIds];
  const [firstAlbumId, ...restAlbumIds] = albumIds;

  executePublicSurfaceRevalidate({
    scopes: [...pending.scopes],
    albumId: firstAlbumId ?? null,
    previousAlbumId: previousAlbumIds[0] ?? null,
    broadcastArtistUpdated: pending.broadcastArtistUpdated,
    broadcastStems: pending.broadcastStems,
    monetizationEnabled: pending.monetizationEnabled,
    displayName: pending.displayName,
    headerImages: pending.headerImages,
    artistSlug: slug,
  });

  for (const albumId of restAlbumIds) {
    executePublicSurfaceRevalidate({
      scopes: ['albumDetails'],
      albumId,
      previousAlbumId: null,
      broadcastArtistUpdated: false,
      broadcastStems: false,
      monetizationEnabled: null,
      displayName: null,
      headerImages: null,
      artistSlug: slug,
    });
  }

  // Remaining previous ids (rename leftovers) not already covered as albumIds.
  for (const previousAlbumId of previousAlbumIds.slice(1)) {
    if (albumIds.includes(previousAlbumId)) continue;
    executePublicSurfaceRevalidate({
      scopes: ['albumDetails'],
      albumId: null,
      previousAlbumId,
      broadcastArtistUpdated: false,
      broadcastStems: false,
      monetizationEnabled: null,
      displayName: null,
      headerImages: null,
      artistSlug: slug,
    });
  }
}
