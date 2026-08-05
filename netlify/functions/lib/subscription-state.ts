/**
 * Premium subscription lifecycle state machine (PR-2).
 * Single place for status transitions and invariants — no DB or runtime wiring yet.
 */

import type { Subscription, SubscriptionStatus } from './subscriptions';

/** Canonical lifecycle statuses stored in subscriptions.status (ADR-001). */
export const CANONICAL_SUBSCRIPTION_STATUSES = [
  'active',
  'cancel_at_period_end',
  'past_due',
  'expired',
] as const;

export type CanonicalSubscriptionStatus = (typeof CANONICAL_SUBSCRIPTION_STATUSES)[number];

/** Absence of a subscription row. */
export type SubscriptionPresenceStatus = 'none' | CanonicalSubscriptionStatus;

/** Billing policy: max failed renewal attempts before DUNNING_EXHAUSTED (ADR-007). */
export const MAX_RENEWAL_ATTEMPTS = 4;

const HOUR_MS = 60 * 60 * 1000;

/** Grace period after first failed renewal — premium access continues (ADR-007). */
export const SUBSCRIPTION_GRACE_PERIOD_MS = 7 * 24 * HOUR_MS;

/** Retry offsets from first_failed_at after attempts 1–3 fail (ADR-007). */
export const RENEWAL_RETRY_OFFSETS_MS = [24 * HOUR_MS, 72 * HOUR_MS, 168 * HOUR_MS] as const;

/**
 * Next charge time after a failed renewal attempt.
 * @param renewalAttemptCount count after the failure (1…MAX_RENEWAL_ATTEMPTS)
 */
export function computeRenewalRetryChargeAt(
  firstFailedAt: Date,
  renewalAttemptCount: number
): Date | null {
  if (renewalAttemptCount >= MAX_RENEWAL_ATTEMPTS) return null;
  const offsetIndex = renewalAttemptCount - 1;
  if (offsetIndex < 0 || offsetIndex >= RENEWAL_RETRY_OFFSETS_MS.length) return null;
  const baseMs = firstFailedAt.getTime();
  if (Number.isNaN(baseMs)) return null;
  return new Date(baseMs + RENEWAL_RETRY_OFFSETS_MS[offsetIndex]!);
}

export const SUBSCRIPTION_EVENTS = [
  'INITIAL_PAYMENT_SUCCEEDED',
  'AUTO_RENEW_SUCCEEDED',
  'USER_DISABLE_AUTO_RENEW',
  'USER_ENABLE_AUTO_RENEW',
  'RENEWAL_FAILED',
  'RETRY_FAILED',
  'RETRY_SUCCEEDED',
  'DUNNING_EXHAUSTED',
  'PERIOD_ENDED',
  'PAYMENT_METHOD_REVOKED',
  'RESUBSCRIBE_SUCCEEDED',
  'PLAN_CHANGE_SUCCEEDED',
] as const;

export type SubscriptionEvent = (typeof SUBSCRIPTION_EVENTS)[number];

export interface SubscriptionTransitionContext {
  /** Required for USER_ENABLE_AUTO_RENEW. */
  hasPaymentMethod?: boolean;
  /** Remaining dunning attempts after the current failure (RENEWAL_FAILED / RETRY_FAILED). */
  attemptsRemaining?: number;
  /** PAYMENT_METHOD_REVOKED: true → past_due, false → expired. */
  paymentMethodRevokedWithGrace?: boolean;
}

export interface SubscriptionInvariantSnapshot {
  status: SubscriptionStatus | CanonicalSubscriptionStatus | string;
  expiresAt: Date | null;
  paymentMethodId?: string | null;
  nextChargeAt?: Date | null;
  renewalAttemptCount?: number;
  now?: Date;
}

export class InvalidSubscriptionTransitionError extends Error {
  readonly code = 'INVALID_SUBSCRIPTION_TRANSITION';

  constructor(
    public readonly from: SubscriptionPresenceStatus,
    public readonly event: SubscriptionEvent,
    message: string
  ) {
    super(message);
    this.name = 'InvalidSubscriptionTransitionError';
  }
}

export class SubscriptionInvariantError extends Error {
  readonly code = 'SUBSCRIPTION_INVARIANT_VIOLATION';

  constructor(
    public readonly invariantId: string,
    message: string
  ) {
    super(message);
    this.name = 'SubscriptionInvariantError';
  }
}

/**
 * Maps DB status (including legacy) to canonical status for reads.
 * Does not mutate stored rows.
 */
