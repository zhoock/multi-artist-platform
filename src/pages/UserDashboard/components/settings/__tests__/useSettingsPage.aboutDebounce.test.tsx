import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';

import { langReducer } from '@shared/model/lang/langSlice';
import { uiDictionaryReducer } from '@shared/model/uiDictionary/uiDictionarySlice';

type SaveResult = { success: boolean; error?: string };

const getTokenMock = jest.fn<() => string | null>();
const updateStoredUserNameMock = jest.fn();

jest.mock('@shared/lib/auth', () => ({
  getToken: () => getTokenMock(),
  updateStoredUserName: (...args: unknown[]) => updateStoredUserNameMock(...args),
}));

const fetchWithAuthSessionMock = jest.fn<(...args: unknown[]) => Promise<Response>>();

jest.mock('@shared/lib/authFetch', () => ({
  fetchWithAuthSession: (...args: unknown[]) => fetchWithAuthSessionMock(...args),
}));

const saveTheBandToDatabaseMock = jest.fn<(...args: unknown[]) => Promise<SaveResult>>();
const loadTheBandFromDatabaseMock = jest.fn<(lang: string) => Promise<string[] | null>>();
const loadHeaderImagesFromDatabaseMock = jest.fn<() => Promise<string[]>>();

jest.mock('@entities/user/lib', () => ({
  saveTheBandToDatabase: (...args: unknown[]) => saveTheBandToDatabaseMock(...args),
  loadTheBandFromDatabase: (lang: string) => loadTheBandFromDatabaseMock(lang),
  loadHeaderImagesFromDatabase: () => loadHeaderImagesFromDatabaseMock(),
}));

jest.mock('@shared/lib/publicSurfaceSync', () => ({
  notifyPublicSurfaceChanged: jest.fn(),
}));

import { useSettingsPage } from '../useSettingsPage';

/** Mirrors the debounce in `handleAboutChange`. */
const ABOUT_DEBOUNCE_MS = 800;
const INITIAL_ABOUT = 'Stored paragraph';

function createWrapper() {
  const store = configureStore({
    reducer: {
      lang: langReducer,
      uiDictionary: uiDictionaryReducer,
    } as never,
    preloadedState: {
      lang: { current: 'ru' as const },
      uiDictionary: {
        ru: {
          status: 'succeeded' as const,
          error: null,
          data: [{ dashboard: { error: 'Error' } }] as never,
          lastUpdated: Date.now(),
        },
        en: { status: 'idle' as const, error: null, data: [], lastUpdated: null },
      },
    } as never,
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <MemoryRouter>{children}</MemoryRouter>
      </Provider>
    );
  };
}

async function renderSettingsPage(options?: { onSaveError?: (message: string) => void }) {
  const view = renderHook(
    () =>
      useSettingsPage({
        enabled: true,
        userName: 'Test Band',
        onSaveError: options?.onSaveError,
      }),
    { wrapper: createWrapper() }
  );

  await waitFor(() => {
    expect(view.result.current.hasLoadedOnce).toBe(true);
  });
  await waitFor(() => {
    expect(view.result.current.aboutText).toBe(INITIAL_ABOUT);
  });

  // Loading is the only thing allowed to have touched the network so far.
  saveTheBandToDatabaseMock.mockClear();

  return view;
}

