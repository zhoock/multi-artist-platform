import {
  buildDerivedStoragePath,
  buildMasterStoragePath,
  replaceStorageFileExtension,
} from '../trackStoragePaths';

describe('trackStoragePaths', () => {
  const userId = 'user-uuid';
  const albumId = 'my-album';
  const fileName = 'abc__My-Track.flac';

  it('builds master path under original/', () => {
    expect(buildMasterStoragePath(userId, albumId, fileName)).toBe(
      'users/user-uuid/audio/my-album/original/abc__My-Track.flac'
    );
  });

  it('builds derived path under derived/{type}/{format}_{variant}/', () => {
    expect(
      buildDerivedStoragePath(userId, albumId, 'stream', 'opus', '128k', 'abc__My-Track.opus')
    ).toBe('users/user-uuid/audio/my-album/derived/stream/opus_128k/abc__My-Track.opus');
  });

  it('replaces storage file extension', () => {
    expect(replaceStorageFileExtension('abc__My-Track.flac', 'opus')).toBe('abc__My-Track.opus');
  });
});
