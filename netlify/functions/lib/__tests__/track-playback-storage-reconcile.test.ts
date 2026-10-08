import { selectAssetPath } from '../../../../src/shared/lib/audio/assetResolver';
import { PLAYBACK_STORAGE_MISSING_ERROR } from '../../../../src/shared/lib/tracks/playbackStorageMissing';
import {
  isStorageErrorIndicatingMissing,
  markPlaybackStorageMissingForAlbumTrack,
  reconcileAlbumPlaybackStorageBatch,
  reconcileProcessedTrackPlaybackStorage,
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

const missingDownloadError = {
  message: '{}',
  name: 'StorageUnknownError',
  originalError: { status: 400 },
};

function mockMarkResult(assetsFailed: number, tracksFailed: number): void {
  mockedQuery.mockResolvedValue({
    rows: [{ assets_failed: assetsFailed, tracks_failed: tracksFailed }],
    rowCount: 1,
  } as never);
}

type AdminStorageMockOptions = {
  /** Admin authenticated HEAD: object exists (default true). */
  headExists?: boolean;
  /** Explicit HTTP status for admin HEAD (overrides headExists). */
  headStatus?: number;
};

/**
 * Mocks admin client + HEAD responses. Exposes storage.download mock — must stay unused.
 */
function mockAdminStorage(options: AdminStorageMockOptions = {}): { download: jest.Mock } {
  const download = jest.fn();
  mockedCreateSupabaseAdminClient.mockReturnValue({
    storage: {
      from: () => ({ download }),
    },
  } as never);

  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://proj.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

  const headExists = options.headExists !== false;
  const headStatus = options.headStatus ?? (headExists ? 200 : 404);

  global.fetch = jest.fn().mockImplementation((_url: RequestInfo, init?: RequestInit) => {
    if (init?.method === 'HEAD') {
      const ok = headStatus >= 200 && headStatus < 300;
      return Promise.resolve({ ok, status: headStatus });
    }
    return Promise.resolve({ ok: false, status: 500 });
  }) as never;

  return { download };
}

function isAdminAuthenticatedHeadRequest(url: RequestInfo, init?: RequestInit): boolean {
  if (init?.method !== 'HEAD') return false;
  const href = String(url);
  return (
    href.includes('/storage/v1/object/user-media/') && !href.includes('/storage/v1/object/public/')
  );
}

describe('track-playback-storage-reconcile', () => {
  const originalFetch = global.fetch;
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const originalServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    resetPlaybackStorageVerifyCacheForTests();
    global.fetch = originalFetch;
    process.env.SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRole;
  });

  afterAll(() => {
    global.fetch = originalFetch;
    process.env.SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRole;
  });

  test('isStorageErrorIndicatingMissing matches Supabase download StorageUnknownError {} + 400', () => {
    expect(isStorageErrorIndicatingMissing(missingDownloadError)).toBe(true);
    expect(isStorageErrorIndicatingMissing({ message: 'Object not found' })).toBe(true);
    expect(isStorageErrorIndicatingMissing({ message: 'rate limited', statusCode: 429 })).toBe(
      false
    );
  });

  describe('regression: existence verify must not download opus body', () => {
    test('A. existing opus: verify → true and storage.download() is not called', async () => {
      const { download } = mockAdminStorage({ headExists: true });

      const path = 'users/u1/audio/album/derived/stream/opus_128k/a.opus';
      await expect(verifyPlaybackStoragePathExists(path)).resolves.toBe(true);

      expect(download).not.toHaveBeenCalled();
      const headCalls = (global.fetch as jest.Mock).mock.calls.filter(([url, init]) =>
        isAdminAuthenticatedHeadRequest(url, init)
      );
      expect(headCalls.length).toBeGreaterThanOrEqual(1);
    });

    test('B. missing opus: verify → false and reconcile recovery still runs', async () => {
      const { download } = mockAdminStorage({ headExists: false, headStatus: 404 });
      mockMarkResult(1, 1);

      const path = readyStreamAssets[0]!.path;
      await expect(verifyPlaybackStoragePathExists(path)).resolves.toBe(false);
      expect(download).not.toHaveBeenCalled();

      const result = await reconcileReadyPlaybackStorageIfMissing({
        userId: 'u1',
        albumSlug: 'album',
        logicalTrackId: 'track-1',
        processingStatus: 'ready',
        assets: readyStreamAssets,
      });

      expect(result.reconciled).toBe(true);
      expect(result.processingStatus).toBe('failed');
      expect(download).not.toHaveBeenCalled();
    });

    test('C. Storage/API inconclusive HEAD → null (falls through); no download', async () => {
      const { download } = mockAdminStorage({ headStatus: 503 });

      const path = 'users/u1/audio/album/derived/stream/opus_128k/track.opus';
      await expect(verifyPlaybackStoragePathExists(path)).resolves.toBe(null);
      expect(download).not.toHaveBeenCalled();
    });

    test('D. batch reconcile path uses HEAD only (production caller shape)', async () => {
      const { download } = mockAdminStorage({ headExists: true });
      const assetsByTrackId = new Map([['track-1', readyStreamAssets]]);

      await reconcileAlbumPlaybackStorageBatch(
        'u1',
        'album',
        [{ logicalTrackId: 'track-1', processingStatus: 'ready' }],
        assetsByTrackId
      );

      expect(download).not.toHaveBeenCalled();
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url, init]) =>
          isAdminAuthenticatedHeadRequest(url, init)
        )
      ).toBe(true);
    });
  });

  test('Case 1: ready track with existing Storage object stays playable', async () => {
    const { download } = mockAdminStorage({ headExists: true });

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
    expect(download).not.toHaveBeenCalled();
  });

  test('missing Storage object (HEAD 404) reconciles track + stream asset to failed', async () => {
    const { download } = mockAdminStorage({ headExists: false, headStatus: 400 });
    mockMarkResult(1, 1);

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
    expect(download).not.toHaveBeenCalled();

    expect(mockedQuery).toHaveBeenCalledTimes(1);
    const sql = mockedQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain('UPDATE track_assets');
    expect(sql).toContain('UPDATE tracks');
    expect(sql).toContain("processing_status = 'failed'");
    expect(sql).toContain("src = ''");
    expect(mockedQuery.mock.calls[0]?.[1]).toEqual([
      'u1',
      'album',
      'track-1',
      PLAYBACK_STORAGE_MISSING_ERROR,
      readyStreamAssets[0]!.path,
    ]);
  });

  test('verifyPlaybackStoragePathExists re-checks Storage on each call (no positive TTL cache)', async () => {
    const { download } = mockAdminStorage({ headExists: true });

    const path = 'users/u1/audio/album/derived/stream/opus_128k/a.opus';
    await verifyPlaybackStoragePathExists(path);
    await verifyPlaybackStoragePathExists(path);

    const headCalls = (global.fetch as jest.Mock).mock.calls.filter(([url, init]) =>
      isAdminAuthenticatedHeadRequest(url, init)
    );
    expect(headCalls).toHaveLength(2);
    expect(download).not.toHaveBeenCalled();
  });

  test('does not cache Storage missing; same path is re-checked on next verify', async () => {
    let headCall = 0;
    const { download } = mockAdminStorage({});
    (global.fetch as jest.Mock).mockImplementation((_url: RequestInfo, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        headCall += 1;
        const missing = headCall === 1;
        return Promise.resolve({ ok: !missing, status: missing ? 400 : 200 });
      }
      return Promise.resolve({ ok: false, status: 500 });
    });

    const path = 'users/u1/audio/album/derived/stream/opus_128k/track.opus';
    await expect(verifyPlaybackStoragePathExists(path)).resolves.toBe(false);
    await expect(verifyPlaybackStoragePathExists(path)).resolves.toBe(true);
    expect(headCall).toBe(2);
    expect(download).not.toHaveBeenCalled();
  });

  test('missing then re-upload same path: pending skips verify; ready stays playable when Storage exists', async () => {
    let headCall = 0;
    const { download } = mockAdminStorage({});
    (global.fetch as jest.Mock).mockImplementation((_url: RequestInfo, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        headCall += 1;
        const missing = headCall === 1;
        return Promise.resolve({ ok: !missing, status: missing ? 400 : 200 });
      }
      return Promise.resolve({ ok: false, status: 500 });
    });
    mockMarkResult(1, 1);

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
    expect(headCall).toBe(2);
    expect(download).not.toHaveBeenCalled();
  });

  test('without admin client, public HEAD 400 detects missing object', async () => {
    mockedCreateSupabaseAdminClient.mockReturnValue(null);
    process.env.SUPABASE_URL = 'https://proj.supabase.co';
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400 }) as never;

    const path = 'users/u1/audio/album/derived/stream/opus_128k/track.opus';
    await expect(verifyPlaybackStoragePathExists(path, { userId: 'u1' })).resolves.toBe(false);
    expect(global.fetch).toHaveBeenCalled();
  });

  test('without admin client, public HEAD 400 triggers reconcile on album load path', async () => {
    mockedCreateSupabaseAdminClient.mockReturnValue(null);
    process.env.SUPABASE_URL = 'https://proj.supabase.co';
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400 }) as never;
    mockMarkResult(1, 1);

    const result = await reconcileReadyPlaybackStorageIfMissing({
      userId: 'u1',
      albumSlug: 'album',
      logicalTrackId: 'track-1',
      processingStatus: 'ready',
      assets: readyStreamAssets,
    });

    expect(result.reconciled).toBe(true);
    expect(result.processingStatus).toBe('failed');
  });

  test('mark fails asset and track in one statement; track update does not re-require a ready asset', async () => {
    mockMarkResult(1, 1);
    const result = await markPlaybackStorageMissingForAlbumTrack(
      'u1',
      'album',
      't1',
      'users/u1/audio/x.opus'
    );

    expect(result).toEqual({ assetsFailed: 1, tracksFailed: 1 });
    expect(mockedQuery).toHaveBeenCalledTimes(1);
    const sql = mockedQuery.mock.calls[0]?.[0] as string;
    const trackUpdate = sql.slice(sql.indexOf('UPDATE tracks'));
    expect(trackUpdate).toContain('SELECT track_id FROM failed_assets');
    expect(trackUpdate).toContain('SELECT track_id FROM already_failed_assets');
    expect(trackUpdate).not.toContain("ta.status = 'ready'");
    expect(sql).toContain('ta.path IS NOT DISTINCT FROM $5');
    expect(sql).toContain("t.processing_status = 'ready'");
  });

  test('repeat album load: failed stream asset + ready track is re-verified and synced to failed', async () => {
    const { download } = mockAdminStorage({ headExists: false, headStatus: 400 });
    mockMarkResult(0, 1);

    const splitAssets = [{ ...readyStreamAssets[0]!, status: 'failed' }];
    const result = await reconcileReadyPlaybackStorageIfMissing({
      userId: 'u1',
      albumSlug: 'album',
      logicalTrackId: 'track-1',
      processingStatus: 'ready',
      assets: splitAssets,
    });

    expect(result.reconciled).toBe(true);
    expect(result.processingStatus).toBe('failed');
    expect(download).not.toHaveBeenCalled();
  });

  test('production split state (Norwegian Wood) syncs track to failed', async () => {
    const prodPath =
      'users/8e998d76-1131-42ec-b26e-ef18603d8cec/audio/rubber-soul/derived/stream/opus_128k/5a301b85-e687-4378-9707-816cae6bd4e9__Beatles-Norwegian-Wood-This-Bird-Has-Flown.opus';
    mockAdminStorage({ headExists: false, headStatus: 400 });
    mockMarkResult(0, 1);

    const result = await reconcileReadyPlaybackStorageIfMissing({
      userId: '8e998d76-1131-42ec-b26e-ef18603d8cec',
      albumSlug: 'rubber-soul',
      logicalTrackId: '5a301b85-e687-4378-9707-816cae6bd4e9',
      processingStatus: 'ready',
      assets: [
        { type: 'waveform', format: 'json', variant: 'default', status: 'failed', path: '' },
        { type: 'stream', format: 'opus', variant: '128k', status: 'failed', path: prodPath },
      ],
    });

    expect(result.processingStatus).toBe('failed');
    expect(mockedQuery.mock.calls[0]?.[1]).toEqual([
      '8e998d76-1131-42ec-b26e-ef18603d8cec',
      'rubber-soul',
      '5a301b85-e687-4378-9707-816cae6bd4e9',
      PLAYBACK_STORAGE_MISSING_ERROR,
      prodPath,
    ]);
  });

  test('failed stream asset whose object still exists leaves track untouched', async () => {
    mockAdminStorage({ headExists: true });
    const result = await reconcileReadyPlaybackStorageIfMissing({
      userId: 'u1',
      albumSlug: 'album',
      logicalTrackId: 'track-1',
      processingStatus: 'ready',
      assets: [{ ...readyStreamAssets[0]!, status: 'failed' }],
    });

    expect(result.reconciled).toBe(false);
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  test('stale reconcile for path A does not fail track when DB playback asset is path B', async () => {
    mockAdminStorage({ headExists: false, headStatus: 400 });
    mockMarkResult(0, 0);

    const pathA = 'users/u1/audio/album/derived/stream/opus_128k/old.opus';
    const result = await reconcileReadyPlaybackStorageIfMissing({
      userId: 'u1',
      albumSlug: 'album',
      logicalTrackId: 't1',
      processingStatus: 'ready',
      assets: [{ ...readyStreamAssets[0]!, path: pathA }],
    });

    expect(result.reconciled).toBe(false);
    expect(result.processingStatus).toBe('ready');
    expect(result.assets[0]?.status).toBe('ready');
    expect(mockedQuery.mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining([PLAYBACK_STORAGE_MISSING_ERROR, pathA])
    );
  });

  test('stems are untouched: SQL is scoped to the primary stream asset and tracks only', async () => {
    mockAdminStorage({ headExists: false, headStatus: 400 });
    mockMarkResult(1, 1);

    const stemAsset = {
      type: 'stem',
      format: 'wav',
      variant: 'vocals',
      status: 'ready',
      path: 'users/u1/stems/album/vocals.wav',
    };
    const result = await reconcileReadyPlaybackStorageIfMissing({
      userId: 'u1',
      albumSlug: 'album',
      logicalTrackId: 'track-1',
      processingStatus: 'ready',
      assets: [...readyStreamAssets, stemAsset],
    });

    expect(result.assets.find((a) => a.type === 'stem')).toEqual(stemAsset);
    const sql = mockedQuery.mock.calls[0]?.[0] as string;
    expect(sql).not.toMatch(/stem/i);
    expect(sql.match(/ta\.type = 'stream'/g)).toHaveLength(2);
  });
});

