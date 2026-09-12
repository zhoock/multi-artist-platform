/**
 * Orchestration contract for GET /api/artists/:slug/albums.
 *
 * The monetization lookup and the catalog query share one round-trip wave. These tests pin the
 * ordering rules that make that safe: the publication gate still resolves before either query
 * starts, and a rejected gate still costs zero catalog queries.
 *
 * Albums and tracks are fetched by a single `albums LEFT JOIN tracks` query, so the tests also
 * pin the flat-result reconstruction: locale rows dedupe per album primary key, NULL track rows
 * are not tracks, and cross-locale track merging stays in JS.
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

import { query } from '../db';
import { assertArtistVisibleToViewer } from '../artist-publication';
import { artistHasMonetizationEnabled } from '../artist-monetization';
import { viewerHasPremiumAccessToArtist } from '../entitlements';
import { classifyAuthorizationHeader } from '../jwt';
import { PublicArtistResolverError, resolvePublicArtistUserId } from '../public-artist-resolver';
import { handler } from '../../artist-albums-catalog';

const USER_ID = '8e998d76-1131-42ec-b26e-ef18603d8cec';
const ALBUM_PK = '11111111-1111-4111-8111-111111111111';
const ALBUM_PK_RU = '22222222-2222-4222-8222-222222222222';

/** One row of the `albums LEFT JOIN tracks` result. */
type JoinRow = {
  id: string;
  user_id: string | null;
  album_id: string;
  album: string;
  cover: string | null;
  release: unknown;
  is_public: boolean;
  is_published: boolean;
  lang: string;
  updated_at: string | null;
  track_id: string | null;
  duration: number | null;
  visibility: string | null;
  stems_visibility: string | null;
  has_stems: boolean | null;
};

function joinRow(overrides: Partial<JoinRow> = {}): JoinRow {
  return {
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
    track_id: null,
    duration: null,
    visibility: null,
    stems_visibility: null,
    has_stems: null,
    ...overrides,
  };
}

/** The single album + single track shape the endpoint returned before the queries were merged. */
const CATALOG_ROW = joinRow({
  track_id: 'track-1',
  duration: 180,
  visibility: 'public',
  stems_visibility: 'public',
  has_stems: true,
});

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
const mockClassifyAuth = classifyAuthorizationHeader as unknown as jest.Mock;

type RecordedQuery = { sql: string; params: unknown[] };

/** The merged catalog query is the only SQL this endpoint issues. */
const isCatalogQuery = (call: RecordedQuery) =>
  /FROM albums a/.test(call.sql) && /LEFT JOIN tracks t/.test(call.sql);

/** Records every SQL call in order; `catalogError` makes the catalog query fail. */
function recordQueries(options: { rows?: JoinRow[]; catalogError?: Error } = {}): RecordedQuery[] {
  const calls: RecordedQuery[] = [];
  mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    const call = { sql, params };
    calls.push(call);
    if (isCatalogQuery(call)) {
      if (options.catalogError) {
        throw options.catalogError;
      }
      return { rows: options.rows ?? [CATALOG_ROW] };
    }
    throw new Error(`Unexpected SQL in test: ${sql}`);
  });
  return calls;
}

