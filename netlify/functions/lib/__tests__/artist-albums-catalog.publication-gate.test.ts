/**
 * Endpoint-level characterization of the REAL publication gate behind
 * GET /api/artists/:slug/albums.
 *
 * `artist-albums-catalog.orchestration.test.ts` mocks `assertArtistVisibleToViewer` wholesale, so
 * it pins orchestration but proves nothing about the gate itself. This suite is the complement:
 * `artist-publication` and `public-artist-resolver` run for real and only `db.query` is mocked,
 * so Q1/Q2/Q3/Q4 are dispatched by the production code paths and observed as HTTP status codes.
 *
 * Scope is deliberately narrow — it locks in TODAY's behaviour ahead of a possible Q2/Q3/Q4
 * merge. Nothing here endorses the current semantics; several assertions pin quirks.
 *
 * Query naming follows the optimization audit:
 *   Q1 resolvePublicArtistUserId  (users by public_slug)
 *   Q2 hasPublishedTracks         (users + albums + tracks)
 *   Q3 hasPublicArticles          (articles)
 *   Q4 hasPublicProfileContent    (users)
 */

// Signed before importing the handler: the real `jwt` module caches the secret per process.
process.env.JWT_SECRET = process.env.JWT_SECRET?.trim() || 'characterization-test-secret-value';

jest.mock('../db', () => ({ query: jest.fn() }));
// Not part of the gate: kept mocked so a gate assertion never fails for an unrelated reason.
jest.mock('../entitlements', () => ({ viewerHasPremiumAccessToArtist: jest.fn() }));
jest.mock('../artist-monetization', () => ({ artistHasMonetizationEnabled: jest.fn() }));

import { query } from '../db';
import { viewerHasPremiumAccessToArtist } from '../entitlements';
import { artistHasMonetizationEnabled } from '../artist-monetization';
import { generateToken } from '../jwt';
import { handler } from '../../artist-albums-catalog';

const USER_ID = '8e998d76-1131-42ec-b26e-ef18603d8cec';
const SLUG = 'beatles';

const mockQuery = query as unknown as jest.Mock;
const mockPremium = viewerHasPremiumAccessToArtist as unknown as jest.Mock;
const mockMonetization = artistHasMonetizationEnabled as unknown as jest.Mock;

type CatalogResponse = { statusCode: number; headers: Record<string, string>; body: string };
type Event = {
  httpMethod: string;
  path: string;
  queryStringParameters: Record<string, string>;
  headers: Record<string, string>;
};

const invoke = handler as unknown as (event: Event) => Promise<CatalogResponse>;

const ANONYMOUS_EVENT: Event = {
  httpMethod: 'GET',
  path: `/api/artists/${SLUG}/albums`,
  queryStringParameters: { slug: SLUG },
  headers: {},
};

/** One `albums LEFT JOIN tracks` row: enough for the album to survive the public filter. */
const CATALOG_ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  user_id: USER_ID,
  album_id: 'rubber-soul',
  album: 'Rubber Soul',
  cover: 'cover-key',
  release: { date: '1965-10-03' },
  is_public: true,
  is_published: true,
  lang: 'en',
  updated_at: '2026-01-01T00:00:00.000Z',
  track_id: 'track-1',
  duration: 180,
  visibility: 'public',
  stems_visibility: 'public',
  has_stems: false,
};

/** What the mocked driver should do for one gate predicate. */
type GateOutcome = boolean | 'zero-rows' | Error;

type RecordedCall = { sql: string; params: unknown[]; retries: unknown };

type Wiring = {
  /** Q1: `false` makes the slug resolve to zero rows. */
  artistExists?: boolean;
  tracks?: GateOutcome;
  articles?: GateOutcome;
  profile?: GateOutcome;
};

