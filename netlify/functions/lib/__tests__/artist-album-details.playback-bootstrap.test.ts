/**
 * Artist Play bootstrap must not block on playback Storage HEAD/download or lyrics assembly.
 */

jest.mock('../db', () => ({ query: jest.fn() }));
jest.mock('../artist-publication', () => ({ assertArtistVisibleToViewer: jest.fn() }));
jest.mock('../entitlements', () => ({ viewerHasPremiumAccessToArtist: jest.fn() }));
jest.mock('../artist-monetization', () => ({ artistHasMonetizationEnabled: jest.fn() }));
jest.mock('../jwt', () => ({ classifyAuthorizationHeader: jest.fn() }));
jest.mock('../public-artist-resolver', () => {
  const actual = jest.requireActual('../public-artist-resolver');
  return { ...actual, resolvePublicArtistUserId: jest.fn() };
});
jest.mock('../track-assets-loader', () => ({
  fetchTrackAssetsByAlbumPks: jest.fn(),
  resolvePipelineAvailable: jest.fn(),
}));
jest.mock('../track-pipeline-schema', () => ({ tracksTableHasPipelineColumns: jest.fn() }));
jest.mock('../track-playback-storage-reconcile', () => ({
  reconcileAlbumPlaybackStorageBatch: jest.fn(),
}));
jest.mock('../track-lyrics', () => ({
  buildLyricsMapForAlbumTracks: jest.fn(),
}));

import { query } from '../db';
import { assertArtistVisibleToViewer } from '../artist-publication';
import { viewerHasPremiumAccessToArtist } from '../entitlements';
import { artistHasMonetizationEnabled } from '../artist-monetization';
import { classifyAuthorizationHeader } from '../jwt';
import { resolvePublicArtistUserId } from '../public-artist-resolver';
import { fetchTrackAssetsByAlbumPks, resolvePipelineAvailable } from '../track-assets-loader';
import { tracksTableHasPipelineColumns } from '../track-pipeline-schema';
import { reconcileAlbumPlaybackStorageBatch } from '../track-playback-storage-reconcile';
import { buildLyricsMapForAlbumTracks } from '../track-lyrics';
import { handler } from '../../artist-album-details';

const USER_ID = '8e998d76-1131-42ec-b26e-ef18603d8cec';
const ALBUM_PK = '11111111-1111-4111-8111-111111111111';

const mockQuery = query as unknown as jest.Mock;
const mockGate = assertArtistVisibleToViewer as unknown as jest.Mock;
const mockResolve = resolvePublicArtistUserId as unknown as jest.Mock;
const mockMonetization = artistHasMonetizationEnabled as unknown as jest.Mock;
const mockPremium = viewerHasPremiumAccessToArtist as unknown as jest.Mock;
const mockClassifyAuth = classifyAuthorizationHeader as unknown as jest.Mock;
const mockAssets = fetchTrackAssetsByAlbumPks as unknown as jest.Mock;
const mockPipeline = resolvePipelineAvailable as unknown as jest.Mock;
const mockHasPipelineCols = tracksTableHasPipelineColumns as unknown as jest.Mock;
const mockReconcileBatch = reconcileAlbumPlaybackStorageBatch as unknown as jest.Mock;
const mockLyrics = buildLyricsMapForAlbumTracks as unknown as jest.Mock;
const BASE_EVENT = {
  httpMethod: 'GET',
  path: '/api/artists/smolyanoe-chuchelko/albums/23',
  queryStringParameters: { slug: 'smolyanoe-chuchelko', albumId: '23' },
  headers: {},
};

type DetailsResponse = { statusCode: number; body: string };

const invoke = handler as unknown as (event: typeof BASE_EVENT) => Promise<DetailsResponse>;

function albumLocaleRow() {
  return {
    id: ALBUM_PK,
    user_id: USER_ID,
    album_id: '23',
    album: 'Album 23',
    full_name: '',
    description: '',
    cover: 'cover.jpg',
    release: {},
    buttons: {},
    details: [],
    photographer: '',
    photographer_url: '',
    designer: '',
    designer_url: '',
    is_public: true,
    is_published: true,
    lang: 'ru',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function trackRow(trackId: string) {
  return {
    album_pk: ALBUM_PK,
    track_id: trackId,
    title: trackId,
    duration: 180,
    src: `${trackId}.opus`,
    order_index: 0,
    visibility: 'public',
    stems_visibility: 'public',
    audio_container: null,
    audio_codec: null,
    audio_bitrate: null,
    audio_sample_rate: null,
    audio_bit_depth: null,
    audio_channels: null,
    audio_duration: null,
    audio_file_size: null,
    processing_status: 'ready',
    master_path: null,
    content: null,
    authorship: null,
  };
}

describe('artist-album-details playbackBootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockResolve.mockResolvedValue(USER_ID);
    mockGate.mockResolvedValue(undefined);
    mockClassifyAuth.mockReturnValue({ kind: 'none' });
    mockMonetization.mockResolvedValue(false);
    mockPremium.mockResolvedValue(false);
    mockHasPipelineCols.mockResolvedValue(true);
    mockPipeline.mockResolvedValue(true);
    mockAssets.mockResolvedValue(new Map());
    mockReconcileBatch.mockImplementation(async (_u, _a, _t, assets) => ({
      assetsByTrackId: assets,
      failedTrackIds: new Set(),
    }));
    mockLyrics.mockResolvedValue(new Map());

    mockQuery.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('FROM albums a') && text.includes('WHERE a.user_id')) {
        return { rows: [albumLocaleRow()] };
      }
      if (text.includes('FROM tracks t') && text.includes('WHERE t.album_id')) {
        return { rows: [trackRow('t1'), trackRow('t2')] };
      }
      throw new Error(`unexpected SQL: ${text}`);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('skips storage reconcile but still embeds lyrics when playbackBootstrap=1', async () => {
    const response = await invoke({
      ...BASE_EVENT,
      queryStringParameters: {
        slug: 'smolyanoe-chuchelko',
        albumId: '23',
        playbackBootstrap: '1',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(mockGate).toHaveBeenCalledWith(
      USER_ID,
      null,
      expect.objectContaining({ skipPlaybackStorageReconcile: true })
    );
    expect(mockReconcileBatch).not.toHaveBeenCalled();
    expect(mockLyrics).toHaveBeenCalled();
  });

  it('runs storage reconcile and lyrics on the full album page path', async () => {
    const response = await invoke(BASE_EVENT);

    expect(response.statusCode).toBe(200);
    expect(mockGate).toHaveBeenCalledWith(USER_ID, null, {
      skipPlaybackStorageReconcile: false,
    });
    expect(mockReconcileBatch).toHaveBeenCalled();
    expect(mockLyrics).toHaveBeenCalled();
  });
});