describe('useSettingsPage — about text debounce lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();

    getTokenMock.mockReset();
    updateStoredUserNameMock.mockReset();
    fetchWithAuthSessionMock.mockReset();
    saveTheBandToDatabaseMock.mockReset();
    loadTheBandFromDatabaseMock.mockReset();
    loadHeaderImagesFromDatabaseMock.mockReset();

    getTokenMock.mockReturnValue('test-token');
    fetchWithAuthSessionMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { siteName: 'Test Band', publicSlug: 'test-band', genreCode: 'rock' },
      }),
    } as Response);
    loadTheBandFromDatabaseMock.mockImplementation(async (lang) =>
      lang === 'ru' ? [INITIAL_ABOUT] : null
    );
    loadHeaderImagesFromDatabaseMock.mockResolvedValue([]);
    saveTheBandToDatabaseMock.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // A
  it('saves exactly once when the debounce expires while still mounted', async () => {
    const { result } = await renderSettingsPage();

    act(() => {
      result.current.handleAboutChange('Edited paragraph');
    });
    expect(saveTheBandToDatabaseMock).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(ABOUT_DEBOUNCE_MS);
    });

    expect(saveTheBandToDatabaseMock).toHaveBeenCalledTimes(1);
    expect(saveTheBandToDatabaseMock).toHaveBeenCalledWith(['Edited paragraph'], 'ru');
  });

  // B
  it('flushes the pending value when unmounted before the debounce expires', async () => {
    const { result, unmount } = await renderSettingsPage();

    act(() => {
      result.current.handleAboutChange('Pending paragraph');
    });
    act(() => {
      jest.advanceTimersByTime(ABOUT_DEBOUNCE_MS - 500);
    });
    expect(saveTheBandToDatabaseMock).not.toHaveBeenCalled();

    await act(async () => {
      unmount();
    });

    expect(saveTheBandToDatabaseMock).toHaveBeenCalledTimes(1);
    expect(saveTheBandToDatabaseMock).toHaveBeenCalledWith(['Pending paragraph'], 'ru');
  });

  // C
  it('does not save a second time when unmounted after the debounce already fired', async () => {
    const { result, unmount } = await renderSettingsPage();

    act(() => {
      result.current.handleAboutChange('Edited paragraph');
    });
    await act(async () => {
      jest.advanceTimersByTime(ABOUT_DEBOUNCE_MS);
    });
    expect(saveTheBandToDatabaseMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      unmount();
    });

    expect(saveTheBandToDatabaseMock).toHaveBeenCalledTimes(1);
  });

  // C (strict variant: the debounced save has not resolved yet, so `initialAboutText` has not
  // caught up and `saveAboutText`'s own equality check cannot be what prevents the duplicate.)
  it('does not save a second time when unmounted while the debounced save is in flight', async () => {
    let resolveSave: ((value: SaveResult) => void) | undefined;
    saveTheBandToDatabaseMock.mockImplementation(
      () =>
        new Promise<SaveResult>((resolve) => {
          resolveSave = resolve;
        })
    );

    const { result, unmount } = await renderSettingsPage();

    act(() => {
      result.current.handleAboutChange('Edited paragraph');
    });
    act(() => {
      jest.advanceTimersByTime(ABOUT_DEBOUNCE_MS);
    });
    expect(saveTheBandToDatabaseMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      unmount();
    });
    expect(saveTheBandToDatabaseMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSave?.({ success: true });
    });
    expect(saveTheBandToDatabaseMock).toHaveBeenCalledTimes(1);
  });

  // D
  it('flushes only the latest value after several rapid edits', async () => {
    const { result, unmount } = await renderSettingsPage();

    act(() => {
      result.current.handleAboutChange('First');
    });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    act(() => {
      result.current.handleAboutChange('First second');
    });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    act(() => {
      result.current.handleAboutChange('First second third');
    });
    expect(saveTheBandToDatabaseMock).not.toHaveBeenCalled();

    await act(async () => {
      unmount();
    });

    expect(saveTheBandToDatabaseMock).toHaveBeenCalledTimes(1);
    expect(saveTheBandToDatabaseMock).toHaveBeenCalledWith(['First second third'], 'ru');
  });

  // E
  it('does not save when the pending value is back to the stored one', async () => {
    const { result, unmount } = await renderSettingsPage();

    act(() => {
      result.current.handleAboutChange('Edited paragraph');
    });
    act(() => {
      result.current.handleAboutChange(INITIAL_ABOUT);
    });

    await act(async () => {
      unmount();
    });

    expect(saveTheBandToDatabaseMock).not.toHaveBeenCalled();
  });

  // F
  it('keeps blur saving once, with no debounce or unmount duplicate', async () => {
    const { result, unmount } = await renderSettingsPage();

    act(() => {
      result.current.handleAboutChange('Blurred paragraph');
    });
    await act(async () => {
      result.current.handleAboutBlur();
    });

    expect(saveTheBandToDatabaseMock).toHaveBeenCalledTimes(1);
    expect(saveTheBandToDatabaseMock).toHaveBeenCalledWith(['Blurred paragraph'], 'ru');

    await act(async () => {
      jest.advanceTimersByTime(ABOUT_DEBOUNCE_MS);
    });
    expect(saveTheBandToDatabaseMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      unmount();
    });
    expect(saveTheBandToDatabaseMock).toHaveBeenCalledTimes(1);
  });

  // G
  it('still reports save failures on the debounce path', async () => {
    const onSaveError = jest.fn<(message: string) => void>();
    saveTheBandToDatabaseMock.mockResolvedValue({ success: false, error: 'Boom' });

    const { result } = await renderSettingsPage({ onSaveError });

    act(() => {
      result.current.handleAboutChange('Edited paragraph');
    });
    await act(async () => {
      jest.advanceTimersByTime(ABOUT_DEBOUNCE_MS);
    });

    expect(onSaveError).toHaveBeenCalledWith('Error: Boom');
  });

  // G (flush path)
  it('still reports save failures raised by the unmount flush', async () => {
    const onSaveError = jest.fn<(message: string) => void>();
    saveTheBandToDatabaseMock.mockResolvedValue({ success: false, error: 'Boom' });

    const { result, unmount } = await renderSettingsPage({ onSaveError });

    act(() => {
      result.current.handleAboutChange('Pending paragraph');
    });
    await act(async () => {
      unmount();
    });

    expect(saveTheBandToDatabaseMock).toHaveBeenCalledTimes(1);
    expect(onSaveError).toHaveBeenCalledWith('Error: Boom');
  });
});
