import { useEffect, useMemo, useState } from 'react';

import { loadTheBandFromDatabase } from '@entities/user/lib';
import {
  buildArtistPageCanonicalPath,
  buildArtistPageSeo,
  type ResolvedPageSeo,
} from '@shared/constants/platformBranding';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';
import { buildPublicSiteUrl } from '@shared/lib/publicSiteOrigin';

export type UseArtistPageSeoOptions = {
  lang: string;
  artistSlug: string;
  enabled: boolean;
  forcePlatformFallback?: boolean;
};

export function useArtistPageSeo({
  lang,
  artistSlug,
  enabled,
  forcePlatformFallback = false,
}: UseArtistPageSeoOptions): ResolvedPageSeo {
  const normalizedSlug = artistSlug.trim();
  const { displayName } = useSiteArtistDisplayName(lang, {
    artistSlug: enabled && normalizedSlug ? normalizedSlug : null,
  });
  const [aboutText, setAboutText] = useState<string | null>(null);
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
      return undefined;
    }

    let cancelled = false;

    void loadTheBandFromDatabase(lang, {
      artistSlugOverride: normalizedSlug,
      includeArtist: true,
    }).then((paragraphs) => {
      if (cancelled) return;
      const first =
        paragraphs
          ?.find((paragraph) => typeof paragraph === 'string' && paragraph.trim())
          ?.trim() ?? null;
      setAboutText(first);
    });

    return () => {
      cancelled = true;
    };
  }, [aboutRefreshToken, enabled, forcePlatformFallback, lang, normalizedSlug]);

  const canonicalUrl = buildPublicSiteUrl(buildArtistPageCanonicalPath(normalizedSlug));

  return useMemo(
    () =>
      buildArtistPageSeo(
        {
          lang,
          artistSlug: normalizedSlug,
          artistName: displayName,
          aboutText,
          forcePlatformFallback,
        },
        canonicalUrl
      ),
    [aboutText, canonicalUrl, displayName, forcePlatformFallback, lang, normalizedSlug]
  );
}
