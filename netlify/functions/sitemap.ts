import type { Handler, HandlerEvent } from '@netlify/functions';
import { generateSitemapXml } from '../../src/shared/lib/seo/generateSitemap';
import { resolvePublicSiteOriginFromEnv } from '../../src/shared/lib/publicSiteOrigin';
import { fetchDynamicSitemapEntries } from './lib/sitemap-data';

const SITEMAP_HEADERS = {
  'Content-Type': 'application/xml; charset=utf-8',
  'Cache-Control': 'public, max-age=3600, s-maxage=3600',
} as const;

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
    return {
      statusCode: 405,
      headers: SITEMAP_HEADERS,
      body: 'Method Not Allowed',
    };
  }

  try {
    const origin = resolvePublicSiteOriginFromEnv();
    const entries = await fetchDynamicSitemapEntries();
    const xml = generateSitemapXml(origin, entries);

    return {
      statusCode: 200,
      headers: SITEMAP_HEADERS,
      body: event.httpMethod === 'HEAD' ? '' : xml,
    };
  } catch (error) {
    console.error('❌ [sitemap] generation failed:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: 'Failed to generate sitemap',
    };
  }
};
