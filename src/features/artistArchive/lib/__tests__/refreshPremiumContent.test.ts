import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { AppDispatch } from '@shared/model/appStore/types';

const mockFetchAlbumDetails = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetStore = jest.fn<() => unknown>();
const mockSetPlaylist = jest.fn((payload: unknown) => ({
  type: 'player/setPlaylist',
  payload,
}));
const mockSetCurrentTrackIndex = jest.fn((payload: unknown) => ({
  type: 'player/setCurrentTrackIndex',
  payload,
}));
const mockSetPublicArtistSlug = jest.fn((payload: unknown) => ({
  type: 'currentArtist/setPublicArtistSlug',
  payload,
}));
const mockFetchArticles = jest.fn<(...args: unknown[]) => unknown>();
const mockFetchAlbumDetailsPage = jest.fn<(...args: unknown[]) => unknown>();

jest.mock('@entities/album/api/fetchAlbumDetails', () => ({
  fetchAlbumDetails: (...args: unknown[]) => mockFetchAlbumDetails(...args),
}));

jest.mock('@shared/model/appStore', () => ({
  getStore: () => mockGetStore(),
}));

jest.mock('@entities/album', () => ({
  fetchAlbumDetailsPage: (...args: unknown[]) => mockFetchAlbumDetailsPage(...args),
  selectAlbumDetailsData: (state: { albumDetails: { data: unknown } }) => state.albumDetails.data,
}));

jest.mock('@entities/article', () => ({
  fetchArticles: (...args: unknown[]) => mockFetchArticles(...args),
}));

jest.mock('@features/player', () => ({
  playerActions: {
    setPlaylist: (payload: unknown) => mockSetPlaylist(payload),
    setCurrentTrackIndex: (payload: unknown) => mockSetCurrentTrackIndex(payload),
  },
  toPlayerTracks: (tracks: Array<{ id: string; title: string; src: string; duration: number }>) =>
    tracks.map((track) => ({
      id: track.id,
      title: track.title,
      src: track.src,
      duration: track.duration,
    })),
}));

jest.mock('@shared/api/albums', () => ({
  getUserAudioUrl: (src: string) => `https://cdn.example/${src}`,
}));

jest.mock('@shared/lib/media/optionalMediaUrl', () => ({
  emptyStringMediaSrc: (url: string) => url,
}));

jest.mock('@shared/model/currentArtist', () => ({
  setPublicArtistSlug: (payload: unknown) => mockSetPublicArtistSlug(payload),
  selectPublicArtistSlug: () => 'demo-artist',
}));

jest.mock('@shared/lib/dashboardModalBackground', () => ({
  readPublicArtistSlugFromDashboardModalBackground: () => null,
}));

jest.mock('@features/premiumSubscription/lib/premiumSuccessModalStorage', () => ({
  readPremiumCheckoutArtistSlug: () => '',
}));

import { awaitPremiumContentRefresh } from '../refreshPremiumContent';

function makeDetails(overrides: Record<string, unknown> = {}) {
  return {
    albumId: 'album-1',
    slug: 'album-1',
    title: 'Album',
    cover: 'c',
    userId: 'user-1',
    dbAlbumId: 'uuid',
    description: '',
    details: [],
    release: {},
    artwork: {
      photographer: '',
      photographerURL: '',
      designer: '',
      designerURL: '',
    },
    purchase: {
      allowDownloadSale: '',
      regularPrice: '',
      currency: 'RUB',
    },
    serviceButtons: {},
    visibility: { isPublished: true, isPublic: true },
    tracks: [
      {
        id: 't1',
        title: 'Track',
        duration: 100,
        src: 'unlocked.mp3',
        orderIndex: 0,
        playbackLocked: false,
        visibility: 'subscribers_only',
        stemsAvailability: 'public',
        audioContainer: null,
        audioCodec: null,
        audioBitrate: null,
        audioSampleRate: null,
        audioBitDepth: null,
        audioChannels: null,
        audioDuration: null,
        audioFileSize: null,
      },
    ],
    ...overrides,
  };
}

describe('refreshPremiumContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockFetchArticles.mockReturnValue({
      unwrap: () => Promise.resolve([]),
    });
    mockFetchAlbumDetailsPage.mockReturnValue({
      unwrap: () => Promise.resolve({ album: makeDetails() }),
    });
    mockFetchAlbumDetails.mockResolvedValue(makeDetails());
  });

  test('refetches articles + AlbumDetails, never fetchDashboardAlbums / fat catalog', async () => {
    const dispatched: unknown[] = [];
    const dispatch = ((action: unknown) => {
      dispatched.push(action);
      return action;
    }) as AppDispatch;

    // After fetchAlbumDetailsPage, Redux holds unlocked mid-weight details.
    const unlockedDetails = makeDetails();
    mockGetStore.mockReturnValue({
      getState: () => ({
        albumDetails: {
          artistSlug: 'demo-artist',
          albumId: 'album-1',
          data: unlockedDetails,
        },
        player: {
          albumId: 'album-1',
          currentTrackIndex: 0,
          playlist: [{ id: 't1', title: 'Track', duration: 100, src: '', playbackLocked: true }],
          albumMeta: { albumId: 'album-1', publicSlug: 'demo-artist' },
        },
        currentArtist: { publicArtistSlug: 'demo-artist' },
      }),
      dispatch,
    });

    await awaitPremiumContentRefresh(dispatch, 'demo-artist');

    expect(mockFetchArticles).toHaveBeenCalledWith({
      force: true,
      publicArtistSlug: 'demo-artist',
      forcePublicCatalog: true,
    });
    expect(mockFetchAlbumDetailsPage).toHaveBeenCalledWith({
      artistSlug: 'demo-artist',
      albumId: 'album-1',
      force: true,
    });
    expect(mockFetchAlbumDetails).not.toHaveBeenCalled();
    expect(dispatched.some((action) => String(action).includes('fetchDashboardAlbums'))).toBe(
      false
    );
    expect(mockSetPlaylist).toHaveBeenCalled();
    const playlist = mockSetPlaylist.mock.calls[0]?.[0] as Array<{ src: string }>;
    expect(playlist[0]?.src).toContain('unlocked.mp3');
  });

  test('syncs playlist via direct AlbumDetails fetch when store has no matching album', async () => {
    const dispatch = ((action: unknown) => action) as AppDispatch;

    mockGetStore.mockReturnValue({
      getState: () => ({
        albumDetails: {
          artistSlug: null,
          albumId: null,
          data: null,
        },
        player: {
          albumId: 'album-1',
          currentTrackIndex: 0,
          playlist: [{ id: 't1', title: 'Track', duration: 100, src: '' }],
          albumMeta: { albumId: 'album-1', publicSlug: 'demo-artist' },
        },
        currentArtist: { publicArtistSlug: 'demo-artist' },
      }),
      dispatch,
    });

    await awaitPremiumContentRefresh(dispatch, 'demo-artist');

    expect(mockFetchAlbumDetailsPage).not.toHaveBeenCalled();
    expect(mockFetchAlbumDetails).toHaveBeenCalledWith('demo-artist', 'album-1');
    expect(mockSetPlaylist).toHaveBeenCalled();
  });
});
