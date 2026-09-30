import { shouldSkipReadyTrackReprocess } from '../shouldSkipReadyTrackReprocess';

describe('shouldSkipReadyTrackReprocess', () => {
  test('does not start another playback job for a ready track', () => {
    expect(shouldSkipReadyTrackReprocess({ processingStatus: 'ready', optionalOnly: false })).toBe(
      true
    );
  });

  test('still processes a failed or pending track', () => {
    expect(shouldSkipReadyTrackReprocess({ processingStatus: 'failed', optionalOnly: false })).toBe(
      false
    );
    expect(
      shouldSkipReadyTrackReprocess({ processingStatus: 'pending', optionalOnly: false })
    ).toBe(false);
  });

  test('allows an optional-only refresh and an explicit force', () => {
    expect(shouldSkipReadyTrackReprocess({ processingStatus: 'ready', optionalOnly: true })).toBe(
      false
    );
    expect(
      shouldSkipReadyTrackReprocess({
        processingStatus: 'ready',
        optionalOnly: false,
        force: true,
      })
    ).toBe(false);
  });
});