export function normalizeCanonicalStatus(
  status: SubscriptionStatus | string | null | undefined
): CanonicalSubscriptionStatus | null {
  if (!status?.trim()) return null;

  switch (status.trim()) {
    case 'active':
      return 'active';
    case 'cancel_at_period_end':
      return 'cancel_at_period_end';
    case 'past_due':
      return 'past_due';
    case 'expired':
      return 'expired';
    case 'canceled':
    case 'paused':
      return 'expired';
    case 'trial':
      return 'active';
    default:
      return null;
  }
}

export function toPresenceStatus(
  subscription: Subscription | null | undefined
): SubscriptionPresenceStatus {
  if (!subscription) return 'none';
  const canonical = normalizeCanonicalStatus(subscription.status);
  return canonical ?? 'expired';
}

/** Derived: auto-renew enabled ⇔ status === 'active' (ADR-001). */
export function deriveAutoRenewEnabled(
  status: SubscriptionStatus | CanonicalSubscriptionStatus | string | null | undefined
): boolean {
  return normalizeCanonicalStatus(status) === 'active';
}

function resolveRenewalFailedTarget(
  context: SubscriptionTransitionContext
): CanonicalSubscriptionStatus {
  if (context.hasPaymentMethod === false) {
    return 'expired';
  }
  const remaining = context.attemptsRemaining;
  if (remaining !== undefined && remaining <= 0) {
    return 'expired';
  }
  return 'past_due';
}

function resolvePaymentMethodRevokedTarget(
  context: SubscriptionTransitionContext
): CanonicalSubscriptionStatus {
  return context.paymentMethodRevokedWithGrace === false ? 'expired' : 'past_due';
}

/**
 * Returns the next canonical status for a lifecycle event.
 * Throws InvalidSubscriptionTransitionError when the transition is not allowed.
 */
export function getNextSubscriptionStatus(
  from: SubscriptionPresenceStatus,
  event: SubscriptionEvent,
  context: SubscriptionTransitionContext = {}
): CanonicalSubscriptionStatus {
  switch (event) {
    case 'INITIAL_PAYMENT_SUCCEEDED':
      if (from === 'none') return 'active';
      break;

    case 'AUTO_RENEW_SUCCEEDED':
      if (from === 'active') return 'active';
      if (from === 'past_due') return 'active';
      break;

    case 'USER_DISABLE_AUTO_RENEW':
      if (from === 'active' || from === 'past_due') return 'cancel_at_period_end';
      break;

    case 'USER_ENABLE_AUTO_RENEW':
      if (from === 'cancel_at_period_end') {
        if (context.hasPaymentMethod !== true) {
          throw new InvalidSubscriptionTransitionError(
            from,
            event,
            'USER_ENABLE_AUTO_RENEW requires hasPaymentMethod === true'
          );
        }
        return 'active';
      }
      break;

    case 'RENEWAL_FAILED':
      if (from === 'active') return resolveRenewalFailedTarget(context);
      break;

    case 'RETRY_FAILED':
      if (from === 'past_due') {
        const remaining = context.attemptsRemaining;
        if (remaining !== undefined && remaining <= 0) {
          throw new InvalidSubscriptionTransitionError(
            from,
            event,
            'RETRY_FAILED with no attempts remaining — use DUNNING_EXHAUSTED'
          );
        }
        return 'past_due';
      }
      break;

    case 'RETRY_SUCCEEDED':
      if (from === 'past_due') return 'active';
      break;

    case 'DUNNING_EXHAUSTED':
      if (from === 'past_due') return 'expired';
      break;

    case 'PERIOD_ENDED':
      if (from === 'cancel_at_period_end' || from === 'active') return 'expired';
      break;

    case 'PAYMENT_METHOD_REVOKED':
      if (from === 'active' || from === 'past_due') {
        return resolvePaymentMethodRevokedTarget(context);
      }
      break;

    case 'RESUBSCRIBE_SUCCEEDED':
      if (from === 'expired') return 'active';
      break;

    case 'PLAN_CHANGE_SUCCEEDED':
      if (from === 'active' || from === 'cancel_at_period_end' || from === 'past_due') {
        return 'active';
      }
      break;

    default:
      break;
  }

  throw new InvalidSubscriptionTransitionError(
    from,
    event,
    `Transition ${event} is not allowed from ${from}`
  );
}

