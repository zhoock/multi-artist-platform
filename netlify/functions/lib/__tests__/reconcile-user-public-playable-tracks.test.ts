import { reconcileUserPublicPlayableTracks } from '../reconcile-user-public-playable-tracks';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../track-assets-loader', () => ({
  fetchTrackAssetsByAlbumPks: jest.fn(),
}));

jest.mock('../track-playback-storage-reconcile', () => ({
  reconcileAlbumPlaybackStorageBatch: jest.fn(),
}));

import { query } from '../db';
import { fetchTrackAssetsByAlbumPks } from '../track-assets-loader';
import { reconcileAlbumPlaybackStorageBatch } from '../track-playback-storage-reconcile';

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedFetchAssets = fetchTrackAssetsByAlbumPks as jest.MockedFunction<
  typeof fetchTrackAssetsByAlbumPks
>;
const mockedBatch = reconcileAlbumPlaybackStorageBatch as jest.MockedFunction<
  typeof reconcileAlbumPlaybackStorageBatch
>;

describe('reconcileUserPublicPlayableTracks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFetchAssets.mockResolvedValue(new Map());
    mockedBatch.mockResolvedValue({ assetsByTrackId: new Map(), failedTrackIds: new Set() });
  });

  test('no-op for empty userId', async () => {
    await reconcileUserPublicPlayableTracks('  ');
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  test('skips batch when no public playable rows', async () => {
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await reconcileUserPublicPlayableTracks('user-1');

    expect(mockedFetchAssets).not.toHaveBeenCalled();
    expect(mockedBatch).not.toHaveBeenCalled();
  });

  test('runs reconcile batch per album slug for playable rows', async () => {
    mockedQuery.mockResolvedValue({
      rows: [
        {
          album_pk: 'pk-1',
          album_slug: 'rubber-soul',
          track_id: 'track-a',
          processing_status: 'ready',
        },
        {
          album_pk: 'pk-1',
          album_slug: 'rubber-soul',
          track_id: 'track-a',
          processing_status: 'ready',
        },
      ],
      rowCount: 2,
    } as never);

    await reconcileUserPublicPlayableTracks('user-1');

    expect(mockedFetchAssets).toHaveBeenCalledWith(['pk-1']);
    expect(mockedBatch).toHaveBeenCalledTimes(1);
    expect(mockedBatch).toHaveBeenCalledWith(
      'user-1',
      'rubber-soul',
      [{ logicalTrackId: 'track-a', processingStatus: 'ready' }],
      expect.any(Map)
    );
    const sql = mockedQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain("COALESCE(t.processing_status, 'ready') = 'ready'");
    expect(sql).toContain("COALESCE(t.visibility, 'public') <> 'hidden'");
  });
});
