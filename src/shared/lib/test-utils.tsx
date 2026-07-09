import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { HelmetProvider } from 'react-helmet-async';
import { playerReducer } from '@features/player/model/slice/playerSlice';
import { langReducer } from '@shared/model/lang/langSlice';
import { popupReducer } from '@features/popupToggle/model/slice/popupSlice';
import { articlesReducer } from '@entities/article/model/articlesSlice';
import { albumsReducer } from '@entities/album/model/albumsSlice';
import { uiDictionaryReducer } from '@shared/model/uiDictionary/uiDictionarySlice';
import { currentArtistReducer } from '@shared/model/currentArtist';
import { trackLyricsReducer } from '@entities/lyrics/model/trackLyricsSlice';
import type { RootState, AppStore } from '@shared/model/appStore';

// Определяем тип для предзагруженного состояния (частичное состояние)
type PreloadedState = Partial<RootState>;

interface ExtendedRenderOptions extends Omit<RenderOptions, 'queries'> {
  preloadedState?: PreloadedState;
  store?: AppStore;
  initialEntries?: string[];
}

export function renderWithProviders(
  ui: ReactElement,
  {
    preloadedState = {},
    store = configureStore({
      reducer: {
        player: playerReducer,
        lang: langReducer,
        popup: popupReducer,
        articles: articlesReducer,
        albums: albumsReducer,
        currentArtist: currentArtistReducer,
        uiDictionary: uiDictionaryReducer,
        trackLyrics: trackLyricsReducer,
      } as any,
      preloadedState: preloadedState as any,
    }) as AppStore,
    initialEntries = ['/'],
    ...renderOptions
  }: ExtendedRenderOptions = {}
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <HelmetProvider>
        <Provider store={store}>
          <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
        </Provider>
      </HelmetProvider>
    );
  }

  return { store, ...render(ui, { wrapper: Wrapper, ...renderOptions }) };
}
