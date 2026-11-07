import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  fetchArtistHeroHeaderImages,
  filterValidHeroHeaderImages,
  getCachedArtistHeroHeaderImages,
  heroHeaderImagesSignature,
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
  if (getCachedArtistHeroHeaderImages(artistSlug) !== null) return true;
  const publicCached = getCachedPublicArtistHeaderImages(artistSlug);
  return publicCached !== null && filterValidHeroHeaderImages(publicCached).length > 0;
}

function commitHeaderImages(
  setHeaderImages: Dispatch<SetStateAction<string[]>>,
  images: string[]
): void {
  const valid = filterValidHeroHeaderImages(images);
  setHeaderImages((prev) => {
    if (heroHeaderImagesSignature(prev) === heroHeaderImagesSignature(valid)) {
      return prev;
    }
    return valid;
  });
}

function applyPublicArtistHeaderImages(
  artistSlug: string,
  setHeaderImages: Dispatch<SetStateAction<string[]>>,
  setIsHeaderImagesReady: (ready: boolean) => void
): boolean {
  const publicCached = getCachedPublicArtistHeaderImages(artistSlug);
  if (!publicCached) return false;
  const valid = filterValidHeroHeaderImages(publicCached);
  if (valid.length === 0) return false;
  commitHeaderImages(setHeaderImages, valid);
  setIsHeaderImagesReady(true);
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
        commitHeaderImages(setHeaderImages, []);
        setIsHeaderImagesReady(true);
        return;
      }

      const cached = getCachedArtistHeroHeaderImages(normalizedSlug);
      if (cached !== null) {
        commitHeaderImages(setHeaderImages, cached);
        setIsHeaderImagesReady(true);
        return;
      }

      applyPublicArtistHeaderImages(normalizedSlug, setHeaderImages, setIsHeaderImagesReady);

      void ensurePublicArtistsLoaded().then(() => {
        applyPublicArtistHeaderImages(normalizedSlug, setHeaderImages, setIsHeaderImagesReady);
      });

      const images = await fetchArtistHeroHeaderImages(normalizedSlug);
      commitHeaderImages(setHeaderImages, images);
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
      commitHeaderImages(setHeaderImages, validImages);
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
