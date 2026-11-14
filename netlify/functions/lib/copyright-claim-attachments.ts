import crypto from 'node:crypto';

import {
  copyrightClaimAttachmentMimeFromMagic,
  copyrightClaimAttachmentMimeMatchesDeclared,
  type CopyrightClaimAttachmentMime,
} from '../../../src/shared/lib/copyright/copyrightClaimAttachmentMagic';
import { createSupabaseAdminClient, STORAGE_BUCKET_NAME } from './supabase';
import { query } from './db';

export const COPYRIGHT_CLAIM_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
export const COPYRIGHT_CLAIM_MAX_ATTACHMENTS = 10;
export const COPYRIGHT_CLAIM_UPLOAD_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

/** Pending uploads older than this are eligible for scheduled housekeeping. */
export const COPYRIGHT_CLAIM_ATTACHMENT_PENDING_CLEANUP_HOURS = 72;

/** Max stale pending rows processed per cleanup batch (and per SQL fetch). */
export const COPYRIGHT_CLAIM_ATTACHMENT_CLEANUP_BATCH_SIZE = 50;

const COPYRIGHT_CLAIM_STORAGE_PREFIX = 'copyright-claims/';

export function isCopyrightClaimAttachmentStoragePath(storagePath: string): boolean {
  const raw = storagePath.trim().replace(/^\/+/, '');
  if (!raw.startsWith(COPYRIGHT_CLAIM_STORAGE_PREFIX)) {
    return false;
  }
  if (raw.includes('..') || raw.includes('\\')) {
    return false;
  }
  return true;
}

const ALLOWED_MIMES: readonly CopyrightClaimAttachmentMime[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
];

export function isAllowedCopyrightAttachmentMime(
  mime: string
): mime is CopyrightClaimAttachmentMime {
  const normalized = mime.trim().toLowerCase();
  return (ALLOWED_MIMES as readonly string[]).includes(normalized);
}

export function hashCopyrightClaimUploadToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

export function generateCopyrightClaimUploadToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function verifyCopyrightClaimUploadToken(
  storedHash: string | null,
  expiresAt: Date | null,
  token: string
): boolean {
  if (!storedHash || !token.trim()) return false;
  if (expiresAt && expiresAt.getTime() < Date.now()) return false;
  const hash = hashCopyrightClaimUploadToken(token);
  try {
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(storedHash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function sanitizeOriginalFilename(name: string): string {
  const base = name.replace(/[/\\]/g, '').replace(/\.\./g, '').trim();
  if (!base) return 'attachment';
  return base.slice(0, 200);
}

export function buildCopyrightClaimAttachmentStoragePath(
  claimId: string,
  attachmentId: string,
  mimeType: CopyrightClaimAttachmentMime
): string {
  const ext = mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/png' ? 'png' : 'jpg';
  return `copyright-claims/${claimId}/${attachmentId}/evidence.${ext}`;
}

export interface CopyrightClaimUploadAuthRow {
  id: string;
  attachment_upload_token_hash: string | null;
  attachment_upload_expires_at: Date | null;
}

export async function fetchCopyrightClaimUploadAuth(
  claimId: string
): Promise<CopyrightClaimUploadAuthRow | null> {
  const r = await query<CopyrightClaimUploadAuthRow>(
    `SELECT id, attachment_upload_token_hash, attachment_upload_expires_at
     FROM copyright_claims WHERE id = $1::uuid`,
    [claimId],
    0
  );
  return r.rows[0] ?? null;
}

export async function assertCopyrightClaimUploadAuthorized(
  claimId: string,
  uploadToken: string
): Promise<CopyrightClaimUploadAuthRow> {
  const row = await fetchCopyrightClaimUploadAuth(claimId);
  if (!row) {
    throw Object.assign(new Error('Claim not found'), { code: 'NOT_FOUND' });
  }
  if (
    !verifyCopyrightClaimUploadToken(
      row.attachment_upload_token_hash,
      row.attachment_upload_expires_at,
      uploadToken
    )
  ) {
    throw Object.assign(new Error('Invalid upload token'), { code: 'FORBIDDEN' });
  }
  return row;
}

export async function countCopyrightClaimAttachments(claimId: string): Promise<number> {
  const r = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM copyright_claim_attachments WHERE claim_id = $1::uuid`,
    [claimId],
    0
  );
  return Number(r.rows[0]?.count ?? '0');
}

export async function verifyUploadedAttachmentContent(
  storagePath: string,
  expectedMime: CopyrightClaimAttachmentMime,
  expectedSizeBytes: number
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error('Storage unavailable');
  }

  const { data, error } = await supabase.storage.from(STORAGE_BUCKET_NAME).download(storagePath);
  if (error || !data) {
    throw Object.assign(new Error('Upload not found in storage'), { code: 'UPLOAD_MISSING' });
  }

  const buf = Buffer.from(await data.arrayBuffer());
  if (buf.length !== expectedSizeBytes) {
    throw Object.assign(new Error('Uploaded size mismatch'), { code: 'SIZE_MISMATCH' });
  }
  if (buf.length > COPYRIGHT_CLAIM_ATTACHMENT_MAX_BYTES) {
    throw Object.assign(new Error('Uploaded file too large'), { code: 'SIZE_MISMATCH' });
  }

  const head = new Uint8Array(buf.subarray(0, Math.min(16, buf.length)));
  if (!copyrightClaimAttachmentMimeMatchesDeclared(expectedMime, head)) {
    throw Object.assign(new Error('File content type mismatch'), { code: 'MIME_MISMATCH' });
  }

  const detected = copyrightClaimAttachmentMimeFromMagic(head);
  if (!detected || !isAllowedCopyrightAttachmentMime(expectedMime)) {
    throw Object.assign(new Error('Unsupported file type'), { code: 'MIME_MISMATCH' });
  }
}

export async function removeCopyrightClaimStorageObject(storagePath: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  await supabase.storage.from(STORAGE_BUCKET_NAME).remove([storagePath]);
}

export interface CopyrightClaimAttachmentMetaRow {
  id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: string;
  upload_status: string;
  created_at: Date;
  uploaded_at: Date | null;
}

export async function listCopyrightClaimAttachments(
  claimId: string
): Promise<CopyrightClaimAttachmentMetaRow[]> {
  const r = await query<CopyrightClaimAttachmentMetaRow>(
    `SELECT id, original_filename, mime_type, size_bytes::text, upload_status, created_at, uploaded_at
     FROM copyright_claim_attachments
     WHERE claim_id = $1::uuid AND upload_status = 'uploaded'
     ORDER BY created_at ASC`,
    [claimId],
    0
  );
  return r.rows;
}

export async function fetchCopyrightClaimAttachmentRow(
  claimId: string,
  attachmentId: string
): Promise<{ storage_path: string; mime_type: string; original_filename: string } | null> {
  const r = await query<{
    storage_path: string;
    mime_type: string;
    original_filename: string;
  }>(
    `SELECT storage_path, mime_type, original_filename
     FROM copyright_claim_attachments
     WHERE id = $1::uuid AND claim_id = $2::uuid AND upload_status = 'uploaded'`,
    [attachmentId, claimId],
    0
  );
  return r.rows[0] ?? null;
}

export async function createCopyrightClaimAttachmentSignedDownloadUrl(
  storagePath: string
): Promise<string> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error('Storage unavailable');
  }
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET_NAME)
    .createSignedUrl(storagePath, 60 * 15);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? 'Failed to sign download URL');
  }
  return data.signedUrl;
}
