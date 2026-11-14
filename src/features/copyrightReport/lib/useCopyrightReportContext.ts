import { useEffect, useState } from 'react';

import type { CopyrightReportContentType } from './copyrightReportParams';

export type CopyrightReportContextPayload = {
  contentType: CopyrightReportContentType;
  contentId: string;
  title: string;
  artistName: string;
  artistSlug: string;
  albumId?: string;
  albumTitle?: string;
  trackSlug?: string;
  coverImageUrl?: string | null;
};

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

type UseCopyrightReportContextOptions = {
  enabled: boolean;
  contentType: CopyrightReportContentType | null;
  contentId: string;
  artistSlug: string;
  coverImageUrlOverride?: string | null;
  errorFallback: string;
  notFoundFallback: string;
  genericFallback: string;
};

export function useCopyrightReportContext({
  enabled,
  contentType,
  contentId,
  artistSlug,
  coverImageUrlOverride,
  errorFallback,
  notFoundFallback,
  genericFallback,
}: UseCopyrightReportContextOptions) {
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [context, setContext] = useState<CopyrightReportContextPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoadState('idle');
      setContext(null);
      setLoadError(null);
      return;
    }

    if (!contentType || !contentId || !artistSlug) {
      setLoadState('error');
      setLoadError(errorFallback);
      setContext(null);
      return;
    }

    let cancelled = false;
    setLoadState('loading');
    setLoadError(null);

    const qs = new URLSearchParams({
      contentType,
      contentId,
      artistSlug,
    });

    void (async () => {
      try {
        const res = await fetch(`/api/copyright-claims/context?${qs.toString()}`);
        const json = (await res.json()) as {
          success?: boolean;
          data?: CopyrightReportContextPayload;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.success || !json.data) {
          setLoadState('error');
          setLoadError(json.error ?? notFoundFallback);
          setContext(null);
          return;
        }
        const coverImageUrl = coverImageUrlOverride ?? json.data.coverImageUrl ?? null;
        setContext({ ...json.data, coverImageUrl });
        setLoadState('ready');
      } catch {
        if (!cancelled) {
          setLoadState('error');
          setLoadError(genericFallback);
          setContext(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    artistSlug,
    contentId,
    contentType,
    coverImageUrlOverride,
    enabled,
    errorFallback,
    genericFallback,
    notFoundFallback,
  ]);

  return { loadState, context, loadError };
}
