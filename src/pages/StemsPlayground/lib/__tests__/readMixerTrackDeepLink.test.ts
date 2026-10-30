import { describe, expect, test } from '@jest/globals';
import { readMixerTrackDeepLinkFromSearchParams } from '../readMixerTrackDeepLink';

describe('readMixerTrackDeepLinkFromSearchParams', () => {
  test('returns target when artist, album, and track are present', () => {
    const params = new URLSearchParams(
      'artist=beatles&album=rubber-soul&track=80519794-43f2-484c-a46d-08e0394f9c12'
    );
    expect(readMixerTrackDeepLinkFromSearchParams(params)).toEqual({
      albumId: 'rubber-soul',
      trackId: '80519794-43f2-484c-a46d-08e0394f9c12',
    });
  });

  test('returns null for shared mix route', () => {
    const params = new URLSearchParams('artist=beatles&album=a&track=t');
    expect(readMixerTrackDeepLinkFromSearchParams(params, { mixId: 'mix-1' })).toBeNull();
  });

  test('returns null when track param is missing', () => {
    const params = new URLSearchParams('artist=beatles&album=rubber-soul');
    expect(readMixerTrackDeepLinkFromSearchParams(params)).toBeNull();
  });
});
