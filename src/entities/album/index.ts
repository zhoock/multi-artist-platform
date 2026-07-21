export { default as AlbumCover } from './ui/AlbumCover';
export { AlbumCoverImage, type AlbumCoverImageProps } from './ui/AlbumCoverImage';
export { default as WrapperAlbumCover } from './ui/WrapperAlbumCover';
export { default as AlbumDetails } from './ui/AlbumDetails/AlbumDetails';

export {
  albumsReducer,
  fetchDashboardAlbums,
  resetAlbumsState,
  patchDashboardAlbumVisibility,
  patchDashboardTrackVisibility,
} from './model/albumsSlice';
export {
  artistAlbumCatalogReducer,
  fetchArtistAlbumCatalog,
  resetArtistAlbumCatalog,
} from './model/artistAlbumCatalogSlice';
export {
  albumDetailsReducer,
  fetchAlbumDetailsPage,
  resetAlbumDetails,
  adoptAlbumDetailsAlbumId,
  buildAlbumDetailsFetchContextKey,
} from './model/albumDetailsSlice';
export {
  markAlbumDetailsStale,
  markAlbumDetailsStaleMany,
  isAlbumDetailsStale,
  consumeAlbumDetailsStale,
  resetAlbumDetailsStaleForTests,
} from './model/albumDetailsStale';
export type { CatalogAlbum } from './model/catalogAlbum';
/**
 * Model type is `AlbumDetails` in `./model/albumDetails`.
 * Re-exported as `AlbumDetailsData` here to avoid clashing with the UI component `AlbumDetails`.
 */
export type {
  AlbumDetails as AlbumDetailsData,
  TrackDetails,
  AlbumArtworkCredits,
  AlbumPurchaseInfo,
  AlbumVisibilityInfo,
} from './model/albumDetails';
export {
  normalizeAlbumDetails,
  isAlbumDetails,
  mapAlbumEditableToAlbumDetails,
  ALBUM_DETAILS_EXCLUDED_TRACK_FIELDS,
  ALBUM_DETAILS_EXCLUDED_ALBUM_FIELDS,
} from './model/albumDetails';
export { fetchAlbumDetails, AlbumDetailsFetchError } from './api/fetchAlbumDetails';
export { resolveAlbumDetailsForDisplay } from './lib/resolveAlbumDetailsDisplay';
export {
  albumDetailsMatchRoute,
  resolveAlbumDetailsForRoute,
} from './lib/resolveAlbumDetailsForRoute';
export * from './model/albumDetailsSelectors';
export * from './model/artistAlbumCatalogSelectors';
/** Все селекторы из `model/selectors` (в т.ч. `selectDashboardAlbumById`) — единая точка реэкспорта. */
export * from './model/selectors';
export type { AlbumsState, RequestStatus } from './model/types';