describe('reconcileProcessedTrackPlaybackStorage', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    resetPlaybackStorageVerifyCacheForTests();
    global.fetch = originalFetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  const input = {
    userId: 'u1',
    albumSlug: 'album',
    logicalTrackId: 'track-1',
    trackDbId: '11111111-1111-4111-8111-111111111111',
  };

  test('HEADs a ready processed track and does not download the opus body', async () => {
    const { download } = mockAdminStorage({ headExists: false });
    mockedQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM tracks') && sql.includes('processing_status')) {
        return { rows: [{ processing_status: 'ready' }] } as never;
      }
      if (sql.includes('FROM track_assets')) {
        return { rows: readyStreamAssets } as never;
      }
      return { rows: [{ assets_failed: 1, tracks_failed: 1 }], rowCount: 1 } as never;
    });

    await reconcileProcessedTrackPlaybackStorage(input);

    expect(download).not.toHaveBeenCalled();
    const headCalls = (global.fetch as jest.Mock).mock.calls.filter(([url, init]) =>
      isAdminAuthenticatedHeadRequest(url, init)
    );
    expect(headCalls).toHaveLength(1);
    expect(String(mockedQuery.mock.calls.at(-1)?.[0])).toContain('UPDATE track_assets');
  });

  test('does not touch Storage when the processed track is not ready', async () => {
    const { download } = mockAdminStorage({ headExists: true });
    mockedQuery.mockResolvedValue({ rows: [{ processing_status: 'processing' }] } as never);

    await reconcileProcessedTrackPlaybackStorage(input);

    expect(download).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
