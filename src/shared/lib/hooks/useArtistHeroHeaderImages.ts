import { useCallback, useEffect, useState } from 'react';
import {
  fetchArtistHeroHeaderImages,
  filterValidHeroHeaderImages,
  invalidateArtistHeroHeaderImagesCache,
  setCachedArtistHeroHeaderImages,
} from '@shared/lib/artistHeroHeaderImages';

export function useArtistHeroHeaderImages(artistSlug: string) {
  const normalizedSlug = artistSlug.trim().toLowerCase();
  const [headerImages, setHeaderImages] = useState<string[]>([]);
  const [isHeaderImagesReady, setIsHeaderImagesReady] = useState(() => !normalizedSlug);

  const loadImages = useCallback(
    async (options?: { keepReady?: boolean }) => {
      if (!normalizedSlug) {
        setHeaderImages([]);
        setIsHeaderImagesReady(true);
        return;
      }

      if (!options?.keepReady) {
        setIsHeaderImagesReady(false);
      }

      const images = await fetchArtistHeroHeaderImages(normalizedSlug);
      setHeaderImages(images);
      setIsHeaderImagesReady(true);
    },
    [normalizedSlug]
  );

  useEffect(() => {
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
    };

    const handleArtistUpdated = () => {
      if (!normalizedSlug) return;
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