export function isValidSubscriptionTransition(
  from: SubscriptionPresenceStatus,
  event: SubscriptionEvent,
  context: SubscriptionTransitionContext = {}
): boolean {
  try {
    getNextSubscriptionStatus(from, event, context);
    return true;
  } catch (error) {
    if (error instanceof InvalidSubscriptionTransitionError) return false;
    throw error;
  }
}

function parseNextChargeAtMs(nextChargeAt: Date | null | undefined): number | null {
  if (!nextChargeAt) return null;
  const ms =
    nextChargeAt instanceof Date ? nextChargeAt.getTime() : new Date(nextChargeAt).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** PM saved and next_charge_at reached — scheduler would attempt a charge. */
export function isChargeReady(
  snapshot: SubscriptionInvariantSnapshot,
  now: Date = new Date()
): boolean {
  if (!snapshot.paymentMethodId?.trim()) return false;
  const nextChargeAtMs = parseNextChargeAtMs(snapshot.nextChargeAt);
  if (nextChargeAtMs === null) return false;
  return nextChargeAtMs <= now.getTime();
}

/** Scheduler may create a charge when lifecycle status and billing preconditions hold. */
export function willScheduleCharge(
  snapshot: SubscriptionInvariantSnapshot,
  now: Date = new Date()
): boolean {
  const status = normalizeCanonicalStatus(snapshot.status);
  if (status !== 'active' && status !== 'past_due') return false;
  return isChargeReady(snapshot, now);
}

/** Renewal payment rows may only be created in these lifecycle phases (I7). */
export function canCreateRenewalPayment(
  status: SubscriptionStatus | CanonicalSubscriptionStatus | string | null | undefined
): boolean {
  const canonical = normalizeCanonicalStatus(status);
  return canonical === 'active' || canonical === 'past_due';
}

function expiresAtMs(expiresAt: Date | null, now: Date): number | null {
  if (!expiresAt) return null;
  const ms = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function hasPremiumAccessForInvariant(snapshot: SubscriptionInvariantSnapshot, now: Date): boolean {
  const status = normalizeCanonicalStatus(snapshot.status);
  if (!status || status === 'expired') return false;
  const ms = expiresAtMs(snapshot.expiresAt, now);
  if (ms === null) return false;
  return ms > now.getTime();
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Validates subscription invariants I1–I7 from the state machine spec.
 * Returns a list of violated invariant ids (empty = all pass).
 */
export function getSubscriptionInvariantViolations(
  snapshot: SubscriptionInvariantSnapshot,
  now: Date = snapshot.now ?? new Date()
): string[] {
  const violations: string[] = [];
  const status = normalizeCanonicalStatus(snapshot.status);
  if (!status) {
    violations.push('UNKNOWN_STATUS');
    return violations;
  }

  const expiresMs = expiresAtMs(snapshot.expiresAt, now);

  // I1
  if (
    (status === 'active' || status === 'cancel_at_period_end' || status === 'past_due') &&
    expiresMs === null
  ) {
    violations.push('I1');
  }

  // I2: active => next_charge_at set unless period ends within 24h
  if (status === 'active') {
    const hasNextCharge = snapshot.nextChargeAt != null;
    const periodEndsSoon =
      expiresMs !== null &&
      expiresMs > now.getTime() &&
      expiresMs - now.getTime() < TWENTY_FOUR_HOURS_MS;
    if (!hasNextCharge && !periodEndsSoon) {
      violations.push('I2');
    }
  }

  // I3
  if (status === 'cancel_at_period_end' && snapshot.nextChargeAt != null) {
    violations.push('I3');
  }

  // I4
  if (status === 'expired') {
    if (snapshot.nextChargeAt != null) violations.push('I4');
    if (hasPremiumAccessForInvariant(snapshot, now)) violations.push('I4');
  }

  // I5
  if (status === 'past_due' && (snapshot.renewalAttemptCount ?? 0) < 1) {
    violations.push('I5');
  }

  // I6: charge-ready rows must be in a scheduler-eligible lifecycle status
  if (isChargeReady(snapshot, now) && status !== 'active' && status !== 'past_due') {
    violations.push('I6');
  }

  return violations;
}

export function assertSubscriptionInvariants(
  snapshot: SubscriptionInvariantSnapshot,
  now: Date = snapshot.now ?? new Date()
): void {
  const violations = getSubscriptionInvariantViolations(snapshot, now);
  if (violations.length > 0) {
    throw new SubscriptionInvariantError(
      violations.join(','),
      `Subscription invariant violation(s): ${violations.join(', ')}`
    );
  }
}
