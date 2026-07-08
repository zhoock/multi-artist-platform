import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { AlbumData } from '@entities/album/lib/transformAlbumData';
import { renderWithProviders } from '@shared/lib/test-utils';
import { MixerAdmin } from '../MixerAdmin';

const loadStemsMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('@entities/stem', () => {
  const actual = jest.requireActual('@entities/stem') as typeof import('@entities/stem');
  return {
    ...actual,
    loadStems: (...args: unknown[]) => loadStemsMock(...args),
    saveStemsManifest: jest.fn(),
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
      lyricsStatus: 'empty',
      stemsVisibility: 'public',
    },
  ],
};

const mixerUi = {
  dashboard: {
    mixer: {
      stemsEmptyTitle: 'No stems yet',
      stemsEmptyDescription: 'Add the first stem for this track.',
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
    loadStemsMock.mockReset();
    loadStemsMock.mockResolvedValue({
      stems: [],
      accessToken: null,
      accessTokenExpiresAt: null,
    });
  });

  it('renders dashboard kit layout and expands album into kit panel', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <MixerAdmin ui={mixerUi as never} userId="user-1" albums={[sampleAlbum]} />,
      {
        preloadedState: {
          lang: { current: 'en' },
        },
      }
    );

    expect(container.querySelector('.user-dashboard__section')).toBeTruthy();
    expect(container.querySelector('.dashboard-card')).toBeTruthy();
    expect(screen.getByText('Test Album')).toBeTruthy();

    await user.click(screen.getByLabelText('Expand album'));

    await waitFor(() => {
      expect(loadStemsMock).toHaveBeenCalled();
    });

    const albumCard = container.querySelector('.user-dashboard__album-card--expanded');
    const expandedBody = container.querySelector('.user-dashboard__album-body');
    expect(albumCard).toBeTruthy();
    expect(expandedBody).toBeTruthy();
    expect(albumCard?.contains(expandedBody)).toBe(true);
  });

  it('shows card empty state when track has no stems', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <MixerAdmin ui={mixerUi as never} userId="user-1" albums={[sampleAlbum]} />,
      {
        preloadedState: {
          lang: { current: 'en' },
        },
      }
    );

    await user.click(screen.getByLabelText('Expand album'));
    await user.click(screen.getByText('Track One'));

    await waitFor(() => {
      expect(screen.getByText('No stems yet')).toBeTruthy();
    });

    expect(container.querySelector('.dashboard-empty-state--card')).toBeTruthy();
    expect(container.querySelector('.status-badge')).toBeNull();
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
      <MixerAdmin ui={mixerUi as never} userId="user-1" albums={[sampleAlbum]} />,
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
});
