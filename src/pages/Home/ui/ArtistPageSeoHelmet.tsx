import { Helmet } from 'react-helmet-async';

import type { ResolvedPageSeo } from '@shared/constants/platformBranding';
import type { PublicPageHreflangUrls } from '@shared/lib/seo/buildPublicPageHreflangUrls';
import { buildArtistJsonLd } from '@shared/lib/seo/jsonLd/buildPublicPageJsonLd';
import { jsonLdScriptText } from '@shared/lib/seo/jsonLd/JsonLdScript';
import { publicPageHreflangLinks } from '@shared/lib/seo/PublicPageHreflangLinks';

type ArtistPageSeoHelmetProps = {
  seo: ResolvedPageSeo;
  hreflang: PublicPageHreflangUrls;
  artistEntityName?: string;
  headerImageUrl?: string | null;
};

/** Overrides platform default Helmet on `/?artist=<slug>` routes. */
export function ArtistPageSeoHelmet({
  seo,
  hreflang,
  artistEntityName,
  headerImageUrl,
}: ArtistPageSeoHelmetProps) {
  const artistName = artistEntityName?.trim() ?? '';
  const artistJsonLd =
    seo.isArtistSpecific && artistName && seo.canonical
      ? buildArtistJsonLd({
          name: artistName,
          description: seo.description,
          url: seo.canonical,
          imageUrl: headerImageUrl,
        })
      : null;

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
      {artistJsonLd ? (
        <script type="application/ld+json">{jsonLdScriptText(artistJsonLd)}</script>
      ) : null}
    </Helmet>
  );
}
