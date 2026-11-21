import { useCallback, useLayoutEffect, useRef, useState } from 'react';

type UsePlayerHeaderReadyArgs = {
  enabled: boolean;
  coverKey: string;
  trackTitle: string | undefined;
  albumTitle: string;
  artistLabel: string;
};

type UsePlayerHeaderReadyResult = {
  isHeaderReady: boolean;
  setCoverContainer: (node: HTMLDivElement | null) => void;
};

/**
 * Готовность шапки fullscreen-плеера: метаданные в store + обложка в DOM (load / cache hit).
 */
export function usePlayerHeaderReady({
  enabled,
  coverKey,
  trackTitle,
  albumTitle,
  artistLabel,
}: UsePlayerHeaderReadyArgs): UsePlayerHeaderReadyResult {
  const coverContainerRef = useRef<HTMLDivElement | null>(null);
  const [coverAttachVersion, setCoverAttachVersion] = useState(0);
  const [coverReady, setCoverReady] = useState(() => !coverKey.trim());

  const setCoverContainer = useCallback((node: HTMLDivElement | null) => {
    coverContainerRef.current = node;
    setCoverAttachVersion((value) => value + 1);
  }, []);

  useLayoutEffect(() => {
    if (!enabled) {
      setCoverReady(true);
      return;
    }

    const trimmedCover = coverKey.trim();
    if (!trimmedCover) {
      setCoverReady(true);
      return;
    }

    setCoverReady(false);

    const root = coverContainerRef.current;
    if (!root) {
      return;
    }

    const img = root.querySelector('img.album-cover__image');
    if (!(img instanceof HTMLImageElement)) {
      return;
    }

    const markReady = () => {
      setCoverReady(true);
    };

    if (img.complete && img.naturalWidth > 0) {
      markReady();
      return;
    }

    img.addEventListener('load', markReady, { once: true });
    img.addEventListener('error', markReady, { once: true });

    return () => {
      img.removeEventListener('load', markReady);
      img.removeEventListener('error', markReady);
    };
  }, [enabled, coverKey, coverAttachVersion]);

  const metadataReady =
    Boolean(trackTitle?.trim()) && Boolean(albumTitle.trim() || artistLabel.trim());

  const isHeaderReady = !enabled || (metadataReady && coverReady);

  return { isHeaderReady, setCoverContainer };
}
