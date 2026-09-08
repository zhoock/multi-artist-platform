import { Helmet } from 'react-helmet-async';

export const NOINDEX_ROBOTS_META_CONTENT = 'noindex, nofollow';

/** Standalone Helmet for pages that need noindex without other SEO overrides. */
export function NoindexHelmet({ children }: { children?: React.ReactNode }) {
  return (
    <Helmet>
      <meta name="robots" content={NOINDEX_ROBOTS_META_CONTENT} />
      {children}
    </Helmet>
  );
}

/** Inline `<meta>` for use inside an existing `<Helmet>` (must be a native element). */
export const noindexRobotsMetaElement = (
  <meta name="robots" content={NOINDEX_ROBOTS_META_CONTENT} />
);
