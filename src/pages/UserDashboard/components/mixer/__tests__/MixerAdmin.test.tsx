import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { AlbumData } from '@entities/album/lib/transformEditableAlbumData';
import { renderWithProviders } from '@shared/lib/test-utils';
import { resetDashboardAccordionOnboardingForTests } from '../../../lib/dashboardAccordionOnboarding';
import { MixerAdmin } from '../MixerAdmin';

const navigateMock = jest.fn<(path: string) => void>();

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const loadStemsMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const saveStemsManifestMock = jest.fn<(...args: unknown[]) => Promise<void>>();

jest.mock('@entities/stem', () => {
  const actual = jest.requireActual('@entities/stem') as typeof import('@entities/stem');
  return {
    ...actual,
    loadStems: (...args: unknown[]) => loadStemsMock(...args),
    saveStemsManifest: (...args: unknown[]) => saveStemsManifestMock(...args),
    uploadStemAudio: jest.fn(),
    deleteStemFile: jest.fn(),
    getStemStoragePath: jest.fn(),
    getStemAudioUrl: jest.fn(),
    updateStemsVisibility: jest.fn(),
  };
});

jest.mock('@config/user', () => ({
  getUserUserId: () => 'user-1',
}));

const emptyLyrics = (albumId: string, trackId: string) => ({
  albumId,
  trackId,
  lang: 'en',
  content: '',
  syncedLines: null,
  state: 'empty' as const,
  syncedAt: null,
});

const sampleAlbum: AlbumData = {
  id: 'album-1',
  albumId: 'album-1',
  title: 'Test Album',
  artist: 'Test Artist',
  year: '2026',
  isPublic: false,
  isPublished: false,
  tracks: [
    {
      id: 'track-1',
      title: 'Track One',
      order_index: 0,
      duration: '3:00',
      lyrics: emptyLyrics('album-1', 'track-1'),
      stemsVisibility: 'public',
    },
  ],
};

const mixerUi = {
  dashboard: {
    mixer: {
      stemsEmptyTitle: 'No stems yet',
      stemsEmptyDescription: 'Add the first stem for this track.',
      noTracksTitle: 'Add a track first',
      noTracksDescription: 'Stems can only be uploaded for existing tracks.',
      noTracksAction: 'Go to album',
      addStem: 'Add stem',
      stemsVisibility: {
        public: { title: 'Open to everyone' },
        subscribersOnly: { title: 'Subscribers only' },
        hidden: { title: 'Hidden' },
      },
    },
  },
};

describe('MixerAdmin', () => {
  beforeEach(() => {
    resetDashboardAccordionOnboardingForTests();
    navigateMock.mockReset();
    loadStemsMock.mockReset();
    saveStemsManifestMock.mockReset();
    saveStemsManifestMock.mockResolvedValue(undefined);
    loadStemsMock.mockResolvedValue({
      stems: [],
      accessToken: null,
      accessTokenExpiresAt: null,
    });
  });

  it('renders dashboard kit layout and auto-expands first album on first open', async () => {
    const { container } = renderWithProviders(
      <MixerAdmin ui={mixerUi as never} userId="user-1" albums={[sampleAlbum]} tabActive />,
      {
        preloadedState: {
          lang: { current: 'en' },
        },
      }
    );

    expect(container.querySelector('.user-dashboard__section')).toBeTruthy();
    expect(container.querySelector('.dashboard-card')).toBeTruthy();
    expect(screen.getByText('Test Album')).toBeTruthy();

    await waitFor(() => {
      expect(loadStemsMock).toHaveBeenCalled();
      expect(container.querySelector('.user-dashboard__album-card--expanded')).toBeTruthy();
    });

    const albumCard = container.querySelector('.user-dashboard__album-card--expanded');
    const expandedBody = container.querySelector('.user-dashboard__album-body');
    expect(albumCard).toBeTruthy();
    expect(expandedBody).toBeTruthy();
    expect(albumCard?.contains(expandedBody)).toBe(true);
  });

  it('shows card empty state when track has no stems', async () => {
    const { container } = renderWithProviders(
      <MixerAdmin ui={mixerUi as never} userId="user-1" albums={[sampleAlbum]} tabActive />,
      {
        preloadedState: {
          lang: { current: 'en' },
        },
      }
    );

    await waitFor(() => {
      expect(screen.getByText('No stems yet')).toBeTruthy();
    });

    expect(container.querySelector('.dashboard-empty-state--card')).toBeTruthy();
    expect(container.querySelector('.status-badge')).toBeNull();
  });

  it('shows mixer no-tracks empty state and navigates to albums tab', async () => {
    const albumWithoutTracks: AlbumData = {
      ...sampleAlbum,
      tracks: [],
    };
    const user = userEvent.setup();

    renderWithProviders(
      <MixerAdmin ui={mixerUi as never} userId="user-1" albums={[albumWithoutTracks]} tabActive />,
      {
        preloadedState: {
          lang: { current: 'en' },
        },
      }
    );

    await waitFor(() => {
      expect(screen.getByText('Add a track first')).toBeTruthy();
      expect(screen.getByText('Stems can only be uploaded for existing tracks.')).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Go to album' }));

    expect(navigateMock).toHaveBeenCalledWith('/dashboard/albums?focusAlbum=album-1');
  });

  it('shows visibility globe button in track header when stems are loaded', async () => {
    loadStemsMock.mockResolvedValue({
      stems: [
        {
          id: 'stem-1',
          name: 'Drums',
          category: 'drums',
          file: 'drums.wav',
          size: 1024,
        },
      ],
      accessToken: 'token',
      accessTokenExpiresAt: Date.now() + 60_000,
    });

    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <MixerAdmin ui={mixerUi as never} userId="user-1" albums={[sampleAlbum]} tabActive={false} />,
      {
        preloadedState: {
          lang: { current: 'en' },
        },
      }
    );

    await user.click(screen.getByLabelText('Expand album'));

    await waitFor(() => {
      expect(
        container.querySelector(
          '.user-dashboard__expanded-track-access-slot .track-visibility-icon'
        )
      ).toBeTruthy();
    });

    await user.click(screen.getByLabelText('Stem access'));

    expect(screen.getByText('Open to everyone')).toBeTruthy();
  });

  it('calls onMountPinChange when playback or modal state requires pinning', () => {
    const onMountPinChange = jest.fn<(pinned: boolean) => void>();

    const { unmount } = renderWithProviders(
      <MixerAdmin
        ui={mixerUi as never}
        userId="user-1"
        albums={[sampleAlbum]}
        tabActive
        onMountPinChange={onMountPinChange}
      />,
      {
        preloadedState: {
          lang: { current: 'en' },
        },
      }
    );

    expect(onMountPinChange).toHaveBeenCalledWith(false);

    unmount();
  });

  it('dedupes concurrent loadStems requests for the same track during onboarding', async () => {
    let resolveLoad!: (value: unknown) => void;
    loadStemsMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        })
    );

    renderWithProviders(
      <MixerAdmin ui={mixerUi as never} userId="user-1" albums={[sampleAlbum]} tabActive />,
      {
        preloadedState: {
          lang: { current: 'en' },
        },
      }
    );

    await waitFor(() => {
      expect(loadStemsMock).toHaveBeenCalledTimes(1);
    });

    resolveLoad({
      stems: [],
      accessToken: null,
      accessTokenExpiresAt: null,
    });

    await waitFor(() => {
      expect(screen.getByText('No stems yet')).toBeTruthy();
    });

    expect(loadStemsMock).toHaveBeenCalledTimes(1);
  });
});
