import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { TrackLyricsBundle } from '@shared/lib/lyrics/types';

export function lyricsSyncIconAttentionKey(albumId: string, trackId: string): string {
  return `${albumId}:${trackId}`;
}

type LyricsSyncIconAttentionContextValue = {
  isDismissed: (albumId: string, trackId: string) => boolean;
  dismiss: (albumId: string, trackId: string) => void;
  clearDismiss: (albumId: string, trackId: string) => void;
};

const LyricsSyncIconAttentionContext = createContext<LyricsSyncIconAttentionContextValue | null>(
  null
);

export function useLyricsSyncIconAttentionController(): LyricsSyncIconAttentionContextValue {
  const [dismissedKeys, setDismissedKeys] = useState(() => new Set<string>());

  const dismiss = useCallback((albumId: string, trackId: string) => {
    const key = lyricsSyncIconAttentionKey(albumId, trackId);
    setDismissedKeys((prev) => {
      if (prev.has(key)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const clearDismiss = useCallback((albumId: string, trackId: string) => {
    const key = lyricsSyncIconAttentionKey(albumId, trackId);
    setDismissedKeys((prev) => {
      if (!prev.has(key)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const isDismissed = useCallback(
    (albumId: string, trackId: string) =>
      dismissedKeys.has(lyricsSyncIconAttentionKey(albumId, trackId)),
    [dismissedKeys]
  );

  return useMemo(
    () => ({
      isDismissed,
      dismiss,
      clearDismiss,
    }),
    [clearDismiss, dismiss, isDismissed]
  );
}

type LyricsSyncIconAttentionProviderProps = {
  value: LyricsSyncIconAttentionContextValue;
  children: ReactNode;
};

export function LyricsSyncIconAttentionProvider({
  value,
  children,
}: LyricsSyncIconAttentionProviderProps) {
  return (
    <LyricsSyncIconAttentionContext.Provider value={value}>
      {children}
    </LyricsSyncIconAttentionContext.Provider>
  );
}

function useLyricsSyncIconAttentionContext(): LyricsSyncIconAttentionContextValue {
  const context = useContext(LyricsSyncIconAttentionContext);
  if (!context) {
    throw new Error(
      'useLyricsSyncIconAttentionContext must be used within LyricsSyncIconAttentionProvider'
    );
  }
  return context;
}

export function useDismissLyricsSyncIconAttention(): LyricsSyncIconAttentionContextValue['dismiss'] {
  return useLyricsSyncIconAttentionContext().dismiss;
}

/**
 * Soft yellow pulse on the sync (↻) icon after lyrics enter `text-only` in this session.
 * No pulse on initial mount (page load) — only on transition into `text-only`.
 * Dismissed until state leaves `text-only` (e.g. after sync or remove-sync → new episode).
 */
export function useLyricsSyncIconAttentionPulse(
  albumId: string,
  trackId: string,
  lyricsState: TrackLyricsBundle['state']
): boolean {
  const { isDismissed, clearDismiss } = useLyricsSyncIconAttentionContext();
  const prevStateRef = useRef(lyricsState);
  const [episodeActive, setEpisodeActive] = useState(false);

  useEffect(() => {
    const prev = prevStateRef.current;

    if (lyricsState === 'text-only' && prev !== 'text-only') {
      setEpisodeActive(true);
    }

    if (lyricsState !== 'text-only') {
      setEpisodeActive(false);
      clearDismiss(albumId, trackId);
    }

    prevStateRef.current = lyricsState;
  }, [albumId, clearDismiss, lyricsState, trackId]);

  return episodeActive && lyricsState === 'text-only' && !isDismissed(albumId, trackId);
}
