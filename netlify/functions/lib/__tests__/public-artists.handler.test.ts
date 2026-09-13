/**
 * Characterization contract for GET /api/public-artists, pinned before the fused-SQL change that
 * will fold the published-tracks EXISTS into the base query.
 *
 * Only `../db` is mocked, so `isArtistProfilePublished` runs for real and every predicate it
 * sends is observable here. The stub then reads the SQL it is handed and applies the predicates
 * it finds, the way Postgres would: an artist query carrying `u.is_active = true` gets only
 * active rows back, and one carrying the publication EXISTS gets only published rows back.
 *
 * That is what keeps the behavioural blocks below describing the endpoint's contract rather than
 * its current query plan — a correct fused implementation passes them unchanged, while one that
 * drops a filter, loses an artist or reorders the list fails them. `describe('N+1 query shape')`
 * is the deliberate exception: it pins the 1 + N round trips that exist today, and the
 * optimisation is expected to rewrite that block and nothing else.
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

import { query } from '../db';
import { handler } from '../../public-artists';

const mockQuery = query as jest.MockedFunction<typeof query>;

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const ID_C = '33333333-3333-4333-8333-333333333333';

/** One row of the base artist query, as declared by `PublicArtistRow`. */
type ArtistRow = {
  id: string;
  name: string | null;
  site_name: string | null;
  public_slug: string | null;
  genre_code: string | null;
  label_en: string | null;
  label_ru: string | null;
  header_images: unknown;
  monetization_shop_id: string | null;
};

/** The DTO shape `createSuccessResponse` wraps, as declared by `PublicArtistDto`. */
type ArtistDto = {
  userId: string;
  name: string;
  publicSlug: string;
  genreCode: string;
  genreLabel: { en: string; ru: string };
  headerImages: string[];
  monetizationEnabled: boolean;
};

/**
 * A row in `users` plus the facts the endpoint's two predicates read. `active` and `published`
 * are applied by the stub only when the SQL actually asks for them.
 */
type Candidate = {
  row: ArtistRow;
  published: boolean;
  active?: boolean;
  publicationError?: Error;
};

function artistRow(id: string, overrides: Partial<ArtistRow> = {}): ArtistRow {
  return {
    id,
    name: 'Artist',
    site_name: null,
    public_slug: 'artist',
    genre_code: 'rock',
    label_en: 'Rock',
    label_ru: 'Рок',
    header_images: [],
    monetization_shop_id: null,
    ...overrides,
  };
}

function candidate(
  id: string,
  slug: string,
  published: boolean,
  overrides: Partial<Candidate> = {}
): Candidate {
  return {
    row: artistRow(id, { public_slug: slug, name: slug, ...overrides.row }),
    published,
    ...(overrides.active === undefined ? {} : { active: overrides.active }),
    ...(overrides.publicationError ? { publicationError: overrides.publicationError } : {}),
  };
}

type RecordedQuery = { sql: string; params: unknown[] | undefined; retries: unknown };

/** The base query is the only one that joins `genres`; the publication probe never does. */
const isArtistQuery = (sql: string) => /JOIN genres g/.test(sql);
const isPublicationProbe = (sql: string) => /has_published_tracks/.test(sql) && !isArtistQuery(sql);

/** Predicates the stub honours when it sees them, so dropping one changes observable output. */
const FILTERS_INACTIVE = /u\.is_active = true/;
const FILTERS_MISSING_SLUG = /u\.public_slug IS NOT NULL/;
const FILTERS_UNPUBLISHED = /a\.is_published = true/;

/** `query` resolves a full `QueryResult`; these tests only ever read `rows`. */
const rowsResult = (rows: unknown[]) => ({ rows }) as never;

/**
 * Installs the DB boundary and returns the live call log. Every SQL statement the request issues
 * is recorded in order, whether it comes from the handler or from `isArtistProfilePublished`.
 */
