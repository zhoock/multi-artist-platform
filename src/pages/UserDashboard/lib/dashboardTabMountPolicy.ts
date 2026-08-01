import type { DashboardTab } from '@shared/lib/accountType';

export type ComputeMountedTabsInput = {
  activeTab: DashboardTab;
  previousTab: DashboardTab | null;
  pinnedTabs: ReadonlySet<DashboardTab>;
};

/** Tabs that stay mounted: active + previous + any pinned (in-flight/dirty/playback). */
export function computeMountedTabs({
  activeTab,
  previousTab,
  pinnedTabs,
}: ComputeMountedTabsInput): Set<DashboardTab> {
  const mounted = new Set<DashboardTab>([activeTab, ...pinnedTabs]);
  if (previousTab) {
    mounted.add(previousTab);
  }
  return mounted;
}

export function shouldMountDashboardTab(
  tab: DashboardTab,
  mountedTabs: ReadonlySet<DashboardTab>
): boolean {
  return mountedTabs.has(tab);
}

export function computeAlbumsTabPinned(input: {
  isUploadingTracks: Record<string, boolean>;
  replacingTrackId: string | null;
}): boolean {
  if (input.replacingTrackId) {
    return true;
  }
  return Object.values(input.isUploadingTracks).some(Boolean);
}