const isQ1 = (sql: string) => sql.includes('public_slug = $1');
const isQ2 = (sql: string) => sql.includes('has_published_tracks');
const isQ3 = (sql: string) => sql.includes('has_public_articles');
const isQ4 = (sql: string) => sql.includes('has_profile_content');
const isCatalog = (sql: string) => /FROM albums a/.test(sql) && /LEFT JOIN tracks t/.test(sql);

function gateResult(alias: string, outcome: GateOutcome) {
  if (outcome instanceof Error) throw outcome;
  if (outcome === 'zero-rows') return { rows: [] };
  return { rows: [{ [alias]: outcome }] };
}

/**
 * Routes each production SQL statement by the marker that identifies it, and records every call
 * in dispatch order. Q1 is matched first because Q2/Q4 also select `FROM users`.
 */
function wire(options: Wiring = {}): RecordedCall[] {
  const { artistExists = true, tracks = false, articles = false, profile = false } = options;
  const calls: RecordedCall[] = [];

  mockQuery.mockImplementation(async (sql: string, params: unknown[], retries: unknown) => {
    const text = String(sql);
    calls.push({ sql: text, params, retries });

    if (isQ1(text)) return { rows: artistExists ? [{ id: USER_ID }] : [] };
    if (isQ2(text)) return gateResult('has_published_tracks', tracks);
    if (isQ3(text)) return gateResult('has_public_articles', articles);
    if (isQ4(text)) return gateResult('has_profile_content', profile);
    if (isCatalog(text)) return { rows: [CATALOG_ROW] };

    throw new Error(`unexpected SQL in test: ${text}`);
  });

  return calls;
}

function gateCalls(calls: RecordedCall[]): RecordedCall[] {
  return calls.filter(({ sql }) => isQ2(sql) || isQ3(sql) || isQ4(sql));
}

function parseBody(response: CatalogResponse): Record<string, unknown> {
  return JSON.parse(response.body) as Record<string, unknown>;
}

