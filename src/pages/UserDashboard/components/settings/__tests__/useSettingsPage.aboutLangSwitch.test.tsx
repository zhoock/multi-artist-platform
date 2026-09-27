import { describe, expect, it, jest, beforeEach } from '@jest/globals';
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

const RU_ABOUT = 'Stored RU paragraph';
const EN_ABOUT = 'Stored EN paragraph';
const DIRTY_RU_ABOUT = 'Dirty RU about draft';
const DIRTY_EN_ABOUT = 'Dirty EN about draft';

function createWrapper(initialLang: 'ru' | 'en' = 'ru') {
  const store = configureStore({
    reducer: {
      lang: langReducer,
      uiDictionary: uiDictionaryReducer,
    } as never,
    preloadedState: {
      lang: { current: initialLang },
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

async function renderSettingsPage(initialLang: 'ru' | 'en' = 'ru') {
  const view = renderHook(
    () =>
      useSettingsPage({
        enabled: true,
        userName: 'Test Band',
      }),
    { wrapper: createWrapper(initialLang) }
  );

  await waitFor(() => {
    expect(view.result.current.hasLoadedOnce).toBe(true);
  });

  return view;
}

describe('useSettingsPage — About draft must survive language switch (S5)', () => {
  beforeEach(() => {
    localStorage.clear();

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
      lang === 'ru' ? [RU_ABOUT] : [EN_ABOUT]
    );
    loadHeaderImagesFromDatabaseMock.mockResolvedValue([]);
    saveTheBandToDatabaseMock.mockResolvedValue({ success: true });
  });

  it('keeps a dirty RU About draft when switching to EN is requested', async () => {
    const view = await renderSettingsPage('ru');
    expect(view.result.current.aboutText).toBe(RU_ABOUT);

    act(() => {
      view.result.current.handleAboutChange(DIRTY_RU_ABOUT);
    });
    expect(view.result.current.hasUnsavedChanges).toBe(true);

    await act(async () => {
      view.result.current.handleLanguageChange('en');
    });

    expect(view.result.current.currentLang).toBe('ru');
    expect(view.result.current.aboutText).toBe(DIRTY_RU_ABOUT);
    expect(view.result.current.hasUnsavedChanges).toBe(true);
    expect(view.result.current.aboutLangSwitchDiscardOpen).toBe(true);
    expect(saveTheBandToDatabaseMock).not.toHaveBeenCalled();
  });

  it('keeps a dirty EN About draft when switching to RU is requested', async () => {
    const view = await renderSettingsPage('en');
    await waitFor(() => {
      expect(view.result.current.aboutText).toBe(EN_ABOUT);
    });

    act(() => {
      view.result.current.handleAboutChange(DIRTY_EN_ABOUT);
    });

    await act(async () => {
      view.result.current.handleLanguageChange('ru');
    });

    expect(view.result.current.currentLang).toBe('en');
    expect(view.result.current.aboutText).toBe(DIRTY_EN_ABOUT);
    expect(view.result.current.hasUnsavedChanges).toBe(true);
    expect(view.result.current.aboutLangSwitchDiscardOpen).toBe(true);
  });

  it('restores draft and language after canceling the discard dialog', async () => {
    const view = await renderSettingsPage('ru');

    act(() => {
      view.result.current.handleAboutChange(DIRTY_RU_ABOUT);
    });
    await act(async () => {
      view.result.current.handleLanguageChange('en');
    });

    await act(async () => {
      view.result.current.dismissAboutLangSwitchDiscard();
    });

    expect(view.result.current.aboutLangSwitchDiscardOpen).toBe(false);
    expect(view.result.current.currentLang).toBe('ru');
    expect(view.result.current.aboutText).toBe(DIRTY_RU_ABOUT);
    expect(view.result.current.hasUnsavedChanges).toBe(true);
  });

  it('switches language and shows stored About after confirmed discard', async () => {
    const view = await renderSettingsPage('ru');

    act(() => {
      view.result.current.handleAboutChange(DIRTY_RU_ABOUT);
    });
    await act(async () => {
      view.result.current.handleLanguageChange('en');
    });

    await act(async () => {
      view.result.current.confirmAboutLangSwitchDiscard();
    });

    await waitFor(() => {
      expect(view.result.current.currentLang).toBe('en');
    });
    expect(view.result.current.aboutText).toBe(EN_ABOUT);
    expect(view.result.current.hasUnsavedChanges).toBe(false);
    expect(view.result.current.aboutLangSwitchDiscardOpen).toBe(false);
    expect(saveTheBandToDatabaseMock).not.toHaveBeenCalled();
  });

  it('switches RU ↔ EN with clean About as before', async () => {
    const view = await renderSettingsPage('ru');
    expect(view.result.current.aboutText).toBe(RU_ABOUT);
    expect(view.result.current.hasUnsavedChanges).toBe(false);

    await act(async () => {
      view.result.current.handleLanguageChange('en');
    });

    await waitFor(() => {
      expect(view.result.current.currentLang).toBe('en');
    });
    expect(view.result.current.aboutText).toBe(EN_ABOUT);
    expect(view.result.current.hasUnsavedChanges).toBe(false);
    expect(view.result.current.aboutLangSwitchDiscardOpen).toBe(false);

    await act(async () => {
      view.result.current.handleLanguageChange('ru');
    });

    await waitFor(() => {
      expect(view.result.current.currentLang).toBe('ru');
    });
    expect(view.result.current.aboutText).toBe(RU_ABOUT);
    expect(view.result.current.hasUnsavedChanges).toBe(false);
  });
});
