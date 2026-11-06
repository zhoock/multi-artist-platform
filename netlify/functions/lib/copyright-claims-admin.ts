/**
 * Admin workflow for copyright_claims: status transitions + audit logging.
 */

import { query } from './db';

export const COPYRIGHT_CLAIM_STATUSES = ['new', 'under_review', 'resolved', 'rejected'] as const;

export type CopyrightClaimStatus = (typeof COPYRIGHT_CLAIM_STATUSES)[number];

export function isCopyrightClaimStatus(s: string): s is CopyrightClaimStatus {
  return (COPYRIGHT_CLAIM_STATUSES as readonly string[]).includes(s);
}

export const MAX_ADMIN_NOTE_CHARS = 4000;

/** Allowed status transitions (from -> to[]). */
const STATUS_TRANSITIONS: Record<CopyrightClaimStatus, CopyrightClaimStatus[]> = {
  new: ['under_review', 'rejected'],
  under_review: ['resolved', 'rejected'],
  resolved: [],
  rejected: [],
};

export function assertAllowedStatusTransition(
  from: CopyrightClaimStatus,
  to: CopyrightClaimStatus
): void {
  const allowed = STATUS_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw Object.assign(new Error(`Invalid status transition: ${from} → ${to}`), {
      code: 'INVALID_TRANSITION',
    });
  }
}

export async function insertCopyrightAuditEntry(input: {
  adminUserId: string | null;
  action:
    | 'claim_submitted'
    | 'claim_status_changed'
    | 'claim_note_updated'
    | 'claim_album_copyright_restricted'
    | 'claim_album_copyright_released';
  claimId: string;
  details: Record<string, unknown> | null;
}): Promise<void> {
  await query(
    `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, details)
     VALUES ($1::uuid, $2, $3, $4::uuid, $5::jsonb)`,
    [
      input.adminUserId,
      input.action,
      'copyright_claim',
      input.claimId,
      input.details ? JSON.stringify(input.details) : null,
    ],
    0
  );
}

export interface CopyrightClaimRow {
  id: string;
  status: CopyrightClaimStatus;
  admin_note: string | null;
}

export async function fetchCopyrightClaimById(id: string): Promise<CopyrightClaimRow | null> {
  const r = await query<CopyrightClaimRow>(
    `SELECT id, status, admin_note FROM copyright_claims WHERE id = $1::uuid`,
    [id],
    0
  );
  return r.rows[0] ?? null;
}

export interface AuditLogRow {
  id: string;
  admin_user_id: string | null;
  action: string;
  details: unknown;
  created_at: Date;
}

export async function fetchAuditLogForClaim(claimId: string): Promise<AuditLogRow[]> {
  const r = await query<AuditLogRow>(
    `SELECT id, admin_user_id, action, details, created_at
     FROM admin_audit_log
     WHERE target_type = 'copyright_claim' AND target_id = $1::uuid
     ORDER BY created_at ASC`,
    [claimId],
    0
  );
  return r.rows;
}
