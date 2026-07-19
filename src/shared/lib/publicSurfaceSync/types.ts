/**
 * Typed public-surface mutations. Every Dashboard save that can affect the
 * public artist page must call `notifyPublicSurfaceChanged` with one of these.
 */

export type ProfileAspect = 'name' | 'genre' | 'headerImages' | 'about' | 'slug';

export type PublicSurfaceChange =
  | { type: 'albumContentChanged'; albumId: string; previousAlbumId?: string }
  | { type: 'albumVisibilityChanged'; albumId: string }
  | { type: 'albumPublished'; albumId: string }
  | { type: 'albumDeleted'; albumId: string }
  | { type: 'trackContentChanged'; albumId: string }
  | { type: 'trackVisibilityChanged'; albumId: string }
  | { type: 'trackDeleted'; albumId: string }
  | { type: 'articlePublicChanged' }
  | { type: 'profileChanged'; aspects: ProfileAspect[] }
  | { type: 'socialLinksChanged' }
  | { type: 'monetizationChanged'; enabled: boolean }
  | { type: 'stemsChanged'; albumId?: string };

/** Discrete public data sources that can be soft-revalidated (SWR). */
export type PublicSurfaceScope =
  | 'catalog'
  | 'albumDetails'
  | 'articles'
  | 'profileChrome'
  | 'displayName'
  | 'heroImages'
  | 'publicArtists'
  | 'monetization'
  | 'stems';

export type NotifyPublicSurfaceOptions = {
  artistSlug?: string | null;
  /** Display name for `profile-name-updated` when aspects include `name`. */
  displayName?: string | null;
  /** Hero image URLs for immediate `header-images-updated` apply. */
  headerImages?: string[] | null;
};

export type ResolvedPublicSurfacePlan = {
  scopes: PublicSurfaceScope[];
  albumId: string | null;
  /** Prior album id when a save renames/replaces the public slug. */
  previousAlbumId: string | null;
  broadcastArtistUpdated: boolean;
  broadcastStems: boolean;
  monetizationEnabled: boolean | null;
  displayName: string | null;
  headerImages: string[] | null;
};
