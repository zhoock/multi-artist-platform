import { useEffect, useState } from 'react';
import type { CoverProps } from 'models';

import AlbumCover from './AlbumCover';
import { CATALOG_COVER_TABLET_MQ, getCatalogAlbumCoverProps } from '../lib/catalogAlbumCoverProps';

type CatalogAlbumCoverProps = Omit<CoverProps, 'size' | 'densities' | 'sizes'>;

/**
 * Catalog-only wrapper: smaller srcset than default {@link AlbumCover}.
 * Grid (≥768px) caps at -448 even on Retina; mobile keeps -896 at 2x/3x.
 */
export default function CatalogAlbumCover(props: CatalogAlbumCoverProps) {
  const [isGridLayout, setIsGridLayout] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(CATALOG_COVER_TABLET_MQ).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia(CATALOG_COVER_TABLET_MQ);
    const syncLayout = () => setIsGridLayout(mediaQuery.matches);
    syncLayout();
    mediaQuery.addEventListener('change', syncLayout);
    return () => mediaQuery.removeEventListener('change', syncLayout);
  }, []);

  const coverProps = getCatalogAlbumCoverProps(isGridLayout);

  return <AlbumCover {...props} {...coverProps} imageSource="cdn" />;
}
