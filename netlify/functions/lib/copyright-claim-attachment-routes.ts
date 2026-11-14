import crypto from 'node:crypto';
import type { HandlerEvent } from '@netlify/functions';

import {
  CORS_HEADERS,
  createErrorResponse,
  createSuccessResponse,
  handleError,
  parseJsonBody,
} from './api-helpers';
import {
  assertCopyrightClaimUploadAuthorized,
  buildCopyrightClaimAttachmentStoragePath,
  countCopyrightClaimAttachments,
  COPYRIGHT_CLAIM_ATTACHMENT_MAX_BYTES,
  COPYRIGHT_CLAIM_MAX_ATTACHMENTS,
  isAllowedCopyrightAttachmentMime,
  removeCopyrightClaimStorageObject,
  sanitizeOriginalFilename,
  verifyUploadedAttachmentContent,
  type CopyrightClaimAttachmentMime,
} from './copyright-claim-attachments';
import { createSupabaseAdminClient, STORAGE_BUCKET_NAME } from './supabase';
import { query } from './db';
import { enforceIpRateLimit } from './ip-rate-limit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

export function normalizeCopyrightClaimsPath(event: HandlerEvent): string {
  const raw = event.path || '';
  let p = raw.replace(/\/\.netlify\/functions\/copyright-claims/g, '') || '/';
  p = p.replace(/^\/api\/copyright-claims/g, '') || '/';
  if (!p.startsWith('/')) p = `/${p}`;
  return p;
}

interface PresignBody {
  uploadToken?: string;
  originalFilename?: string;
  mimeType?: string;
  sizeBytes?: number;
}

interface CompleteBody {
  uploadToken?: string;
}

export async function handleCopyrightClaimAttachmentRoute(
  event: HandlerEvent,
  path: string
): Promise<{ statusCode: number; headers: Record<string, string>; body: string } | null> {
  const presignMatch = path.match(/^\/([^/]+)\/attachments\/presign\/?$/i);
  if (presignMatch && event.httpMethod === 'POST') {
    return handlePresign(event, presignMatch[1]);
  }

  const completeMatch = path.match(/^\/([^/]+)\/attachments\/([^/]+)\/complete\/?$/i);
  if (completeMatch && event.httpMethod === 'POST') {
    return handleComplete(event, completeMatch[1], completeMatch[2]);
  }

  return null;
}

