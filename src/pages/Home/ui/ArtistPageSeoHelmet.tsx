import { Helmet } from 'react-helmet-async';

import type { ResolvedPageSeo } from '@shared/constants/platformBranding';
import type { PublicPageHreflangUrls } from '@shared/lib/seo/buildPublicPageHreflangUrls';
import { publicPageHreflangLinks } from '@shared/lib/seo/PublicPageHreflangLinks';

type ArtistPageSeoHelmetProps = {
  seo: ResolvedPageSeo;
  hreflang: PublicPageHreflangUrls;
};

/** Overrides platform default Helmet on `/?artist=<slug>` routes. */
export function ArtistPageSeoHelmet({ seo, hreflang }: ArtistPageSeoHelmetProps) {
  return (
    <Helmet>
      <title>{seo.title}</title>
      <meta name="description" content={seo.description} />
      <link rel="canonical" href={seo.canonical} />
      {publicPageHreflangLinks(hreflang)}
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
