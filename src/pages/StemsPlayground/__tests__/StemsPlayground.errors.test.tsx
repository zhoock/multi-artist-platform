import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@shared/lib/test-utils';
import type { MixerAlbum } from '../lib/types';

const mockLoadAlbumTracks = jest.fn<() => Promise<MixerAlbum | null>>();
const mockGetSharedMix = jest.fn<(mixId: string) => Promise<unknown>>();

let navigationState: {
  view: 'albums' | 'tracks' | 'mixer';
  selectedAlbum: MixerAlbum | null;
  selectedTrack: null;
};

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'en' }),
}));

jest.mock('@shared/lib/hooks/useArtistPageBuilder', () => ({
  useArtistPageBuilder: () => ({
    isOwner: false,
    ownerResolved: true,
    showOnboarding: false,
    showOnboardingSkeleton: false,
    showNotFound: false,
  }),
}));

jest.mock('@shared/lib/hooks/useSiteArtistDisplayName', () => ({
  useSiteArtistDisplayName: () => ({ displayName: 'Test Artist' }),
}));

jest.mock('@shared/lib/hooks/useRedirectHomeAfterOwnAccountDeleted', () => ({
  useRedirectHomeAfterOwnAccountDeleted: () => false,
}));

jest.mock('@shared/lib/archiveAccessModal', () => ({
  useArchiveAccessModal: () => ({ requestAccess: jest.fn() }),
}));

jest.mock('@shared/api/savedMixes', () => ({
  getSharedMix: (mixId: string) => mockGetSharedMix(mixId),
  getMyMixes: jest.fn(async () => []),
  createMix: jest.fn(),
  deleteMix: jest.fn(),
}));

jest.mock('../lib/useMixerCatalog', () => ({
  useMixerCatalog: () => ({
    albums: navigationState.selectedAlbum ? [navigationState.selectedAlbum] : [],
    loading: false,
    catalogStatus: 'succeeded',
    catalogCacheStale: false,
    catalogHasStemAlbums: true,
    tracksLoadingAlbumId: null,
    loadAlbumTracks: mockLoadAlbumTracks,
  }),
}));

jest.mock('../lib/useMixerNavigation', () => ({
  useMixerNavigation: () => ({
    view: navigationState.view,
    selectedAlbum: navigationState.selectedAlbum,
    selectedTrack: navigationState.selectedTrack,
    selectAlbum: jest.fn(),
    selectTrack: jest.fn(),
    backToAlbums: jest.fn(),
    backToTracks: jest.fn(),
  }),
}));

jest.mock('../components/MixerPlayerPanel', () => ({
  MixerPlayerPanel: () => <div data-testid="mixer-player-panel" />,
}));

import StemsPlayground from '../StemsPlayground';

const uiDictionary = {
  menu: {},
  buttons: { playButton: 'Play', pause: 'Pause' },
  titles: {},
  stems: {
    pageTitle: 'Mixer',
    selectAlbumHint: 'Choose an album',
    noAlbums: 'No albums',
    tracksLoadError: 'Could not load tracks for this album.',
    retry: 'Retry',
    sharedMixLoadError: 'This shared mix link is invalid or unavailable.',
    sharedMixApplyError: 'Could not open the track for this shared mix.',
    backToMixer: 'Open Mixer',
    stemsLoadError: 'Could not load stems',
    stemLoadFailed: 'Unavailable',
    playBlocked: 'Tap Play again',
    partialStemsFailed: 'Some stems failed',
    solo: 'Solo',
    mute: 'Mute',
  },
};

function renderStems(initialEntries: string[]) {
  return renderWithProviders(
    <Routes>
      <Route path="/en/stems/mix/:mixId" element={<StemsPlayground />} />
      <Route path="/en/stems" element={<StemsPlayground />} />
    </Routes>,
    {
      initialEntries,
      preloadedState: {
        lang: { current: 'en' },
        uiDictionary: {
          en: {
            status: 'succeeded',
            error: null,
            data: [uiDictionary],
            lastUpdated: Date.now(),
          },
          ru: { status: 'idle', error: null, data: [], lastUpdated: null },
        },
        popup: { isOpen: false },
        currentArtist: { publicSlug: 'beatles' },
      },
    }
  );
}

describe('StemsPlayground error surfaces', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = jest.fn();
    window.scrollTo = jest.fn();
    mockLoadAlbumTracks.mockReset();
    mockGetSharedMix.mockReset();
    navigationState = {
      view: 'tracks',
      selectedAlbum: {
        albumId: 'album-1',
        title: 'Album One',
        year: '2024',
        listedTrackCount: 2,
        tracks: [],
        tracksStatus: 'failed',
        userId: 'user-1',
      },
      selectedTrack: null,
    };
  });

  test('shows tracks load error and Retry when tracksStatus is failed', () => {
    renderStems(['/en/stems?artist=beatles']);

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load tracks for this album.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mockLoadAlbumTracks).toHaveBeenCalledWith('album-1', { force: true });
  });

  test('shows shared mix fetch error with Retry', async () => {
    mockGetSharedMix.mockRejectedValue(new Error('not found'));

    renderStems(['/en/stems/mix/mix-404?artist=beatles']);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'This shared mix link is invalid or unavailable.'
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mockGetSharedMix.mock.calls.length).toBeGreaterThan(1);
  });
});
