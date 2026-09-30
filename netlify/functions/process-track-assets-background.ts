/**
 * Background audio processor for production deploys.
 *
 * Filename suffix `-background` makes Netlify return 202 immediately and keep
 * the invocation alive for the transcode (up to 15 minutes). Upload and retry
 * call this endpoint; they do not run ffmpeg inside the synchronous function.
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import { createErrorResponse, createOptionsResponse, parseJsonBody } from './lib/api-helpers';
import { runInSiteTrackProcessor } from './lib/runInSiteTrackProcessor';

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed');
  }

  const authorization = event.headers.authorization || event.headers.Authorization;
  const signature =
    event.headers['x-audio-processor-signature'] || event.headers['X-Audio-Processor-Signature'];
  const result = await runInSiteTrackProcessor({
    authorization,
    signature,
    rawBody: event.body || '',
    payload: parseJsonBody(event.body, {}),
  });

  if ('error' in result.body) {
    return createErrorResponse(result.statusCode, result.body.error);
  }

  return {
    statusCode: result.statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(result.body),
  };
};
