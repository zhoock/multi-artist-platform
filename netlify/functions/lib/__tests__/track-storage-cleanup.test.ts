import {
  collectSupersededTrackStoragePaths,
  extractStoragePathFromTrackRef,
} from '../track-storage-cleanup';

describe('track-storage-cleanup', () => {
  const userId = 'user-uuid';

  it('extracts users/ paths', () => {
    expect(
      extractStoragePathFromTrackRef('users/user-uuid/audio/album/original/track.flac', userId)
    ).toBe('users/user-uuid/audio/album/original/track.flac');
  });

  it('collects old master and derived paths but keeps new master', () => {
    const paths = collectSupersededTrackStoragePaths(
      userId,
      'users/user-uuid/audio/album/original/track_v2.flac',
      'users/user-uuid/audio/album/original/track_v1.flac',
      ['users/user-uuid/audio/album/derived/stream/opus_128k/track_v1.opus']
    );
    expect(paths).toEqual([
      'users/user-uuid/audio/album/original/track_v1.flac',
      'users/user-uuid/audio/album/derived/stream/opus_128k/track_v1.opus',
    ]);
  });

  it('does not delete new master when path unchanged (upsert)', () => {
    const same = 'users/user-uuid/audio/album/original/track.flac';
    const paths = collectSupersededTrackStoragePaths(userId, same, same, [
      'users/user-uuid/audio/album/derived/stream/opus_128k/track.opus',
    ]);
    expect(paths).toEqual(['users/user-uuid/audio/album/derived/stream/opus_128k/track.opus']);
  });
});
