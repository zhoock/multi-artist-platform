/**
 * SEO-006 — anonymous document-level HTTP status gate.
 *
 * Replaces SPA catch-all: decides HTTP 200 (index.html) vs 404 (minimal HTML).
 * Does not render React or expose unpublished content.
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import { classifyDocumentRoute, isStaticAssetPath } from './lib/public-document/routes';
import { resolveDocumentAllow } from './lib/public-document/resolver';
import {
  buildDocument200Response,
  buildDocument404Response,
  getIndexHtml,
  getNotFoundHtml,
} from './lib/public-document/responses';

function readArtistQuery(event: HandlerEvent): string | null {
  const fromQuery = event.queryStringParameters?.artist;
  if (typeof fromQuery === 'string') return fromQuery;

  const raw = event.rawQuery?.trim();
  if (!raw) return null;
  return new URLSearchParams(raw).get('artist');
}

export async function resolvePublicDocumentAllow(
  pathname: string,
  artistQuery: string | null | undefined
): Promise<boolean> {
  if (isStaticAssetPath(pathname)) {
    return false;
  }

  const route = classifyDocumentRoute(pathname, artistQuery);
  return resolveDocumentAllow(route);
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: 'Method Not Allowed',
    };
  }

  try {
    const pathname = event.path?.trim() || '/';
    const allow = await resolvePublicDocumentAllow(pathname, readArtistQuery(event));
    const body = allow ? getIndexHtml() : getNotFoundHtml();
    const response = allow ? buildDocument200Response(body) : buildDocument404Response(body);

    return {
      ...response,
      body: event.httpMethod === 'HEAD' ? '' : response.body,
    };
  } catch (error) {
    console.error('[public-document]', error);
    return buildDocument200Response(event.httpMethod === 'HEAD' ? '' : getIndexHtml());
  }
};
