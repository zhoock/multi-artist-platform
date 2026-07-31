import type { PublicPageHreflangUrls } from './buildPublicPageHreflangUrls';

/** Native `<link rel="alternate">` nodes — use as `{publicPageHreflangLinks(hreflang)}` inside `<Helmet>`. */
export function publicPageHreflangLinks(hreflang: PublicPageHreflangUrls) {
  return (
    <>
      <link rel="alternate" href={hreflang.ru} hrefLang="ru" />
      <link rel="alternate" href={hreflang.en} hrefLang="en" />
      <link rel="alternate" href={hreflang.xDefault} hrefLang="x-default" />
    </>
  );
}

type PublicPageHreflangLinksProps = {
  hreflang: PublicPageHreflangUrls;
};

/** For use outside `<Helmet>` only. Inside Helmet use `{publicPageHreflangLinks(hreflang)}`. */
export function PublicPageHreflangLinks({ hreflang }: PublicPageHreflangLinksProps) {
  return publicPageHreflangLinks(hreflang);
}