function installDb(options: { candidates?: Candidate[]; baseError?: Error } = {}): RecordedQuery[] {
  const candidates = options.candidates ?? [];
  const calls: RecordedQuery[] = [];

  mockQuery.mockImplementation((async (sql: string, params?: unknown[], retries?: unknown) => {
    calls.push({ sql, params, retries });

    if (isArtistQuery(sql)) {
      if (options.baseError) {
        throw options.baseError;
      }

      const gatesPublication = FILTERS_UNPUBLISHED.test(sql);
      const visible = candidates.filter((entry) => {
        if (FILTERS_INACTIVE.test(sql) && entry.active === false) return false;
        if (FILTERS_MISSING_SLUG.test(sql) && entry.row.public_slug === null) return false;
        return !gatesPublication || entry.published;
      });

      // A fused query evaluates the gate inside this statement, so a candidate configured to
      // fail the gate has to fail the statement rather than a follow-up probe.
      if (gatesPublication) {
        const failing = visible.find((entry) => entry.publicationError);
        if (failing?.publicationError) throw failing.publicationError;
      }

      return rowsResult(visible.map((entry) => entry.row));
    }

    if (isPublicationProbe(sql)) {
      const userId = params?.[0];
      const match = candidates.find((entry) => entry.row.id === userId);
      if (!match) {
        throw new Error(`publication probe for unknown user: ${String(userId)}`);
      }
      if (match.publicationError) {
        throw match.publicationError;
      }
      return rowsResult([{ has_published_tracks: match.published }]);
    }

    throw new Error(`Unexpected SQL in test: ${sql}`);
  }) as never);

  return calls;
}

type ApiResponse = { statusCode: number; headers: Record<string, string>; body: string };

const GET_EVENT = {
  httpMethod: 'GET',
  path: '/api/public-artists',
  headers: {},
  queryStringParameters: null,
};

const invoke = (event: Record<string, unknown> = GET_EVENT): Promise<ApiResponse> =>
  (handler as unknown as (e: Record<string, unknown>) => Promise<ApiResponse>)(event);

function parseBody(response: ApiResponse): {
  success: boolean;
  data?: ArtistDto[];
  error?: string;
} {
  return JSON.parse(response.body);
}

async function invokeArtists(candidates: Candidate[]): Promise<{
  response: ApiResponse;
  artists: ArtistDto[];
  calls: RecordedQuery[];
}> {
  const calls = installDb({ candidates });
  const response = await invoke();
  return { response, artists: parseBody(response).data ?? [], calls };
}

/** Every SQL statement the request issued, concatenated — predicates survive being moved. */
const allSql = (calls: RecordedQuery[]) => calls.map((call) => call.sql).join('\n');

const slugsOf = (artists: ArtistDto[]) => artists.map((artist) => artist.publicSlug);

const probedIds = (calls: RecordedQuery[]) =>
  calls.filter((call) => isPublicationProbe(call.sql)).map((call) => call.params?.[0]);

