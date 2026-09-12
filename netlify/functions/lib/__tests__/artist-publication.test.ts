import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { isArtistPublishedFromSignals } from '../artist-publication-signals';
import {
  artistHasPublicPageContent,
  assertArtistVisibleToViewer,
  getArtistPublicationSignals,
  hasPublicProfileContentFromFields,
  isArtistProfilePublished,
} from '../artist-publication';
import { PublicArtistResolverError } from '../public-artist-resolver';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

import { query } from '../db';

const mockQuery = query as jest.MockedFunction<typeof query>;

describe('artist-publication', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test('catalog includes artist only when there are published tracks', () => {
    expect(isArtistPublishedFromSignals({ hasPublishedTracks: true })).toBe(true);
    expect(isArtistPublishedFromSignals({ hasPublishedTracks: false })).toBe(false);
  });

  test('public albums without tracks do not publish profile to catalog', () => {
    expect(isArtistPublishedFromSignals({ hasPublishedTracks: false })).toBe(false);
  });

  describe('hasPublicProfileContentFromFields', () => {
    test('returns true when header_images has a non-empty entry', () => {
      expect(
        hasPublicProfileContentFromFields({
          header_images: ['/api/proxy-image?path=users/u1/hero/cover-1920.jpg'],
        })
      ).toBe(true);
    });

    test('returns true when the_band has filled paragraphs', () => {
      expect(
        hasPublicProfileContentFromFields({
          the_band: { ru: ['About the band'], en: [] },
        })
      ).toBe(true);
    });

    test('returns true when social_links has a non-empty URL', () => {
      expect(
        hasPublicProfileContentFromFields({
          social_links: { instagram: 'https://instagram.com/artist' },
        })
      ).toBe(true);
    });

    test('returns false for empty profile content', () => {
      expect(
        hasPublicProfileContentFromFields({
          header_images: [],
          the_band: { ru: [], en: [] },
          social_links: {},
        })
      ).toBe(false);
    });
  });

  describe('artistHasPublicPageContent with preloaded profile fields', () => {
    test('short-circuits tracks/articles when profile fields already prove public content', async () => {
      mockQuery.mockImplementation(async () => {
        throw new Error('should not query when profileContentFields prove visibility');
      });

      const visible = await artistHasPublicPageContent('user-hero', {
        profileContentFields: {
          header_images: ['/api/proxy-image?path=users/u1/hero/cover-1920.jpg'],
          the_band: { ru: [], en: [] },
          social_links: {},
        },
      });

      expect(visible).toBe(true);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    test('short-circuits on the_band without tracks/articles SQL', async () => {
      mockQuery.mockImplementation(async () => {
        throw new Error('should not query when the_band proves visibility');
      });

      const visible = await artistHasPublicPageContent('user-about', {
        profileContentFields: {
          header_images: [],
          the_band: { ru: ['About the band'], en: [] },
          social_links: {},
        },
      });

      expect(visible).toBe(true);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    test('runs tracks/articles queries when profile fields are empty', async () => {
      let inFlight = 0;
      let maxInFlight = 0;

      mockQuery.mockImplementation(async (sql: string) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;

        if (sql.includes('has_published_tracks')) {
          return { rows: [{ has_published_tracks: true }] } as never;
        }
        if (sql.includes('has_public_articles')) {
          return { rows: [{ has_public_articles: false }] } as never;
        }
        if (sql.includes('has_profile_content')) {
          throw new Error('should not re-read users when profileContentFields are provided');
        }
        throw new Error(`unexpected query: ${sql}`);
      });

      const visible = await artistHasPublicPageContent('user-1', {
        profileContentFields: {
          header_images: [],
          the_band: { ru: [], en: [] },
          social_links: {},
        },
      });

      expect(visible).toBe(true);
      expect(maxInFlight).toBe(2);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    test('returns true for articles-only artist without tracks or profile body', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('has_published_tracks')) {
          return { rows: [{ has_published_tracks: false }] } as never;
        }
        if (sql.includes('has_public_articles')) {
          return { rows: [{ has_public_articles: true }] } as never;
        }
        throw new Error(`unexpected query: ${sql}`);
      });

      const visible = await artistHasPublicPageContent('user-2', {
        profileContentFields: {
          header_images: [],
          the_band: { ru: [], en: [] },
          social_links: {},
        },
      });

      expect(visible).toBe(true);
    });

    test('returns false for unpublished artist with empty signals', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('has_published_tracks')) {
          return { rows: [{ has_published_tracks: false }] } as never;
        }
        if (sql.includes('has_public_articles')) {
          return { rows: [{ has_public_articles: false }] } as never;
        }
        throw new Error(`unexpected query: ${sql}`);
      });

      const visible = await artistHasPublicPageContent('user-3', {
        profileContentFields: {
          header_images: [],
          the_band: { ru: [], en: [] },
          social_links: {},
        },
      });

      expect(visible).toBe(false);
    });
  });

  describe('album publication visibility (SEO-003/SEO-004)', () => {
    function tracksPublicationSql(sql: string): string {
      const match = mockQuery.mock.calls.find(([calledSql]) =>
        String(calledSql).includes('has_published_tracks')
      );
      return String(match?.[0] ?? sql);
    }

    test('Case A: unpublished public album does not publish artist via tracks', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('has_published_tracks')) {
          expect(sql).toContain('a.is_published = true');
          expect(sql).toContain('a.is_public = true');
          return { rows: [{ has_published_tracks: false }] } as never;
        }
        if (sql.includes('has_public_articles')) {
          return { rows: [{ has_public_articles: false }] } as never;
        }
        if (sql.includes('has_profile_content')) {
          return { rows: [{ has_profile_content: false }] } as never;
        }
        throw new Error(`unexpected query: ${sql}`);
      });

      const visible = await artistHasPublicPageContent('user-unpublished-public-album');
      const published = await isArtistProfilePublished('user-unpublished-public-album');

      expect(visible).toBe(false);
      expect(published).toBe(false);
      expect(tracksPublicationSql('')).toContain('a.is_published = true');
    });

    test('Case B: published public album keeps artist public via tracks', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('has_published_tracks')) {
          return { rows: [{ has_published_tracks: true }] } as never;
        }
        if (sql.includes('has_public_articles')) {
          return { rows: [{ has_public_articles: false }] } as never;
        }
        if (sql.includes('has_profile_content')) {
          return { rows: [{ has_profile_content: false }] } as never;
        }
        throw new Error(`unexpected query: ${sql}`);
      });

      const signals = await getArtistPublicationSignals('user-published-public-album');
      const visible = await artistHasPublicPageContent('user-published-public-album');
      const published = await isArtistProfilePublished('user-published-public-album');

      expect(signals.hasPublishedTracks).toBe(true);
      expect(visible).toBe(true);
      expect(published).toBe(true);
    });

    test('Case C: private published album does not publish artist via tracks', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('has_published_tracks')) {
          expect(sql).toContain('a.is_public = true');
          return { rows: [{ has_published_tracks: false }] } as never;
        }
        if (sql.includes('has_public_articles')) {
          return { rows: [{ has_public_articles: false }] } as never;
        }
        if (sql.includes('has_profile_content')) {
          return { rows: [{ has_profile_content: false }] } as never;
        }
        throw new Error(`unexpected query: ${sql}`);
      });

      const published = await isArtistProfilePublished('user-private-album');

      expect(published).toBe(false);
    });

    test('Case D: profile-only artist remains public without published albums', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('has_published_tracks')) {
          return { rows: [{ has_published_tracks: false }] } as never;
        }
        if (sql.includes('has_public_articles')) {
          return { rows: [{ has_public_articles: false }] } as never;
        }
        if (sql.includes('has_profile_content')) {
          return { rows: [{ has_profile_content: true }] } as never;
        }
        throw new Error(`unexpected query: ${sql}`);
      });

      const visible = await artistHasPublicPageContent('user-profile-only');

      expect(visible).toBe(true);
    });
  });

  describe('assertArtistVisibleToViewer', () => {
    test('throws ARTIST_NOT_PUBLISHED for invisible artist', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('has_published_tracks')) {
          return { rows: [{ has_published_tracks: false }] } as never;
        }
        if (sql.includes('has_public_articles')) {
          return { rows: [{ has_public_articles: false }] } as never;
        }
        throw new Error(`unexpected query: ${sql}`);
      });

      await expect(
        assertArtistVisibleToViewer('user-4', null, {
          profileContentFields: {
            header_images: [],
            the_band: { ru: [], en: [] },
            social_links: {},
          },
        })
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'ARTIST_NOT_PUBLISHED',
      } satisfies Partial<PublicArtistResolverError>);
    });

    test('skips visibility checks when viewer is the artist owner', async () => {
      await assertArtistVisibleToViewer('owner-id', 'owner-id', {
        profileContentFields: {
          header_images: [],
          the_band: { ru: [], en: [] },
          social_links: {},
        },
      });

      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Characterization of the ORDINARY (no-options) three-query publication gate.
  //
  // Every describe above that touches `artistHasPublicPageContent` passes
  // `profileContentFields`, which takes a different branch (in-memory profile check, then Q2+Q3
  // only). The suites below deliberately omit options so the real Q2/Q3/Q4 path is exercised.
  //
  // These tests pin CURRENT behaviour ahead of a possible Q2/Q3/Q4 merge. They are
  // characterization tests: some of them lock in quirks rather than desirable semantics.
  // ===========================================================================

  /** What the mocked driver should do for one gate predicate. */
  type GateOutcome = boolean | 'zero-rows' | Error;

  type RecordedCall = { sql: string; params?: unknown[]; retries?: number };

  const TRACKS_ALIAS = 'has_published_tracks';
  const ARTICLES_ALIAS = 'has_public_articles';
  const PROFILE_ALIAS = 'has_profile_content';

  function gateResult(alias: string, outcome: GateOutcome) {
    if (outcome instanceof Error) throw outcome;
    if (outcome === 'zero-rows') return { rows: [] };
    return { rows: [{ [alias]: outcome }] };
  }

  /**
   * Mocks the three gate predicates using the SQL-substring dispatch this file already relies on,
   * and records every call in dispatch order.
   */
  function mockOrdinaryGate(outcomes: {
    tracks: GateOutcome;
    articles: GateOutcome;
    profile: GateOutcome;
  }): RecordedCall[] {
    const calls: RecordedCall[] = [];

    mockQuery.mockImplementation(async (sql: string, params?: unknown[], retries?: number) => {
      const text = String(sql);
      calls.push({ sql: text, params, retries });

      if (text.includes(TRACKS_ALIAS)) return gateResult(TRACKS_ALIAS, outcomes.tracks) as never;
      if (text.includes(ARTICLES_ALIAS)) {
        return gateResult(ARTICLES_ALIAS, outcomes.articles) as never;
      }
      if (text.includes(PROFILE_ALIAS)) return gateResult(PROFILE_ALIAS, outcomes.profile) as never;
      throw new Error(`unexpected query: ${text}`);
    });

    return calls;
  }

  /**
   * Deterministically drains queued microtasks so an `await` chain can advance without any
   * reliance on wall-clock time. The gate's await depth is fixed and small.
   */
  async function drainMicrotasks(levels = 20): Promise<void> {
    for (let i = 0; i < levels; i += 1) {
      await Promise.resolve();
    }
  }

  describe('ordinary gate: full truth table', () => {
    test.each([
      [
        'tracks=true articles=false profile=false → visible',
        { tracks: true, articles: false, profile: false },
        true,
      ],
      [
        'tracks=false articles=true profile=false → visible',
        { tracks: false, articles: true, profile: false },
        true,
      ],
      [
        'tracks=false articles=false profile=true → visible',
        { tracks: false, articles: false, profile: true },
        true,
      ],
      [
        'tracks=true articles=true profile=true → visible',
        { tracks: true, articles: true, profile: true },
        true,
      ],
      [
        'tracks=false articles=false profile=false → NOT visible',
        { tracks: false, articles: false, profile: false },
        false,
      ],
    ])('%s', async (_label, outcomes, expected) => {
      mockOrdinaryGate(outcomes);

      await expect(artistHasPublicPageContent('user-truth-table')).resolves.toBe(expected);
    });
  });

  describe('ordinary gate: lazy Q3/Q4 dispatch', () => {
    // Variant E. Q2 is probed on its own; Q3 and Q4 are only reached when Q2 comes back false.
    // The boolean verdict is unchanged for every combination — only the dispatch timing moved.

    test.each([
      ['Case A — tracks only', { tracks: true, articles: false, profile: false }],
      ['Case E — all three true', { tracks: true, articles: true, profile: true }],
    ])('%s: a true Q2 opens the gate on one query, Q3/Q4 never run', async (_label, outcomes) => {
      const calls = mockOrdinaryGate(outcomes);

      await expect(artistHasPublicPageContent('user-lazy-hit')).resolves.toBe(true);

      expect(calls).toHaveLength(1);
      expect(calls[0].sql).toContain(TRACKS_ALIAS);
      expect(calls.some(({ sql }) => sql.includes(ARTICLES_ALIAS))).toBe(false);
      expect(calls.some(({ sql }) => sql.includes(PROFILE_ALIAS))).toBe(false);
    });

    test.each([
      ['Case B — articles rescue a false Q2', { tracks: false, articles: true, profile: false }],
      ['Case C — profile rescues a false Q2', { tracks: false, articles: false, profile: true }],
    ])('%s: gate passes and all three predicates run', async (_label, outcomes) => {
      const calls = mockOrdinaryGate(outcomes);

      await expect(artistHasPublicPageContent('user-lazy-miss')).resolves.toBe(true);

      expect(calls).toHaveLength(3);
      // Q2 is always the first query: the other two are consequences of its answer.
      expect(calls[0].sql).toContain(TRACKS_ALIAS);
      expect(calls.some(({ sql }) => sql.includes(ARTICLES_ALIAS))).toBe(true);
      expect(calls.some(({ sql }) => sql.includes(PROFILE_ALIAS))).toBe(true);
    });

    test('Case D — all three false still costs three queries and closes the gate', async () => {
      const calls = mockOrdinaryGate({ tracks: false, articles: false, profile: false });

      await expect(artistHasPublicPageContent('user-lazy-none')).resolves.toBe(false);

      expect(calls).toHaveLength(3);
    });
  });

  describe('ordinary gate: query count and concurrency', () => {
    test('a false Q2 issues three queries, each keyed only on the artist id, with retries off', async () => {
      const calls = mockOrdinaryGate({ tracks: false, articles: false, profile: true });

      await artistHasPublicPageContent('user-shape');

      expect(calls).toHaveLength(3);
      for (const call of calls) {
        expect(call.params).toEqual(['user-shape']);
        expect(call.retries).toBe(0);
      }
    });

    test('probes Q2 alone, then dispatches Q3 and Q4 together', async () => {
      // Deterministic, no timers: `query` hands back a promise this test resolves by hand, so
      // wave boundaries are observed structurally rather than by waiting.
      const settle = new Map<string, (rows: Array<Record<string, boolean>>) => void>();
      let inFlight = 0;
      let maxInFlight = 0;

      mockQuery.mockImplementation(((sql: string) => {
        const text = String(sql);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return new Promise((resolve) => {
          settle.set(text, (rows) => {
            inFlight -= 1;
            resolve({ rows } as never);
          });
        });
      }) as never);

      const pending = artistHasPublicPageContent('user-concurrency');

      // Wave 1 — Q2 on its own. Q3/Q4 cannot be in flight yet: the gate does not know whether it
      // needs them until Q2 answers.
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(maxInFlight).toBe(1);
      const q2Sql = [...settle.keys()].find((sql) => sql.includes(TRACKS_ALIAS));
      expect(q2Sql).toBeDefined();

      // A false Q2 is what unlocks wave 2.
      settle.get(q2Sql!)!([{ [TRACKS_ALIAS]: false }]);
      await drainMicrotasks();

      // Wave 2 — both remaining predicates outstanding simultaneously, so they cost one wave
      // together rather than two sequential ones.
      expect(mockQuery).toHaveBeenCalledTimes(3);
      expect(maxInFlight).toBe(2);

      // NOTE: these are concurrent *application* calls, not connections. The production pool caps
      // connections at 2 (pinned by db-pool-config.test.ts), so wave 2's pair fits in a single
      // pool round-trip. That mapping lives in `pg.Pool`, below the mocked `query` boundary, and
      // is therefore not observable from this suite.
      for (const [sql, resolveWith] of settle) {
        if (sql.includes(ARTICLES_ALIAS)) resolveWith([{ [ARTICLES_ALIAS]: false }]);
        else if (sql.includes(PROFILE_ALIAS)) resolveWith([{ [PROFILE_ALIAS]: true }]);
      }

      await expect(pending).resolves.toBe(true);
      expect(inFlight).toBe(0);
    });

    test('a true Q2 never puts Q3 or Q4 in flight at all', async () => {
      const settle = new Map<string, (rows: Array<Record<string, boolean>>) => void>();

      mockQuery.mockImplementation(((sql: string) => {
        const text = String(sql);
        return new Promise((resolve) => {
          settle.set(text, (rows) => resolve({ rows } as never));
        });
      }) as never);

      const pending = artistHasPublicPageContent('user-fast-path');

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const q2Sql = [...settle.keys()][0];
      settle.get(q2Sql)!([{ [TRACKS_ALIAS]: true }]);

      await expect(pending).resolves.toBe(true);
      // Still one call after the gate has fully resolved: nothing was dispatched behind it.
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('ordinary gate: zero-row driver results', () => {
    test('Q2 zero rows → hasPublishedTracks false', async () => {
      // Q2 selects `FROM users WHERE id = $1 AND is_active = true`; a missing or deactivated
      // user produces no row, which the helper reports as false instead of throwing.
      mockOrdinaryGate({ tracks: 'zero-rows', articles: false, profile: false });

      await expect(getArtistPublicationSignals('user-zero-rows')).resolves.toEqual({
        hasPublishedTracks: false,
      });
      await expect(isArtistProfilePublished('user-zero-rows')).resolves.toBe(false);
    });

    test('Q4 zero rows → hasPublicProfileContent false', async () => {
      mockOrdinaryGate({ tracks: false, articles: false, profile: 'zero-rows' });

      await expect(artistHasPublicPageContent('user-zero-profile')).resolves.toBe(false);
    });

    test('Q3 zero rows → hasPublicArticles false', async () => {
      // Q3 is a bare `SELECT EXISTS (...)` and always returns one row in production; the helper
      // still tolerates an empty result via optional chaining.
      mockOrdinaryGate({ tracks: false, articles: 'zero-rows', profile: false });

      await expect(artistHasPublicPageContent('user-zero-articles')).resolves.toBe(false);
    });

    test('a zero-row Q2/Q4 does not stop Q3 from opening the gate', async () => {
      // Q3 has no `users` join, so it can outvote a users row the other two cannot see.
      mockOrdinaryGate({ tracks: 'zero-rows', articles: true, profile: 'zero-rows' });

      await expect(artistHasPublicPageContent('user-articles-survive')).resolves.toBe(true);
    });
  });

  describe('ordinary gate: error semantics', () => {
    test.each([
      ['Q2', { tracks: new Error('Q2 failed'), articles: false, profile: false }, 'Q2 failed'],
      ['Q3', { tracks: false, articles: new Error('Q3 failed'), profile: false }, 'Q3 failed'],
      ['Q4', { tracks: false, articles: false, profile: new Error('Q4 failed') }, 'Q4 failed'],
    ])('a rejecting %s rejects the whole gate', async (_label, outcomes, message) => {
      mockOrdinaryGate(outcomes);

      // No try/catch, no fallback, no `isMissingRelationError` branch: the rejection propagates
      // verbatim, and callers see a generic Error rather than a PublicArtistResolverError.
      await expect(artistHasPublicPageContent('user-error')).rejects.toThrow(message);
    });

    test('Case F — a rejecting Q2 rejects before Q3 or Q4 is dispatched', async () => {
      const calls = mockOrdinaryGate({
        tracks: new Error('Q2 failed'),
        articles: true,
        profile: true,
      });

      await expect(artistHasPublicPageContent('user-q2-error')).rejects.toThrow('Q2 failed');

      // The lazy probe fails closed: no follow-up query is spent, and a would-be-true Q3/Q4
      // cannot mask the failure.
      expect(calls).toHaveLength(1);
      expect(calls[0].sql).toContain(TRACKS_ALIAS);
    });

    test.each([
      [
        'Case I — a true Q3 does not rescue a rejecting Q4',
        { tracks: false, articles: true, profile: new Error('Q4 failed') },
        'Q4 failed',
      ],
      [
        'Case I — a true Q4 does not rescue a rejecting Q3',
        { tracks: false, articles: new Error('Q3 failed'), profile: true },
        'Q3 failed',
      ],
    ])('%s', async (_label, outcomes, message) => {
      // The Q3/Q4 pair keeps its Promise.all semantics: a rejection there is still fatal even
      // though the sibling would have opened the gate. Only Q2's short-circuit is lazy.
      mockOrdinaryGate(outcomes);

      await expect(artistHasPublicPageContent('user-sibling-error')).rejects.toThrow(message);
    });

    test('a gate rejection is not converted into a 404 by assertArtistVisibleToViewer', async () => {
      mockOrdinaryGate({ tracks: new Error('driver exploded'), articles: false, profile: false });

      const error: unknown = await assertArtistVisibleToViewer('user-error-404', null).then(
        () => new Error('gate unexpectedly resolved'),
        (rejected: unknown) => rejected
      );

      // A driver failure must stay a driver failure. If it were a PublicArtistResolverError the
      // endpoint would answer 404 and quietly hide the artist instead of reporting a 500.
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(PublicArtistResolverError);
      expect((error as Error).message).toBe('driver exploded');
    });
  });

  describe('ordinary gate: 404 and owner-viewer', () => {
    test('all three predicates false → 404 ARTIST_NOT_PUBLISHED', async () => {
      mockOrdinaryGate({ tracks: false, articles: false, profile: false });

      await expect(assertArtistVisibleToViewer('user-invisible', null)).rejects.toMatchObject({
        statusCode: 404,
        code: 'ARTIST_NOT_PUBLISHED',
      } satisfies Partial<PublicArtistResolverError>);
    });

    test('owner viewer skips all three predicates without options', async () => {
      // The owner short-circuit precedes the options check, so it holds on this path too.
      mockQuery.mockImplementation(async () => {
        throw new Error('gate must not query for the owner');
      });

      await expect(assertArtistVisibleToViewer('owner-id', 'owner-id')).resolves.toBeUndefined();
      expect(mockQuery).not.toHaveBeenCalled();
    });

    test('a viewer who is not the owner still runs the gate', async () => {
      const calls = mockOrdinaryGate({ tracks: true, articles: false, profile: false });

      await expect(
        assertArtistVisibleToViewer('artist-id', 'someone-else')
      ).resolves.toBeUndefined();

      // One query rather than zero: the contrast with the owner bypass above is what matters.
      expect(calls).toHaveLength(1);
      expect(calls[0].sql).toContain(TRACKS_ALIAS);
    });
  });

  describe('gate SQL predicates (pinned so a merge cannot silently reword them)', () => {
    async function captureGateSql(): Promise<Record<'tracks' | 'articles' | 'profile', string>> {
      const calls = mockOrdinaryGate({ tracks: false, articles: false, profile: false });
      await artistHasPublicPageContent('user-sql-capture');

      const find = (marker: string) => String(calls.find((c) => c.sql.includes(marker))?.sql ?? '');
      return {
        tracks: find(TRACKS_ALIAS),
        articles: find(ARTICLES_ALIAS),
        profile: find(PROFILE_ALIAS),
      };
    }

    test('Q2 gates on published + public + titled album and a non-hidden track', async () => {
      const { tracks } = await captureGateSql();

      expect(tracks).toContain('INNER JOIN albums a ON t.album_id = a.id');
      expect(tracks).toContain('a.is_published = true');
      expect(tracks).toContain('a.is_public = true');
      expect(tracks).toContain("btrim(COALESCE(a.album, '')) <> ''");
      expect(tracks).toContain("COALESCE(t.visibility, 'public') <> 'hidden'");
      expect(tracks).toContain('u.is_active = true');

      // Q2 never looks at stems_visibility, so a track hidden on the track axis but open on the
      // stems axis does NOT publish the artist — even though the catalog query counts it.
      expect(tracks).not.toContain('stems_visibility');
    });

    test('Q3 treats a NULL draft flag as published and only excludes hidden articles', async () => {
      const { articles } = await captureGateSql();

      expect(articles).toContain('(ar.is_draft = false OR ar.is_draft IS NULL)');
      expect(articles).toContain("COALESCE(ar.visibility, 'public') <> 'hidden'");

      // No `users` join and no language filter: any locale row of any non-hidden, non-draft
      // article publishes the artist, and `subscribers_only` counts as public here.
      expect(articles).not.toContain('is_active');
      expect(articles).not.toContain('ar.lang');
    });
  });

  describe('Q4 profile-content SQL quirks (characterized, deliberately NOT fixed)', () => {
    // These two quirks were confirmed against production PostgreSQL 17.6 during the read-only
    // audit. They cannot be executed here — this suite mocks `db.query`, and there is no
    // DATABASE_URL_TEST for the integration tier — so the SQL text that produces them is pinned
    // instead. Editing either literal changes which artists are publicly visible.

    async function captureProfileSql(): Promise<string> {
      const calls = mockOrdinaryGate({ tracks: false, articles: false, profile: false });
      await artistHasPublicPageContent('user-q4-sql');
      return String(calls.find((c) => c.sql.includes(PROFILE_ALIAS))?.sql ?? '');
    }

    test('QUIRK #1: the empty-bilingual the_band blacklist is unreachable for jsonb values', async () => {
      const profile = await captureProfileSql();

      // PostgreSQL renders jsonb '{"ru":[],"en":[]}' as `{"en": [], "ru": []}` — keys sorted and
      // a space after each colon. The blacklist literal is in compact form, so it can never
      // match a stored jsonb value: an artist whose the_band is an empty bilingual object is
      // therefore treated as HAVING public profile content.
      expect(profile).toContain(
        `btrim(u.the_band::text) NOT IN ('null', '[]', '{}', '{"ru":[],"en":[]}')`
      );
      // The form that would actually match is absent. Production `beatles` currently relies on
      // this quirk for its the_band disjunct.
      expect(profile).not.toContain('{"en": [], "ru": []}');
    });

    test('QUIRK #2: header_images matches on unquoted text, so null and blanks count', async () => {
      const profile = await captureProfileSql();

      // `btrim(img::text, '"')` strips only quote characters, never whitespace. For a JSON null
      // element `img::text` is 'null' → 'null' <> '' → true; for "  " it is '"  "' → '  ' <> ''
      // → true. Only the empty string "" is excluded. The first disjunct is thus redundant.
      expect(profile).toContain(`WHERE btrim(img #>> '{}') <> '' OR btrim(img::text, '"') <> ''`);
    });

    test('the in-memory twin disagrees with the SQL on all three quirk inputs', () => {
      // hasPublicProfileContentFromFields is documented as the equivalent of the Q4 SQL, but it
      // normalizes the_band through JSON.stringify (compact form, so the blacklist DOES match)
      // and rejects null / whitespace header images outright. Pinned as an executable record of
      // the divergence so neither side gets "aligned" without a deliberate decision.
      expect(hasPublicProfileContentFromFields({ the_band: { ru: [], en: [] } })).toBe(false);
      expect(hasPublicProfileContentFromFields({ header_images: [null] })).toBe(false);
      expect(hasPublicProfileContentFromFields({ header_images: ['   '] })).toBe(false);
    });
  });
});