describe('artist-albums-catalog publication gate (real gate, mocked driver)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockPremium.mockResolvedValue(false);
    mockMonetization.mockResolvedValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('error semantics: a failing gate predicate is a 500, never a 404', () => {
    // There is no try/catch, no fallback and no `isMissingRelationError` handling around the
    // gate: `Promise.all` already makes all three predicates all-or-nothing, so a single
    // rejection takes down the whole gate and surfaces as an unhandled error at the endpoint.

    it('Q2 rejection becomes a 500 and spends no catalog query', async () => {
      const calls = wire({ tracks: new Error('Q2 tracks probe failed') });

      const response = await invoke(ANONYMOUS_EVENT);

      expect(response.statusCode).toBe(500);
      expect(parseBody(response)).toEqual({
        success: false,
        error: 'Q2 tracks probe failed',
      });
      // Crucially NOT a 404: a broken predicate must not be reported as "artist not published".
      expect(parseBody(response).code).toBeUndefined();
      expect(calls.filter(({ sql }) => isCatalog(sql))).toHaveLength(0);
      expect(mockMonetization).not.toHaveBeenCalled();
    });

    it('Q3 rejection becomes a 500 and spends no catalog query', async () => {
      const calls = wire({ tracks: false, articles: new Error('Q3 articles probe failed') });

      const response = await invoke(ANONYMOUS_EVENT);

      expect(response.statusCode).toBe(500);
      expect(parseBody(response).error).toBe('Q3 articles probe failed');
      expect(calls.filter(({ sql }) => isCatalog(sql))).toHaveLength(0);
    });

    it('Q4 rejection becomes a 500 and spends no catalog query', async () => {
      const calls = wire({ tracks: false, articles: false, profile: new Error('Q4 probe failed') });

      const response = await invoke(ANONYMOUS_EVENT);

      expect(response.statusCode).toBe(500);
      expect(parseBody(response).error).toBe('Q4 probe failed');
      expect(calls.filter(({ sql }) => isCatalog(sql))).toHaveLength(0);
    });

    it('a truthy Q3 does not rescue a rejecting Q4', async () => {
      // Q2 is false, so the gate reaches the Q3/Q4 pair, which keeps its Promise.all semantics:
      // a rejection is fatal even though the sibling would have opened the gate.
      wire({ tracks: false, articles: true, profile: new Error('Q4 still fails the whole gate') });

      const response = await invoke(ANONYMOUS_EVENT);

      expect(response.statusCode).toBe(500);
      expect(parseBody(response).error).toBe('Q4 still fails the whole gate');
    });

    it('a true Q2 short-circuits past a predicate that would have failed', async () => {
      // Behaviour change introduced with the lazy gate: Q3 is never dispatched, so a driver
      // failure that used to surface as a 500 is no longer even triggered. The request succeeds
      // because published tracks already satisfy the gate on their own.
      const calls = wire({ tracks: true, articles: new Error('Q3 would have failed') });

      const response = await invoke(ANONYMOUS_EVENT);

      expect(response.statusCode).toBe(200);
      expect(gateCalls(calls)).toHaveLength(1);
      expect(isQ2(gateCalls(calls)[0].sql)).toBe(true);
    });
  });

  describe('gate outcome → HTTP status', () => {
    it('passes the gate and returns album DTOs when all three predicates are true', async () => {
      const calls = wire({ tracks: true, articles: true, profile: true });

      const response = await invoke(ANONYMOUS_EVENT);

      expect(response.statusCode).toBe(200);
      expect(parseBody(response).success).toBe(true);
      expect(parseBody(response).data).toHaveLength(1);
      expect(calls.filter(({ sql }) => isCatalog(sql))).toHaveLength(1);
    });

    it('404s with ARTIST_NOT_PUBLISHED when all three predicates are false', async () => {
      const calls = wire({ tracks: false, articles: false, profile: false });

      const response = await invoke(ANONYMOUS_EVENT);

      expect(response.statusCode).toBe(404);
      expect(parseBody(response)).toEqual({
        success: false,
        error: 'Artist not found',
        code: 'ARTIST_NOT_PUBLISHED',
      });
      // A rejected gate costs zero catalog and zero monetization work.
      expect(calls.filter(({ sql }) => isCatalog(sql))).toHaveLength(0);
      expect(mockMonetization).not.toHaveBeenCalled();
    });

    it.each([
      ['tracks only', { tracks: true, articles: false, profile: false }],
      ['articles only', { tracks: false, articles: true, profile: false }],
      ['profile only', { tracks: false, articles: false, profile: true }],
    ])('passes the gate on %s (any single predicate is sufficient)', async (_label, wiring) => {
      wire(wiring);

      const response = await invoke(ANONYMOUS_EVENT);

      expect(response.statusCode).toBe(200);
    });

    it('404s with ARTIST_NOT_FOUND when Q1 resolves no artist, before any gate query', async () => {
      const calls = wire({ artistExists: false });

      const response = await invoke(ANONYMOUS_EVENT);

      expect(response.statusCode).toBe(404);
      expect(parseBody(response)).toEqual({
        success: false,
        error: 'Artist not found',
        code: 'ARTIST_NOT_FOUND',
      });
      // The two 404s are distinguishable by `code`, and an unresolved slug short-circuits Q2/Q3/Q4.
      expect(gateCalls(calls)).toHaveLength(0);
      expect(calls).toHaveLength(1);
    });
  });

  describe('query characterization for the ordinary no-options gate', () => {
    it('issues only Q1 + Q2 before the catalog wave when Q2 is true', async () => {
      const calls = wire({ tracks: true, articles: true, profile: true });

      await invoke(ANONYMOUS_EVENT);

      // The lazy fast path: three statements total for a published artist, where the eager gate
      // needed five. Q3/Q4 are not dispatched even though both would have been true.
      expect(calls).toHaveLength(3);
      expect(isQ1(calls[0].sql)).toBe(true);
      expect(isQ2(calls[1].sql)).toBe(true);
      expect(isCatalog(calls[2].sql)).toBe(true);
      expect(gateCalls(calls)).toHaveLength(1);
    });

    it('issues Q1 + Q2 + Q3 + Q4 before the catalog wave when Q2 is false', async () => {
      const calls = wire({ tracks: false, articles: true, profile: true });

      await invoke(ANONYMOUS_EVENT);

      // Q2 is ordered first; Q3/Q4 are dispatched together, so only the group boundary is fixed.
      expect(calls).toHaveLength(5);
      expect(isQ1(calls[0].sql)).toBe(true);
      expect(isQ2(calls[1].sql)).toBe(true);
      expect(calls.slice(2, 4).every(({ sql }) => isQ3(sql) || isQ4(sql))).toBe(true);
      expect(isCatalog(calls[4].sql)).toBe(true);
      expect(gateCalls(calls)).toHaveLength(3);
    });

    it('keys every gate predicate on the resolved artist id alone', async () => {
      const calls = wire({ tracks: false, articles: true, profile: true });

      await invoke(ANONYMOUS_EVENT);

      expect(gateCalls(calls)).toHaveLength(3);
      for (const call of gateCalls(calls)) {
        expect(call.params).toEqual([USER_ID]);
      }
    });

    it('runs every gate predicate with retries disabled', async () => {
      const calls = wire({ tracks: false, articles: true, profile: true });

      await invoke(ANONYMOUS_EVENT);

      // `query(sql, params, 0)` — a connection blip on the gate fails the request instead of
      // silently costing another round-trip. Pinned because it is easy to drop in a refactor.
      expect(gateCalls(calls)).toHaveLength(3);
      for (const call of gateCalls(calls)) {
        expect(call.retries).toBe(0);
      }
    });
  });

  describe('owner-viewer', () => {
    it('spends zero gate queries when the viewer is the artist owner', async () => {
      const calls = wire({ tracks: false, articles: false, profile: false });
      const ownerToken = generateToken(USER_ID, 'owner@example.com');

      const response = await invoke({
        ...ANONYMOUS_EVENT,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      // The owner bypasses the gate entirely, so an artist with no public content at all still
      // gets a 200 — and Q2/Q3/Q4 are never issued.
      expect(response.statusCode).toBe(200);
      expect(gateCalls(calls)).toHaveLength(0);
      expect(
        calls.map(({ sql }) => (isQ1(sql) ? 'Q1' : isCatalog(sql) ? 'catalog' : 'other'))
      ).toEqual(['Q1', 'catalog']);
    });
  });

  describe('zero-row driver results', () => {
    it('treats a zero-row Q2 as "no published tracks" rather than an error', async () => {
      // Q2 selects `FROM users WHERE id = $1 AND is_active = true`, so an artist deactivated
      // between Q1 and the gate yields no row at all.
      wire({ tracks: 'zero-rows', articles: false, profile: false });

      const response = await invoke(ANONYMOUS_EVENT);

      expect(response.statusCode).toBe(404);
      expect(parseBody(response).code).toBe('ARTIST_NOT_PUBLISHED');
    });

    it('treats a zero-row Q4 as "no profile content" rather than an error', async () => {
      wire({ tracks: false, articles: false, profile: 'zero-rows' });

      const response = await invoke(ANONYMOUS_EVENT);

      expect(response.statusCode).toBe(404);
      expect(parseBody(response).code).toBe('ARTIST_NOT_PUBLISHED');
    });

    it('still opens the gate when only Q3 is true and the users-keyed probes return no row', async () => {
      // Q3 has no `users` join, so it can outvote a users row that Q2/Q4 cannot even see.
      // This asymmetry is exactly what a merged users-anchored query would remove.
      wire({ tracks: 'zero-rows', articles: true, profile: 'zero-rows' });

      const response = await invoke(ANONYMOUS_EVENT);

      expect(response.statusCode).toBe(200);
    });
  });
});
