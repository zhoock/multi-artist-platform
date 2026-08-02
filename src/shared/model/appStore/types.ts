import type { configureStore, ThunkDispatch, UnknownAction } from '@reduxjs/toolkit';

import type { popupReducer } from '@features/popupToggle';
import type { playerReducer } from '@features/player';
import type { LangState } from '@shared/model/lang';
import type { CurrentArtistState } from '@shared/model/currentArtist';
import type { ArticlesState } from '@entities/article/model/types';
import type { AlbumsState } from '@entities/album/model/types';
import type { ArtistAlbumCatalogState } from '@entities/album/model/artistAlbumCatalogSlice';
import type { AlbumDetailsState } from '@entities/album/model/albumDetailsSlice';
import type { HelpState } from '@entities/help/model/types';
import type { UiDictionaryState } from '@shared/model/uiDictionary/types';
import type { TrackLyricsState } from '@entities/lyrics/model/trackLyricsSlice';

type PopupState = ReturnType<typeof popupReducer>;
type PlayerState = ReturnType<typeof playerReducer>;

export interface RootState {
  popup: PopupState;
  player: PlayerState;
  lang: LangState;
  currentArtist: CurrentArtistState;
  articles: ArticlesState;
  albums: AlbumsState;
  artistAlbumCatalog: ArtistAlbumCatalogState;
  albumDetails: AlbumDetailsState;
  help: HelpState;
  uiDictionary: UiDictionaryState;
  trackLyrics: TrackLyricsState;
}

export type AppStore = ReturnType<typeof configureStore<RootState>>;
export type AppDispatch = ThunkDispatch<RootState, unknown, UnknownAction>;
