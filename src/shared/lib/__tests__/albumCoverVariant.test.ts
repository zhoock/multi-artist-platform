import {
  ALBUM_COVER_PUBLIC_JPG_WIDTHS,
  ALBUM_COVER_PUBLIC_WEBP_WIDTHS,
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
