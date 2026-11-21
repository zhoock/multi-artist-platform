import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useLang } from '@app/providers/lang';
import type { PlayerAlbumMeta } from '@features/player/model/types/playerSchema';
import { buildArtistPagePath, buildPublicAlbumPagePath } from '@shared/lib/seo/publicPagePaths';

export function usePlayerContentLinks(albumMeta: PlayerAlbumMeta | null, albumId: string | null) {
  const { lang } = useLang();
  const location = useLocation();

  const artistSlugForProfileLink = useMemo(() => {
    const fromMeta = albumMeta?.publicSlug?.trim();
    if (fromMeta) return fromMeta;
    const fromSearch = new URLSearchParams(location.search).get('artist')?.trim();
    return fromSearch || null;
  }, [albumMeta?.publicSlug, location.search]);

  const albumIdForLink = useMemo(() => {
    const fromMeta = albumMeta?.albumId?.trim();
    if (fromMeta) return fromMeta;
    const fallback = albumId?.trim();
    return fallback || null;
  }, [albumMeta?.albumId, albumId]);

  const albumPagePath = useMemo(() => {
    if (!albumIdForLink) return null;
    return buildPublicAlbumPagePath(lang, albumIdForLink, artistSlugForProfileLink ?? '');
  }, [albumIdForLink, artistSlugForProfileLink, lang]);

  const artistPagePath = useMemo(() => {
    if (!artistSlugForProfileLink) return null;
    return buildArtistPagePath(lang, artistSlugForProfileLink);
  }, [artistSlugForProfileLink, lang]);

  const albumTitle = albumMeta?.album?.trim() || albumMeta?.fullName?.trim() || '';
  const artistTitle = albumMeta?.artist?.trim() || '';

  return {
    artistSlugForProfileLink,
    albumPagePath,
    artistPagePath,
    albumTitle,
    artistTitle,
  };
}
