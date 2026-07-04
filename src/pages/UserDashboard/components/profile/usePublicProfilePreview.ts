import { useCallback, useEffect, useState } from 'react';
import { buildApiUrl } from '@shared/lib/artistQuery';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { getAuthHeader } from '@shared/lib/auth';
import type { SupportedLang } from '@shared/model/lang';
import { GENRE_OPTIONS } from '../modals/album/EditAlbumModal.constants';

export type PublicProfilePreviewData = {
  bandName: string | null;
  genreCode: string;
  publicSlug: string | null;
  aboutParagraphs: string[];
};

const EMPTY_PREVIEW: PublicProfilePreviewData = {
  bandName: null,
  genreCode: 'other',
  publicSlug: null,
  aboutParagraphs: [],
};

function normalizeAboutParagraphs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
}

function normalizeGenreCode(raw: unknown): string {
  const allowed = new Set(GENRE_OPTIONS.map((g) => g.code));
  const code = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return code && allowed.has(code) ? code : 'other';
}

export function usePublicProfilePreview(
  userId: string | null | undefined,
  lang: SupportedLang
): {
  data: PublicProfilePreviewData;
  isLoading: boolean;
  reload: () => Promise<void>;
} {
  const [data, setData] = useState<PublicProfilePreviewData>(EMPTY_PREVIEW);
  const [isLoading, setIsLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) {
      setData(EMPTY_PREVIEW);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetchWithAuthSession(
        buildApiUrl('/api/user-profile', { lang }, { includeArtist: false }),
        {
          cache: 'no-cache',
          headers: {
            'Cache-Control': 'no-cache',
            ...getAuthHeader(),
          },
        }
      );

      if (!response.ok) {
        setData(EMPTY_PREVIEW);
        return;
      }

      const result = (await response.json()) as {
        success?: boolean;
        data?: {
          siteName?: string | null;
          name?: string | null;
          publicSlug?: string | null;
          genreCode?: string | null;
          theBand?: unknown;
        };
      };

      if (!result.success || !result.data) {
        setData(EMPTY_PREVIEW);
        return;
      }

      const bandName = result.data.siteName?.trim() || result.data.name?.trim() || null;
      const publicSlug = result.data.publicSlug?.trim() || null;

      setData({
        bandName,
        genreCode: normalizeGenreCode(result.data.genreCode),
        publicSlug,
        aboutParagraphs: normalizeAboutParagraphs(result.data.theBand),
      });
    } catch {
      setData(EMPTY_PREVIEW);
    } finally {
      setIsLoading(false);
    }
  }, [userId, lang]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onProfileUpdated = () => {
      void reload();
    };
    window.addEventListener('profile-name-updated', onProfileUpdated);
    window.addEventListener('artist:updated', onProfileUpdated);
    return () => {
      window.removeEventListener('profile-name-updated', onProfileUpdated);
      window.removeEventListener('artist:updated', onProfileUpdated);
    };
  }, [reload]);

  return { data, isLoading, reload };
}

export function getPublicProfileGenreLabel(genreCode: string, lang: SupportedLang): string | null {
  if (genreCode === 'other') return null;
  const option = GENRE_OPTIONS.find((g) => g.code === genreCode);
  if (!option) return null;
  return option.label[lang === 'en' ? 'en' : 'ru'];
}

export function formatPublicProfileAboutText(paragraphs: string[]): string {
  return paragraphs.join('\n\n');
}
