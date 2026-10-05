/**
 * Public catalog regression: an artist / album is public only while it has ≥1 publicly
 * available track: non-hidden main audio must be `processing_status = 'ready'` (failed / pending /
 * processing are excluded), matching the album page mapper and SQL gates.
 *
 * Only `../db` is mocked. The stub evaluates each fixture track against the predicates the SQL
 * actually carries, so dropping the `failed` exclusion from a gate makes these tests fail.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET?.trim() || 'public-catalog-test-secret-value';

jest.mock('../db', () => ({ query: jest.fn() }));
jest.mock('../entitlements', () => ({ viewerHasPremiumAccessToArtist: jest.fn() }));
jest.mock('../artist-monetization', () => ({ artistHasMonetizationEnabled: jest.fn() }));
jest.mock('../reconcile-user-public-playable-tracks', () => ({
  reconcileUserPublicPlayableTracks: jest.fn().mockResolvedValue(undefined),
}));

import { query } from '../db';
import { viewerHasPremiumAccessToArtist } from '../entitlements';
import { artistHasMonetizationEnabled } from '../artist-monetization';
import { generateToken } from '../jwt';
import { handler as publicArtistsHandler } from '../../public-artists';
import { handler as catalogHandler } from '../../artist-albums-catalog';
import { getArtistPublicationSignals } from '../artist-publication';
import { isAlbumPubliclyAccessible } from '../public-document/resolver';
import {
  isAlbumDetailsVisibleToPublicViewer,
  mapLocalesToAlbumDetails,
  type AlbumDetailsTrackSource,
} from '../album-details-mapper';

const mockQuery = query as unknown as jest.Mock;
const mockPremium = viewerHasPremiumAccessToArtist as unknown as jest.Mock;
const mockMonetization = artistHasMonetizationEnabled as unknown as jest.Mock;

const USER_ID = '8e998d76-1131-42ec-b26e-ef18603d8cec';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const SLUG = 'beatles';

type FixtureTrack = {
  albumId: string;
  trackId: string;
  visibility?: string | null;
  stemsVisibility?: string | null;
  processingStatus?: string | null;
};

type FixtureArtist = { id: string; slug: string; tracks: FixtureTrack[] };

const REQUIRES_READY = /COALESCE\(t\.processing_status, 'ready'\) = 'ready'/;
const EXCLUDES_HIDDEN = /COALESCE\(t\.visibility, 'public'\) <> 'hidden'/;

/** Mirrors `publicPlayableTrackSql` — but only the parts the SQL under test actually asks for. */
function trackQualifies(sql: string, track: FixtureTrack): boolean {
  if (EXCLUDES_HIDDEN.test(sql) && (track.visibility ?? 'public') === 'hidden') return false;
  if (REQUIRES_READY.test(sql) && (track.processingStatus ?? 'ready') !== 'ready') return false;
  return true;
}

const ready = (albumId: string, trackId: string): FixtureTrack => ({
  albumId,
  trackId,
  visibility: 'public',
  stemsVisibility: 'hidden',
  processingStatus: 'ready',
});

const withStatus =
  (processingStatus: 'failed' | 'pending' | 'processing') =>
  (albumId: string, trackId: string): FixtureTrack => ({
    ...ready(albumId, trackId),
    processingStatus,
  });

const failed = withStatus('failed');
const pending = withStatus('pending');
const processing = withStatus('processing');

function artistRow(artist: FixtureArtist) {
  return {
    id: artist.id,
    name: artist.slug,
    site_name: null,
    public_slug: artist.slug,
    genre_code: 'rock',
    label_en: 'Rock',
    label_ru: 'Рок',
    header_images: [],
    monetization_shop_id: null,
  };
}

function catalogRows(artist: FixtureArtist) {
  const albumIds = [...new Set(artist.tracks.map((t) => t.albumId))];
  return albumIds.flatMap((albumId, index) =>
    artist.tracks
      .filter((t) => t.albumId === albumId)
      .map((t) => ({
        id: `pk-${albumId}`,
        user_id: artist.id,
        album_id: albumId,
        album: albumId.toUpperCase(),
        cover: `${albumId}-cover`,
        release: { date: `196${index}-01-01` },
        is_public: true,
        is_published: true,
        lang: 'en',
        updated_at: '2026-01-01T00:00:00.000Z',
        track_id: t.trackId,
        duration: 120,
        visibility: t.visibility ?? 'public',
        stems_visibility: t.stemsVisibility ?? 'hidden',
        has_stems: false,
        processing_status: t.processingStatus ?? 'ready',
      }))
  );
}

