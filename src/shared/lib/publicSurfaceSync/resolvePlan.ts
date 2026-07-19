import type {
  NotifyPublicSurfaceOptions,
  PublicSurfaceChange,
  PublicSurfaceScope,
  ResolvedPublicSurfacePlan,
} from './types';

function uniqueScopes(scopes: PublicSurfaceScope[]): PublicSurfaceScope[] {
  return [...new Set(scopes)];
}

/**
 * Single source of truth: mutation kind → public scopes to revalidate.
 * Call sites must not invent ad-hoc scope lists.
 */
export function resolvePublicSurfacePlan(
  change: PublicSurfaceChange,
  options: NotifyPublicSurfaceOptions = {}
): ResolvedPublicSurfacePlan {
  let scopes: PublicSurfaceScope[] = [];
  let albumId: string | null = null;
  let previousAlbumId: string | null = null;
  let broadcastArtistUpdated = false;
  let broadcastStems = false;
  let monetizationEnabled: boolean | null = null;

  switch (change.type) {
    case 'albumContentChanged':
      albumId = change.albumId;
      previousAlbumId = change.previousAlbumId?.trim() || null;
      scopes = ['catalog', 'albumDetails'];
      broadcastArtistUpdated = true;
      break;
    case 'albumVisibilityChanged':
    case 'albumPublished':
      albumId = change.albumId;
      scopes = ['catalog', 'albumDetails'];
      broadcastArtistUpdated = true;
      break;
    case 'albumDeleted':
      albumId = change.albumId;
      scopes = ['catalog', 'albumDetails', 'stems'];
      broadcastArtistUpdated = true;
      broadcastStems = true;
      break;
    case 'trackContentChanged':
    case 'trackVisibilityChanged':
      albumId = change.albumId;
      scopes = ['catalog', 'albumDetails'];
      break;
    case 'trackDeleted':
      albumId = change.albumId;
      scopes = ['catalog', 'albumDetails', 'stems'];
      broadcastStems = true;
      break;
    case 'articlePublicChanged':
      scopes = ['articles'];
      broadcastArtistUpdated = true;
      break;
    case 'profileChanged': {
      scopes = ['profileChrome'];
      broadcastArtistUpdated = true;
      if (change.aspects.includes('name') || change.aspects.includes('slug')) {
        scopes.push('displayName', 'publicArtists');
      }
      if (change.aspects.includes('genre')) {
        scopes.push('publicArtists');
      }
      if (change.aspects.includes('headerImages')) {
        scopes.push('heroImages');
      }
      break;
    }
    case 'socialLinksChanged':
      scopes = ['profileChrome'];
      broadcastArtistUpdated = true;
      break;
    case 'monetizationChanged':
      scopes = ['monetization', 'catalog', 'albumDetails', 'articles', 'stems'];
      monetizationEnabled = change.enabled;
      broadcastStems = true;
      break;
    case 'stemsChanged':
      albumId = change.albumId?.trim() || null;
      scopes = ['stems', 'catalog'];
      if (albumId) scopes.push('albumDetails');
      broadcastStems = true;
      break;
    default: {
      const _exhaustive: never = change;
      void _exhaustive;
      break;
    }
  }

  return {
    scopes: uniqueScopes(scopes),
    albumId,
    previousAlbumId,
    broadcastArtistUpdated,
    broadcastStems,
    monetizationEnabled,
    displayName: options.displayName?.trim() || null,
    headerImages: Array.isArray(options.headerImages) ? options.headerImages : null,
  };
}
