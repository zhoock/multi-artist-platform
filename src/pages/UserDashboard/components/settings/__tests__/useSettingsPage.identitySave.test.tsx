import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';

import { langReducer } from '@shared/model/lang/langSlice';
import { uiDictionaryReducer } from '@shared/model/uiDictionary/uiDictionarySlice';

type ServerProfile = { siteName: string; publicSlug: string; genreCode: string };
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

const RU_ABOUT = 'Stored RU paragraph';

let serverProfile: ServerProfile;

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
          data: [
            {
              dashboard: { error: 'Error' },
              auth: { register: { siteBandNameRequired: 'Site / band name is required' } },
            },
          ] as never,
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

function postedBodies(): Record<string, unknown>[] {
  return fetchWithAuthSessionMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

async function renderSettingsPage() {
  const view = renderHook(
    () =>
      useSettingsPage({
        enabled: true,
        userName: 'Fallback Name',
      }),
    { wrapper: createWrapper() }
  );

  await waitFor(() => {
    expect(view.result.current.hasLoadedOnce).toBe(true);
  });
  await waitFor(() => {
    expect(view.result.current.name).toBe(serverProfile.siteName);
  });

  return view;
}

describe('useSettingsPage — siteName and publicSlug save independently', () => {
  beforeEach(() => {
    localStorage.clear();

    getTokenMock.mockReset();
    updateStoredUserNameMock.mockReset();
    fetchWithAuthSessionMock.mockReset();
    saveTheBandToDatabaseMock.mockReset();
    loadTheBandFromDatabaseMock.mockReset();
    loadHeaderImagesFromDatabaseMock.mockReset();

    serverProfile = { siteName: 'Band A', publicSlug: 'band-a', genreCode: 'rock' };

    getTokenMock.mockReturnValue('test-token');
    fetchWithAuthSessionMock.mockImplementation(async (_url, init) => {
      if ((init as RequestInit | undefined)?.method === 'POST') {
        return { ok: true, json: async () => ({ success: true }) } as Response;
      }
      return {
        ok: true,
        json: async () => ({ success: true, data: { ...serverProfile } }),
      } as Response;
    });

    loadTheBandFromDatabaseMock.mockImplementation(async (lang) =>
      lang === 'ru' ? [RU_ABOUT] : null
    );
    loadHeaderImagesFromDatabaseMock.mockResolvedValue([]);
    saveTheBandToDatabaseMock.mockResolvedValue({ success: true });
  });

  // A
  it('sends only siteName when name is the field that blurred', async () => {
    const { result } = await renderSettingsPage();

    act(() => {
      result.current.setName('Band Renamed');
    });
    await act(async () => {
      result.current.handleNameBlur();
    });

    await waitFor(() => {
      expect(postedBodies()).toEqual([{ siteName: 'Band Renamed' }]);
    });
    expect(result.current.hasUnsavedChanges).toBe(false);
  });

  // B
  it('sends only publicSlug when slug is the field that blurred', async () => {
    const { result } = await renderSettingsPage();

    act(() => {
      result.current.handlePublicSlugChange('band-renamed');
    });
    await act(async () => {
      result.current.handlePublicSlugBlur();
    });

    await waitFor(() => {
      expect(postedBodies()).toEqual([{ publicSlug: 'band-renamed' }]);
    });
    expect(result.current.hasUnsavedChanges).toBe(false);
  });

  // C
  it('saves a valid name without sending a dirty invalid slug', async () => {
    const { result } = await renderSettingsPage();

    act(() => {
      result.current.setName('Band Renamed');
      result.current.handlePublicSlugChange('');
    });
    expect(result.current.publicSlug).toBe('');
    expect(result.current.hasUnsavedChanges).toBe(true);

    await act(async () => {
      result.current.handleNameBlur();
    });

    await waitFor(() => {
      expect(postedBodies()).toEqual([{ siteName: 'Band Renamed' }]);
    });
    expect(result.current.name).toBe('Band Renamed');
    expect(result.current.publicSlug).toBe('');
    expect(result.current.hasUnsavedChanges).toBe(true);
  });

  // D
  it('saves a valid slug without sending a dirty invalid name', async () => {
    const { result } = await renderSettingsPage();

    act(() => {
      result.current.setName('   ');
      result.current.handlePublicSlugChange('band-renamed');
    });
    expect(result.current.hasUnsavedChanges).toBe(true);

    await act(async () => {
      result.current.handlePublicSlugBlur();
    });

    await waitFor(() => {
      expect(postedBodies()).toEqual([{ publicSlug: 'band-renamed' }]);
    });
    expect(result.current.publicSlug).toBe('band-renamed');
    expect(result.current.name).toBe('   ');
    expect(result.current.hasUnsavedChanges).toBe(true);
  });

  // E
  it('saves both valid fields with one request each and no extras', async () => {
    const { result } = await renderSettingsPage();

    act(() => {
      result.current.setName('Band Renamed');
      result.current.handlePublicSlugChange('band-renamed');
    });

    await act(async () => {
      result.current.handleNameBlur();
    });
    await act(async () => {
      result.current.handlePublicSlugBlur();
    });

    await waitFor(() => {
      expect(postedBodies()).toEqual([
        { siteName: 'Band Renamed' },
        { publicSlug: 'band-renamed' },
      ]);
    });
    expect(result.current.name).toBe('Band Renamed');
    expect(result.current.publicSlug).toBe('band-renamed');
    expect(result.current.hasUnsavedChanges).toBe(false);
  });

  // F
  it('keeps the other field dirty after a successful single-field save', async () => {
    const { result } = await renderSettingsPage();

    act(() => {
      result.current.setName('Band Renamed');
      result.current.handlePublicSlugChange('still-dirty');
    });

    await act(async () => {
      result.current.handleNameBlur();
    });

    await waitFor(() => {
      expect(postedBodies()).toEqual([{ siteName: 'Band Renamed' }]);
    });
    expect(result.current.name).toBe('Band Renamed');
    expect(result.current.publicSlug).toBe('still-dirty');
    expect(result.current.hasUnsavedChanges).toBe(true);

    // A second name blur must not POST again — only the slug remains dirty.
    await act(async () => {
      result.current.handleNameBlur();
    });
    expect(postedBodies()).toEqual([{ siteName: 'Band Renamed' }]);
  });
});