/** Routes production SQL by its marker; publication gates are evaluated against fixtures. */
function wireDb(artists: FixtureArtist[], options: { profileContent?: boolean } = {}) {
  const calls: string[] = [];
  const byId = new Map(artists.map((a) => [a.id, a]));

  mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    const text = String(sql);
    calls.push(text);

    if (/JOIN genres g/.test(text)) {
      return {
        rows: artists.filter((a) => a.tracks.some((t) => trackQualifies(text, t))).map(artistRow),
      };
    }
    if (text.includes('public_slug = $1')) {
      const match = artists.find((a) => a.slug === params[0]);
      return { rows: match ? [{ id: match.id }] : [] };
    }
    if (text.includes('has_published_tracks')) {
      const artist = byId.get(String(params[0]));
      return {
        rows: [
          { has_published_tracks: Boolean(artist?.tracks.some((t) => trackQualifies(text, t))) },
        ],
      };
    }
    if (text.includes('has_public_articles')) return { rows: [{ has_public_articles: false }] };
    if (text.includes('has_profile_content')) {
      return { rows: [{ has_profile_content: options.profileContent === true }] };
    }
    if (/FROM albums a/.test(text) && /LEFT JOIN tracks t/.test(text)) {
      const artist = byId.get(String(params[0]));
      return { rows: artist ? catalogRows(artist) : [] };
    }
    throw new Error(`unexpected SQL in test: ${text}`);
  });

  return calls;
}

type HttpResponse = { statusCode: number; body: string };

const invokePublicArtists = () =>
  (publicArtistsHandler as unknown as (e: unknown) => Promise<HttpResponse>)({
    httpMethod: 'GET',
    path: '/api/public-artists',
    headers: {},
    queryStringParameters: null,
  });

const invokeCatalog = (headers: Record<string, string> = {}) =>
  (catalogHandler as unknown as (e: unknown) => Promise<HttpResponse>)({
    httpMethod: 'GET',
    path: `/api/artists/${SLUG}/albums`,
    headers,
    queryStringParameters: { slug: SLUG },
  });

const body = (response: HttpResponse) =>
  JSON.parse(response.body) as {
    success: boolean;
    code?: string;
    data?: Array<{ publicSlug?: string; albumId?: string; trackCount?: number }>;
  };

