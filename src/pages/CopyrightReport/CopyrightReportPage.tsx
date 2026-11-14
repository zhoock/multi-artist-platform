import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useLang } from '@app/providers/lang';
import { buildPublicAlbumPagePath } from '@shared/lib/seo/publicPagePaths';
import { PageRouteLoader } from '@app/ui/InitialAppLoader';
import {
  COPYRIGHT_REPORT_OPEN_QUERY_PARAM,
  parseCopyrightReportRequestFromSearchParams,
} from '@features/copyrightReport';

/**
 * Legacy `/copyright/report` entry (user agreement URLs). Resolves content and
 * opens the fullscreen report modal on the public album page.
 */
export default function CopyrightReportPage() {
  const { lang } = useLang();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const parsed = parseCopyrightReportRequestFromSearchParams(searchParams);
    if (!parsed) {
      navigate('/', { replace: true });
      return;
    }

    const appendQuery = (path: string, params: URLSearchParams) => {
      const q = params.toString();
      if (!q) return path;
      return `${path}${path.includes('?') ? '&' : '?'}${q}`;
    };

    const openTarget = async () => {
      const next = new URLSearchParams();
      next.set(COPYRIGHT_REPORT_OPEN_QUERY_PARAM, '1');

      if (parsed.contentType === 'track') {
        next.set('contentType', 'track');
        next.set('contentId', parsed.contentId);
        next.set('artistSlug', parsed.artistSlug);
      }

      if (parsed.contentType === 'album') {
        const albumPath = buildPublicAlbumPagePath(lang, parsed.contentId, parsed.artistSlug);
        navigate(appendQuery(albumPath, next), { replace: true });
        return;
      }

      try {
        const qs = new URLSearchParams({
          contentType: parsed.contentType,
          contentId: parsed.contentId,
          artistSlug: parsed.artistSlug,
        });
        const res = await fetch(`/api/copyright-claims/context?${qs.toString()}`);
        const json = (await res.json()) as { success?: boolean; data?: { albumId?: string } };
        const albumId = json.data?.albumId;
        if (!res.ok || !json.success || !albumId) {
          navigate('/', { replace: true });
          return;
        }
        const albumPath = buildPublicAlbumPagePath(lang, albumId, parsed.artistSlug);
        navigate(appendQuery(albumPath, next), { replace: true });
      } catch {
        navigate('/', { replace: true });
      }
    };

    void openTarget();
  }, [lang, navigate, searchParams]);

  return <PageRouteLoader />;
}
