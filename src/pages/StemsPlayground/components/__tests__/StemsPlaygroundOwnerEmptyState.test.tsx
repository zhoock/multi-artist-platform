import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import type { AlbumData } from '@entities/album/lib/transformEditableAlbumData';

const mockNavigate = jest.fn();
const mockPreloadUserDashboardModule = jest.fn();

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

jest.mock('@shared/lib/hooks/useEffectiveLocation', () => ({
  useEffectiveLocation: () => ({
    pathname: '/stems',
    search: '?artist=beatles',
    hash: '',
    state: null,
    key: 'test',
  }),
}));

jest.mock('@shared/lib/preloadUserDashboard', () => ({
  preloadUserDashboardModule: () => mockPreloadUserDashboardModule(),
}));

import {
  StemsPlaygroundOwnerEmptyState,
  buildStemsOwnerDashboardMixerUrl,
} from '../StemsPlaygroundOwnerEmptyState';

const albums: AlbumData[] = [
  {
    id: 'dashboard-album-1',
    albumId: 'public-album-1',
    title: 'Album One',
    artist: 'Artist',
    year: '2024',
    tracks: [
      {
        id: 'track-1',
        title: 'Track One',
        order_index: 0,
        duration: '3:00',
        lyrics: {
          albumId: 'public-album-1',
          trackId: 'track-1',
          lang: 'ru',
          content: '',
          syncedLines: null,
          state: 'empty',
          syncedAt: null,
        },
      },
    ],
  },
];

describe('buildStemsOwnerDashboardMixerUrl', () => {
  it('opens mixer tab with album and track focus when a track exists', () => {
    expect(buildStemsOwnerDashboardMixerUrl(albums)).toBe(
      '/dashboard/mixer?focusAlbum=dashboard-album-1&focusTrack=track-1'
    );
  });

  it('opens mixer tab with only album focus when the album has no tracks', () => {
    expect(
      buildStemsOwnerDashboardMixerUrl([
        {
          ...albums[0],
          tracks: [],
        },
      ])
    ).toBe('/dashboard/mixer?focusAlbum=dashboard-album-1');
  });

  it('falls back to the mixer tab without query params', () => {
    expect(buildStemsOwnerDashboardMixerUrl([])).toBe('/dashboard/mixer');
  });
});

describe('StemsPlaygroundOwnerEmptyState', () => {
  it('renders universal owner copy and opens dashboard mixer editor', () => {
    mockNavigate.mockClear();

    render(
      <MemoryRouter>
        <StemsPlaygroundOwnerEmptyState
          ui={{
            menu: {},
            buttons: {},
            titles: {},
            stems: {
              ownerEmptyTitle: 'Настройте микшер',
              ownerEmptyDescription: 'Добавьте и настройте стемы для своих треков.',
              ownerEmptyAction: 'Настройте микшер',
            },
          }}
          dashboardAlbums={albums}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Настройте микшер')).toBeInTheDocument();
    expect(screen.getByText('Добавьте и настройте стемы для своих треков.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Настройте микшер' }));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/dashboard/mixer?focusAlbum=dashboard-album-1&focusTrack=track-1',
      {
        state: {
          backgroundLocation: {
            pathname: '/stems',
            search: '?artist=beatles',
            hash: '',
            state: null,
            key: 'test',
          },
        },
      }
    );
    expect(mockPreloadUserDashboardModule).toHaveBeenCalled();
  });
});
