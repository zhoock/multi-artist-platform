import { describe, expect, it } from '@jest/globals';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { DashboardModalShellContext } from '@shared/lib/dashboardModalShellContext';
import { useEffectiveLocation, useEffectiveSearchParams } from '../useEffectiveLocation';

function wrapperWithAuthOverlay({ children }: { children: ReactNode }) {
  const backgroundLocation = {
    pathname: '/',
    search: '?artist=band-slug',
    hash: '',
    state: null,
    key: 'bg',
  };

  return (
    <DashboardModalShellContext.Provider value={{ overlayOpen: false, surfaceLocation: null }}>
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/auth',
            search: '?mode=login',
            state: { backgroundLocation },
          },
        ]}
      >
        <Routes>
          <Route path="*" element={children} />
        </Routes>
      </MemoryRouter>
    </DashboardModalShellContext.Provider>
  );
}

describe('useEffectiveLocation', () => {
  it('returns backgroundLocation while auth overlay is open', () => {
    const { result } = renderHook(
      () => ({
        live: useLocation(),
        effective: useEffectiveLocation(),
        searchParams: useEffectiveSearchParams()[0],
      }),
      { wrapper: wrapperWithAuthOverlay }
    );

    expect(result.current.live.pathname).toBe('/auth');
    expect(result.current.effective.pathname).toBe('/');
    expect(result.current.effective.search).toBe('?artist=band-slug');
    expect(result.current.searchParams.get('artist')).toBe('band-slug');
  });

  it('returns dashboard surface while dashboard overlay is open', () => {
    const surfaceLocation = {
      pathname: '/albums',
      search: '?artist=band-slug',
      hash: '',
      state: null,
      key: 'surface',
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <DashboardModalShellContext.Provider value={{ overlayOpen: true, surfaceLocation }}>
        <MemoryRouter initialEntries={['/dashboard-new/albums']}>
          <Routes>
            <Route path="*" element={children} />
          </Routes>
        </MemoryRouter>
      </DashboardModalShellContext.Provider>
    );

    const { result } = renderHook(() => useEffectiveLocation(), { wrapper });
    expect(result.current.pathname).toBe('/albums');
    expect(result.current.search).toBe('?artist=band-slug');
  });
});
