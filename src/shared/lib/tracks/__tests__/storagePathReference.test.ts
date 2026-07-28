import {
  extractStoragePathFromTrackRef,
  isPipelineManagedAudioStoragePath,
  normalizeStoragePath,
} from '../storagePathReference';

describe('storagePathReference', () => {
  it('normalizes users/ paths', () => {
    expect(extractStoragePathFromTrackRef('users/u/audio/a/original/t.flac', 'u')).toBe(
      'users/u/audio/a/original/t.flac'
    );
  });

  it('detects pipeline-managed audio paths', () => {
    expect(isPipelineManagedAudioStoragePath('users/u/audio/album/original/track.flac')).toBe(true);
    expect(
      isPipelineManagedAudioStoragePath('users/u/audio/album/derived/stream/opus_128k/t.opus')
    ).toBe(true);
    expect(isPipelineManagedAudioStoragePath('users/u/covers/album.jpg')).toBe(false);
  });

  it('normalizes storage paths', () => {
    expect(normalizeStoragePath('/users/u/audio/a/original/t.flac')).toBe(
      'users/u/audio/a/original/t.flac'
    );
  });

  it('finds orphan pipeline audio paths not referenced in DB', () => {
    const referenced = new Set([
      'users/u/audio/album/original/current.flac',
      'users/u/audio/album/derived/stream/opus_128k/current.opus',
    ]);

    const bucketPaths = [
      'users/u/audio/album/original/current.flac',
      'users/u/audio/album/original/old.flac',
      'users/u/audio/album/derived/stream/opus_128k/old.opus',
      'users/u/covers/album.jpg',
    ];

    const orphans = bucketPaths
      .map(normalizeStoragePath)
      .filter((path) => isPipelineManagedAudioStoragePath(path))
      .filter((path) => !referenced.has(path))
      .sort();

    expect(orphans).toEqual([
      'users/u/audio/album/derived/stream/opus_128k/old.opus',
      'users/u/audio/album/original/old.flac',
    ]);
  });
});
