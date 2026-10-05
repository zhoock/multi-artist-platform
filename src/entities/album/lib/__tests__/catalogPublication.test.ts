import { describe, expect, test } from '@jest/globals';
import type { AlbumEditable } from '@models';

import {
  dashboardAlbumHasPublicListedTrack,
  filterDashboardAlbumsForPublicArtistPageSurface,
} from '../catalogPublication';

function album(
  overrides: Partial<AlbumEditable> & { tracks?: AlbumEditable['tracks'] }
): AlbumEditable {
  return {
    albumId: 'rubber-soul',
    album: 'Rubber Soul',
    cover: 'cover',
    isPublished: true,
    isPublic: true,
    release: { date: '1965-12-03' },
    tracks: [],
    ...overrides,
  } as AlbumEditable;
}

function track(
  processingStatus: 'ready' | 'failed' | 'pending' | 'processing',
  visibility: 'public' | 'hidden' = 'public'
) {
  return {
    id: 't1',
    title: 'Track',
    src: processingStatus === 'ready' ? 'https://example/a.opus' : '',
    duration: 120,
    content: '',
    order_index: 0,
    visibility,
    stemsVisibility: 'hidden' as const,
    processingStatus,
  };
}

describe('filterDashboardAlbumsForPublicArtistPageSurface', () => {
  test('ready track → album visible on public artist page', () => {
    const rows = filterDashboardAlbumsForPublicArtistPageSurface([
      album({ tracks: [track('ready')] }),
    ]);
    expect(rows).toHaveLength(1);
    expect(dashboardAlbumHasPublicListedTrack(rows[0]!)).toBe(true);
  });

  test('failed-only track → album not visible on public artist page', () => {
    expect(
      filterDashboardAlbumsForPublicArtistPageSurface([album({ tracks: [track('failed')] })])
    ).toHaveLength(0);
  });

  test('pending-only track → album not visible on public artist page', () => {
    expect(
      filterDashboardAlbumsForPublicArtistPageSurface([album({ tracks: [track('pending')] })])
    ).toHaveLength(0);
  });

  test('processing-only track → album not visible on public artist page', () => {
    expect(
      filterDashboardAlbumsForPublicArtistPageSurface([album({ tracks: [track('processing')] })])
    ).toHaveLength(0);
  });

  test('empty album → not visible on public artist page', () => {
    expect(filterDashboardAlbumsForPublicArtistPageSurface([album({ tracks: [] })])).toHaveLength(
      0
    );
  });

  test('mixer-only (hidden + visible stems) with failed main audio stays listed', () => {
    const rows = filterDashboardAlbumsForPublicArtistPageSurface([
      album({
        tracks: [
          {
            ...track('failed', 'hidden'),
            stemsVisibility: 'public',
          },
        ],
      }),
    ]);
    expect(rows).toHaveLength(1);
  });
});