describe('public catalog — artist/album exists only with ≥1 available track', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockPremium.mockResolvedValue(false);
    mockMonetization.mockResolvedValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET /api/public-artists (Universe / search / artist cards)', () => {
    test('1 — an artist with a published, ready track is in the public catalog', async () => {
      wireDb([{ id: USER_ID, slug: SLUG, tracks: [ready('rubber-soul', 'norwegian-wood')] }]);

      const response = await invokePublicArtists();

      expect(response.statusCode).toBe(200);
      expect(body(response).data?.map((a) => a.publicSlug)).toEqual([SLUG]);
    });

    test('2 — an artist whose only track failed (playback file gone) is absent', async () => {
      wireDb([
        { id: USER_ID, slug: SLUG, tracks: [failed('rubber-soul', 'norwegian-wood')] },
        { id: OTHER_ID, slug: 'kinks', tracks: [ready('face-to-face', 'sunny-afternoon')] },
      ]);

      const response = await invokePublicArtists();

      expect(body(response).data?.map((a) => a.publicSlug)).toEqual(['kinks']);
    });

    test.each([
      ['pending', pending],
      ['processing', processing],
    ])('an artist whose only track is %s is absent from catalog', async (_label, make) => {
      wireDb([
        { id: USER_ID, slug: SLUG, tracks: [make('rubber-soul', 'norwegian-wood')] },
        { id: OTHER_ID, slug: 'kinks', tracks: [ready('face-to-face', 'sunny-afternoon')] },
      ]);

      expect(body(await invokePublicArtists()).data?.map((a) => a.publicSlug)).toEqual(['kinks']);
    });

    test('artist with ready + failed tracks stays in catalog', async () => {
      wireDb([
        {
          id: USER_ID,
          slug: SLUG,
          tracks: [failed('rubber-soul', 'norwegian-wood'), ready('rubber-soul', 'michelle')],
        },
      ]);

      expect(body(await invokePublicArtists()).data?.map((a) => a.publicSlug)).toEqual([SLUG]);
    });
  });

  describe('artist publication signal (artist page / search gate)', () => {
    test('2 — zero available tracks → hasPublishedTracks false', async () => {
      wireDb([{ id: USER_ID, slug: SLUG, tracks: [failed('rubber-soul', 'norwegian-wood')] }]);

      await expect(getArtistPublicationSignals(USER_ID)).resolves.toEqual({
        hasPublishedTracks: false,
      });
    });
  });

  describe('GET /api/artists/:slug/albums (artist page album cards)', () => {
    test('3 — an album whose only track failed is not a public album card', async () => {
      wireDb([{ id: USER_ID, slug: SLUG, tracks: [failed('rubber-soul', 'norwegian-wood')] }], {
        profileContent: true,
      });

      const response = await invokeCatalog();

      expect(response.statusCode).toBe(200);
      expect(body(response).data).toEqual([]);
    });

    test('4 — zero public tracks and no other public content → existing ARTIST_NOT_PUBLISHED flow', async () => {
      wireDb([{ id: USER_ID, slug: SLUG, tracks: [failed('rubber-soul', 'norwegian-wood')] }]);

      const response = await invokeCatalog();

      expect(response.statusCode).toBe(404);
      expect(body(response).code).toBe('ARTIST_NOT_PUBLISHED');
    });

    test('6 — album A lost all tracks, album B still has one → artist public, only B listed', async () => {
      wireDb([
        {
          id: USER_ID,
          slug: SLUG,
          tracks: [failed('rubber-soul', 'norwegian-wood'), ready('revolver', 'taxman')],
        },
      ]);

      const catalog = await invokeCatalog();
      expect(catalog.statusCode).toBe(200);
      expect(body(catalog).data?.map((a) => [a.albumId, a.trackCount])).toEqual([['revolver', 1]]);

      const artists = await invokePublicArtists();
      expect(body(artists).data?.map((a) => a.publicSlug)).toEqual([SLUG]);
    });

    test.each([
      ['pending', pending],
      ['processing', processing],
    ])('album whose only track is %s is not a public card', async (_label, make) => {
      wireDb([{ id: USER_ID, slug: SLUG, tracks: [make('rubber-soul', 'norwegian-wood')] }], {
        profileContent: true,
      });

      expect(body(await invokeCatalog()).data).toEqual([]);
    });

    test('a failed track does not inflate trackCount of an album that keeps other tracks', async () => {
      wireDb([
        {
          id: USER_ID,
          slug: SLUG,
          tracks: [failed('rubber-soul', 'norwegian-wood'), ready('rubber-soul', 'michelle')],
        },
      ]);

      const response = await invokeCatalog();

      expect(body(response).data?.map((a) => [a.albumId, a.trackCount])).toEqual([
        ['rubber-soul', 1],
      ]);
    });

    test('a failed mixer-only row (hidden track, visible stems) still counts — same as album page', async () => {
      wireDb([
        {
          id: USER_ID,
          slug: SLUG,
          tracks: [
            ready('revolver', 'taxman'),
            {
              albumId: 'rubber-soul',
              trackId: 'mixer-only',
              visibility: 'hidden',
              stemsVisibility: 'public',
              processingStatus: 'failed',
            },
          ],
        },
      ]);

      const response = await invokeCatalog();

      expect(body(response).data?.map((a) => [a.albumId, a.trackCount])).toEqual(
        expect.arrayContaining([
          ['rubber-soul', 1],
          ['revolver', 1],
        ])
      );
    });

    test('owner still receives the emptied album (trackCount 0) — owner/admin flows untouched', async () => {
      wireDb([{ id: USER_ID, slug: SLUG, tracks: [failed('rubber-soul', 'norwegian-wood')] }]);
      const ownerToken = generateToken(USER_ID, 'owner@example.com');

      const response = await invokeCatalog({ authorization: `Bearer ${ownerToken}` });

      expect(response.statusCode).toBe(200);
      expect(body(response).data?.map((a) => [a.albumId, a.trackCount])).toEqual([
        ['rubber-soul', 0],
      ]);
    });
  });

  describe('direct album URL', () => {
    function track(partial: Partial<AlbumDetailsTrackSource>): AlbumDetailsTrackSource {
      return {
        trackId: 'norwegian-wood',
        title: 'Norwegian Wood',
        duration: 120,
        src: '',
        orderIndex: 0,
        visibility: 'public',
        stemsVisibility: 'hidden',
        audioContainer: null,
        audioCodec: null,
        audioBitrate: null,
        audioSampleRate: null,
        audioBitDepth: null,
        audioChannels: null,
        audioDuration: null,
        audioFileSize: null,
        ...partial,
      };
    }

    function mapAlbum(tracks: AlbumDetailsTrackSource[]) {
      return mapLocalesToAlbumDetails(
        [
          {
            lang: 'en',
            dbAlbumId: 'pk-rubber-soul',
            userId: USER_ID,
            albumId: 'rubber-soul',
            title: 'Rubber Soul',
            fullName: 'Beatles — Rubber Soul',
            description: '',
            cover: 'cover',
            release: {},
            buttons: {},
            details: [],
            photographer: '',
            photographerURL: '',
            designer: '',
            designerURL: '',
            isPublic: true,
            isPublished: true,
            updatedAt: '2026-01-01T00:00:00.000Z',
            tracks,
          },
        ],
        { hasPremiumAccess: false, monetizationEnabled: false, pipelineAvailable: true }
      )!;
    }

    test.each([
      ['A public + ready', { visibility: 'public', processingStatus: 'ready' }, true],
      ['B public + failed', { visibility: 'public', processingStatus: 'failed' }, false],
      ['C public + pending', { visibility: 'public', processingStatus: 'pending' }, false],
      ['D public + processing', { visibility: 'public', processingStatus: 'processing' }, false],
      [
        'E hidden + stems visible (mixer-only, failed ok)',
        { visibility: 'hidden', stemsVisibility: 'public', processingStatus: 'failed' },
        true,
      ],
      [
        'F hidden + stems hidden',
        { visibility: 'hidden', stemsVisibility: 'hidden', processingStatus: 'ready' },
        false,
      ],
    ] as const)('album page mapper: %s', (_label, partial, listed) => {
      const dto = mapAlbum([track(partial as Partial<AlbumDetailsTrackSource>)]);

      expect(dto.tracks.map((t) => t.id)).toEqual(listed ? ['norwegian-wood'] : []);
    });

    test.each(['pending', 'processing'] as const)(
      'direct album URL with only %s → no public track, 404 flow',
      (status) => {
        const dto = mapAlbum([track({ processingStatus: status })]);

        expect(dto.tracks).toEqual([]);
        expect(isAlbumDetailsVisibleToPublicViewer(dto)).toBe(false);
      }
    );

    test('album details with only failed track → 404 flow (3d8dfe56 missing storage)', () => {
      const dto = mapAlbum([track({ processingStatus: 'failed' })]);

      expect(dto.tracks).toEqual([]);
      expect(isAlbumDetailsVisibleToPublicViewer(dto)).toBe(false);
    });

    test('3 — public document (SEO head) counts only publicly listed tracks', async () => {
      const calls: string[] = [];
      mockQuery.mockImplementation(async (sql: string) => {
        const text = String(sql);
        calls.push(text);
        if (text.includes('public_slug')) return { rows: [{ id: USER_ID }] };
        if (text.includes('a.is_public, a.is_published')) {
          return { rows: [{ album: 'Rubber Soul', is_public: true, is_published: true }] };
        }
        if (text.includes('COUNT(DISTINCT t.track_id)')) {
          return { rows: [{ count: REQUIRES_READY.test(text) ? '0' : '1' }] };
        }
        throw new Error(`unexpected SQL in test: ${text}`);
      });

      await expect(isAlbumPubliclyAccessible(SLUG, 'rubber-soul')).resolves.toBe(false);
    });
  });
});
