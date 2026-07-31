import { Helmet } from 'react-helmet-async';

import type { ResolvedPageSeo } from '@shared/constants/platformBranding';

type ArtistPageSeoHelmetProps = {
  seo: ResolvedPageSeo;
};

/** Overrides platform default Helmet on `/?artist=<slug>` routes. */
export function ArtistPageSeoHelmet({ seo }: ArtistPageSeoHelmetProps) {
  return (
    <Helmet>
      <title>{seo.title}</title>
      <meta name="description" content={seo.description} />
      <link rel="canonical" href={seo.canonical} />
      <meta property="og:type" content="profile" />
      <meta property="og:title" content={seo.title} />
      <meta property="og:description" content={seo.description} />
      <meta property="og:url" content={seo.canonical} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={seo.title} />
      <meta name="twitter:description" content={seo.description} />
      <meta name="twitter:url" content={seo.canonical} />
    </Helmet>
  );
}