/** Lets every already-queued microtask run so in-flight queries become observable. */
function flushPendingWork(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function parseCatalog(response: CatalogResponse): Array<Record<string, unknown>> {
  return JSON.parse(response.body).data as Array<Record<string, unknown>>;
}

describe('artist-albums-catalog orchestration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockResolveArtist.mockResolvedValue(USER_ID);
    mockGate.mockResolvedValue(undefined);
    mockPremium.mockResolvedValue(false);
    mockMonetization.mockResolvedValue(false);
    mockClassifyAuth.mockReturnValue({ kind: 'none' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts the catalog query without waiting for the monetization lookup', async () => {
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

    // Monetization is still unresolved, yet the catalog query is already in flight: one wave.
    expect(mockMonetization).toHaveBeenCalledWith(USER_ID);
    expect(calls.filter(isCatalogQuery)).toHaveLength(1);

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

    // While the monetization + catalog wave is open, nothing else has been dispatched.
    expect(mockPremium).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);

    releaseMonetization(false);
    await pending;

    expect(mockPremium).toHaveBeenCalledWith(null, USER_ID);
  });

  it('loads albums and tracks in exactly one SQL query keyed only by the artist id', async () => {
    const calls = recordQueries();

    const response = await invoke(EVENT);

    expect(calls).toHaveLength(1);
    expect(isCatalogQuery(calls[0])).toBe(true);
    expect(calls[0].params).toEqual([USER_ID]);
    expect(response.statusCode).toBe(200);
  });

  it('keeps publication and visibility filtering out of SQL', async () => {
    const calls = recordQueries();

    await invoke(EVENT);
    const { sql } = calls[0];

    // A LEFT JOIN is what keeps trackless locale rows alive; an INNER JOIN would drop them.
    expect(sql).toMatch(/LEFT JOIN tracks t ON t\.album_id = a\.id/);
    expect(sql).not.toMatch(/INNER JOIN/);

    // Publication and visibility gates stay in JS so the owner view keeps working.
    expect(sql).not.toMatch(/is_published\s*=/);
    expect(sql).not.toMatch(/is_public\s*=/);
    expect(sql).not.toMatch(/visibility\s*(=|<>|!=)/);
    expect(sql).not.toMatch(/has_stems\s*=/);
    expect(sql).not.toMatch(/track_id IS NOT NULL/);

    // Track dedup is a cross-locale JS merge, never a SQL aggregate.
    expect(sql).not.toMatch(/\b(COUNT|SUM|GROUP BY|DISTINCT|array_agg|json_agg|jsonb_agg)\b/i);

    // Album ordering is still resolved by the database, verbatim.
    expect(sql).toMatch(
      /ORDER BY a\.album_id,\s*CASE a\.lang WHEN 'ru' THEN 0 WHEN 'en' THEN 1 ELSE 2 END,\s*a\.updated_at DESC NULLS LAST,\s*a\.created_at DESC/
    );
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
    expect(calls.filter(isCatalogQuery)).toHaveLength(1);
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

  it('surfaces a catalog query failure as 500 without retrying it', async () => {
    const calls = recordQueries({ catalogError: new Error('catalog query failed') });

    const response = await invoke(EVENT);

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).error).toBe('catalog query failed');
    // One failed attempt only: no fallback ladder replays the albums-side scan.
    expect(calls).toHaveLength(1);
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

  it('returns an empty catalog for an artist with no albums', async () => {
    const calls = recordQueries({ rows: [] });

    const response = await invoke(EVENT);

    expect(response.statusCode).toBe(200);
    expect(parseCatalog(response)).toEqual([]);
    // No album ids to feed anywhere, so still exactly one query.
    expect(calls).toHaveLength(1);
  });
});

describe('artist-albums-catalog flat join reconstruction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockResolveArtist.mockResolvedValue(USER_ID);
    mockGate.mockResolvedValue(undefined);
    mockPremium.mockResolvedValue(false);
    mockMonetization.mockResolvedValue(false);
    mockClassifyAuth.mockReturnValue({ kind: 'none' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps a trackless locale row that carries album-level data (production 23-remastered)', async () => {
    // `ru` holds all three tracks; `en` has none but is the newer row, so it supplies both the
    // title (en wins the title priority) and the shared cover / release / publication flags.
    const ru = {
      id: ALBUM_PK_RU,
      album_id: '23-remastered',
      lang: 'ru',
      album: '23 (Remastered) RU',
      cover: 'cover-ru',
      release: { date: '2000-01-01' },
      updated_at: '2026-01-01T00:00:00.000Z',
    };
    const en = {
      id: ALBUM_PK,
      album_id: '23-remastered',
      lang: 'en',
      album: '23 (Remastered) EN',
      cover: 'cover-en',
      release: { date: '2025-02-20' },
      updated_at: '2026-06-01T00:00:00.000Z',
    };

    recordQueries({
      rows: [
        // SQL order: langRank puts `ru` first, then the trackless `en` row.
        joinRow({
          ...ru,
          track_id: 'a',
          duration: 10,
          visibility: 'public',
          stems_visibility: 'public',
          has_stems: false,
        }),
        joinRow({
          ...ru,
          track_id: 'b',
          duration: 20,
          visibility: 'public',
          stems_visibility: 'public',
          has_stems: false,
        }),
        joinRow({
          ...ru,
          track_id: 'c',
          duration: 30,
          visibility: 'public',
          stems_visibility: 'public',
          has_stems: false,
        }),
        joinRow({ ...en, track_id: null }),
      ],
    });

    const catalog = parseCatalog(await invoke(EVENT));

    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({
      albumId: '23-remastered',
      title: '23 (Remastered) EN',
      cover: 'cover-en',
      releaseDate: '2025-02-20',
      trackCount: 3,
      duration: 60,
      isPublished: true,
      isPublic: true,
    });
  });

  it('gives an album whose every locale is trackless no phantom track', async () => {
    const rows = [
      joinRow({
        id: ALBUM_PK_RU,
        album_id: 'empty',
        lang: 'ru',
        album: 'Empty RU',
        track_id: null,
      }),
      joinRow({ id: ALBUM_PK, album_id: 'empty', lang: 'en', album: 'Empty EN', track_id: null }),
    ];

    // The public gate drops trackCount === 0 albums.
    recordQueries({ rows });
    expect(parseCatalog(await invoke(EVENT))).toEqual([]);

    // The owner bypasses that gate, which exposes the real count: zero, not one.
    mockClassifyAuth.mockReturnValue({ kind: 'valid', userId: USER_ID });
    recordQueries({ rows });
    const ownerCatalog = parseCatalog(
      await invoke({ ...EVENT, headers: { authorization: 'Bearer owner' } })
    );

    expect(ownerCatalog).toHaveLength(1);
    expect(ownerCatalog[0]).toMatchObject({ albumId: 'empty', trackCount: 0, duration: 0 });
  });

  it('counts a track shared by two locales once', async () => {
    recordQueries({
      rows: [
        joinRow({
          id: ALBUM_PK_RU,
          lang: 'ru',
          track_id: 'shared',
          duration: 200,
          visibility: 'public',
          stems_visibility: 'public',
          has_stems: false,
        }),
        joinRow({
          id: ALBUM_PK,
          lang: 'en',
          track_id: 'shared',
          duration: 180,
          visibility: 'public',
          stems_visibility: 'public',
          has_stems: false,
        }),
      ],
    });

    const catalog = parseCatalog(await invoke(EVENT));

    expect(catalog).toHaveLength(1);
    // One track, and the merge keeps the longest duration rather than summing the locales.
    expect(catalog[0]).toMatchObject({ trackCount: 1, duration: 200 });
  });

  it('merges divergent per-locale visibility to the most open value', async () => {
    recordQueries({
      rows: [
        // First locale alone would read as hidden track + hidden stems, i.e. invisible.
        joinRow({
          id: ALBUM_PK_RU,
          lang: 'ru',
          track_id: 'shared',
          duration: 90,
          visibility: 'hidden',
          stems_visibility: 'hidden',
          has_stems: true,
        }),
        joinRow({
          id: ALBUM_PK,
          lang: 'en',
          track_id: 'shared',
          duration: 90,
          visibility: 'public',
          stems_visibility: 'public',
          has_stems: false,
        }),
      ],
    });

    const catalog = parseCatalog(await invoke(EVENT));

    expect(catalog).toHaveLength(1);
    // Most-open visibility makes it countable; most-open stems_visibility plus OR'd has_stems
    // makes it a stems album.
    expect(catalog[0]).toMatchObject({ trackCount: 1, duration: 90, hasStems: true });
  });

  it('counts stems from a hidden track whose stems stay public', async () => {
    recordQueries({
      rows: [
        joinRow({
          track_id: 'hidden-public-stems',
          duration: 120,
          visibility: 'hidden',
          stems_visibility: 'public',
          has_stems: true,
        }),
        joinRow({
          track_id: 'fully-hidden',
          duration: 999,
          visibility: 'hidden',
          stems_visibility: 'hidden',
          has_stems: true,
        }),
        joinRow({
          track_id: 'plain',
          duration: 60,
          visibility: 'public',
          stems_visibility: 'public',
          has_stems: false,
        }),
      ],
    });

    const catalog = parseCatalog(await invoke(EVENT));

    expect(catalog).toHaveLength(1);
    // A hidden track stays listable while its stems are open, so it keeps counting and sets
    // hasStems. Only the track hidden on both axes drops out of trackCount / duration, and its
    // has_stems does not reach hasStems either.
    expect(catalog[0]).toMatchObject({ trackCount: 2, duration: 180, hasStems: true });
  });

  it('shows the owner an unpublished album that anonymous viewers never see', async () => {
    const rows = [
      joinRow({
        album_id: 'draft',
        album: 'Draft',
        is_public: false,
        is_published: false,
        track_id: 'track-1',
        duration: 42,
        visibility: 'public',
        stems_visibility: 'public',
        has_stems: false,
      }),
    ];

    recordQueries({ rows });
    expect(parseCatalog(await invoke(EVENT))).toEqual([]);

    mockClassifyAuth.mockReturnValue({ kind: 'valid', userId: USER_ID });
    const calls = recordQueries({ rows });
    const ownerCatalog = parseCatalog(
      await invoke({ ...EVENT, headers: { authorization: 'Bearer owner' } })
    );

    expect(ownerCatalog).toHaveLength(1);
    expect(ownerCatalog[0]).toMatchObject({
      albumId: 'draft',
      trackCount: 1,
      duration: 42,
      isPublished: false,
      isPublic: false,
    });
    // The owner sees it because the gate is in JS: the SQL was identical for both viewers.
    expect(calls[0].params).toEqual([USER_ID]);
  });

  it('preserves album order and dedupes locale rows across multiple albums', async () => {
    recordQueries({
      rows: [
        joinRow({
          id: 'pk-b-ru',
          album_id: 'b-album',
          lang: 'ru',
          album: 'B RU',
          track_id: 't1',
          duration: 10,
          visibility: 'public',
          stems_visibility: 'public',
          has_stems: false,
        }),
        joinRow({
          id: 'pk-b-ru',
          album_id: 'b-album',
          lang: 'ru',
          album: 'B RU',
          track_id: 't2',
          duration: 20,
          visibility: 'public',
          stems_visibility: 'public',
          has_stems: false,
        }),
        joinRow({
          id: 'pk-b-en',
          album_id: 'b-album',
          lang: 'en',
          album: 'B EN',
          track_id: 't1',
          duration: 10,
          visibility: 'public',
          stems_visibility: 'public',
          has_stems: false,
        }),
        joinRow({
          id: 'pk-c-ru',
          album_id: 'c-album',
          lang: 'ru',
          album: 'C RU',
          track_id: 't1',
          duration: 30,
          visibility: 'public',
          stems_visibility: 'public',
          has_stems: false,
        }),
      ],
    });

    const catalog = parseCatalog(await invoke(EVENT));

    // Album order follows the SQL ORDER BY, not the repeated flat rows.
    expect(catalog.map((a) => a.albumId)).toEqual(['b-album', 'c-album']);
    expect(catalog[0]).toMatchObject({ title: 'B EN', trackCount: 2, duration: 30 });
    expect(catalog[1]).toMatchObject({ title: 'C RU', trackCount: 1, duration: 30 });
  });
});
