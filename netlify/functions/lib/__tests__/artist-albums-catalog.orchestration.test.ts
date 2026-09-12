/**
 * Orchestration contract for GET /api/artists/:slug/albums.
 *
 * The monetization lookup and the albums query share one round-trip wave. These tests pin the
 * ordering rules that make that safe: the publication gate still resolves before either query
 * starts, the tracks query still consumes album ids produced by the albums query, and a rejected
 * gate still costs zero catalog queries.
 */

jest.mock('../db', () => ({ query: jest.fn() }));
jest.mock('../artist-publication', () => ({ assertArtistVisibleToViewer: jest.fn() }));
jest.mock('../entitlements', () => ({ viewerHasPremiumAccessToArtist: jest.fn() }));
jest.mock('../artist-monetization', () => ({ artistHasMonetizationEnabled: jest.fn() }));
jest.mock('../public-artist-resolver', () => {
  const actual = jest.requireActual('../public-artist-resolver');
  return { ...actual, resolvePublicArtistUserId: jest.fn() };
});

import { query } from '../db';
import { assertArtistVisibleToViewer } from '../artist-publication';
import { artistHasMonetizationEnabled } from '../artist-monetization';
import { viewerHasPremiumAccessToArtist } from '../entitlements';
import { PublicArtistResolverError, resolvePublicArtistUserId } from '../public-artist-resolver';
import { handler } from '../../artist-albums-catalog';

const USER_ID = '8e998d76-1131-42ec-b26e-ef18603d8cec';
const ALBUM_PK = '11111111-1111-4111-8111-111111111111';

const ALBUM_ROW = {
  id: ALBUM_PK,
  user_id: USER_ID,
  album_id: 'rubber-soul',
  album: 'Rubber Soul',
  cover: 'cover-key',
  release: { date: '1965-10-03' },
  is_public: true,
  is_published: true,
  lang: 'en',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const TRACK_ROW = {
  album_pk: ALBUM_PK,
  track_id: 'track-1',
  duration: 180,
  visibility: 'public',
  stems_visibility: 'public',
  has_stems: true,
};

const EVENT = {
  httpMethod: 'GET',
  path: '/api/artists/beatles/albums',
  queryStringParameters: { slug: 'beatles' },
  headers: {},
};

type CatalogResponse = { statusCode: number; headers: Record<string, string>; body: string };

const invoke = handler as unknown as (event: typeof EVENT) => Promise<CatalogResponse>;

const mockQuery = query as unknown as jest.Mock;
const mockGate = assertArtistVisibleToViewer as unknown as jest.Mock;
const mockMonetization = artistHasMonetizationEnabled as unknown as jest.Mock;
const mockPremium = viewerHasPremiumAccessToArtist as unknown as jest.Mock;
const mockResolveArtist = resolvePublicArtistUserId as unknown as jest.Mock;

type RecordedQuery = { sql: string; params: unknown[] };

const isAlbumsQuery = (call: RecordedQuery) => /FROM albums/.test(call.sql);
const isTracksQuery = (call: RecordedQuery) => /FROM tracks/.test(call.sql);

/** Records every SQL call in order; `albumsError` makes only the albums query fail. */
function recordQueries(options: { albumsError?: Error } = {}): RecordedQuery[] {
  const calls: RecordedQuery[] = [];
  mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    const call = { sql, params };
    calls.push(call);
    if (isAlbumsQuery(call)) {
      if (options.albumsError) {
        throw options.albumsError;
      }
      return { rows: [ALBUM_ROW] };
    }
    if (isTracksQuery(call)) {
      return { rows: [TRACK_ROW] };
    }
    throw new Error(`Unexpected SQL in test: ${sql}`);
  });
  return calls;
}

