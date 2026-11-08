import {
  buildStemMasterStoragePath,
  buildStemPlaybackFileName,
  getStemStoragePath,
} from '../stemStoragePaths';

const USER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('stemStoragePaths', () => {
  test('master upload lives under track original/', () => {
    expect(buildStemMasterStoragePath(USER, 'album-1', 'track-1', 'stem-a.wav')).toBe(
      `users/${USER}/audio/album-1/track-1/original/stem-a.wav`
    );
  });

  test('playback file is opus next to manifest', () => {
    expect(buildStemPlaybackFileName('stem-a.wav')).toBe('stem-a.opus');
    expect(getStemStoragePath(USER, 'album-1', 'track-1', 'stem-a.opus')).toBe(
      `users/${USER}/audio/album-1/track-1/stem-a.opus`
    );
  });
});
