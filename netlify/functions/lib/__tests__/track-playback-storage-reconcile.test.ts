import { selectAssetPath } from '../../../../src/shared/lib/audio/assetResolver';
import { PLAYBACK_STORAGE_MISSING_ERROR } from '../../../../src/shared/lib/tracks/playbackStorageMissing';
import {
  markPlaybackStorageMissingForAlbumTrack,
  reconcileReadyPlaybackStorageIfMissing,
  resetPlaybackStorageVerifyCacheForTests,
  verifyPlaybackStoragePathExists,
} from '../track-playback-storage-reconcile';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../supabase', () => ({
  STORAGE_BUCKET_NAME: 'user-media',
  createSupabaseAdminClient: jest.fn(),
}));

import { query } from '../db';
import { createSupabaseAdminClient } from '../supabase';

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedCreateSupabaseAdminClient = createSupabaseAdminClient as jest.MockedFunction<
  typeof createSupabaseAdminClient
>;

const readyStreamAssets = [
  {
    type: 'stream',
    format: 'opus',
    variant: '128k',
    status: 'ready',
    path: 'users/u1/audio/album/derived/stream/opus_128k/track.opus',
  },
];

describe('track-playback-storage-reconcile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPlaybackStorageVerifyCacheForTests();
  });

  test('Case 1: ready track with existing Storage object stays playable', async () => {
    mockedCreateSupabaseAdminClient.mockReturnValue({
      storage: {
        from: () => ({
          createSignedUrl: jest
            .fn()
            .mockResolvedValue({ data: { signedUrl: 'https://x' }, error: null }),
        }),
      },
    } as never);

    const result = await reconcileReadyPlaybackStorageIfMissing({
      userId: 'u1',
      albumSlug: 'album',
      logicalTrackId: 'track-1',
      processingStatus: 'ready',
      assets: readyStreamAssets,
    });

    expect(result.reconciled).toBe(false);
    expect(result.processingStatus).toBe('ready');
    const selected = selectAssetPath(result.assets, {
      purpose: 'playback',
      processingStatus: 'ready',
      hasPremiumAccess: true,
    });
    expect(selected.url).toContain('track.opus');
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  test('missing Storage object reconciles track + stream asset to failed', async () => {
    mockedCreateSupabaseAdminClient.mockReturnValue({
      storage: {
        from: () => ({
          createSignedUrl: jest
            .fn()
            .mockResolvedValue({ data: null, error: { message: 'Object not found' } }),
        }),
      },
    } as never);

    mockedQuery.mockResolvedValue({ rows: [], rowCount: 1 } as never);

    const result = await reconcileReadyPlaybackStorageIfMissing({
      userId: 'u1',
      albumSlug: 'album',
      logicalTrackId: 'track-1',
      processingStatus: 'ready',
      assets: readyStreamAssets,
    });

    expect(result.reconciled).toBe(true);
    expect(result.processingStatus).toBe('failed');
    expect(result.assets[0]?.status).toBe('failed');

    expect(mockedQuery).toHaveBeenCalledTimes(2);
    const trackUpdate = mockedQuery.mock.calls[1]?.[0] as string;
    expect(trackUpdate).toContain("processing_status = 'failed'");
    expect(trackUpdate).toContain("t.processing_status = 'ready'");
    expect(trackUpdate).toContain('EXISTS');
    expect(trackUpdate).toContain('ta.path IS NOT DISTINCT FROM');

    const assetUpdate = mockedQuery.mock.calls[0]?.[0] as string;
    expect(assetUpdate).toContain("ta.status = 'ready'");
    expect(mockedQuery.mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining(['u1', 'album', 'track-1', PLAYBACK_STORAGE_MISSING_ERROR])
    );
  });

  test('verifyPlaybackStoragePathExists caches positive result', async () => {
    const createSignedUrl = jest
      .fn()
      .mockResolvedValue({ data: { signedUrl: 'https://x' }, error: null });
    mockedCreateSupabaseAdminClient.mockReturnValue({
      storage: { from: () => ({ createSignedUrl }) },
    } as never);

    const path = 'users/u1/audio/album/derived/stream/opus_128k/a.opus';
    await verifyPlaybackStoragePathExists(path);
    await verifyPlaybackStoragePathExists(path);

    expect(createSignedUrl).toHaveBeenCalledTimes(1);
  });

  test('markPlaybackStorageMissingForAlbumTrack is scoped with ready guard', async () => {
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    await markPlaybackStorageMissingForAlbumTrack('u1', 'album', 't1', 'users/u1/audio/x.opus');
    const sql = mockedQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain("ta.status = 'ready'");
    expect(sql).toContain('ta.path IS NOT DISTINCT FROM');
  });

  test('does not cache Storage missing; same path is re-checked on next verify', async () => {
    const createSignedUrl = jest
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } })
      .mockResolvedValueOnce({ data: { signedUrl: 'https://x' }, error: null });
    mockedCreateSupabaseAdminClient.mockReturnValue({
      storage: { from: () => ({ createSignedUrl }) },
    } as never);

    const path = 'users/u1/audio/album/derived/stream/opus_128k/track.opus';
    await expect(verifyPlaybackStoragePathExists(path)).resolves.toBe(false);
    await expect(verifyPlaybackStoragePathExists(path)).resolves.toBe(true);
    expect(createSignedUrl).toHaveBeenCalledTimes(2);
  });

  test('missing then re-upload same path: pending skips verify; ready stays playable when Storage exists', async () => {
    const createSignedUrl = jest
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } })
      .mockResolvedValueOnce({ data: { signedUrl: 'https://x' }, error: null });
    mockedCreateSupabaseAdminClient.mockReturnValue({
      storage: { from: () => ({ createSignedUrl }) },
    } as never);
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 1 } as never);

    const input = {
      userId: 'u1',
      albumSlug: 'album',
      logicalTrackId: 'track-1',
      assets: readyStreamAssets,
    };

    const failed = await reconcileReadyPlaybackStorageIfMissing({
      ...input,
      processingStatus: 'ready',
    });
    expect(failed.reconciled).toBe(true);
    expect(failed.processingStatus).toBe('failed');

    const pending = await reconcileReadyPlaybackStorageIfMissing({
      ...input,
      processingStatus: 'pending',
    });
    expect(pending.reconciled).toBe(false);

    mockedQuery.mockClear();
    const readyAgain = await reconcileReadyPlaybackStorageIfMissing({
      ...input,
      processingStatus: 'ready',
    });
    expect(readyAgain.reconciled).toBe(false);
    expect(readyAgain.processingStatus).toBe('ready');
    expect(mockedQuery).not.toHaveBeenCalled();
    expect(createSignedUrl).toHaveBeenCalledTimes(2);
  });

  test('stale reconcile for path A does not fail track when DB playback asset is path B', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    const pathA = 'users/u1/audio/album/derived/stream/opus_128k/old.opus';
    const changed = await markPlaybackStorageMissingForAlbumTrack('u1', 'album', 't1', pathA);
    expect(changed).toBe(false);

    const trackSql = mockedQuery.mock.calls[1]?.[0] as string;
    expect(trackSql).toContain('EXISTS');
    expect(trackSql).toContain('ta.path IS NOT DISTINCT FROM');
    expect(mockedQuery.mock.calls[1]?.[1]).toEqual(
      expect.arrayContaining(['u1', 'album', 't1', PLAYBACK_STORAGE_MISSING_ERROR, pathA])
    );
  });
});
