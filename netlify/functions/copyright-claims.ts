/**
 * GET  /api/copyright-claims/context — resolved title for report form (public)
 * POST /api/copyright-claims — submit report (public)
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import {
  CORS_HEADERS,
  createErrorResponse,
  createOptionsResponse,
  createSuccessResponse,
  handleError,
  parseJsonBody,
} from './lib/api-helpers';
import { query } from './lib/db';
import {
  CLAIMANT_TYPES,
  isValidEmail,
  MAX_CLAIMANT_NAME_CHARS,
  MAX_DESCRIPTION_CHARS,
  MAX_REQUEST_BODY_BYTES,
  MIN_DESCRIPTION_CHARS,
  normalizeClaimantType,
  resolveAlbumForCopyrightReport,
  resolveTrackForCopyrightReport,
  type CopyrightClaimantType,
  type CopyrightContentType,
} from './lib/copyright-claims';
import { insertCopyrightAuditEntry } from './lib/copyright-claims-admin';
import { insertCopyrightClaimAdminNotification } from './lib/admin-notifications-db';

const ALLOWED_BODY_KEYS = new Set([
  'contentType',
  'contentId',
  'claimantName',
  'claimantEmail',
  'claimantType',
  'description',
  'artistSlug',
]);

interface Body {
  contentType?: string;
  contentId?: string;
  claimantName?: string;
  claimantEmail?: string;
  claimantType?: string;
  description?: string;
  artistSlug?: string;
}

function rejectUnknownKeys(body: Record<string, unknown>): string | null {
  for (const k of Object.keys(body)) {
    if (!ALLOWED_BODY_KEYS.has(k)) return `Unknown field: ${k}`;
  }
  return null;
}

function normalizeContentType(raw: unknown): CopyrightContentType | null {
  if (raw === 'album' || raw === 'track') return raw;
  return null;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  const path = (event.path || '').replace(/\/\.netlify\/functions\/copyright-claims/g, '');
  const isContext =
    event.httpMethod === 'GET' &&
    ((path || '').includes('/context') ||
      Boolean(
        event.queryStringParameters?.contentType || event.queryStringParameters?.content_type
      ));

  if (isContext) {
    const q = event.queryStringParameters ?? {};
    const contentType = normalizeContentType(q.contentType ?? q.content_type);
    const contentId = (q.contentId ?? q.content_id ?? '').toString().trim();
    const artistSlug = (q.artistSlug ?? q.artist_slug ?? q.artist ?? '').toString().trim();

    if (!contentType || !contentId || !artistSlug) {
      return createErrorResponse(400, 'Missing query parameters', CORS_HEADERS, {
        code: 'VALIDATION_ERROR',
      });
    }

    try {
      if (contentType === 'album') {
        const row = await resolveAlbumForCopyrightReport({ albumSlugId: contentId, artistSlug });
        if (!row) {
          return createErrorResponse(404, 'Content not found', CORS_HEADERS, { code: 'NOT_FOUND' });
        }
        return createSuccessResponse({
          contentType: 'album',
          contentId: row.album_id,
          title: row.album_title,
          artistName: row.artist_display,
          artistSlug: row.artist_slug,
        });
      }

      const row = await resolveTrackForCopyrightReport({ trackPk: contentId, artistSlug });
      if (!row) {
        return createErrorResponse(404, 'Content not found', CORS_HEADERS, { code: 'NOT_FOUND' });
      }
      return createSuccessResponse({
        contentType: 'track',
        contentId: row.track_pk,
        title: row.track_title,
        artistName: row.artist_display,
        artistSlug: row.artist_slug,
        albumId: row.album_id,
        albumTitle: row.album_title,
        trackSlug: row.track_slug,
      });
    } catch (error) {
      return handleError(error, 'copyright-claims-context', 'Failed to load content');
    }
  }

  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed', CORS_HEADERS);
  }

  const rawBody = event.body ?? '';
  const byteLen = Buffer.byteLength(rawBody, 'utf8');
  if (byteLen > MAX_REQUEST_BODY_BYTES) {
    return createErrorResponse(413, 'Request body too large', CORS_HEADERS, {
      code: 'BODY_TOO_LARGE',
    });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseJsonBody<Record<string, unknown>>(event.body, {});
  } catch {
    return createErrorResponse(400, 'Invalid JSON body', CORS_HEADERS, { code: 'INVALID_JSON' });
  }

  const badKey = rejectUnknownKeys(parsed);
  if (badKey) {
    return createErrorResponse(400, badKey, CORS_HEADERS, { code: 'UNKNOWN_FIELD' });
  }

  const body = parsed as Body;
  const contentType = normalizeContentType(body.contentType);
  const contentId = typeof body.contentId === 'string' ? body.contentId.trim() : '';
  const artistSlug = typeof body.artistSlug === 'string' ? body.artistSlug.trim() : '';
  const claimantName = typeof body.claimantName === 'string' ? body.claimantName.trim() : '';
  const claimantEmail = typeof body.claimantEmail === 'string' ? body.claimantEmail.trim() : '';
  const claimantType = normalizeClaimantType(body.claimantType);
  const description = typeof body.description === 'string' ? body.description.trim() : '';

  if (!contentType || !contentId) {
    return createErrorResponse(400, 'contentType and contentId are required', CORS_HEADERS, {
      code: 'VALIDATION_ERROR',
    });
  }
  if (!artistSlug) {
    return createErrorResponse(400, 'artistSlug is required', CORS_HEADERS, {
      code: 'VALIDATION_ERROR',
    });
  }
  if (!claimantName || claimantName.length > MAX_CLAIMANT_NAME_CHARS) {
    return createErrorResponse(400, 'Invalid claimant name', CORS_HEADERS, {
      code: 'VALIDATION_ERROR',
    });
  }
  if (!isValidEmail(claimantEmail)) {
    return createErrorResponse(400, 'Invalid email', CORS_HEADERS, { code: 'VALIDATION_ERROR' });
  }
  if (!claimantType || !CLAIMANT_TYPES.includes(claimantType)) {
    return createErrorResponse(400, 'Invalid claimant type', CORS_HEADERS, {
      code: 'VALIDATION_ERROR',
    });
  }
  if (description.length < MIN_DESCRIPTION_CHARS || description.length > MAX_DESCRIPTION_CHARS) {
    return createErrorResponse(400, 'Invalid description length', CORS_HEADERS, {
      code: 'VALIDATION_ERROR',
    });
  }

  try {
    let contentTitleForNotify = '';

    if (contentType === 'album') {
      const row = await resolveAlbumForCopyrightReport({
        albumSlugId: contentId,
        artistSlug,
      });
      if (!row) {
        return createErrorResponse(404, 'Content not found', CORS_HEADERS, { code: 'NOT_FOUND' });
      }
      contentTitleForNotify = row.album_title || contentId;
    } else {
      const row = await resolveTrackForCopyrightReport({
        trackPk: contentId,
        artistSlug,
      });
      if (!row) {
        return createErrorResponse(404, 'Content not found', CORS_HEADERS, { code: 'NOT_FOUND' });
      }
      contentTitleForNotify = row.track_title || contentId;
    }

    const insertResult = await query<{ id: string }>(
      `INSERT INTO copyright_claims (
         content_type, content_id, claimant_name, claimant_email, claimant_type, description, status
       ) VALUES ($1, $2, $3, LOWER(TRIM($4)), $5, $6, 'new')
       RETURNING id`,
      [contentType, contentId, claimantName, claimantEmail, claimantType, description],
      0
    );

    const newId = insertResult.rows[0]?.id;
    if (newId) {
      await insertCopyrightAuditEntry({
        adminUserId: null,
        action: 'claim_submitted',
        claimId: newId,
        details: { status: 'new', contentType, contentId },
      });

      try {
        await insertCopyrightClaimAdminNotification({
          claimId: newId,
          payload: { contentTitle: contentTitleForNotify },
        });
      } catch (notifyErr) {
        console.error('copyright-claims: admin notification insert failed', notifyErr);
      }
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    return handleError(error, 'copyright-claims', 'Failed to submit report');
  }
};
