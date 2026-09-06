import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  fetchArtistHeroHeaderImages,
  filterValidHeroHeaderImages,
  getCachedArtistHeroHeaderImages,
  invalidateArtistHeroHeaderImagesCache,
  preloadHeroCoverFromHeaderImages,
  setCachedArtistHeroHeaderImages,
} from '@shared/lib/artistHeroHeaderImages';
import {
  ensurePublicArtistsLoaded,
  getCachedPublicArtistHeaderImages,
} from '@shared/lib/publicArtistsCache';

function resolveHeaderImagesFromCaches(artistSlug: string): string[] {
  if (!artistSlug) return [];
  const profileCached = getCachedArtistHeroHeaderImages(artistSlug);
  if (profileCached !== null) return profileCached;
  const publicCached = getCachedPublicArtistHeaderImages(artistSlug);
  if (publicCached) return filterValidHeroHeaderImages(publicCached);
  return [];
}

function readInitialHeaderImages(artistSlug: string): string[] {
  return resolveHeaderImagesFromCaches(artistSlug);
}

function readInitialHeaderImagesReady(artistSlug: string): boolean {
  if (!artistSlug) return true;
  return getCachedArtistHeroHeaderImages(artistSlug) !== null;
}

function applyPublicArtistHeaderImages(
  artistSlug: string,
  setHeaderImages: (images: string[]) => void
): boolean {
  const publicCached = getCachedPublicArtistHeaderImages(artistSlug);
  if (!publicCached) return false;
  const valid = filterValidHeroHeaderImages(publicCached);
  if (valid.length === 0) return false;
  setHeaderImages(valid);
  preloadHeroCoverFromHeaderImages(artistSlug, valid);
  return true;
}

export function useArtistHeroHeaderImages(artistSlug: string) {
  const normalizedSlug = artistSlug.trim().toLowerCase();
  const skipArtistUpdatedReloadRef = useRef(false);
  const [headerImages, setHeaderImages] = useState(() => readInitialHeaderImages(normalizedSlug));
  const [isHeaderImagesReady, setIsHeaderImagesReady] = useState(() =>
    readInitialHeaderImagesReady(normalizedSlug)
  );

  const loadImages = useCallback(
    async (options?: { keepReady?: boolean }) => {
      if (!normalizedSlug) {
        setHeaderImages([]);
        setIsHeaderImagesReady(true);
        return;
      }

      const cached = getCachedArtistHeroHeaderImages(normalizedSlug);
      if (cached !== null) {
        setHeaderImages(cached);
        setIsHeaderImagesReady(true);
        return;
      }

      applyPublicArtistHeaderImages(normalizedSlug, setHeaderImages);

      void ensurePublicArtistsLoaded().then(() => {
        applyPublicArtistHeaderImages(normalizedSlug, setHeaderImages);
      });

      const images = await fetchArtistHeroHeaderImages(normalizedSlug);
      setHeaderImages(images);
      setIsHeaderImagesReady(true);
    },
    [normalizedSlug]
  );

  useLayoutEffect(() => {
    void loadImages();
  }, [loadImages]);

  useEffect(() => {
    const handleHeaderImagesUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ images: string[] }>;
      const newImages = customEvent.detail?.images;
      if (!Array.isArray(newImages)) return;

      const validImages = filterValidHeroHeaderImages(newImages);
      if (normalizedSlug) {
        setCachedArtistHeroHeaderImages(normalizedSlug, validImages);
      }
      setHeaderImages(validImages);
      setIsHeaderImagesReady(true);
      skipArtistUpdatedReloadRef.current = true;
    };

    const handleArtistUpdated = () => {
      if (!normalizedSlug) return;
      if (skipArtistUpdatedReloadRef.current) {
        skipArtistUpdatedReloadRef.current = false;
        return;
      }
      invalidateArtistHeroHeaderImagesCache(normalizedSlug);
      void loadImages({ keepReady: true });
    };

    window.addEventListener('header-images-updated', handleHeaderImagesUpdate);
    window.addEventListener('artist:updated', handleArtistUpdated);

    return () => {
      window.removeEventListener('header-images-updated', handleHeaderImagesUpdate);
      window.removeEventListener('artist:updated', handleArtistUpdated);
    };
  }, [loadImages, normalizedSlug]);

  return { headerImages, isHeaderImagesReady };
}
