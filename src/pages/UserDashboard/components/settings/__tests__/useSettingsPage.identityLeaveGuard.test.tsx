/** @jest-environment jsdom */

import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { useState, type ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider, useLocation, useNavigate } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';

import { langReducer } from '@shared/model/lang/langSlice';
import { uiDictionaryReducer } from '@shared/model/uiDictionary/uiDictionarySlice';
import { useUnsavedNavigationLeaveGuard } from '@shared/lib/hooks/useUnsavedNavigationLeaveGuard';

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

if (typeof Request === 'undefined') {
  class TestRequest {
    url: string;
    constructor(input: string | { url?: string }) {
      this.url = typeof input === 'string' ? input : String(input.url ?? '');
    }
  }
  (globalThis as unknown as { Request: typeof Request }).Request =
    TestRequest as unknown as typeof Request;
}

const RU_ABOUT = 'Stored RU paragraph';

let serverProfile: ServerProfile;

function postedBodies(): Record<string, unknown>[] {
  return fetchWithAuthSessionMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

function createStore() {
  return configureStore({
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
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

type SettingsPanelProps = {
  enabled: boolean;
  onIdentityDiscardRiskChange: (hasRisk: boolean) => void;
};

function SettingsPanel({ enabled, onIdentityDiscardRiskChange }: SettingsPanelProps) {
  const {
    name,
    setName,
    publicSlug,
    handlePublicSlugChange,
    handleNameBlur,
    handlePublicSlugBlur,
    hasLoadedOnce,
    hasIdentityUnsavedChanges,
  } = useSettingsPage({
    enabled,
    userName: 'Fallback Name',
    onIdentityDiscardRiskChange,
  });

  if (!hasLoadedOnce) {
    return <div data-testid="settings-loading">loading</div>;
  }

  return (
    <div>
      <div data-testid="identity-dirty">{String(hasIdentityUnsavedChanges)}</div>
      <input
        data-testid="site-name"
        aria-label="Site name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={handleNameBlur}
      />
      <input
        data-testid="public-slug"
        aria-label="Public slug"
        value={publicSlug}
        onChange={(event) => handlePublicSlugChange(event.target.value)}
        onBlur={handlePublicSlugBlur}
      />
    </div>
  );
}

type HarnessOptions = {
  simulateArticleDiscardRisk?: boolean;
};

function SettingsIdentityLeaveGuardHarness({ simulateArticleDiscardRisk = false }: HarnessOptions) {
  const [settingsIdentityRisk, setSettingsIdentityRisk] = useState(false);
  const [articleRisk, setArticleRisk] = useState(simulateArticleDiscardRisk);
  const navigate = useNavigate();
  const guardActive = settingsIdentityRisk || articleRisk;
  const blocker = useUnsavedNavigationLeaveGuard(guardActive);

  return (
    <>
      <LocationProbe />
      <div data-testid="guard-active">{String(guardActive)}</div>
      <div data-testid="blocker-state">{blocker.state}</div>
      <SettingsPanel enabled onIdentityDiscardRiskChange={setSettingsIdentityRisk} />
      {simulateArticleDiscardRisk ? (
        <button type="button" onClick={() => setArticleRisk(true)}>
          Mark article dirty
        </button>
      ) : null}
      <button type="button" onClick={() => navigate('/')}>
        Leave dashboard
      </button>
      {blocker.state === 'blocked' ? (
        <>
          <button type="button" onClick={() => blocker.proceed?.()}>
            Confirm leave
          </button>
          <button type="button" onClick={() => blocker.reset?.()}>
            Stay
          </button>
        </>
      ) : null}
    </>
  );
}

function TabSwitchHarness() {
  const [enabled, setEnabled] = useState(true);
  const [settingsIdentityRisk, setSettingsIdentityRisk] = useState(false);
  useUnsavedNavigationLeaveGuard(settingsIdentityRisk);

  return (
    <>
      <div data-testid="guard-active">{String(settingsIdentityRisk)}</div>
      <SettingsPanel enabled={enabled} onIdentityDiscardRiskChange={setSettingsIdentityRisk} />
      <button type="button" onClick={() => setEnabled(false)}>
        Switch tab
      </button>
      <button type="button" onClick={() => setEnabled(true)}>
        Return to settings
      </button>
    </>
  );
}

function renderDashboardHarness(options?: HarnessOptions) {
  const store = createStore();
  const router = createMemoryRouter(
    [
      {
        path: '/dashboard/settings',
        element: <SettingsIdentityLeaveGuardHarness {...options} />,
      },
      { path: '/', element: <div data-testid="public-home">home</div> },
    ],
    { initialEntries: ['/dashboard/settings'] }
  );

  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  );

  return { router };
}

function renderTabSwitchHarness() {
  const store = createStore();
  const router = createMemoryRouter(
    [
      {
        path: '/dashboard/settings',
        element: <TabSwitchHarness />,
      },
    ],
    { initialEntries: ['/dashboard/settings'] }
  );

  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  );
}

async function waitForSettingsReady() {
  await waitFor(() => {
    expect(screen.queryByTestId('settings-loading')).toBeNull();
  });
  await waitFor(() => {
    expect(screen.getByTestId('site-name')).toHaveValue(serverProfile.siteName);
  });
}

async function waitForGuardActive() {
  await waitFor(() => {
    expect(screen.getByTestId('guard-active')).toHaveTextContent('true');
  });
}

function dispatchBeforeUnload(): BeforeUnloadEvent {
  const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
  Object.defineProperty(event, 'returnValue', { configurable: true, writable: true, value: '' });
  window.dispatchEvent(event);
  return event;
}

describe('useSettingsPage — identity leave guard (S13)', () => {
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

  it('blocks leaving dashboard when siteName is dirty without blur', async () => {
    renderDashboardHarness();
    await waitForSettingsReady();

    fireEvent.change(screen.getByTestId('site-name'), { target: { value: 'Dirty Band' } });
    await waitForGuardActive();

    fireEvent.click(screen.getByRole('button', { name: 'Leave dashboard' }));

    await waitFor(() => {
      expect(screen.getByTestId('blocker-state')).toHaveTextContent('blocked');
    });
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard/settings');
    expect(postedBodies()).toEqual([]);
  });

  it('blocks leaving dashboard when publicSlug is dirty without blur', async () => {
    renderDashboardHarness();
    await waitForSettingsReady();

    fireEvent.change(screen.getByTestId('public-slug'), { target: { value: 'dirty-slug' } });
    await waitForGuardActive();

    fireEvent.click(screen.getByRole('button', { name: 'Leave dashboard' }));

    await waitFor(() => {
      expect(screen.getByTestId('blocker-state')).toHaveTextContent('blocked');
    });
    expect(postedBodies()).toEqual([]);
  });

  it('blocks leaving when both identity fields are dirty', async () => {
    renderDashboardHarness();
    await waitForSettingsReady();

    fireEvent.change(screen.getByTestId('site-name'), { target: { value: 'Dirty Band' } });
    fireEvent.change(screen.getByTestId('public-slug'), { target: { value: 'dirty-slug' } });
    await waitForGuardActive();

    fireEvent.click(screen.getByRole('button', { name: 'Leave dashboard' }));

    await waitFor(() => {
      expect(screen.getByTestId('blocker-state')).toHaveTextContent('blocked');
    });
  });

  it('keeps the draft after Stay and does not save', async () => {
    renderDashboardHarness();
    await waitForSettingsReady();

    fireEvent.change(screen.getByTestId('site-name'), { target: { value: 'Dirty Band' } });
    await waitForGuardActive();
    fireEvent.click(screen.getByRole('button', { name: 'Leave dashboard' }));
    await waitFor(() => {
      expect(screen.getByTestId('blocker-state')).toHaveTextContent('blocked');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));

    await waitFor(() => {
      expect(screen.getByTestId('blocker-state')).toHaveTextContent('unblocked');
    });
    expect(screen.getByTestId('site-name')).toHaveValue('Dirty Band');
    expect(screen.getByTestId('identity-dirty')).toHaveTextContent('true');
    expect(postedBodies()).toEqual([]);
  });

  it('continues navigation on Discard without blur-save', async () => {
    renderDashboardHarness();
    await waitForSettingsReady();

    fireEvent.change(screen.getByTestId('public-slug'), { target: { value: 'dirty-slug' } });
    await waitForGuardActive();
    fireEvent.click(screen.getByRole('button', { name: 'Leave dashboard' }));
    await waitFor(() => {
      expect(screen.getByTestId('blocker-state')).toHaveTextContent('blocked');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Confirm leave' }));

    await waitFor(() => {
      expect(screen.getByTestId('public-home')).toBeTruthy();
    });
    expect(postedBodies()).toEqual([]);
  });

  it('does not block leave after blur save', async () => {
    renderDashboardHarness();
    await waitForSettingsReady();

    fireEvent.change(screen.getByTestId('site-name'), { target: { value: 'Saved Band' } });
    fireEvent.blur(screen.getByTestId('site-name'));

    await waitFor(() => {
      expect(screen.getByTestId('guard-active')).toHaveTextContent('false');
    });
    await waitFor(() => {
      expect(postedBodies()).toEqual([{ siteName: 'Saved Band' }]);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Leave dashboard' }));

    await waitFor(() => {
      expect(screen.getByTestId('public-home')).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: 'Stay' })).toBeNull();
  });

  it('registers beforeunload while identity is dirty', async () => {
    const addSpy = jest.spyOn(window, 'addEventListener');
    renderDashboardHarness();
    await waitForSettingsReady();

    fireEvent.change(screen.getByTestId('site-name'), { target: { value: 'Dirty Band' } });
    await waitForGuardActive();

    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    const event = dispatchBeforeUnload();
    expect(event.defaultPrevented).toBe(true);

    addSpy.mockRestore();
  });

  it('preserves identity draft when the settings tab is deactivated and reactivated', async () => {
    renderTabSwitchHarness();
    await waitForSettingsReady();

    fireEvent.change(screen.getByTestId('site-name'), { target: { value: 'Tab Dirty' } });
    await waitForGuardActive();

    fireEvent.click(screen.getByRole('button', { name: 'Switch tab' }));
    fireEvent.click(screen.getByRole('button', { name: 'Return to settings' }));

    expect(screen.getByTestId('site-name')).toHaveValue('Tab Dirty');
    expect(screen.getByTestId('identity-dirty')).toHaveTextContent('true');
    expect(postedBodies()).toEqual([]);
  });

  it('uses one combined guard when article and settings identity are both dirty', async () => {
    renderDashboardHarness({ simulateArticleDiscardRisk: true });
    await waitForSettingsReady();

    fireEvent.click(screen.getByRole('button', { name: 'Mark article dirty' }));
    fireEvent.change(screen.getByTestId('site-name'), { target: { value: 'Dirty Band' } });
    await waitForGuardActive();

    fireEvent.click(screen.getByRole('button', { name: 'Leave dashboard' }));

    await waitFor(() => {
      expect(screen.getByTestId('blocker-state')).toHaveTextContent('blocked');
    });
    expect(screen.getAllByRole('button', { name: 'Stay' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Confirm leave' })).toHaveLength(1);
  });

  it('keeps trailing hyphen dirty without auto-save until blur', async () => {
    renderDashboardHarness();
    await waitForSettingsReady();

    fireEvent.change(screen.getByTestId('public-slug'), { target: { value: 'my-band-' } });

    await waitFor(() => {
      expect(screen.getByTestId('public-slug')).toHaveValue('my-band-');
    });
    expect(screen.getByTestId('identity-dirty')).toHaveTextContent('true');
    await waitForGuardActive();

    fireEvent.click(screen.getByRole('button', { name: 'Leave dashboard' }));
    await waitFor(() => {
      expect(screen.getByTestId('blocker-state')).toHaveTextContent('blocked');
    });
    expect(postedBodies()).toEqual([]);
  });
});
