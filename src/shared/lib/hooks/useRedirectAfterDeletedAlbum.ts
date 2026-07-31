import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useLang } from '@app/providers/lang';
import {
  clearAlbumDeletedLeavePage,
  readAlbumDeletedLeavePage,
  shouldLeaveDeletedAlbumPage,
} from '@shared/lib/albumDeletedSession';
import { buildLocalizedPublicPath } from '@shared/lib/i18n/routeLang/buildLocalizedPublicPath';
import { buildOwnArtistPagePath } from '@shared/lib/ownArtistPage';

/**
 * Скрывает «Album not found» и уводит с /albums/:id после удаления этого альбома из кабинета.
 */
export function useRedirectAfterDeletedAlbum(albumId: string, fallbackArtistSlug: string): boolean {
  const { lang } = useLang();
  const navigate = useNavigate();
  const shouldSuppress = shouldLeaveDeletedAlbumPage(albumId);

  useEffect(() => {
    if (!shouldSuppress) return;

    const payload = readAlbumDeletedLeavePage();
    const slug = payload?.artistSlug?.trim() || fallbackArtistSlug.trim();
    clearAlbumDeletedLeavePage();

    if (slug) {
      navigate(buildOwnArtistPagePath(lang, slug), { replace: true });
      return;
    }

    navigate(buildLocalizedPublicPath(lang, '/'), { replace: true });
  }, [shouldSuppress, navigate, fallbackArtistSlug, lang]);

  return shouldSuppress;
}