/** Lets every already-queued microtask run so in-flight queries become observable. */
function flushPendingWork(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('artist-albums-catalog orchestration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockResolveArtist.mockResolvedValue(USER_ID);
    mockGate.mockResolvedValue(undefined);
    mockPremium.mockResolvedValue(false);
    mockMonetization.mockResolvedValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts the albums query without waiting for the monetization lookup', async () => {
    const calls = recordQueries();
    let releaseMonetization: (value: boolean) => void = () => undefined;
    mockMonetization.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          releaseMonetization = resolve;
        })
    );

    const pending = invoke(EVENT);
    await flushPendingWork();

    // Monetization is still unresolved, yet the albums query is already in flight: one wave.
    expect(mockMonetization).toHaveBeenCalledWith(USER_ID);
    expect(calls.filter(isAlbumsQuery)).toHaveLength(1);
    expect(calls.filter(isTracksQuery)).toHaveLength(0);

    releaseMonetization(false);
    await expect(pending).resolves.toMatchObject({ statusCode: 200 });
  });

  it('keeps concurrency at two by resolving the premium check after the shared wave', async () => {
    const calls = recordQueries();
    let releaseMonetization: (value: boolean) => void = () => undefined;
    mockMonetization.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          releaseMonetization = resolve;
        })
    );

    const pending = invoke(EVENT);
    await flushPendingWork();

    // While the monetization + albums wave is open, nothing else has been dispatched.
    expect(mockPremium).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);

    releaseMonetization(false);
    await pending;

    expect(mockPremium).toHaveBeenCalledWith(null, USER_ID);
  });

  it('feeds album ids from the albums query into the tracks query', async () => {
    const calls = recordQueries();

    const response = await invoke(EVENT);

    const albumsIndex = calls.findIndex(isAlbumsQuery);
    const tracksIndex = calls.findIndex(isTracksQuery);
    expect(albumsIndex).toBe(0);
    expect(tracksIndex).toBeGreaterThan(albumsIndex);
    expect(calls[tracksIndex].params).toEqual([[ALBUM_PK]]);
    expect(response.statusCode).toBe(200);
  });

  it('resolves the publication gate before dispatching either shared-wave call', async () => {
    const calls = recordQueries();
    let releaseGate: () => void = () => undefined;
    mockGate.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseGate = resolve;
        })
    );

    const pending = invoke(EVENT);
    await flushPendingWork();

    expect(mockMonetization).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);

    releaseGate();
    await pending;

    expect(mockMonetization).toHaveBeenCalledTimes(1);
    expect(calls.filter(isAlbumsQuery)).toHaveLength(1);
  });

  it('spends no monetization or catalog query when the gate rejects with 404', async () => {
    const calls = recordQueries();
    mockGate.mockRejectedValue(
      new PublicArtistResolverError(404, 'Artist not found', 'ARTIST_NOT_PUBLISHED')
    );

    const response = await invoke(EVENT);

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({
      success: false,
      error: 'Artist not found',
      code: 'ARTIST_NOT_PUBLISHED',
    });
    expect(mockMonetization).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('surfaces an albums query failure as 500', async () => {
    recordQueries({ albumsError: new Error('albums query failed') });

    const response = await invoke(EVENT);

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).error).toBe('albums query failed');
  });

  it('surfaces a monetization lookup failure as 500', async () => {
    recordQueries();
    mockMonetization.mockRejectedValue(new Error('monetization lookup failed'));

    const response = await invoke(EVENT);

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).error).toBe('monetization lookup failed');
  });

  it('returns the unchanged catalog payload for a published album', async () => {
    recordQueries();

    const response = await invoke(EVENT);

    expect(response.body).toBe(
      JSON.stringify({
        success: true,
        data: [
          {
            albumId: 'rubber-soul',
            slug: 'rubber-soul',
            title: 'Rubber Soul',
            cover: 'cover-key',
            releaseDate: '1965-10-03',
            trackCount: 1,
            duration: 180,
            userId: USER_ID,
            isPublished: true,
            isPublic: true,
            hasLockedTracks: false,
            hasStems: true,
          },
        ],
      })
    );
  });
});
