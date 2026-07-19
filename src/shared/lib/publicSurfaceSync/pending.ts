import type { PublicSurfaceScope } from './types';

export type PendingPublicSurfaceSync = {
  scopes: Set<PublicSurfaceScope>;
  albumIds: Set<string>;
  previousAlbumIds: Set<string>;
  broadcastArtistUpdated: boolean;
  broadcastStems: boolean;
  monetizationEnabled: boolean | null;
  displayName: string | null;
  headerImages: string[] | null;
};

let pending: PendingPublicSurfaceSync | null = null;

export function enqueuePendingPublicSurfaceSync(input: {
  scopes: PublicSurfaceScope[];
  albumId: string | null;
  previousAlbumId?: string | null;
  broadcastArtistUpdated: boolean;
  broadcastStems: boolean;
  monetizationEnabled: boolean | null;
  displayName: string | null;
  headerImages: string[] | null;
}): void {
  if (!pending) {
    pending = {
      scopes: new Set(),
      albumIds: new Set(),
      previousAlbumIds: new Set(),
      broadcastArtistUpdated: false,
      broadcastStems: false,
      monetizationEnabled: null,
      displayName: null,
      headerImages: null,
    };
  }

  for (const scope of input.scopes) {
    pending.scopes.add(scope);
  }
  if (input.albumId) pending.albumIds.add(input.albumId);
  if (input.previousAlbumId?.trim()) {
    pending.previousAlbumIds.add(input.previousAlbumId.trim());
  }
  pending.broadcastArtistUpdated = pending.broadcastArtistUpdated || input.broadcastArtistUpdated;
  pending.broadcastStems = pending.broadcastStems || input.broadcastStems;
  if (input.monetizationEnabled !== null) {
    pending.monetizationEnabled = input.monetizationEnabled;
  }
  if (input.displayName) pending.displayName = input.displayName;
  if (input.headerImages) pending.headerImages = input.headerImages;
}

export function takePendingPublicSurfaceSync(): PendingPublicSurfaceSync | null {
  const next = pending;
  pending = null;
  return next;
}

/** Test helper */
export function resetPendingPublicSurfaceSyncForTests(): void {
  pending = null;
}

export function hasPendingPublicSurfaceSync(): boolean {
  return pending !== null && pending.scopes.size > 0;
}
