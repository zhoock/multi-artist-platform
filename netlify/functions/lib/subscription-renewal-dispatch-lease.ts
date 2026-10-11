/**
 * PR-3c — DB-backed dispatch lease + generation fencing for renewal attempts (migration 079).
 */

import { randomUUID } from 'node:crypto';

import { isMissingRelationError, query } from './db';

/** In-flight dispatch work (GET/POST/sync) — separate from subscriptions.next_charge_at claim lock. */
export const RENEWAL_DISPATCH_LEASE_MS = 5 * 60 * 1000;

export interface RenewalDispatchLease {
  subscriptionPaymentId: string;
  userId: string;
  token: string;
  generation: number;
  leaseUntil: Date;
}

export type AcquireRenewalDispatchLeaseResult =
  | { ok: true; lease: RenewalDispatchLease }
  | { ok: false; reason: 'not_found' | 'lease_held' | 'needs_review' | 'not_open' };

export type AttachRenewalProviderPaymentFenceResult = 'attached' | 'fence_rejected' | 'not_found';

export function createRenewalDispatchRunId(): string {
  return randomUUID();
}

export async function acquireRenewalAttemptDispatchLease(params: {
  subscriptionPaymentId: string;
  userId: string;
  runId: string;
  now?: Date;
  leaseMs?: number;
}): Promise<AcquireRenewalDispatchLeaseResult> {
  const now = params.now ?? new Date();
  const leaseMs = params.leaseMs ?? RENEWAL_DISPATCH_LEASE_MS;
  const leaseUntil = new Date(now.getTime() + leaseMs);

  try {
    const acquired = await query<{ dispatch_generation: number }>(
      `UPDATE subscription_payments
       SET dispatch_lease_token = $3::uuid,
           dispatch_lease_until = $4,
           dispatch_generation = dispatch_generation + 1,
           dispatch_phase = CASE
             WHEN dispatch_phase IS NULL OR dispatch_phase = 'created' THEN 'leased'
             ELSE dispatch_phase
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
         AND user_id = $2::uuid
         AND kind = 'renewal'
         AND status IN ('pending', 'waiting_for_capture')
         AND (dispatch_phase IS NULL OR dispatch_phase <> 'needs_review')
         AND (dispatch_lease_until IS NULL OR dispatch_lease_until < $5)
       RETURNING dispatch_generation`,
      [params.subscriptionPaymentId, params.userId, params.runId, leaseUntil, now]
    );

    const generation = acquired.rows[0]?.dispatch_generation;
    if (generation == null) {
      const existing = await query<{
        dispatch_phase: string | null;
        status: string;
        dispatch_lease_until: Date | null;
      }>(
        `SELECT dispatch_phase, status, dispatch_lease_until
         FROM subscription_payments
         WHERE id = $1::uuid AND user_id = $2::uuid AND kind = 'renewal'
         LIMIT 1`,
        [params.subscriptionPaymentId, params.userId]
      );
      const row = existing.rows[0];
      if (!row) return { ok: false, reason: 'not_found' };
      if (row.dispatch_phase === 'needs_review') return { ok: false, reason: 'needs_review' };
      if (!['pending', 'waiting_for_capture'].includes(row.status)) {
        return { ok: false, reason: 'not_open' };
      }
      return { ok: false, reason: 'lease_held' };
    }

    return {
      ok: true,
      lease: {
        subscriptionPaymentId: params.subscriptionPaymentId,
        userId: params.userId,
        token: params.runId,
        generation,
        leaseUntil,
      },
    };
  } catch (error) {
    if (isMissingRelationError(error)) return { ok: false, reason: 'not_found' };
    throw error;
  }
}

export async function releaseRenewalAttemptDispatchLease(
  lease: RenewalDispatchLease,
  now: Date = new Date()
): Promise<void> {
  try {
    await query(
      `UPDATE subscription_payments
       SET dispatch_lease_token = NULL,
           dispatch_lease_until = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
         AND user_id = $2::uuid
         AND kind = 'renewal'
         AND dispatch_lease_token = $3::uuid
         AND dispatch_generation = $4`,
      [lease.subscriptionPaymentId, lease.userId, lease.token, lease.generation]
    );
    void now;
  } catch (error) {
    if (isMissingRelationError(error)) return;
    throw error;
  }
}

