import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';

import { langReducer } from '@shared/model/lang/langSlice';
import { uiDictionaryReducer } from '@shared/model/uiDictionary/uiDictionarySlice';

type ServerProfile = { siteName: string; publicSlug: string; genreCode: string };

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

type SaveResult = { success: boolean; error?: string };

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

const RU_ABOUT = 'Stored RU paragraph';
const EN_ABOUT = 'Stored EN paragraph';

/** Stands in for the `users` row; tests mutate it to simulate DB drift. */
let serverProfile: ServerProfile;
let postFails: boolean;
let profileGetCount: number;

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

/** Drains pending microtasks plus one macrotask turn, so a reload that *would* run has run. */
async function flushAsync() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderSettingsPage(options?: { onSaveError?: (message: string) => void }) {
  const view = renderHook(
    ({ enabled }: { enabled: boolean }) =>
      useSettingsPage({
        enabled,
        userName: 'Fallback Name',
        onSaveError: options?.onSaveError,
      }),
    { wrapper: createWrapper(), initialProps: { enabled: true } }
  );

  await waitFor(() => {
    expect(view.result.current.hasLoadedOnce).toBe(true);
  });
  await waitFor(() => {
    expect(view.result.current.name).toBe(serverProfile.siteName);
  });

  return view;
}

/** Models switching to another dashboard tab and back; the tab stays mounted while pinned. */
async function leaveAndReenter(view: Awaited<ReturnType<typeof renderSettingsPage>>) {
  act(() => {
    view.rerender({ enabled: false });
  });
  act(() => {
    view.rerender({ enabled: true });
  });
  await flushAsync();
}

