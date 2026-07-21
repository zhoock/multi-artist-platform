import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { configureStore } from '@reduxjs/toolkit';

import { playerReducer } from '@features/player/model/slice/playerSlice';
import { langReducer } from '@shared/model/lang/langSlice';
import { popupReducer } from '@features/popupToggle/model/slice/popupSlice';
import { articlesReducer } from '@entities/article/model/articlesSlice';
import { albumsReducer } from '@entities/album/model/albumsSlice';
import { artistAlbumCatalogReducer } from '@entities/album/model/artistAlbumCatalogSlice';
import { albumDetailsReducer } from '@entities/album/model/albumDetailsSlice';
import { uiDictionaryReducer } from '@shared/model/uiDictionary/uiDictionarySlice';
import { currentArtistReducer } from '@shared/model/currentArtist';
import { trackLyricsReducer } from '@entities/lyrics/model/trackLyricsSlice';
import { usePaymentSettings } from '../usePaymentSettings';

const getPaymentSettingsMock = jest.fn();

jest.mock('@shared/api/payment/settings', () => ({
  getPaymentSettings: (...args: unknown[]) => getPaymentSettingsMock(...args),
  savePaymentSettings: jest.fn(),
  disconnectPaymentProvider: jest.fn(),
}));

jest.mock('@features/artistArchive', () => ({
  refreshPremiumContentForArchiveChange: jest.fn(),
}));

jest.mock('@shared/lib/publicSurfaceSync', () => ({
  notifyPublicSurfaceChanged: jest.fn(),
}));

function createHookWrapper() {
  const store = configureStore({
    reducer: {
      player: playerReducer,
      lang: langReducer,
      popup: popupReducer,
      articles: articlesReducer,
      albums: albumsReducer,
      artistAlbumCatalog: artistAlbumCatalogReducer,
      albumDetails: albumDetailsReducer,
      currentArtist: currentArtistReducer,
      uiDictionary: uiDictionaryReducer,
      trackLyrics: trackLyricsReducer,
    } as never,
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <HelmetProvider>
        <Provider store={store}>
          <MemoryRouter>{children}</MemoryRouter>
        </Provider>
      </HelmetProvider>
    );
  };
}

describe('usePaymentSettings lazy loading', () => {
  beforeEach(() => {
    getPaymentSettingsMock.mockReset();
    getPaymentSettingsMock.mockResolvedValue({ success: true, settings: null });
  });

  it('does not fetch payment settings while the tab is inactive', async () => {
    renderHook(() => usePaymentSettings({ userId: 'user-1', active: false }), {
      wrapper: createHookWrapper(),
    });

    await waitFor(() => {
      expect(getPaymentSettingsMock).not.toHaveBeenCalled();
    });
  });

  it('fetches payment settings once when the tab becomes active', async () => {
    const { result } = renderHook(() => usePaymentSettings({ userId: 'user-1', active: true }), {
      wrapper: createHookWrapper(),
    });

    await waitFor(() => {
      expect(getPaymentSettingsMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(result.current.loadSucceeded).toBe(true);
    });
  });

  it('does not refetch when toggling active after a successful load', async () => {
    const { rerender } = renderHook(
      ({ isActive }) => usePaymentSettings({ userId: 'user-1', active: isActive }),
      {
        initialProps: { isActive: true },
        wrapper: createHookWrapper(),
      }
    );

    await waitFor(() => {
      expect(getPaymentSettingsMock).toHaveBeenCalledTimes(1);
    });

    rerender({ isActive: false });
    rerender({ isActive: true });

    await waitFor(() => {
      expect(getPaymentSettingsMock).toHaveBeenCalledTimes(1);
    });
  });

  it('retries loading when the tab is reopened after an error', async () => {
    getPaymentSettingsMock
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ success: true, settings: null });

    const { result, rerender } = renderHook(
      ({ isActive }) => usePaymentSettings({ userId: 'user-1', active: isActive }),
      {
        initialProps: { isActive: true },
        wrapper: createHookWrapper(),
      }
    );

    await waitFor(() => {
      expect(getPaymentSettingsMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Network error');
      expect(result.current.loadSucceeded).toBe(false);
    });

    rerender({ isActive: false });
    rerender({ isActive: true });

    await waitFor(() => {
      expect(getPaymentSettingsMock).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(result.current.loadSucceeded).toBe(true);
      expect(result.current.error).toBeNull();
    });
  });
});
