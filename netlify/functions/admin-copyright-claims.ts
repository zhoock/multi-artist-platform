/**
 * GET    /api/admin/copyright-claims[?status=]
 * GET    /api/admin/copyright-claims/:id
 * PATCH  /api/admin/copyright-claims/:id
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import {
  CORS_HEADERS,
  createErrorResponse,
  createOptionsResponse,
  createSuccessResponse,
  getUserIdFromEvent,
  handleError,
  parseJsonBody,
  requireAdmin,
  unauthorizedFromAuthHeader,
} from './lib/api-helpers';
import { forbiddenAdminPanelResponse } from './lib/admin-http';
import { query } from './lib/db';
import {
  assertAllowedStatusTransition,
  fetchAuditLogForClaim,
  fetchCopyrightClaimById,
  insertCopyrightAuditEntry,
  isCopyrightClaimStatus,
  MAX_ADMIN_NOTE_CHARS,
  type CopyrightClaimStatus,
} from './lib/copyright-claims-admin';
import type { CopyrightContentType } from './lib/copyright-claims';
import {
  applyCopyrightAlbumTemporaryHide,
  restoreCopyrightAlbumAfterReview,
  resolveTargetAlbumForCopyrightClaim,
} from './lib/copyright-claims-album-hide';

interface ClaimListRow {
  id: string;
  content_type: string;
  content_id: string;
  claimant_name: string;
  created_at: Date;
  status: string;
  content_title: string | null;
  artist_display: string | null;
}

interface ClaimDetailRow {
  id: string;
  content_type: string;
  content_id: string;
  claimant_name: string;
  claimant_email: string;
  claimant_type: string;
  description: string;
  status: string;
  admin_note: string | null;
  created_at: Date;
  content_title: string | null;
  artist_display: string | null;
  artist_slug: string | null;
  album_slug: string | null;
  track_slug: string | null;
  album_copyright_restricted: boolean | null;
}

const CLAIM_DETAIL_SELECT = `
         c.id,
         c.content_type,
         c.content_id,
         c.claimant_name,
         c.claimant_email,
         c.claimant_type,
         c.description,
         c.status,
         c.admin_note,
         c.created_at,
         CASE c.content_type
           WHEN 'album' THEN (
             SELECT COALESCE(NULLIF(TRIM(a.full_name), ''), a.album)
             FROM albums a
             WHERE a.album_id = c.content_id
             ORDER BY (a.lang = 'en') DESC NULLS LAST, a.lang ASC
             LIMIT 1
           )
           WHEN 'track' THEN (
             SELECT t.title FROM tracks t WHERE t.id::text = c.content_id LIMIT 1
           )
         END AS content_title,
         CASE c.content_type
           WHEN 'album' THEN (
             SELECT COALESCE(NULLIF(TRIM(u.site_name), ''), u.name, '')
             FROM albums a
             INNER JOIN users u ON u.id = a.user_id
             WHERE a.album_id = c.content_id
             ORDER BY (a.lang = 'en') DESC NULLS LAST, a.lang ASC
             LIMIT 1
           )
           WHEN 'track' THEN (
             SELECT COALESCE(NULLIF(TRIM(u.site_name), ''), u.name, '')
             FROM tracks t
             INNER JOIN albums a ON a.id = t.album_id
             INNER JOIN users u ON u.id = a.user_id
             WHERE t.id::text = c.content_id
             LIMIT 1
           )
         END AS artist_display,
         CASE c.content_type
           WHEN 'album' THEN (
             SELECT u.public_slug
             FROM albums a
             INNER JOIN users u ON u.id = a.user_id
             WHERE a.album_id = c.content_id
             ORDER BY (a.lang = 'en') DESC NULLS LAST, a.lang ASC
             LIMIT 1
           )
           WHEN 'track' THEN (
             SELECT u.public_slug
             FROM tracks t
             INNER JOIN albums a ON a.id = t.album_id
             INNER JOIN users u ON u.id = a.user_id
             WHERE t.id::text = c.content_id
             LIMIT 1
           )
         END AS artist_slug,
         CASE c.content_type
           WHEN 'album' THEN c.content_id
           WHEN 'track' THEN (
             SELECT a.album_id FROM tracks t INNER JOIN albums a ON a.id = t.album_id WHERE t.id::text = c.content_id LIMIT 1
           )
         END AS album_slug,
         CASE c.content_type
           WHEN 'track' THEN (SELECT t.track_id FROM tracks t WHERE t.id::text = c.content_id LIMIT 1)
           ELSE NULL
         END AS track_slug,
         CASE c.content_type
           WHEN 'album' THEN (
             SELECT COALESCE(bool_or(COALESCE(a.copyright_restricted, false)), false)
             FROM albums a
             WHERE a.album_id = c.content_id
           )
           WHEN 'track' THEN (
             SELECT COALESCE(bool_or(COALESCE(a.copyright_restricted, false)), false)
             FROM tracks t
             INNER JOIN albums a ON a.id = t.album_id
             WHERE t.id::text = c.content_id
           )
           ELSE false
         END AS album_copyright_restricted`;

const LIST_SELECT = `
           c.id,
           c.content_type,
           c.content_id,
           c.claimant_name,
           c.created_at,
           c.status,
           CASE c.content_type
             WHEN 'album' THEN (
               SELECT COALESCE(NULLIF(TRIM(a.full_name), ''), a.album)
               FROM albums a
               WHERE a.album_id = c.content_id
               ORDER BY (a.lang = 'en') DESC NULLS LAST, a.lang ASC
               LIMIT 1
             )
             WHEN 'track' THEN (
               SELECT t.title FROM tracks t WHERE t.id::text = c.content_id LIMIT 1
             )
           END AS content_title,
           CASE c.content_type
             WHEN 'album' THEN (
               SELECT COALESCE(NULLIF(TRIM(u.site_name), ''), u.name, '')
               FROM albums a
               INNER JOIN users u ON u.id = a.user_id
               WHERE a.album_id = c.content_id
               ORDER BY (a.lang = 'en') DESC NULLS LAST, a.lang ASC
               LIMIT 1
             )
             WHEN 'track' THEN (
               SELECT COALESCE(NULLIF(TRIM(u.site_name), ''), u.name, '')
               FROM tracks t
               INNER JOIN albums a ON a.id = t.album_id
               INNER JOIN users u ON u.id = a.user_id
               WHERE t.id::text = c.content_id
               LIMIT 1
             )
           END AS artist_display`;

function normalizeAdminPath(event: HandlerEvent): string {
  const raw = event.path || '';
  let p = '/';
  const fnIdx = raw.indexOf('/.netlify/functions/admin-copyright-claims');
  if (fnIdx >= 0) {
    p = raw.slice(fnIdx + '/.netlify/functions/admin-copyright-claims'.length) || '/';
  } else {
    p = raw.replace(/^\/api\/admin\/copyright-claims/, '') || '/';
  }
  if (!p.startsWith('/')) p = `/${p}`;
  return p;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

function parseListStatusFilter(event: HandlerEvent): CopyrightClaimStatus | 'all' | null {
  const raw = (event.queryStringParameters?.status ?? '').trim().toLowerCase();
  if (!raw || raw === 'all') return 'all';
  if (isCopyrightClaimStatus(raw)) return raw;
  return null;
}

const PATCH_ALLOWED = new Set(['status', 'adminNote', 'action']);

interface PatchBody {
  status?: string;
  adminNote?: string;
  action?: string;
}

async function loadClaimDetailRow(id: string): Promise<ClaimDetailRow | null> {
  const detail = await query<ClaimDetailRow>(
    `SELECT ${CLAIM_DETAIL_SELECT}
     FROM copyright_claims c
     WHERE c.id = $1::uuid`,
    [id],
    0
  );
  return detail.rows[0] ?? null;
}

async function respondClaimDetail(id: string) {
  const r = await loadClaimDetailRow(id);
  if (!r) {
    return createErrorResponse(404, 'Not found', CORS_HEADERS);
  }
  const auditRows = await fetchAuditLogForClaim(id);
  const activity = auditRows.map((row) => ({
    id: row.id,
    action: row.action,
    details: row.details,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    adminUserId: row.admin_user_id,
  }));
  return createSuccessResponse({ claim: mapClaimDetail(r), activity });
}

const CLAIM_PATCH_ACTIONS = {
  temporarilyHideAlbum: 'temporarilyHideAlbum',
  restoreAlbumPublication: 'restoreAlbumPublication',
} as const;

type ClaimPatchAction = (typeof CLAIM_PATCH_ACTIONS)[keyof typeof CLAIM_PATCH_ACTIONS];

function isClaimPatchAction(s: string): s is ClaimPatchAction {
  return (Object.values(CLAIM_PATCH_ACTIONS) as string[]).includes(s);
}

function mapClaimDetail(r: ClaimDetailRow) {
  return {
    id: r.id,
    contentType: r.content_type,
    contentId: r.content_id,
    contentTitle: r.content_title ?? '',
    artistDisplay: r.artist_display ?? '',
    claimantName: r.claimant_name,
    claimantEmail: r.claimant_email,
    claimantType: r.claimant_type,
    description: r.description,
    status: r.status,
    adminNote: r.admin_note ?? '',
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    artistSlug: r.artist_slug,
    albumSlug: r.album_slug,
    trackSlug: r.track_slug,
    albumCopyrightRestricted: r.album_copyright_restricted === true,
  };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  const adminId = await requireAdmin(event);
  if (!adminId) {
    return getUserIdFromEvent(event)
      ? forbiddenAdminPanelResponse(event)
      : unauthorizedFromAuthHeader(event);
  }

  const path = normalizeAdminPath(event);

  if (event.httpMethod === 'GET') {
    return handleGet(event, path);
  }
  if (event.httpMethod === 'PATCH') {
    return handlePatch(event, path, adminId);
  }

  return createErrorResponse(405, 'Method not allowed', CORS_HEADERS);
};

async function handleGet(event: HandlerEvent, path: string) {
  try {
    if (path === '/' || path === '') {
      const filter = parseListStatusFilter(event);
      if (filter === null) {
        return createErrorResponse(400, 'Invalid status filter', CORS_HEADERS, {
          code: 'VALIDATION_ERROR',
        });
      }

      const where = filter === 'all' ? '' : `WHERE c.status = $1`;
      const params = filter === 'all' ? [] : [filter];

      const result = await query<ClaimListRow>(
        `SELECT ${LIST_SELECT}
         FROM copyright_claims c
         ${where}
         ORDER BY c.created_at DESC`,
        params,
        0
      );

      const rows = result.rows.map((r) => ({
        id: r.id,
        contentType: r.content_type,
        contentId: r.content_id,
        contentTitle: r.content_title ?? '',
        artistDisplay: r.artist_display ?? '',
        claimantName: r.claimant_name,
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        status: r.status,
      }));

      const newCount = rows.filter((r) => r.status === 'new').length;
      return createSuccessResponse({ claims: rows, total: rows.length, totalNew: newCount });
    }

    const id = path.replace(/^\//, '').trim();
    if (!isUuid(id)) {
      return createErrorResponse(404, 'Not found', CORS_HEADERS);
    }

    const detail = await query<ClaimDetailRow>(
      `SELECT ${CLAIM_DETAIL_SELECT}
       FROM copyright_claims c
       WHERE c.id = $1::uuid`,
      [id],
      0
    );

    if (detail.rows.length === 0) {
      return createErrorResponse(404, 'Not found', CORS_HEADERS);
    }

    const r = detail.rows[0];
    const auditRows = await fetchAuditLogForClaim(id);
    const activity = auditRows.map((row) => ({
      id: row.id,
      action: row.action,
      details: row.details,
      createdAt:
        row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      adminUserId: row.admin_user_id,
    }));

    return createSuccessResponse({
      claim: mapClaimDetail(r),
      activity,
    });
  } catch (error) {
    return handleError(error, 'admin-copyright-claims', 'Server error');
  }
}

async function handlePatch(event: HandlerEvent, path: string, adminId: string) {
  const id = path.replace(/^\//, '').trim();
  if (!isUuid(id)) {
    return createErrorResponse(404, 'Not found', CORS_HEADERS);
  }

  let body: Record<string, unknown>;
  try {
    body = parseJsonBody<Record<string, unknown>>(event.body, {});
  } catch {
    return createErrorResponse(400, 'Invalid JSON body', CORS_HEADERS, { code: 'INVALID_JSON' });
  }

  for (const k of Object.keys(body)) {
    if (!PATCH_ALLOWED.has(k)) {
      return createErrorResponse(400, `Unknown field: ${k}`, CORS_HEADERS, {
        code: 'UNKNOWN_FIELD',
      });
    }
  }

  const patch = body as PatchBody;
  const hasStatus = patch.status !== undefined;
  const hasNote = patch.adminNote !== undefined;
  const rawAction = patch.action;
  const hasAction = rawAction !== undefined;

  if (!hasStatus && !hasNote && !hasAction) {
    return createErrorResponse(400, 'No changes', CORS_HEADERS, { code: 'VALIDATION_ERROR' });
  }

  if (hasAction && (hasStatus || hasNote)) {
    return createErrorResponse(
      400,
      'action cannot be combined with status or adminNote',
      CORS_HEADERS,
      {
        code: 'VALIDATION_ERROR',
      }
    );
  }

  if (hasAction && typeof rawAction !== 'string') {
    return createErrorResponse(400, 'Invalid action', CORS_HEADERS, { code: 'VALIDATION_ERROR' });
  }

  const actionNorm = hasAction ? rawAction.trim() : '';
  if (hasAction && !isClaimPatchAction(actionNorm)) {
    return createErrorResponse(400, 'Invalid action', CORS_HEADERS, { code: 'VALIDATION_ERROR' });
  }

  if (hasStatus && typeof patch.status !== 'string') {
    return createErrorResponse(400, 'Invalid status', CORS_HEADERS, { code: 'VALIDATION_ERROR' });
  }
  if (hasNote && typeof patch.adminNote !== 'string') {
    return createErrorResponse(400, 'Invalid adminNote', CORS_HEADERS, {
      code: 'VALIDATION_ERROR',
    });
  }

  const nextStatus = hasStatus ? (patch.status as string).trim().toLowerCase() : null;
  if (hasStatus && !isCopyrightClaimStatus(nextStatus!)) {
    return createErrorResponse(400, 'Invalid status', CORS_HEADERS, { code: 'VALIDATION_ERROR' });
  }

  let noteValue: string | null = null;
  if (hasNote) {
    const trimmed = patch.adminNote!.trim();
    if (trimmed.length > MAX_ADMIN_NOTE_CHARS) {
      return createErrorResponse(400, 'adminNote too long', CORS_HEADERS, {
        code: 'VALIDATION_ERROR',
      });
    }
    noteValue = trimmed.length === 0 ? null : trimmed;
  }

  try {
    const row = await fetchCopyrightClaimById(id);
    if (!row) {
      return createErrorResponse(404, 'Not found', CORS_HEADERS);
    }

    const fromStatus = row.status;
    const prevNote = row.admin_note;

    if (hasAction && !hasStatus && !hasNote) {
      if (fromStatus === 'resolved' || fromStatus === 'rejected') {
        return createErrorResponse(400, 'Claim is closed', CORS_HEADERS, { code: 'CLAIM_CLOSED' });
      }

      const claimRow = await loadClaimDetailRow(id);
      if (!claimRow) {
        return createErrorResponse(404, 'Not found', CORS_HEADERS);
      }
      const albumTarget = await resolveTargetAlbumForCopyrightClaim({
        contentType: claimRow.content_type as CopyrightContentType,
        contentId: claimRow.content_id,
      });
      if (!albumTarget) {
        return createErrorResponse(400, 'Target album not found', CORS_HEADERS, {
          code: 'CONTENT_NOT_FOUND',
        });
      }

      if (actionNorm === CLAIM_PATCH_ACTIONS.temporarilyHideAlbum) {
        if (fromStatus !== 'new' && fromStatus !== 'under_review') {
          return createErrorResponse(400, 'Invalid claim status for this action', CORS_HEADERS, {
            code: 'INVALID_ACTION_FOR_STATUS',
          });
        }
        const hide = await applyCopyrightAlbumTemporaryHide(
          albumTarget.albumSlugId,
          albumTarget.userId
        );
        if (!hide.ok) {
          const codeMap: Record<string, string> = {
            CONTENT_NOT_FOUND: 'CONTENT_NOT_FOUND',
            ALREADY_RESTRICTED: 'ALREADY_RESTRICTED',
          };
          return createErrorResponse(
            400,
            hide.code === 'ALREADY_RESTRICTED'
              ? 'Album already temporarily hidden'
              : 'Target album not found',
            CORS_HEADERS,
            { code: codeMap[hide.code] ?? 'CONTENT_NOT_FOUND' }
          );
        }
        await insertCopyrightAuditEntry({
          adminUserId: adminId,
          action: 'claim_album_copyright_restricted',
          claimId: id,
          details: {
            albumSlug: albumTarget.albumSlugId,
            updatedLocales: hide.updatedRowCount,
          },
        });
        return respondClaimDetail(id);
      }

      if (actionNorm === CLAIM_PATCH_ACTIONS.restoreAlbumPublication) {
        if (fromStatus !== 'under_review') {
          return createErrorResponse(400, 'Invalid claim status for this action', CORS_HEADERS, {
            code: 'INVALID_ACTION_FOR_STATUS',
          });
        }
        const restore = await restoreCopyrightAlbumAfterReview(
          albumTarget.albumSlugId,
          albumTarget.userId
        );
        if (!restore.ok) {
          const msg =
            restore.code === 'NOT_RESTRICTED'
              ? 'Album is not under copyright restriction'
              : 'Target album not found';
          const errCode =
            restore.code === 'NOT_RESTRICTED' ? 'NOT_RESTRICTED' : 'CONTENT_NOT_FOUND';
          return createErrorResponse(400, msg, CORS_HEADERS, { code: errCode });
        }
        await insertCopyrightAuditEntry({
          adminUserId: adminId,
          action: 'claim_album_copyright_released',
          claimId: id,
          details: {
            albumSlug: albumTarget.albumSlugId,
            updatedLocales: restore.updatedRowCount,
          },
        });
        return respondClaimDetail(id);
      }
    }

    if (hasStatus && nextStatus) {
      if (nextStatus === fromStatus) {
        return createErrorResponse(400, 'Status unchanged', CORS_HEADERS, {
          code: 'VALIDATION_ERROR',
        });
      }
      assertAllowedStatusTransition(fromStatus, nextStatus as CopyrightClaimStatus);
    }

    if (hasNote) {
      const same =
        (prevNote == null && noteValue == null) ||
        (prevNote != null && noteValue != null && prevNote === noteValue);
      if (same && !hasStatus && !hasAction) {
        return createErrorResponse(400, 'Note unchanged', CORS_HEADERS, {
          code: 'VALIDATION_ERROR',
        });
      }
    }

    const newStatus = hasStatus ? (nextStatus as CopyrightClaimStatus) : fromStatus;
    const newNote = hasNote ? noteValue : prevNote;

    await query(
      `UPDATE copyright_claims
       SET status = $2::text, admin_note = $3
       WHERE id = $1::uuid`,
      [id, newStatus, newNote],
      0
    );

    if (hasStatus && nextStatus && nextStatus !== fromStatus) {
      await insertCopyrightAuditEntry({
        adminUserId: adminId,
        action: 'claim_status_changed',
        claimId: id,
        details: { from: fromStatus, to: nextStatus },
      });
    }

    if (hasNote) {
      const noteChanged =
        (prevNote ?? null) !== (noteValue ?? null) &&
        !((prevNote == null || prevNote === '') && (noteValue == null || noteValue === ''));
      if (noteChanged) {
        await insertCopyrightAuditEntry({
          adminUserId: adminId,
          action: 'claim_note_updated',
          claimId: id,
          details: { previousLength: prevNote?.length ?? 0, newLength: noteValue?.length ?? 0 },
        });
      }
    }

    return respondClaimDetail(id);
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code;
    if (code === 'INVALID_TRANSITION') {
      return createErrorResponse(400, (error as Error).message, CORS_HEADERS, {
        code: 'INVALID_TRANSITION',
      });
    }
    return handleError(error, 'admin-copyright-claims-patch', 'Server error');
  }
}
