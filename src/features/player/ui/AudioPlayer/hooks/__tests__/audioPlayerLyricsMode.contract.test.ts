/**
 * Documents Full Player lyrics UX contract (mirrors AudioPlayer.tsx).
 * Keeps auto-close and button enable rules testable without full player mount.
 */

import { describe, expect, test } from '@jest/globals';

function computeHasTextToShow(input: {
  hasPlainLyrics: boolean;
  hasSyncedLyricsAvailable: boolean;
  hasSyncedLyricsHint: boolean;
  isLyricsHydrating: boolean;
  isLoadingSyncedLyrics: boolean;
  hasNonEmptyLyricsEntity: boolean;
}): boolean {
  return (
    input.hasSyncedLyricsAvailable ||
    input.hasSyncedLyricsHint ||
    input.hasPlainLyrics ||
    input.isLyricsHydrating ||
    (input.isLoadingSyncedLyrics && !input.hasNonEmptyLyricsEntity)
  );
}

function shouldAutoCloseLyricsMode(input: {
  showLyrics: boolean;
  isLyricsConfirmedUnavailable: boolean;
}): boolean {
  return input.showLyrics && input.isLyricsConfirmedUnavailable;
}

describe('Full Player lyrics mode contract', () => {
  test('lyrics button stays enabled while hydrating', () => {
    expect(
      computeHasTextToShow({
        hasPlainLyrics: false,
        hasSyncedLyricsAvailable: false,
        hasSyncedLyricsHint: false,
        isLyricsHydrating: true,
        isLoadingSyncedLyrics: false,
        hasNonEmptyLyricsEntity: false,
      })
    ).toBe(true);
  });

  test('lyrics mode does not auto-close during hydration', () => {
    expect(
      shouldAutoCloseLyricsMode({
        showLyrics: true,
        isLyricsConfirmedUnavailable: false,
      })
    ).toBe(false);
  });

  test('lyrics mode closes only when unavailable is confirmed', () => {
    expect(
      shouldAutoCloseLyricsMode({
        showLyrics: true,
        isLyricsConfirmedUnavailable: true,
      })
    ).toBe(true);
  });

  test('button disabled when confirmed unavailable and not hydrating', () => {
    expect(
      computeHasTextToShow({
        hasPlainLyrics: false,
        hasSyncedLyricsAvailable: false,
        hasSyncedLyricsHint: false,
        isLyricsHydrating: false,
        isLoadingSyncedLyrics: false,
        hasNonEmptyLyricsEntity: false,
      })
    ).toBe(false);
  });

  test('button enabled when plain lyrics loaded', () => {
    expect(
      computeHasTextToShow({
        hasPlainLyrics: true,
        hasSyncedLyricsAvailable: false,
        hasSyncedLyricsHint: false,
        isLyricsHydrating: false,
        isLoadingSyncedLyrics: false,
        hasNonEmptyLyricsEntity: true,
      })
    ).toBe(true);
  });
});