async function handlePresign(event: HandlerEvent, claimIdRaw: string) {
  if (!isUuid(claimIdRaw)) {
    return createErrorResponse(400, 'Invalid claim id', CORS_HEADERS, { code: 'VALIDATION_ERROR' });
  }

  const rateLimited = await enforceIpRateLimit(event, {
    bucketKey: 'copyright_claim_attachment_presign',
    limit: 60,
  });
  if (rateLimited) return rateLimited;

  let body: PresignBody;
  try {
    body = parseJsonBody<PresignBody>(event.body, {});
  } catch {
    return createErrorResponse(400, 'Invalid JSON body', CORS_HEADERS, { code: 'INVALID_JSON' });
  }

  const uploadToken = typeof body.uploadToken === 'string' ? body.uploadToken : '';
  const originalFilename =
    typeof body.originalFilename === 'string' ? body.originalFilename : 'attachment';
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim().toLowerCase() : '';
  const sizeBytes =
    typeof body.sizeBytes === 'number'
      ? body.sizeBytes
      : typeof body.sizeBytes === 'string'
        ? Number(body.sizeBytes)
        : NaN;

  if (!uploadToken) {
    return createErrorResponse(400, 'uploadToken is required', CORS_HEADERS, {
      code: 'VALIDATION_ERROR',
    });
  }
  if (!isAllowedCopyrightAttachmentMime(mimeType)) {
    return createErrorResponse(400, 'Unsupported file type', CORS_HEADERS, {
      code: 'VALIDATION_ERROR',
    });
  }
  if (
    !Number.isFinite(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > COPYRIGHT_CLAIM_ATTACHMENT_MAX_BYTES
  ) {
    return createErrorResponse(400, 'Invalid file size', CORS_HEADERS, {
      code: 'VALIDATION_ERROR',
    });
  }

  try {
    await assertCopyrightClaimUploadAuthorized(claimIdRaw, uploadToken);

    const existingCount = await countCopyrightClaimAttachments(claimIdRaw);
    if (existingCount >= COPYRIGHT_CLAIM_MAX_ATTACHMENTS) {
      return createErrorResponse(400, 'Too many attachments', CORS_HEADERS, {
        code: 'ATTACHMENT_LIMIT',
      });
    }

    const attachmentId = crypto.randomUUID();
    const storagePath = buildCopyrightClaimAttachmentStoragePath(
      claimIdRaw,
      attachmentId,
      mimeType as CopyrightClaimAttachmentMime
    );

    await query(
      `INSERT INTO copyright_claim_attachments (
         id, claim_id, storage_path, original_filename, mime_type, size_bytes, upload_status
       ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, 'pending')`,
      [
        attachmentId,
        claimIdRaw,
        storagePath,
        sanitizeOriginalFilename(originalFilename),
        mimeType,
        sizeBytes,
      ],
      0
    );

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      await query(`DELETE FROM copyright_claim_attachments WHERE id = $1::uuid`, [attachmentId], 0);
      return createErrorResponse(500, 'Storage unavailable', CORS_HEADERS);
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(STORAGE_BUCKET_NAME)
      .createSignedUploadUrl(storagePath, { upsert: true });

    if (signedUrlError || !signedUrlData?.signedUrl) {
      await query(`DELETE FROM copyright_claim_attachments WHERE id = $1::uuid`, [attachmentId], 0);
      return createErrorResponse(
        500,
        signedUrlError?.message ?? 'Failed to presign upload',
        CORS_HEADERS
      );
    }

    return createSuccessResponse({
      attachmentId,
      signedUrl: signedUrlData.signedUrl,
      storagePath,
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'NOT_FOUND') {
      return createErrorResponse(404, 'Claim not found', CORS_HEADERS, { code });
    }
    if (code === 'FORBIDDEN') {
      return createErrorResponse(403, 'Invalid upload token', CORS_HEADERS, { code });
    }
    return handleError(error, 'copyright-claim-attachments-presign', 'Failed to presign');
  }
}

async function handleComplete(event: HandlerEvent, claimIdRaw: string, attachmentIdRaw: string) {
  if (!isUuid(claimIdRaw) || !isUuid(attachmentIdRaw)) {
    return createErrorResponse(400, 'Invalid id', CORS_HEADERS, { code: 'VALIDATION_ERROR' });
  }

  const rateLimited = await enforceIpRateLimit(event, {
    bucketKey: 'copyright_claim_attachment_complete',
    limit: 60,
  });
  if (rateLimited) return rateLimited;

  let body: CompleteBody;
  try {
    body = parseJsonBody<CompleteBody>(event.body, {});
  } catch {
    return createErrorResponse(400, 'Invalid JSON body', CORS_HEADERS, { code: 'INVALID_JSON' });
  }

  const uploadToken = typeof body.uploadToken === 'string' ? body.uploadToken : '';
  if (!uploadToken) {
    return createErrorResponse(400, 'uploadToken is required', CORS_HEADERS, {
      code: 'VALIDATION_ERROR',
    });
  }

  try {
    await assertCopyrightClaimUploadAuthorized(claimIdRaw, uploadToken);

    const row = await query<{
      id: string;
      claim_id: string;
      storage_path: string;
      mime_type: string;
      size_bytes: string;
      upload_status: string;
    }>(
      `SELECT id, claim_id, storage_path, mime_type, size_bytes::text, upload_status
       FROM copyright_claim_attachments
       WHERE id = $1::uuid AND claim_id = $2::uuid`,
      [attachmentIdRaw, claimIdRaw],
      0
    );
    const att = row.rows[0];
    if (!att) {
      return createErrorResponse(404, 'Attachment not found', CORS_HEADERS, { code: 'NOT_FOUND' });
    }
    if (att.upload_status === 'uploaded') {
      return createSuccessResponse({ attachmentId: att.id, status: 'uploaded' });
    }
    if (!isAllowedCopyrightAttachmentMime(att.mime_type)) {
      return createErrorResponse(400, 'Invalid attachment mime', CORS_HEADERS);
    }

    const sizeBytes = Number(att.size_bytes);
    try {
      await verifyUploadedAttachmentContent(
        att.storage_path,
        att.mime_type as CopyrightClaimAttachmentMime,
        sizeBytes
      );
    } catch (verifyErr) {
      await query(
        `UPDATE copyright_claim_attachments SET upload_status = 'failed' WHERE id = $1::uuid`,
        [att.id],
        0
      );
      await removeCopyrightClaimStorageObject(att.storage_path);
      const code = (verifyErr as { code?: string }).code ?? 'VERIFY_FAILED';
      return createErrorResponse(400, 'Upload verification failed', CORS_HEADERS, { code });
    }

    await query(
      `UPDATE copyright_claim_attachments
       SET upload_status = 'uploaded', uploaded_at = NOW()
       WHERE id = $1::uuid`,
      [att.id],
      0
    );

    return createSuccessResponse({ attachmentId: att.id, status: 'uploaded' });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'NOT_FOUND') {
      return createErrorResponse(404, 'Claim not found', CORS_HEADERS, { code });
    }
    if (code === 'FORBIDDEN') {
      return createErrorResponse(403, 'Invalid upload token', CORS_HEADERS, { code });
    }
    return handleError(error, 'copyright-claim-attachments-complete', 'Failed to complete upload');
  }
}