describe('GET /api/public-artists', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('candidate filtering', () => {
    test('Case 1 — every candidate is evaluated and list order is preserved', async () => {
      const { response, artists, calls } = await invokeArtists([
        candidate(ID_A, 'artist-a', true),
        candidate(ID_B, 'artist-b', true),
        candidate(ID_C, 'artist-c', true),
      ]);

      expect(response.statusCode).toBe(200);
      expect(slugsOf(artists)).toEqual(['artist-a', 'artist-b', 'artist-c']);

      // Independence: the verdict is correlated to the candidate's own id. An uncorrelated gate
      // would publish every artist as soon as any one of them had a qualifying track.
      expect(allSql(calls)).toContain('a.user_id = u.id');
      expect(artists.map((artist) => artist.userId)).toEqual([ID_A, ID_B, ID_C]);
    });

    test('Case 2 — a published artist is present in the response', async () => {
      const { artists } = await invokeArtists([candidate(ID_A, 'published', true)]);

      expect(slugsOf(artists)).toEqual(['published']);
    });

    test('Case 3 — an unpublished artist is absent from the response', async () => {
      const { response, artists } = await invokeArtists([candidate(ID_A, 'unpublished', false)]);

      expect(response.statusCode).toBe(200);
      expect(artists).toEqual([]);
    });

    test('Case 4 — a mixed verdict keeps the survivors in base-row order', async () => {
      const { artists } = await invokeArtists([
        candidate(ID_A, 'artist-a', true),
        candidate(ID_B, 'artist-b', false),
        candidate(ID_C, 'artist-c', true),
      ]);

      expect(slugsOf(artists)).toEqual(['artist-a', 'artist-c']);
    });

    test('Case 4 — a false verdict does not stop later candidates being evaluated', async () => {
      const { artists } = await invokeArtists([
        candidate(ID_A, 'artist-a', false),
        candidate(ID_B, 'artist-b', false),
        candidate(ID_C, 'artist-c', true),
      ]);

      // The last candidate still survives, so the endpoint does not abandon the list on a miss.
      expect(slugsOf(artists)).toEqual(['artist-c']);
    });

    test('Case 6 — an artist with no qualifying track is dropped even with albums present', async () => {
      const { artists } = await invokeArtists([
        candidate(ID_A, 'albums-but-no-tracks', false),
        candidate(ID_B, 'has-tracks', true),
      ]);

      expect(slugsOf(artists)).toEqual(['has-tracks']);
    });
  });

  describe('base query predicates', () => {
    test('Case 5 — an inactive artist is filtered by SQL, not by the publication gate', async () => {
      const { artists, calls } = await invokeArtists([
        candidate(ID_A, 'inactive', true, { active: false }),
        candidate(ID_B, 'active', true),
      ]);

      // The stub only hides the inactive row because the SQL asks it to; losing this predicate
      // would surface `inactive` here.
      expect(allSql(calls)).toMatch(FILTERS_INACTIVE);
      expect(slugsOf(artists)).toEqual(['active']);

      // An inactive artist is never a candidate, so no verdict is ever sought for it.
      expect(probedIds(calls)).not.toContain(ID_A);
    });

    test('an artist without a public slug is filtered by SQL', async () => {
      const { artists, calls } = await invokeArtists([
        candidate(ID_A, 'no-slug', true, { row: { public_slug: null } }),
        candidate(ID_B, 'with-slug', true),
      ]);

      expect(allSql(calls)).toMatch(FILTERS_MISSING_SLUG);
      expect(slugsOf(artists)).toEqual(['with-slug']);
    });
  });

  describe('publication gate predicates', () => {
    // These pin the SQL that decides the verdict. They read the union of every statement the
    // request issued, so moving the EXISTS into the base query keeps them passing, while
    // weakening any single predicate fails them.

    test('Case 8 — an empty album title cannot qualify an artist', async () => {
      const { artists, calls } = await invokeArtists([candidate(ID_A, 'empty-title', false)]);

      expect(allSql(calls)).toContain("btrim(COALESCE(a.album, '')) <> ''");
      expect(artists).toEqual([]);
    });

    test('Case 9 — a hidden track cannot qualify an artist', async () => {
      const { artists, calls } = await invokeArtists([candidate(ID_A, 'hidden-track', false)]);

      expect(allSql(calls)).toContain("COALESCE(t.visibility, 'public') <> 'hidden'");
      expect(artists).toEqual([]);
    });

    test('the gate requires a published, public album', async () => {
      const { calls } = await invokeArtists([candidate(ID_A, 'artist-a', true)]);

      expect(allSql(calls)).toContain('a.is_published = true');
      expect(allSql(calls)).toContain('a.is_public = true');
    });
  });

  describe('locale rows', () => {
    test('Case 7 — the artist result set joins no album or track rows, so locales cannot fan out', async () => {
      const { artists, calls } = await invokeArtists([candidate(ID_A, 'two-locales', true)]);

      const artistSql = calls.find((call) => isArtistQuery(call.sql))?.sql ?? '';

      // Only the clause that builds the result set is off limits. `albums` and `tracks` may be
      // read behind the main WHERE — inside a subquery they cannot multiply the artist — so the
      // check stops at the first WHERE rather than scanning the whole statement.
      const resultSetClause = artistSql.slice(0, artistSql.indexOf('WHERE'));
      expect(resultSetClause).toMatch(/FROM users u/);
      expect(resultSetClause).not.toMatch(/albums/i);
      expect(resultSetClause).not.toMatch(/tracks/i);

      // The gate itself has to be a subquery, not a join that was merely moved further down.
      expect(artistSql).toMatch(/EXISTS\s*\(/i);

      // An artist whose release exists in both `ru` and `en` is still a single `users` row.
      expect(artists).toHaveLength(1);
      expect(artists.map((artist) => artist.userId)).toEqual([ID_A]);
    });

    test('Case 7 — the handler maps rows 1:1 and never dedupes them', async () => {
      // Documents the absence of a safety net: fan-out has to be prevented in SQL, because a
      // repeated id would reach the response untouched. Both locale rows are handed back from
      // the artist query here, standing in for a join that multiplied the artist.
      const duplicated = candidate(ID_A, 'two-locales', true);
      installDb({ candidates: [duplicated, duplicated] });

      const artists = parseBody(await invoke()).data ?? [];

      expect(artists).toHaveLength(2);
      expect(artists.map((artist) => artist.userId)).toEqual([ID_A, ID_A]);
    });
  });

  describe('empty result', () => {
    test('zero candidates return 200 with an empty list and no publication probe', async () => {
      const { response, artists, calls } = await invokeArtists([]);

      expect(response.statusCode).toBe(200);
      expect(parseBody(response).success).toBe(true);
      expect(artists).toEqual([]);

      expect(calls).toHaveLength(1);
      expect(isArtistQuery(calls[0].sql)).toBe(true);
      expect(probedIds(calls)).toEqual([]);
    });
  });

  describe('response contract', () => {
    test('a published row maps to the documented DTO', async () => {
      const { response, artists } = await invokeArtists([
        candidate(ID_A, 'beatles', true, {
          row: {
            name: 'The Beatles',
            site_name: 'Beatles',
            genre_code: 'rock',
            label_en: 'Rock',
            label_ru: 'Рок',
            header_images: ['hero-main'],
            monetization_shop_id: 'shop-123',
          },
        }),
      ]);

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/json');
      expect(response.headers['Cache-Control']).toBe('no-store, max-age=0');
      expect(parseBody(response).success).toBe(true);

      expect(artists).toEqual([
        {
          userId: ID_A,
          name: 'Beatles',
          publicSlug: 'beatles',
          genreCode: 'rock',
          genreLabel: { en: 'Rock', ru: 'Рок' },
          headerImages: [
            `/api/proxy-image?path=${encodeURIComponent(`users/${ID_A}/hero/hero-main.jpg`)}`,
          ],
          monetizationEnabled: true,
        },
      ]);
    });

    test('display name falls back through site_name, name, slug, then a literal', async () => {
      const { artists } = await invokeArtists([
        candidate(ID_A, 'slug-a', true, { row: { site_name: 'Site', name: 'Name' } }),
        candidate(ID_B, 'slug-b', true, { row: { site_name: null, name: 'Name' } }),
        candidate(ID_C, 'slug-c', true, { row: { site_name: null, name: null } }),
      ]);

      expect(artists.map((artist) => artist.name)).toEqual(['Site', 'Name', 'slug-c']);
    });

    test('missing genre and slug fall back to defaults', async () => {
      const { artists } = await invokeArtists([
        candidate(ID_A, 'artist-a', true, {
          row: { genre_code: null, label_en: null, label_ru: null },
        }),
      ]);

      expect(artists[0].genreCode).toBe('other');
      expect(artists[0].genreLabel).toEqual({ en: 'Other', ru: 'Другое' });
    });

    test('monetization is enabled only by a non-blank shop id', async () => {
      const { artists } = await invokeArtists([
        candidate(ID_A, 'none', true, { row: { monetization_shop_id: null } }),
        candidate(ID_B, 'blank', true, { row: { monetization_shop_id: '   ' } }),
        candidate(ID_C, 'set', true, { row: { monetization_shop_id: 'shop-1' } }),
      ]);

      expect(artists.map((artist) => artist.monetizationEnabled)).toEqual([false, false, true]);
    });

    test('header images pass absolute and proxy URLs through, and drop blank entries', async () => {
      const { artists } = await invokeArtists([
        candidate(ID_A, 'artist-a', true, {
          row: {
            header_images: [
              'https://cdn.example.com/hero.jpg',
              '/api/proxy-image?path=users/x/hero/a.jpg',
              'users/custom/pic.png',
              '   ',
            ],
          },
        }),
      ]);

      expect(artists[0].headerImages).toEqual([
        'https://cdn.example.com/hero.jpg',
        '/api/proxy-image?path=users/x/hero/a.jpg',
        `/api/proxy-image?path=${encodeURIComponent('users/custom/pic.png')}`,
      ]);
    });

    test('a non-array header_images value yields no images', async () => {
      const { artists } = await invokeArtists([
        candidate(ID_A, 'artist-a', true, { row: { header_images: null } }),
      ]);

      expect(artists[0].headerImages).toEqual([]);
    });
  });

  describe('HTTP method contract', () => {
    test('OPTIONS returns 200 with an empty body and no DB access', async () => {
      const calls = installDb({ candidates: [candidate(ID_A, 'artist-a', true)] });

      const response = await invoke({ ...GET_EVENT, httpMethod: 'OPTIONS' });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('');
      expect(calls).toEqual([]);
    });

    test.each(['POST', 'PUT', 'DELETE', 'PATCH'])(
      '%s is rejected with 405 and no DB access',
      async (httpMethod) => {
        const calls = installDb({ candidates: [candidate(ID_A, 'artist-a', true)] });

        const response = await invoke({ ...GET_EVENT, httpMethod });

        expect(response.statusCode).toBe(405);
        expect(parseBody(response)).toEqual({
          success: false,
          error: 'Method not allowed. Use GET.',
        });
        expect(calls).toEqual([]);
      }
    );
  });

  describe('Case 10 — database errors', () => {
    let consoleError: jest.SpiedFunction<typeof console.error>;

    beforeEach(() => {
      consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleError.mockRestore();
    });

    test('a failing base query returns 500 and does not leak the driver message', async () => {
      installDb({ baseError: new Error('connection terminated unexpectedly') });

      const response = await invoke();

      expect(response.statusCode).toBe(500);
      expect(parseBody(response)).toEqual({
        success: false,
        error: 'Failed to load public artists',
      });
    });

    test('a failing publication verdict for one artist fails the whole request', async () => {
      // The error is not swallowed into a partial list: a request that cannot decide one
      // candidate must not answer 200 with the others.
      installDb({
        candidates: [
          candidate(ID_A, 'artist-a', true),
          candidate(ID_B, 'artist-b', true, { publicationError: new Error('gate query failed') }),
          candidate(ID_C, 'artist-c', true),
        ],
      });

      const response = await invoke();

      expect(response.statusCode).toBe(500);
      expect(parseBody(response).success).toBe(false);
      expect(parseBody(response).data).toBeUndefined();
    });

    test('the failure is logged rather than silently discarded', async () => {
      installDb({ baseError: new Error('boom') });

      await invoke();

      expect(consoleError).toHaveBeenCalledWith('❌ [public-artists] failed:', expect.any(Error));
    });
  });

  describe('query shape', () => {
    // CHARACTERIZATION — this block describes the round trips the endpoint makes, and is the one
    // place the fused-SQL change rewrote. It previously pinned the 1 + N shape: a base query
    // followed by one `has_published_tracks` probe per candidate. Every other block above is a
    // behavioural contract that survived the change untouched.

    test('N = 3 candidates cost exactly one query, which carries the gate', async () => {
      const { artists, calls } = await invokeArtists([
        candidate(ID_A, 'artist-a', true),
        candidate(ID_B, 'artist-b', false),
        candidate(ID_C, 'artist-c', true),
      ]);

      expect(calls).toHaveLength(1);
      expect(isArtistQuery(calls[0].sql)).toBe(true);
      expect(probedIds(calls)).toEqual([]);

      // The gate rides along in that single statement rather than in follow-up round trips.
      expect(calls[0].sql).toMatch(/EXISTS\s*\(/i);
      expect(calls[0].sql).toContain('FROM tracks t');
      expect(calls[0].sql).toContain('INNER JOIN albums a ON t.album_id = a.id');

      // And it is the query that filtered, not the handler.
      expect(slugsOf(artists)).toEqual(['artist-a', 'artist-c']);
    });

    test('the query count does not scale with the number of artists', async () => {
      const empty = await invokeArtists([]);
      expect(empty.calls).toHaveLength(1);

      const three = await invokeArtists([
        candidate(ID_A, 'artist-a', true),
        candidate(ID_B, 'artist-b', true),
        candidate(ID_C, 'artist-c', true),
      ]);
      expect(three.calls).toHaveLength(1);
      expect(three.artists).toHaveLength(3);
    });

    test('the single query takes no parameters and the default retry budget', async () => {
      // Folding the gate in means it inherits the artist query's retries instead of the
      // `retries: 0` the standalone probe used — an intended consequence of the merge.
      const { calls } = await invokeArtists([candidate(ID_A, 'artist-a', true)]);

      expect(calls[0].params).toBeUndefined();
      expect(calls[0].retries).toBeUndefined();
    });

    test('the query orders candidates by user id', async () => {
      const { calls } = await invokeArtists([candidate(ID_A, 'artist-a', true)]);

      expect(calls[0].sql).toContain('ORDER BY u.id ASC');
    });
  });
});
