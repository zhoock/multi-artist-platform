import {
  ALBUM_COVER_PUBLIC_JPG_WIDTHS,
  ALBUM_COVER_PUBLIC_WEBP_WIDTHS,
  getAlbumCoverAdminVariantUrls,
  getAlbumCoverCacheVersion,
  getAlbumStorageBaseName,
  pickAlbumCoverStorageWidth,
} from '../albumCoverUrl';

describe('pickAlbumCoverStorageWidth', () => {
  it('includes -128 for small UI targets (MiniPlayer, checkout, payment)', () => {
    expect(pickAlbumCoverStorageWidth(40, 'webp')).toBe(128);
    expect(pickAlbumCoverStorageWidth(64, 'webp')).toBe(128);
    expect(pickAlbumCoverStorageWidth(72, 'webp')).toBe(128);
    expect(pickAlbumCoverStorageWidth(96, 'webp')).toBe(128);
    expect(pickAlbumCoverStorageWidth(128, 'webp')).toBe(128);
  });

  it('keeps large variants for catalog and full player', () => {
    expect(pickAlbumCoverStorageWidth(448, 'webp')).toBe(448);
    expect(pickAlbumCoverStorageWidth(896, 'webp')).toBe(896);
    expect(pickAlbumCoverStorageWidth(1344, 'webp')).toBe(1344);
    expect(pickAlbumCoverStorageWidth(2000, 'webp')).toBe(1344);
  });

  it('limits lyrics-mode targets to -448 max (no -896/-1344)', () => {
    expect(pickAlbumCoverStorageWidth(150, 'webp')).toBe(448);
    expect(pickAlbumCoverStorageWidth(300, 'webp')).toBe(448);
  });

  it('uses jpg ladder without -1344', () => {
    expect(ALBUM_COVER_PUBLIC_JPG_WIDTHS).toEqual([128, 448, 896]);
    expect(pickAlbumCoverStorageWidth(500, 'jpg')).toBe(896);
    expect(pickAlbumCoverStorageWidth(2000, 'jpg')).toBe(896);
  });

  it('webp ladder includes -1344', () => {
    expect(ALBUM_COVER_PUBLIC_WEBP_WIDTHS).toEqual([128, 448, 896, 1344]);
  });
});

const COVER_BASE = 'album_cover_uuid_artist-Cover-album';

describe('getAlbumStorageBaseName', () => {
  it('handles string cover (legacy)', () => {
    expect(getAlbumStorageBaseName(COVER_BASE)).toBe(COVER_BASE);
    expect(getAlbumStorageBaseName(`${COVER_BASE}-128.webp`)).toBe(COVER_BASE);
  });

  it('handles object cover without throwing', () => {
    expect(
      getAlbumStorageBaseName({
        img: `${COVER_BASE}-448.webp`,
      })
    ).toBe(COVER_BASE);
  });

  it('returns empty string for null and undefined', () => {
    expect(getAlbumStorageBaseName(null)).toBe('');
    expect(getAlbumStorageBaseName(undefined)).toBe('');
  });
});

describe('getAlbumCoverAdminVariantUrls', () => {
  const USER_ID = 'af97f741-8dae-410b-94a6-3f828f9140a4';
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      VITE_SUPABASE_URL: 'https://jhpvetvfnsklpwswadle.supabase.co',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('builds admin URLs for string cover', () => {
    const urls = getAlbumCoverAdminVariantUrls(COVER_BASE, USER_ID);
    expect(urls.webp).toContain(`${COVER_BASE}-128.webp`);
    expect(urls.jpg).toContain(`${COVER_BASE}-128.jpg`);
  });

  it('handles object cover without throwing', () => {
    expect(() => getAlbumCoverAdminVariantUrls({ img: COVER_BASE }, USER_ID)).not.toThrow();
    const urls = getAlbumCoverAdminVariantUrls({ img: COVER_BASE }, USER_ID);
    expect(urls.webp).toContain(`${COVER_BASE}-128.webp`);
  });

  it('returns null URLs when cover is empty', () => {
    expect(getAlbumCoverAdminVariantUrls(null, USER_ID)).toEqual({
      webp: null,
      jpg: null,
      pipelineJpg64: null,
      pipelineJpg448: null,
    });
  });
});

describe('getAlbumCoverCacheVersion', () => {
  it('uses stable baseName and strips size suffixes', () => {
    const base = 'album_cover_uuid_artist-Cover-album';
    expect(getAlbumCoverCacheVersion(base)).toBe(base);
    expect(getAlbumCoverCacheVersion(`${base}-448.webp`)).toBe(base);
  });

  it('changes when cover identity changes after re-upload', () => {
    const oldCover = 'album_cover_aaa_artist-Cover-album';
    const newCover = 'album_cover_bbb_artist-Cover-album';
    expect(getAlbumCoverCacheVersion(oldCover)).not.toBe(getAlbumCoverCacheVersion(newCover));
  });

  it('matches getAlbumStorageBaseName', () => {
    const cover = 'album_cover_uuid_band-Cover-title-128';
    expect(getAlbumCoverCacheVersion(cover)).toBe(getAlbumStorageBaseName(cover));
  });
});
