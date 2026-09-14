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
const INITIAL_SLUG = 'band-a';

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

async function renderSettingsPage(options?: { onSaveError?: (message: string) => void }) {
  const view = renderHook(
    () =>
      useSettingsPage({
        enabled: true,
        userName: 'Fallback Name',
        onSaveError: options?.onSaveError,
      }),
    { wrapper: createWrapper() }
  );

  await waitFor(() => {
    expect(view.result.current.hasLoadedOnce).toBe(true);
  });
  await waitFor(() => {
    expect(view.result.current.publicSlug).toBe(serverProfile.publicSlug);
  });

  return view;
}

describe('useSettingsPage — publicSlug input and empty-blur UX', () => {
  beforeEach(() => {
    localStorage.clear();

    getTokenMock.mockReset();
    updateStoredUserNameMock.mockReset();
    fetchWithAuthSessionMock.mockReset();
    saveTheBandToDatabaseMock.mockReset();
    loadTheBandFromDatabaseMock.mockReset();
    loadHeaderImagesFromDatabaseMock.mockReset();

    serverProfile = { siteName: 'Band A', publicSlug: INITIAL_SLUG, genreCode: 'rock' };

    getTokenMock.mockReturnValue('test-token');
    fetchWithAuthSessionMock.mockImplementation(async (_url, init) => {
      if ((init as RequestInit | undefined)?.method === 'POST') {
        const body = JSON.parse(String((init as RequestInit).body)) as {
          publicSlug?: string;
        };
        if (typeof body.publicSlug === 'string' && body.publicSlug.trim() === '') {
          return {
            ok: false,
            status: 400,
            json: async () => ({ success: false, error: 'publicSlug cannot be empty' }),
          } as Response;
        }
        if (
          typeof body.publicSlug === 'string' &&
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.publicSlug)
        ) {
          return {
            ok: false,
            status: 400,
            json: async () => ({
              success: false,
              error:
                'Invalid publicSlug format. Use lowercase latin letters, numbers and hyphens only.',
            }),
          } as Response;
        }
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
  it('does not POST an empty publicSlug on blur and keeps the field dirty', async () => {
    const onSaveError = jest.fn<(message: string) => void>();
    const { result } = await renderSettingsPage({ onSaveError });

    act(() => {
      result.current.handlePublicSlugChange('');
    });
    expect(result.current.publicSlug).toBe('');
    expect(result.current.hasUnsavedChanges).toBe(true);

    await act(async () => {
      result.current.handlePublicSlugBlur();
    });

    expect(postedBodies()).toEqual([]);
    expect(onSaveError).not.toHaveBeenCalled();
    expect(result.current.publicSlug).toBe('');
    expect(result.current.hasUnsavedChanges).toBe(true);
  });

  // B
  it('keeps a trailing hyphen while the user types my-band-', async () => {
    const { result } = await renderSettingsPage();
    let typed = '';

    for (const char of 'my-band-') {
      typed += char;
      act(() => {
        result.current.handlePublicSlugChange(typed);
      });
    }

    expect(result.current.publicSlug).toBe('my-band-');
  });

  // C
  it('saves my-band as my-band', async () => {
    const { result } = await renderSettingsPage();

    act(() => {
      result.current.handlePublicSlugChange('my-band');
    });
    await act(async () => {
      result.current.handlePublicSlugBlur();
    });

    await waitFor(() => {
      expect(postedBodies()).toEqual([{ publicSlug: 'my-band' }]);
    });
    expect(result.current.publicSlug).toBe('my-band');
    expect(result.current.hasUnsavedChanges).toBe(false);
  });

  // D
  it('saves my-band-2 as my-band-2', async () => {
    const { result } = await renderSettingsPage();

    act(() => {
      result.current.handlePublicSlugChange('my-band-2');
    });
    await act(async () => {
      result.current.handlePublicSlugBlur();
    });

    await waitFor(() => {
      expect(postedBodies()).toEqual([{ publicSlug: 'my-band-2' }]);
    });
    expect(result.current.publicSlug).toBe('my-band-2');
    expect(result.current.hasUnsavedChanges).toBe(false);
  });

  // E
  it('keeps existing normalizePublicSlug rules for case, spaces, and invalid characters', async () => {
    const { result } = await renderSettingsPage();
    const { normalizePublicSlug } = result.current;

    expect(normalizePublicSlug('MY-BAND')).toBe('my-band');
    expect(normalizePublicSlug('My Band')).toBe('my-band');
    expect(normalizePublicSlug('my_band!')).toBe('my-band');
    expect(normalizePublicSlug('my--band')).toBe('my-band');
    expect(normalizePublicSlug('--my-band--')).toBe('my-band');
    expect(normalizePublicSlug('  my band  ')).toBe('my-band');

    act(() => {
      result.current.handlePublicSlugChange('MY Band_Name!');
    });
    expect(result.current.publicSlug).toBe('my-band-name-');

    await act(async () => {
      result.current.handlePublicSlugBlur();
    });

    await waitFor(() => {
      expect(postedBodies()).toEqual([{ publicSlug: 'my-band-name' }]);
    });
    expect(result.current.publicSlug).toBe('my-band-name');
  });

  // F
  it('does not POST a trailing-hyphen slug; blur saves the backend-valid form', async () => {
    const onSaveError = jest.fn<(message: string) => void>();
    const { result } = await renderSettingsPage({ onSaveError });

    act(() => {
      result.current.handlePublicSlugChange('my-band-');
    });
    expect(result.current.publicSlug).toBe('my-band-');

    await act(async () => {
      result.current.handlePublicSlugBlur();
    });

    await waitFor(() => {
      expect(postedBodies()).toEqual([{ publicSlug: 'my-band' }]);
    });
    expect(postedBodies().some((body) => body.publicSlug === 'my-band-')).toBe(false);
    expect(onSaveError).not.toHaveBeenCalled();
    expect(result.current.publicSlug).toBe('my-band');
    expect(result.current.hasUnsavedChanges).toBe(false);
  });
});
