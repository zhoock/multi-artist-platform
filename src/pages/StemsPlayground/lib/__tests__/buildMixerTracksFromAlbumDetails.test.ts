import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { buildMixerTracksFromAlbumDetails } from '../buildMixerTracksFromAlbumDetails';
import { createMockAlbumDetails } from '@entities/album/model/__tests__/albumDetailsFixtures';

jest.mock('@entities/stem', () => ({
  loadStems: jest.fn(),
  getStemAudioUrl: jest.fn(
    (
      _userId: string,
      _albumId: string,
      _trackId: string,
      meta: { id: string; name: string; category: string }
    ) => `https://stem/${meta.id}`
  ),
}));

jest.mock('@shared/api/albums', () => ({
  getUserAudioUrl: (src: string) => `https://cdn/${src}`,
}));

jest.mock('@shared/lib/media/optionalMediaUrl', () => ({
  optionalMediaSrc: (url: string) => url,
}));

import { loadStems } from '@entities/stem';

const mockLoadStems = loadStems as jest.MockedFunction<typeof loadStems>;

describe('buildMixerTracksFromAlbumDetails', () => {
  beforeEach(() => {
    mockLoadStems.mockReset();
  });

  test('builds MixerTrack from AlbumDetails + loadStems without IAlbums', async () => {
    mockLoadStems.mockResolvedValue({
      stems: [{ id: 's1', name: 'Drums', category: 'drums', file: 'drums.wav' }],
      accessToken: 'tok',
      accessTokenExpiresAt: Date.now() + 60_000,
    });

    const details = createMockAlbumDetails({
      tracks: [
        {
          id: '1',
          title: 'Track 1',
          orderIndex: 0,
          duration: 180,
          src: 'mix.mp3',
          playbackLocked: false,
          visibility: 'public',
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
    });

    const tracks = await buildMixerTracksFromAlbumDetails(details, 'user-1');

    expect(mockLoadStems).toHaveBeenCalledWith('user-1', 'test-album', '1');
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      id: '1',
      title: 'Track 1',
      duration: 180,
      mixUrl: 'https://cdn/mix.mp3',
    });
    expect(tracks[0].stems[0]).toMatchObject({
      id: 's1',
      name: 'Drums',
      category: 'drums',
      url: 'https://stem/s1',
    });
  });

  test('skips hidden stemsAvailability tracks', async () => {
    const details = createMockAlbumDetails({
      tracks: [
        {
          id: '1',
          title: 'Hidden stems',
          orderIndex: 0,
          duration: 100,
          src: 'a.mp3',
          playbackLocked: false,
          visibility: 'public',
          stemsAvailability: 'hidden',
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
    });

    await expect(buildMixerTracksFromAlbumDetails(details, 'user-1')).resolves.toEqual([]);
    expect(mockLoadStems).not.toHaveBeenCalled();
  });
});
