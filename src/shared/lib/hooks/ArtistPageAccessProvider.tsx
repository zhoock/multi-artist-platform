import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDashboardModalShell } from '@shared/lib/dashboardModalShellContext';
import { resolveArtistPageSurfaceSlug } from '@shared/lib/artistPageSurfaceSlug';
import { useArtistPageAccessState, type ArtistPageAccessValue } from './useArtistPageAccess';

type ArtistPageAccessContextValue = {
  slug: string;
  access: ArtistPageAccessValue;
};

const ArtistPageAccessContext = createContext<ArtistPageAccessContextValue | null>(null);

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

export function useSharedArtistPageAccess(slug: string): ArtistPageAccessValue | null {
  const ctx = useContext(ArtistPageAccessContext);
  const normalized = normalizeSlug(slug);
  if (!ctx || !normalized || ctx.slug !== normalized) return null;
  return ctx.access;
}

export function useArtistPageAccess(artistSlug: string): ArtistPageAccessValue {
  const shared = useSharedArtistPageAccess(artistSlug);
  const local = useArtistPageAccessState(artistSlug, { enabled: !shared });
  return shared ?? local;
}

/** Единый источник правды для `/?artist=` — Hero, Home и Footer читают одно состояние. */
export function ArtistPageAccessProvider({ children }: { children: ReactNode }) {
  const [searchParams] = useSearchParams();
  const shell = useDashboardModalShell();
  const artistSlug = resolveArtistPageSurfaceSlug(searchParams.get('artist'), shell);
  const slug = normalizeSlug(artistSlug);
  const access = useArtistPageAccessState(artistSlug, { enabled: Boolean(slug) });

  const value = useMemo(() => (slug ? { slug, access } : null), [slug, access]);

  useEffect(() => {
    document.body.classList.toggle(
      'page--artist-skeleton',
      Boolean(slug && access.showArtistPageSkeleton)
    );
    return () => document.body.classList.remove('page--artist-skeleton');
  }, [access.showArtistPageSkeleton, slug]);

  return (
    <ArtistPageAccessContext.Provider value={value}>{children}</ArtistPageAccessContext.Provider>
  );
}
