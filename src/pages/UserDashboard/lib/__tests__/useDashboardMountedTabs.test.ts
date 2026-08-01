import { describe, expect, it } from '@jest/globals';
import { renderHook } from '@testing-library/react';

import type { DashboardTab } from '@shared/lib/accountType';

import { useDashboardMountedTabs } from '../useDashboardMountedTabs';

describe('useDashboardMountedTabs', () => {
  it('mounts only the active tab on initial open', () => {
    const pinnedTabs = new Set<DashboardTab>();
    const { result } = renderHook(() => useDashboardMountedTabs('albums', pinnedTabs));

    expect(result.current.shouldMount('albums')).toBe(true);
    expect(result.current.shouldMount('settings')).toBe(false);
    expect(result.current.shouldMount('mixer')).toBe(false);
  });

  it('keeps previous tab mounted after switching tabs', () => {
    const pinnedTabs = new Set<DashboardTab>();
    const { result, rerender } = renderHook(
      ({ activeTab }: { activeTab: DashboardTab }) =>
        useDashboardMountedTabs(activeTab, pinnedTabs),
      { initialProps: { activeTab: 'albums' as DashboardTab } }
    );

    rerender({ activeTab: 'settings' });

    expect(result.current.shouldMount('settings')).toBe(true);
    expect(result.current.shouldMount('albums')).toBe(true);
    expect(result.current.shouldMount('mixer')).toBe(false);
  });

  it('includes pinned tabs in mounted set', () => {
    const pinnedTabs = new Set<DashboardTab>(['mixer']);
    const { result } = renderHook(() => useDashboardMountedTabs('albums', pinnedTabs));

    expect(result.current.shouldMount('albums')).toBe(true);
    expect(result.current.shouldMount('mixer')).toBe(true);
    expect(result.current.shouldMount('settings')).toBe(false);
  });
});
