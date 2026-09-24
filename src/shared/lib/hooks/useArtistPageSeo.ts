import { useEffect, useMemo, useState } from 'react';

import { fetchPublicArtistUserProfile } from '@shared/lib/publicArtistUserProfile';
import { buildArtistPageSeo, type ResolvedPageSeo } from '@shared/constants/platformBranding';
import type { RouteLang } from '@shared/lib/i18n/routeLang';
import { buildLocalizedPublicPath } from '@shared/lib/i18n/routeLang/buildLocalizedPublicPath';
import { buildArtistPagePath } from '@shared/lib/seo/publicPagePaths';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';
import { buildPublicSiteUrl } from '@shared/lib/publicSiteOrigin';

export type UseArtistPageSeoOptions = {
  lang: string;
  artistSlug: string;
  enabled: boolean;
  forcePlatformFallback?: boolean;
};

export type ArtistPageSeoResult = ResolvedPageSeo & {
  headerImageUrl: string | null;
  /** Public display name used for artist-specific SEO and JSON-LD. */
  artistEntityName: string;
};

export function useArtistPageSeo({
  lang,
  artistSlug,
  enabled,
  forcePlatformFallback = false,
}: UseArtistPageSeoOptions): ArtistPageSeoResult {
  const normalizedSlug = artistSlug.trim();
  const { displayName } = useSiteArtistDisplayName(lang, {
    artistSlug: enabled && normalizedSlug ? normalizedSlug : null,
  });
  const [aboutText, setAboutText] = useState<string | null>(null);
  const [headerImageUrl, setHeaderImageUrl] = useState<string | null>(null);
  const [aboutRefreshToken, setAboutRefreshToken] = useState(0);

  useEffect(() => {
    const handleArtistUpdated = () => {
      setAboutRefreshToken((token) => token + 1);
    };
    window.addEventListener('artist:updated', handleArtistUpdated);
    return () => window.removeEventListener('artist:updated', handleArtistUpdated);
  }, []);

  useEffect(() => {
    if (!enabled || !normalizedSlug || forcePlatformFallback) {
      setAboutText(null);
      setHeaderImageUrl(null);
      return undefined;
    }

    let cancelled = false;

    void fetchPublicArtistUserProfile(normalizedSlug, { lang }).then((profile) => {
      if (cancelled) return;
      if (!profile) {
        setAboutText(null);
        setHeaderImageUrl(null);
        return;
      }
      const first =
        profile.theBand
          .find((paragraph) => typeof paragraph === 'string' && paragraph.trim())
          ?.trim() ?? null;
      setAboutText(first);
      const image =
        profile.headerImages.find((url) => typeof url === 'string' && url.trim())?.trim() ?? null;
      setHeaderImageUrl(image);
    });

    return () => {
      cancelled = true;
    };
  }, [aboutRefreshToken, enabled, forcePlatformFallback, lang, normalizedSlug]);

  const routeLang = lang as RouteLang;
  const canonicalPath =
    forcePlatformFallback || !normalizedSlug
      ? buildLocalizedPublicPath(routeLang, '/')
      : buildArtistPagePath(routeLang, normalizedSlug);
  const canonicalUrl = buildPublicSiteUrl(canonicalPath);

  return useMemo(
    () => ({
      ...buildArtistPageSeo(
        {
          lang,
          artistSlug: normalizedSlug,
          artistName: displayName,
          aboutText,
          forcePlatformFallback,
        },
        canonicalUrl
      ),
      headerImageUrl,
      artistEntityName: displayName?.trim() ?? '',
    }),
    [
      aboutText,
      canonicalUrl,
      displayName,
      forcePlatformFallback,
      headerImageUrl,
      lang,
      normalizedSlug,
    ]
  );
}
