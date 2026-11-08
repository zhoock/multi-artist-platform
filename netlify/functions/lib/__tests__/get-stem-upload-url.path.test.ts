import { buildStemMasterStoragePath, getStemStoragePath } from '../stem-storage-path-shared';

const USER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('stem upload storage paths', () => {
  test('manifest stays at track root', () => {
    expect(getStemStoragePath(USER, 'album', 'track', 'stems.json')).toBe(
      `users/${USER}/audio/album/track/stems.json`
    );
  });

  test('audio upload uses original/', () => {
    expect(buildStemMasterStoragePath(USER, 'album', 'track', 'stem-1.wav')).toContain(
      '/original/stem-1.wav'
    );
  });
});