describe('useSettingsPage — tab re-entry must not clobber unsaved edits', () => {
  beforeEach(() => {
    localStorage.clear();

    getTokenMock.mockReset();
    updateStoredUserNameMock.mockReset();
    fetchWithAuthSessionMock.mockReset();
    saveTheBandToDatabaseMock.mockReset();
    loadTheBandFromDatabaseMock.mockReset();
    loadHeaderImagesFromDatabaseMock.mockReset();

    serverProfile = { siteName: 'Band A', publicSlug: 'band-a', genreCode: 'rock' };
    postFails = false;
    profileGetCount = 0;

    getTokenMock.mockReturnValue('test-token');
    fetchWithAuthSessionMock.mockImplementation(async (_url, init) => {
      const method = (init as RequestInit | undefined)?.method;

      if (method === 'POST') {
        return postFails
          ? ({ ok: false, status: 500, json: async () => ({ error: 'Save failed' }) } as Response)
          : ({ ok: true, json: async () => ({ success: true }) } as Response);
      }

      profileGetCount += 1;
      return {
        ok: true,
        json: async () => ({ success: true, data: { ...serverProfile } }),
      } as Response;
    });

    loadTheBandFromDatabaseMock.mockImplementation(async (lang) =>
      lang === 'ru' ? [RU_ABOUT] : [EN_ABOUT]
    );
    loadHeaderImagesFromDatabaseMock.mockResolvedValue([]);
    saveTheBandToDatabaseMock.mockResolvedValue({ success: true });
  });

  // A
  it('populates local state from the API on the first open', async () => {
    const { result } = await renderSettingsPage();

    expect(result.current.name).toBe('Band A');
    expect(result.current.publicSlug).toBe('band-a');
    expect(result.current.genreCode).toBe('rock');
    expect(result.current.aboutText).toBe(RU_ABOUT);
    expect(result.current.hasUnsavedChanges).toBe(false);
    expect(profileGetCount).toBe(1);
  });

  // B
  it('reloads fresh API data when re-entering a clean form', async () => {
    const view = await renderSettingsPage();

    serverProfile = { siteName: 'Band B', publicSlug: 'band-b', genreCode: 'metal' };
    await leaveAndReenter(view);

    await waitFor(() => {
      expect(view.result.current.name).toBe('Band B');
    });
    expect(view.result.current.publicSlug).toBe('band-b');
    expect(view.result.current.genreCode).toBe('metal');
    expect(view.result.current.hasUnsavedChanges).toBe(false);
    expect(profileGetCount).toBe(2);
  });

  // C
  it('keeps the edit after a failed save followed by a tab re-entry', async () => {
    const onSaveError = jest.fn<(message: string) => void>();
    const view = await renderSettingsPage({ onSaveError });

    postFails = true;
    act(() => {
      view.result.current.setName('Edited Band');
    });
    act(() => {
      view.result.current.handleNameBlur();
    });

    await waitFor(() => {
      expect(onSaveError).toHaveBeenCalled();
    });
    expect(view.result.current.name).toBe('Edited Band');
    expect(view.result.current.hasUnsavedChanges).toBe(true);

    await leaveAndReenter(view);

    expect(view.result.current.name).toBe('Edited Band');
    expect(view.result.current.hasUnsavedChanges).toBe(true);
    expect(profileGetCount).toBe(1);
  });

  // D
  it('does not let a stale API value overwrite an unsaved edit on re-entry', async () => {
    const view = await renderSettingsPage();

    act(() => {
      view.result.current.setName('Locally Edited');
    });
    expect(view.result.current.hasUnsavedChanges).toBe(true);

    // The server still holds 'Band A'.
    await leaveAndReenter(view);

    expect(view.result.current.name).toBe('Locally Edited');
    expect(profileGetCount).toBe(1);
  });

  // D — about draft lives in `aboutText` only; the RU/EN copies stay at the last saved value
  // until a successful save, so the lang-sync effect on `enabled` must not apply them.
  it('does not let stored about text overwrite an unsaved about draft on re-entry', async () => {
    const view = await renderSettingsPage();
    const aboutLoadsBeforeEdit = loadTheBandFromDatabaseMock.mock.calls.length;

    act(() => {
      view.result.current.handleAboutChange('Locally edited about');
    });
    expect(view.result.current.hasUnsavedChanges).toBe(true);

    await leaveAndReenter(view);

    expect(view.result.current.aboutText).toBe('Locally edited about');
    expect(view.result.current.hasUnsavedChanges).toBe(true);
    expect(loadTheBandFromDatabaseMock.mock.calls.length).toBe(aboutLoadsBeforeEdit);
  });

  it('keeps the about edit after a failed save followed by a tab re-entry', async () => {
    const onSaveError = jest.fn<(message: string) => void>();
    saveTheBandToDatabaseMock.mockResolvedValue({ success: false, error: 'Save failed' });
    const view = await renderSettingsPage({ onSaveError });

    act(() => {
      view.result.current.handleAboutChange('Edited about');
    });
    await act(async () => {
      view.result.current.handleAboutBlur();
    });

    await waitFor(() => {
      expect(onSaveError).toHaveBeenCalled();
    });
    expect(view.result.current.aboutText).toBe('Edited about');
    expect(view.result.current.hasUnsavedChanges).toBe(true);

    const aboutLoadsAfterFailedSave = loadTheBandFromDatabaseMock.mock.calls.length;
    await leaveAndReenter(view);

    expect(view.result.current.aboutText).toBe('Edited about');
    expect(view.result.current.hasUnsavedChanges).toBe(true);
    expect(loadTheBandFromDatabaseMock.mock.calls.length).toBe(aboutLoadsAfterFailedSave);
  });

  it('does not refetch in a loop while the form stays dirty', async () => {
    const view = await renderSettingsPage();

    act(() => {
      view.result.current.setName('Locally Edited');
    });

    await leaveAndReenter(view);
    await leaveAndReenter(view);
    await leaveAndReenter(view);

    expect(profileGetCount).toBe(1);
    expect(view.result.current.name).toBe('Locally Edited');
  });

  // E
  it('stays consistent after a successful save and re-entry', async () => {
    const view = await renderSettingsPage();

    act(() => {
      view.result.current.setName('Saved Band');
    });
    act(() => {
      view.result.current.handleNameBlur();
    });

    await waitFor(() => {
      expect(view.result.current.hasUnsavedChanges).toBe(false);
    });
    expect(view.result.current.name).toBe('Saved Band');

    // The save landed, so the DB now agrees with local state.
    serverProfile = { ...serverProfile, siteName: 'Saved Band' };
    await leaveAndReenter(view);

    await waitFor(() => {
      expect(profileGetCount).toBe(2);
    });
    expect(view.result.current.name).toBe('Saved Band');
    expect(view.result.current.hasUnsavedChanges).toBe(false);
  });

  // F
  it('still switches the about text between RU and EN when clean', async () => {
    const view = await renderSettingsPage();
    expect(view.result.current.aboutText).toBe(RU_ABOUT);

    await act(async () => {
      view.result.current.handleLanguageChange('en');
    });

    await waitFor(() => {
      expect(view.result.current.aboutText).toBe(EN_ABOUT);
    });
    expect(view.result.current.currentLang).toBe('en');
  });

  // F
  it('switches language without mixing values while a field is dirty', async () => {
    const view = await renderSettingsPage();

    act(() => {
      view.result.current.setName('Dirty Band');
    });

    await act(async () => {
      view.result.current.handleLanguageChange('en');
    });

    await waitFor(() => {
      expect(view.result.current.aboutText).toBe(EN_ABOUT);
    });
    expect(view.result.current.aboutText).not.toBe(RU_ABOUT);
    expect(view.result.current.name).toBe('Dirty Band');
  });
});
