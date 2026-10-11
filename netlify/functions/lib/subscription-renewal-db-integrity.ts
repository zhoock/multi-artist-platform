/**
 * PR-5 — renewal attempt DB invariants (app layer + migration 080 alignment).
 */

import {
  readRenewalSubscriptionPaymentIdFromPayload,
  readRenewalYookassaCreatePayload,
  type RenewalYookassaCreatePayload,
} from './subscription-renewal-post-payload';

export const RENEWAL_DISPATCH_PHASES = [
  'created',
  'leased',
  'provider_linked',
  'needs_review',
] as const;

export type RenewalDispatchPhase = (typeof RENEWAL_DISPATCH_PHASES)[number];

export function isRenewalDispatchPhase(value: unknown): value is RenewalDispatchPhase {
  return (
    typeof value === 'string' && (RENEWAL_DISPATCH_PHASES as readonly string[]).includes(value)
  );
}

export function expectedRenewalIdempotenceKey(subscriptionPaymentId: string): string {
  return `renewal-${subscriptionPaymentId.trim()}`;
}

export function isDispatchLeaseFieldPairCoherent(params: {
  dispatchLeaseToken: unknown;
  dispatchLeaseUntil: unknown;
}): boolean {
  const hasToken = params.dispatchLeaseToken != null;
  const hasUntil = params.dispatchLeaseUntil != null;
  return hasToken === hasUntil;
}

export type AssessRenewalFrozenPaymentProtocolResult =
  | { ok: true }
  | { ok: false; reason: 'ambiguous_needs_review'; detail: string };

/**
 * Validates frozen POST identity matches the renewal attempt row (PR-3a/PR-4/PR-5).
 * Requires embedded metadata.subscriptionPaymentId equal to subscription_payments.id.
 */
export function assessRenewalFrozenPaymentProtocol(params: {
  subscriptionPaymentId: string;
  idempotenceKey: string | null | undefined;
  payload: RenewalYookassaCreatePayload | null;
}): AssessRenewalFrozenPaymentProtocolResult {
  const subscriptionPaymentId = params.subscriptionPaymentId.trim();
  const expectedKey = expectedRenewalIdempotenceKey(subscriptionPaymentId);
  const idempotenceKey = params.idempotenceKey?.trim() ?? null;

  if (!idempotenceKey) {
    return {
      ok: false,
      reason: 'ambiguous_needs_review',
      detail: 'missing_idempotence_key',
    };
  }

  if (idempotenceKey !== expectedKey) {
    return {
      ok: false,
      reason: 'ambiguous_needs_review',
      detail: 'idempotence_key_not_bound_to_row_id',
    };
  }

  if (!params.payload) {
    return {
      ok: false,
      reason: 'ambiguous_needs_review',
      detail: 'missing_frozen_payload',
    };
  }

  const embeddedId = readRenewalSubscriptionPaymentIdFromPayload(params.payload);
  if (embeddedId == null) {
    return {
      ok: false,
      reason: 'ambiguous_needs_review',
      detail: 'missing_subscription_payment_id_in_frozen_payload',
    };
  }

  if (embeddedId !== subscriptionPaymentId) {
    return {
      ok: false,
      reason: 'ambiguous_needs_review',
      detail: 'frozen_payload_subscription_payment_id_mismatch',
    };
  }

  return { ok: true };
}

export function assessRenewalFrozenPaymentProtocolFromRaw(params: {
  subscriptionPaymentId: string;
  idempotenceKey: string | null | undefined;
  rawLastEvent: unknown;
}): AssessRenewalFrozenPaymentProtocolResult {
  const payload = readRenewalYookassaCreatePayload(params.rawLastEvent);
  return assessRenewalFrozenPaymentProtocol({
    subscriptionPaymentId: params.subscriptionPaymentId,
    idempotenceKey: params.idempotenceKey,
    payload,
  });
}

export function isPostgresUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error != null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

export type RenewalAttemptCreateConflictReason =
  | 'open_renewal_for_subscription'
  | 'idempotence_key_conflict'
  | 'unknown_unique';

export function classifyRenewalAttemptInsertUniqueViolation(
  error: unknown
): RenewalAttemptCreateConflictReason | null {
  if (!isPostgresUniqueViolation(error)) return null;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error != null && 'message' in error
        ? String((error as { message?: unknown }).message)
        : '';
  if (message.includes('idx_subscription_payments_one_open_renewal_per_subscription')) {
    return 'open_renewal_for_subscription';
  }
  if (message.includes('idx_subscription_payments_idempotence_key_unique')) {
    return 'idempotence_key_conflict';
  }
  if (message.includes('subscription_payments_provider_payment_unique')) {
    return 'unknown_unique';
  }
  return 'unknown_unique';
}
