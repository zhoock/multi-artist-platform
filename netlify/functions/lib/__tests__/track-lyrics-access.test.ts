import { decideTrackLyricsRead } from '../track-lyrics-access';

describe('decideTrackLyricsRead', () => {
  test('owner reads lyrics of their artist even without a premium subscription', () => {
    expect(
      decideTrackLyricsRead({
        hasArtistQuery: true,
        authUserId: 'artist-1',
        artistUserId: 'artist-1',
        monetizationEnabled: true,
        hasPremiumAccess: false,
      })
    ).toBe('allow');
  });

  test('public artist page: lyrics readable without premium (matches album-details embed)', () => {
    expect(
      decideTrackLyricsRead({
        hasArtistQuery: true,
        authUserId: 'listener-1',
        artistUserId: 'artist-1',
        monetizationEnabled: true,
        hasPremiumAccess: false,
      })
    ).toBe('allow');
  });

  test('premium viewer can read', () => {
    expect(
      decideTrackLyricsRead({
        hasArtistQuery: true,
        authUserId: 'listener-1',
        artistUserId: 'artist-1',
        monetizationEnabled: true,
        hasPremiumAccess: true,
      })
    ).toBe('allow');
  });

  test('public artist without monetization is readable', () => {
    expect(
      decideTrackLyricsRead({
        hasArtistQuery: true,
        authUserId: null,
        artistUserId: 'artist-1',
        monetizationEnabled: false,
        hasPremiumAccess: false,
      })
    ).toBe('allow');
  });
});
