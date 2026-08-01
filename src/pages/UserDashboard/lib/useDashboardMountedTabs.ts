import { useCallback, useMemo, useRef } from 'react';

import type { DashboardTab } from '@shared/lib/accountType';

import { computeMountedTabs, shouldMountDashboardTab } from './dashboardTabMountPolicy';

export function useDashboardMountedTabs(
  activeTab: DashboardTab,
  pinnedTabs: ReadonlySet<DashboardTab>
) {
  const previousTabRef = useRef<DashboardTab | null>(null);
  const lastActiveTabRef = useRef(activeTab);

  if (lastActiveTabRef.current !== activeTab) {
    previousTabRef.current = lastActiveTabRef.current;
    lastActiveTabRef.current = activeTab;
  }

  const mountedTabs = useMemo(
    () =>
      computeMountedTabs({
        activeTab,
        previousTab: previousTabRef.current,
        pinnedTabs,
      }),
    [activeTab, pinnedTabs]
  );

  const shouldMount = useCallback(
    (tab: DashboardTab) => shouldMountDashboardTab(tab, mountedTabs),
    [mountedTabs]
  );

  return { shouldMount, mountedTabs };
}
