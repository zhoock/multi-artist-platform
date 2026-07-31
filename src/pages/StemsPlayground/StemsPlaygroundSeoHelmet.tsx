import { Helmet } from 'react-helmet-async';

import type { PublicPageHreflangUrls } from '@shared/lib/seo/buildPublicPageHreflangUrls';
import { publicPageHreflangLinks } from '@shared/lib/seo/PublicPageHreflangLinks';

type StemsPlaygroundSeoHelmetProps = {
  title: string;
  description: string;
  canonical: string;
  hreflang: PublicPageHreflangUrls;
};

/** Full public SEO set for stems — one canonical for link, og:url, and twitter:url. */
export function StemsPlaygroundSeoHelmet({
  title,
  description,
  canonical,
  hreflang,
}: StemsPlaygroundSeoHelmetProps) {
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      {publicPageHreflangLinks(hreflang)}
      <meta property="og:type" content="website" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:url" content={canonical} />
    </Helmet>
  );
}
