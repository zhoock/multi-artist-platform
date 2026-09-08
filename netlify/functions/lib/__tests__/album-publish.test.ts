import { beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../track-pipeline-schema', () => ({
  tracksTableHasPipelineColumns: jest.fn(),
  trackAssetsTableExists: jest.fn(),
}));

import { query } from '../db';
import { isAlbumRowReadyToPublish, loadAlbumPublishTrackContext } from '../album-publish';
import { trackAssetsTableExists, tracksTableHasPipelineColumns } from '../track-pipeline-schema';

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedTracksTableHasPipelineColumns = tracksTableHasPipelineColumns as jest.MockedFunction<
  typeof tracksTableHasPipelineColumns
>;
const mockedTrackAssetsTableExists = trackAssetsTableExists as jest.MockedFunction<
  typeof trackAssetsTableExists
>;

const USER_ID = 'user-1';
const ALBUM_ID = 'album-1';

const draftAlbum = {
  album: 'Album',
  cover: 'cover-base',
  description: 'Description',
  release: { date: '2020-01-01', UPC: '123', genreCodes: ['rock'] },
  is_published: false,
};

const readyStreamRow = {
  track_id: 't1',
  type: 'stream',
  format: 'opus',
  variant: '128k',
  status: 'ready',
  path: 'users/u1/audio/album/derived/stream/opus_128k/t1.opus',
};

function mockPipelineTrackRow(
  overrides: Partial<{
    track_id: string;
    visibility: string;
    stems_visibility: string;
    processing_status: string;
    src: string;
  }> = {}
) {
  return {
    track_id: 't1',
    visibility: 'public',
    stems_visibility: 'public',
    src: '',
    processing_status: 'ready',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedTracksTableHasPipelineColumns.mockResolvedValue(true);
  mockedTrackAssetsTableExists.mockResolvedValue(true);
});

describe('isAlbumRowReadyToPublish', () => {
  test('rejects pending visible track', () => {
    const trackContext = {
      pipelineAvailable: true,
      assetsByTrackId: new Map(),
      tracks: [
        {
          trackId: 't1',
          visibility: 'public',
          stemsVisibility: 'public',
          processingStatus: 'pending' as const,
          src: '',
        },
      ],
    };

    expect(isAlbumRowReadyToPublish(draftAlbum, trackContext)).toBe(false);
  });

  test('accepts ready visible track with playback asset', () => {
    const trackContext = {
      pipelineAvailable: true,
      assetsByTrackId: new Map([
        [
          't1',
          [
            {
              type: 'stream',
              format: 'opus',
              variant: '128k',
              status: 'ready',
              path: readyStreamRow.path,
            },
          ],
        ],
      ]),
      tracks: [
        {
          trackId: 't1',
          visibility: 'public',
          stemsVisibility: 'public',
          processingStatus: 'ready' as const,
          src: '',
        },
      ],
    };

    expect(isAlbumRowReadyToPublish(draftAlbum, trackContext)).toBe(true);
  });

  test('accepts legacy album without pipeline when src is set', () => {
    const trackContext = {
      pipelineAvailable: false,
      assetsByTrackId: new Map(),
      tracks: [
        {
          trackId: 't1',
          visibility: 'public',
          stemsVisibility: 'public',
          processingStatus: null,
          src: 'users/u1/track.mp3',
        },
      ],
    };

    expect(isAlbumRowReadyToPublish(draftAlbum, trackContext)).toBe(true);
  });
});

describe('loadAlbumPublishTrackContext', () => {
  test('loads deduped tracks and assets from DB', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ id: 'album-pk-1' }] } as never)
      .mockResolvedValueOnce({ rows: [mockPipelineTrackRow()] } as never)
      .mockResolvedValueOnce({ rows: [readyStreamRow] } as never);

    const context = await loadAlbumPublishTrackContext(USER_ID, ALBUM_ID);

    expect(context.pipelineAvailable).toBe(true);
    expect(context.tracks).toHaveLength(1);
    expect(context.assetsByTrackId.get('t1')).toHaveLength(1);
  });
});
