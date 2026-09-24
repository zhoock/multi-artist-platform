import { serializeJsonLd } from './serializeJsonLd';

type JsonLdPayload = Record<string, unknown> | Record<string, unknown>[];

/**
 * Text for `<script type="application/ld+json">` inside `<Helmet>`.
 * react-helmet-async requires a native `<script>` child (not a wrapper component).
 */
export function jsonLdScriptText(data: JsonLdPayload): string {
  const payload = Array.isArray(data)
    ? {
        '@context': 'https://schema.org',
        '@graph': data.map(({ '@context': _ctx, ...node }) => node),
      }
    : data;

  return serializeJsonLd(payload);
}
