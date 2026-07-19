export { default as AlbumCover } from './ui/AlbumCover';
export { AlbumCoverImage, type AlbumCoverImageProps } from './ui/AlbumCoverImage';
export { default as WrapperAlbumCover } from './ui/WrapperAlbumCover';
export { default as AlbumDetails } from './ui/AlbumDetails/AlbumDetails';

export {
  albumsReducer,
  fetchAlbums,
  resetAlbumsState,
  patchDashboardAlbumVisibility,
  patchDashboardTrackVisibility,
} from './model/albumsSlice';
export {
  artistAlbumCatalogReducer,
  fetchArtistAlbumCatalog,
  resetArtistAlbumCatalog,
} from './model/artistAlbumCatalogSlice';
export type { CatalogAlbum } from './model/catalogAlbum';
export * from './model/artistAlbumCatalogSelectors';
/** Все селекторы из `model/selectors` (в т.ч. `selectDashboardAlbumById`) — единая точка реэкспорта. */
export * from './model/selectors';
export type { AlbumsState, RequestStatus } from './model/types';
