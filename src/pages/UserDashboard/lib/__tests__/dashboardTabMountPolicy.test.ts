import { describe, expect, it } from '@jest/globals';

import {
  computeAlbumsTabPinned,
  computeMountedTabs,
  shouldMountDashboardTab,
} from '../dashboardTabMountPolicy';

describe('computeMountedTabs', () => {
  it('mounts only the active tab on first visit', () => {
    const mounted = computeMountedTabs({
      activeTab: 'albums',
      previousTab: null,
      pinnedTabs: new Set(),
    });
    expect([...mounted]).toEqual(['albums']);
  });

  it('keeps active and previous tabs mounted', () => {
    const mounted = computeMountedTabs({
      activeTab: 'mixer',
      previousTab: 'settings',
      pinnedTabs: new Set(),
    });
    expect([...mounted].sort()).toEqual(['mixer', 'settings']);
  });

  it('includes pinned tabs alongside active and previous', () => {
    const mounted = computeMountedTabs({
      activeTab: 'mixer',
      previousTab: 'settings',
      pinnedTabs: new Set(['albums']),
    });
    expect([...mounted].sort()).toEqual(['albums', 'mixer', 'settings']);
  });
});

describe('shouldMountDashboardTab', () => {
  it('returns true only for tabs in the mounted set', () => {
    const mounted = new Set(['albums', 'settings'] as const);
    expect(shouldMountDashboardTab('albums', mounted)).toBe(true);
    expect(shouldMountDashboardTab('posts', mounted)).toBe(false);
  });
});

describe('computeAlbumsTabPinned', () => {
  it('pins while any album upload is in progress', () => {
    expect(
      computeAlbumsTabPinned({
        isUploadingTracks: { a1: true },
        replacingTrackId: null,
      })
    ).toBe(true);
  });

  it('pins while track audio replacement is in progress', () => {
    expect(
      computeAlbumsTabPinned({
        isUploadingTracks: {},
        replacingTrackId: 'track-1',
      })
    ).toBe(true);
  });

  it('does not pin when idle', () => {
    expect(
      computeAlbumsTabPinned({
        isUploadingTracks: {},
        replacingTrackId: null,
      })
    ).toBe(false);
  });
});
