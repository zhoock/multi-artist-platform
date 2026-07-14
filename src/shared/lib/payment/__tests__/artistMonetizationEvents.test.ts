import {
  ARTIST_MONETIZATION_CHANGED_EVENT,
  dispatchArtistMonetizationChanged,
  subscribeArtistMonetizationChanged,
} from '../artistMonetizationEvents';

describe('artistMonetizationEvents', () => {
  test('dispatches and delivers monetization changes', () => {
    const seen: boolean[] = [];
    const unsubscribe = subscribeArtistMonetizationChanged((enabled) => {
      seen.push(enabled);
    });

    dispatchArtistMonetizationChanged(true);
    dispatchArtistMonetizationChanged(false);

    expect(seen).toEqual([true, false]);
    unsubscribe();

    dispatchArtistMonetizationChanged(true);
    expect(seen).toEqual([true, false]);
  });

  test('uses a stable custom event name', () => {
    expect(ARTIST_MONETIZATION_CHANGED_EVENT).toBe('artist:monetization-changed');
  });
});
