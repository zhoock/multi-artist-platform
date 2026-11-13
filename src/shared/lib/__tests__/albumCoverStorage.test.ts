import {
  backImgBaseForStorageCleanup,
  coverImgBaseForStorageCleanup,
  coverImgFromStorageField,
  parseAlbumCoverField,
  buildAlbumCoverStorageValue,
  mergeAlbumCoverPayloadForSave,
} from '../albumCoverStorage';

const BG = {
  primary: [10, 20, 30] as [number, number, number],
  secondary: [40, 50, 60] as [number, number, number],
};

describe('albumCoverStorage', () => {
  test('reads img from new jsonb object', () => {
    const raw = {
      img: 'album_cover_uuid_artist-Cover-rubber-soul',
      playerBackground: BG,
    };
    expect(coverImgFromStorageField(raw)).toBe('album_cover_uuid_artist-Cover-rubber-soul');
    expect(parseAlbumCoverField(raw).playerBackground).toEqual(BG);
  });

  test('reads img from json string (driver text)', () => {
    const raw = JSON.stringify({
      img: 'album_cover_uuid_artist-Cover-rubber-soul',
      playerBackground: BG,
    });
    expect(coverImgFromStorageField(raw)).toBe('album_cover_uuid_artist-Cover-rubber-soul');
  });

  test('reads legacy plain string base', () => {
    expect(coverImgFromStorageField('beatles-rubber-soul')).toBe('beatles-rubber-soul');
  });

  test('returns empty img for malformed object', () => {
    expect(coverImgFromStorageField({ playerBackground: BG })).toBe('');
  });

  test('buildAlbumCoverStorageValue normalizes variant suffix', () => {
    const value = buildAlbumCoverStorageValue('my-cover-448.webp', BG);
    expect(value.img).toBe('my-cover');
  });

  test('reads backImg from jsonb object', () => {
    const raw = {
      img: 'album_cover_front',
      playerBackground: BG,
      backImg: 'album_cover_back',
    };
    expect(parseAlbumCoverField(raw).backImg).toBe('album_cover_back');
  });

  test('delete cleanup collects front and back base names from JSONB', () => {
    const raw = {
      img: 'album_cover_front',
      backImg: 'album_cover_back',
    };
    expect(coverImgBaseForStorageCleanup(raw)).toBe('album_cover_front');
    expect(backImgBaseForStorageCleanup(raw)).toBe('album_cover_back');
  });

  test('backImgBaseForStorageCleanup normalizes variant suffix', () => {
    const raw = {
      img: 'front',
      playerBackground: BG,
      backImg: 'album_back-448.webp',
    };
    expect(backImgBaseForStorageCleanup(raw)).toBe('album_back');
  });

  test('album without backImg leaves merge undefined when nothing changes', () => {
    expect(
      mergeAlbumCoverPayloadForSave({
        prior: { img: 'front-only', playerBackground: BG },
        front: null,
        backBaseName: null,
      })
    ).toBeUndefined();
  });
});
