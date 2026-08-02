import { configureStore } from '@reduxjs/toolkit';

import { popupReducer } from '@features/popupToggle';
import { playerReducer } from '@features/player';
import {
  playerListenerMiddleware,
  attachAudioEvents,
} from '@features/player/model/middleware/playerListeners';
import { langReducer, langListenerMiddleware, applyLangSideEffects } from '@shared/model/lang';
import { currentArtistReducer } from '@shared/model/currentArtist';
import { articlesReducer } from '@entities/article';
import { albumsReducer } from '@entities/album';
import { artistAlbumCatalogReducer } from '@entities/album/model/artistAlbumCatalogSlice';
import { albumDetailsReducer } from '@entities/album/model/albumDetailsSlice';
import { helpReducer } from '@entities/help';
import { uiDictionaryReducer } from '@shared/model/uiDictionary';
import { trackLyricsReducer } from '@entities/lyrics';

import type { AppDispatch, AppStore as AppStoreType, RootState } from './types';

const rootReducer = {
  popup: popupReducer,
  player: playerReducer,
  lang: langReducer,
  currentArtist: currentArtistReducer,
  articles: articlesReducer,
  albums: albumsReducer,
  artistAlbumCatalog: artistAlbumCatalogReducer,
  albumDetails: albumDetailsReducer,
  help: helpReducer,
  uiDictionary: uiDictionaryReducer,
  trackLyrics: trackLyricsReducer,
};

let storeInstance: AppStoreType | null = null;

export const createReduxStore = (): AppStoreType => {
  if (storeInstance) {
    return storeInstance;
  }

  const store = configureStore({
    reducer: rootReducer,
    devTools: process.env.NODE_ENV !== 'production',
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(
        playerListenerMiddleware.middleware,
        langListenerMiddleware.middleware
      ),
  });

  attachAudioEvents(store.dispatch as AppDispatch, store.getState as () => RootState);
  applyLangSideEffects(store.getState().lang.current);

  storeInstance = store;

  return store;
};

export const getStore = (): AppStoreType => createReduxStore();
