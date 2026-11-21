import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

import type { TrackLyricsBundle } from '@shared/lib/lyrics/types';
import {
  LyricsSyncIconAttentionProvider,
  useLyricsSyncIconAttentionController,
  useLyricsSyncIconAttentionPulse,
  useDismissLyricsSyncIconAttention,
} from '../../../../lib/lyricsSyncIconAttention';

function createHarnessWrapper() {
  return function Wrapper({ children }: { children: ReactNode }) {
    const controller = useLyricsSyncIconAttentionController();
    return (
      <LyricsSyncIconAttentionProvider value={controller}>
        {children}
      </LyricsSyncIconAttentionProvider>
    );
  };
}

function usePulseWithDismiss(
  albumId: string,
  trackId: string,
  lyricsState: TrackLyricsBundle['state']
) {
  const pulse = useLyricsSyncIconAttentionPulse(albumId, trackId, lyricsState);
  const dismiss = useDismissLyricsSyncIconAttention();
  return { pulse, dismiss };
}

describe('useLyricsSyncIconAttentionPulse', () => {
  const albumId = 'album-1';
  const trackId = 'track-1';
  const wrapper = createHarnessWrapper();

  it('does not pulse on initial mount when already text-only', () => {
    const { result } = renderHook(
      () => useLyricsSyncIconAttentionPulse(albumId, trackId, 'text-only'),
      { wrapper }
    );

    expect(result.current).toBe(false);
  });

  it('pulses after transition into text-only', () => {
    const { result, rerender } = renderHook(
      ({ state }: { state: TrackLyricsBundle['state'] }) =>
        useLyricsSyncIconAttentionPulse(albumId, trackId, state),
      {
        wrapper,
        initialProps: { state: 'empty' as TrackLyricsBundle['state'] },
      }
    );

    expect(result.current).toBe(false);

    rerender({ state: 'text-only' });
    expect(result.current).toBe(true);
  });

  it('stops pulsing after dismiss (sync modal opened)', () => {
    const { result, rerender } = renderHook(
      ({ state }: { state: TrackLyricsBundle['state'] }) =>
        usePulseWithDismiss(albumId, trackId, state),
      {
        wrapper,
        initialProps: { state: 'empty' as TrackLyricsBundle['state'] },
      }
    );

    rerender({ state: 'text-only' });
    expect(result.current.pulse).toBe(true);

    act(() => {
      result.current.dismiss(albumId, trackId);
    });
    expect(result.current.pulse).toBe(false);

    rerender({ state: 'text-only' });
    expect(result.current.pulse).toBe(false);
  });

  it('pulses again after a new text-only episode (e.g. remove sync)', () => {
    const { result, rerender } = renderHook(
      ({ state }: { state: TrackLyricsBundle['state'] }) =>
        usePulseWithDismiss(albumId, trackId, state),
      {
        wrapper,
        initialProps: { state: 'empty' as TrackLyricsBundle['state'] },
      }
    );

    rerender({ state: 'text-only' });
    act(() => {
      result.current.dismiss(albumId, trackId);
    });
    expect(result.current.pulse).toBe(false);

    rerender({ state: 'synced' });
    rerender({ state: 'text-only' });
    expect(result.current.pulse).toBe(true);
  });
});