export async function attachRenewalProviderPaymentIdWithFence(
  lease: RenewalDispatchLease,
  providerPaymentId: string
): Promise<AttachRenewalProviderPaymentFenceResult> {
  try {
    const updated = await query<{ id: string }>(
      `UPDATE subscription_payments
       SET provider_payment_id = $3,
           dispatch_phase = 'provider_linked',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
         AND user_id = $2::uuid
         AND kind = 'renewal'
         AND dispatch_lease_token = $4::uuid
         AND dispatch_generation = $5
       RETURNING id`,
      [lease.subscriptionPaymentId, lease.userId, providerPaymentId, lease.token, lease.generation]
    );
    if (updated.rows[0]?.id) return 'attached';

    const exists = await query<{ id: string }>(
      `SELECT id FROM subscription_payments
       WHERE id = $1::uuid AND user_id = $2::uuid AND kind = 'renewal' LIMIT 1`,
      [lease.subscriptionPaymentId, lease.userId]
    );
    return exists.rows[0]?.id ? 'fence_rejected' : 'not_found';
  } catch (error) {
    if (isMissingRelationError(error)) return 'not_found';
    throw error;
  }
}

export async function markRenewalAttemptNeedsReviewWithFence(
  lease: RenewalDispatchLease
): Promise<boolean> {
  try {
    const updated = await query<{ id: string }>(
      `UPDATE subscription_payments
       SET dispatch_phase = 'needs_review',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
         AND user_id = $2::uuid
         AND kind = 'renewal'
         AND dispatch_lease_token = $3::uuid
         AND dispatch_generation = $4
       RETURNING id`,
      [lease.subscriptionPaymentId, lease.userId, lease.token, lease.generation]
    );
    return Boolean(updated.rows[0]?.id);
  } catch (error) {
    if (isMissingRelationError(error)) return false;
    throw error;
  }
}

export type ClaimRenewalFirstPostAtWithFenceResult =
  | 'claimed'
  | 'already_started'
  | 'fence_rejected'
  | 'not_found';

/** PR-2 first_post_at marker, fenced by dispatch lease (PR-3c). */
export async function claimRenewalFirstPostAtWithFence(
  lease: RenewalDispatchLease,
  firstPostAt: Date = new Date()
): Promise<ClaimRenewalFirstPostAtWithFenceResult> {
  try {
    const claimed = await query<{ id: string }>(
      `UPDATE subscription_payments
       SET first_post_at = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
         AND user_id = $2::uuid
         AND kind = 'renewal'
         AND first_post_at IS NULL
         AND dispatch_lease_token = $4::uuid
         AND dispatch_generation = $5
       RETURNING id`,
      [lease.subscriptionPaymentId, lease.userId, firstPostAt, lease.token, lease.generation]
    );
    if (claimed.rows[0]?.id) return 'claimed';

    const existing = await query<{ first_post_at: Date | null }>(
      `SELECT first_post_at
       FROM subscription_payments
       WHERE id = $1::uuid AND user_id = $2::uuid AND kind = 'renewal'
       LIMIT 1`,
      [lease.subscriptionPaymentId, lease.userId]
    );
    const row = existing.rows[0];
    if (!row) return 'not_found';
    if (row.first_post_at != null) return 'already_started';

    const stillHolder = await query<{ id: string }>(
      `SELECT id FROM subscription_payments
       WHERE id = $1::uuid AND user_id = $2::uuid AND kind = 'renewal'
         AND dispatch_lease_token = $3::uuid AND dispatch_generation = $4
       LIMIT 1`,
      [lease.subscriptionPaymentId, lease.userId, lease.token, lease.generation]
    );
    return stillHolder.rows[0]?.id ? 'fence_rejected' : 'fence_rejected';
  } catch (error) {
    if (isMissingRelationError(error)) return 'not_found';
    throw error;
  }
}
