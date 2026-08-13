/**
 * Rebind payment method fulfillment (PR-9).
 * Updates payment_method_id + payment_method_title only.
 * Resume-from-cancel continues via existing USER_ENABLE_AUTO_RENEW after a successful apply.
 */

import type { PoolClient } from 'pg';

import { withTransaction } from './db';
import { getMyArchiveForUser } from './archive';
import {
  ClaimSubscriptionPaymentSuccessResult,
  CLAIMABLE_SUBSCRIPTION_PAYMENT_SUCCESS_STATUSES,
  getRebindAmountRub,
  PREMIUM_SUBSCRIPTION_PRODUCT_TYPE,
  readPaymentMethodEpoch,
  readRebindOutcome,
  REBIND_OUTCOME_APPLIED,
  REBIND_OUTCOME_STALE_AFTER_UNLINK,
  updateSubscriptionPaymentStatus,
  validateRebindSubscriptionPayment,
} from './subscription-billing';
import { isSubscriptionAutoRenewEnabled } from './subscription-feature-flag';
import { devMockPaymentMethodTitle, formatPaymentMethodTitle } from './subscription-payment-method';
import type { SubscriptionProviderPayment } from './subscription-provider-payment';
import { providerPaymentKind } from './subscription-provider-payment';
import type { Subscription } from './subscriptions';
import { getViewerSubscription, mapSubscriptionRow, type SubscriptionRow } from './subscriptions';
import { derivePaymentMethodTitle } from './subscription-billing-snapshot';
import {
  devMockPaymentMethodId,
  extractSavedPaymentMethodId,
  SUBSCRIPTION_PAYMENT_KIND_REBIND,
} from './subscription-yookassa';
import { amountsEqual, metaString } from './yookassa-webhook-verify';
import {
  patchSubscriptionAutoRenew,
  SubscriptionAutoRenewPatchError,
} from './subscription-auto-renew-patch';

export interface ProcessRebindSubscriptionProviderPaymentResult {
  paymentMethodUpdated: boolean;
  alreadyApplied: boolean;
  staleAfterUnlink: boolean;
}

export interface ProcessRebindSubscriptionProviderPaymentOptions {
  devMode?: boolean;
}

export interface FulfillRebindSubscriptionPaymentResult {
  subscription: Subscription | null;
  applied: boolean;
  alreadyApplied: boolean;
  staleAfterUnlink: boolean;
}

export function isRebindSubscriptionPaymentKind(kind: string | null | undefined): boolean {
  return kind?.trim() === SUBSCRIPTION_PAYMENT_KIND_REBIND;
}

const SUBSCRIPTION_RETURNING = `
  id,
  user_id,
  status,
  plan,
  slots_limit,
  provider,
  provider_subscription_id,
  started_at,
  expires_at,
  payment_method_id,
  payment_method_title,
  next_charge_at,
  renewal_attempt_count,
  scheduled_plan,
  first_failed_at,
  payment_method_epoch,
  created_at,
  updated_at`;

function isResumeAutoRenewRebindPayment(payment: SubscriptionProviderPayment): boolean {
  return metaString(payment.metadata, 'resumeAutoRenew') === 'true';
}

function resolvePaymentMethodIdFromRebindPayment(
  payment: SubscriptionProviderPayment,
  options: ProcessRebindSubscriptionProviderPaymentOptions = {}
): string | null {
  if (!isSubscriptionAutoRenewEnabled()) return null;
  if (options.devMode) return devMockPaymentMethodId(payment.id);
  if (!payment.paymentMethod?.id) return null;
  return extractSavedPaymentMethodId({
    id: payment.id,
    payment_method: {
      id: payment.paymentMethod.id,
      saved: payment.paymentMethod.saved,
    },
  });
}

function resolvePaymentMethodTitleFromRebindPayment(
  payment: SubscriptionProviderPayment,
  options: ProcessRebindSubscriptionProviderPaymentOptions = {}
): string | null {
  if (options.devMode) return devMockPaymentMethodTitle(payment.id);
  return formatPaymentMethodTitle(payment.paymentMethod);
}

/** Unlink clears both PM and next_charge_at; stale rebind must not restore PM after that. */
export function isSubscriptionPaymentMethodUnlinked(subscription: Subscription): boolean {
  return !subscription.paymentMethodId?.trim() && subscription.nextChargeAt == null;
}

/** Stale when checkout captured an older PM generation than the current unlinked subscription. */
export function isStaleRebindByEpoch(subscription: Subscription, paymentEpoch: number): boolean {
  if (!isSubscriptionPaymentMethodUnlinked(subscription)) return false;
  const currentEpoch = subscription.paymentMethodEpoch ?? 0;
  return paymentEpoch < currentEpoch;
}

async function claimSubscriptionPaymentSuccessInTransaction(
  client: PoolClient,
  providerPaymentId: string,
  userId: string
): Promise<ClaimSubscriptionPaymentSuccessResult> {
  const claimed = await client.query<{ id: string }>(
    `UPDATE subscription_payments
     SET status = 'succeeded', updated_at = CURRENT_TIMESTAMP
     WHERE provider = 'yookassa'
       AND provider_payment_id = $1
       AND user_id = $2::uuid
       AND status = ANY($3::text[])
     RETURNING id`,
    [providerPaymentId, userId, CLAIMABLE_SUBSCRIPTION_PAYMENT_SUCCESS_STATUSES]
  );
  if (claimed.rows[0]?.id) return 'claimed';

  const existing = await client.query<{ status: string }>(
    `SELECT status
     FROM subscription_payments
     WHERE provider = 'yookassa'
       AND provider_payment_id = $1
       AND user_id = $2::uuid
     LIMIT 1`,
    [providerPaymentId, userId]
  );
  const row = existing.rows[0];
  if (!row) return 'not_found';
  if (row.status === 'succeeded') return 'already_succeeded';
  return 'rejected_terminal';
}

async function markRebindOutcomeInTransaction(
  client: PoolClient,
  paymentRowId: string,
  userId: string,
  outcome: typeof REBIND_OUTCOME_STALE_AFTER_UNLINK | typeof REBIND_OUTCOME_APPLIED,
  options: { markSucceeded?: boolean } = {}
): Promise<void> {
  const payload = JSON.stringify({ rebindOutcome: outcome });
  if (options.markSucceeded) {
    await client.query(
      `UPDATE subscription_payments
       SET status = 'succeeded',
           updated_at = CURRENT_TIMESTAMP,
           raw_last_event = COALESCE(raw_last_event, '{}'::jsonb) || $3::jsonb
       WHERE id = $1
         AND user_id = $2::uuid`,
      [paymentRowId, userId, payload]
    );
    return;
  }

  await client.query(
    `UPDATE subscription_payments
     SET raw_last_event = COALESCE(raw_last_event, '{}'::jsonb) || $3::jsonb
     WHERE id = $1
       AND user_id = $2::uuid`,
    [paymentRowId, userId, payload]
  );
}

export async function fulfillRebindSubscriptionPayment(params: {
  userId: string;
  providerPaymentId: string;
  paymentMethodId: string;
  paymentMethodTitle: string | null;
}): Promise<FulfillRebindSubscriptionPaymentResult> {
  return withTransaction(async (client) => {
    const paymentResult = await client.query<{
      id: string;
      status: string;
      raw_last_event: unknown;
    }>(
      `SELECT id, status, raw_last_event
       FROM subscription_payments
       WHERE provider = 'yookassa'
         AND provider_payment_id = $1
         AND user_id = $2::uuid
       FOR UPDATE`,
      [params.providerPaymentId, params.userId]
    );
    const paymentRow = paymentResult.rows[0];
    if (!paymentRow) {
      throw Object.assign(new Error('Subscription payment not found'), { statusCode: 404 });
    }

    const subscriptionResult = await client.query<SubscriptionRow>(
      `SELECT ${SUBSCRIPTION_RETURNING.replace(/\n\s+/g, ' ')}
       FROM subscriptions
       WHERE user_id = $1::uuid
       FOR UPDATE`,
      [params.userId]
    );
    const subscriptionRow = subscriptionResult.rows[0];
    if (!subscriptionRow) {
      throw Object.assign(new Error('Subscription not found'), { statusCode: 404 });
    }

    const subscription = mapSubscriptionRow(subscriptionRow);
    const existingOutcome = readRebindOutcome(paymentRow.raw_last_event);

    if (existingOutcome === REBIND_OUTCOME_STALE_AFTER_UNLINK) {
      return {
        subscription,
        applied: false,
        alreadyApplied: false,
        staleAfterUnlink: true,
      };
    }

    if (existingOutcome === REBIND_OUTCOME_APPLIED) {
      const pmApplied = Boolean(subscription.paymentMethodId?.trim());
      return {
        subscription,
        applied: false,
        alreadyApplied: pmApplied,
        staleAfterUnlink: false,
      };
    }

    const paymentEpoch = readPaymentMethodEpoch(paymentRow.raw_last_event);
    if (isStaleRebindByEpoch(subscription, paymentEpoch)) {
      await markRebindOutcomeInTransaction(
        client,
        paymentRow.id,
        params.userId,
        REBIND_OUTCOME_STALE_AFTER_UNLINK,
        { markSucceeded: paymentRow.status !== 'succeeded' }
      );
      return {
        subscription,
        applied: false,
        alreadyApplied: false,
        staleAfterUnlink: true,
      };
    }

    const resolvedTitle = derivePaymentMethodTitle(subscription, params.paymentMethodTitle);
    const updated = await client.query<SubscriptionRow>(
      `UPDATE subscriptions
       SET payment_method_id = $2,
           payment_method_title = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1::uuid
       RETURNING ${SUBSCRIPTION_RETURNING}`,
      [params.userId, params.paymentMethodId, resolvedTitle]
    );
    const updatedRow = updated.rows[0];
    if (!updatedRow) {
      throw Object.assign(new Error('Subscription update failed'), { statusCode: 500 });
    }

    const claim = await claimSubscriptionPaymentSuccessInTransaction(
      client,
      params.providerPaymentId,
      params.userId
    );
    if (claim === 'not_found') {
      throw Object.assign(new Error('Subscription payment not found'), { statusCode: 404 });
    }
    if (claim === 'rejected_terminal') {
      throw Object.assign(new Error('Subscription payment in terminal state'), { statusCode: 409 });
    }

    await markRebindOutcomeInTransaction(
      client,
      paymentRow.id,
      params.userId,
      REBIND_OUTCOME_APPLIED
    );

    return {
      subscription: mapSubscriptionRow(updatedRow),
      applied: claim === 'claimed',
      alreadyApplied: claim === 'already_succeeded',
      staleAfterUnlink: false,
    };
  });
}

export async function processRebindSubscriptionProviderPayment(
  payment: SubscriptionProviderPayment,
  userId: string,
  options: ProcessRebindSubscriptionProviderPaymentOptions = {}
): Promise<ProcessRebindSubscriptionProviderPaymentResult> {
  const kind = providerPaymentKind(payment);
  if (!isRebindSubscriptionPaymentKind(kind)) {
    throw Object.assign(new Error('Unsupported subscription payment kind'), { statusCode: 400 });
  }

  const validation = validateRebindSubscriptionPayment({
    productType: metaString(payment.metadata, 'productType'),
    userId: metaString(payment.metadata, 'userId'),
    kind,
    amountValue: payment.amount.value,
    currency: payment.amount.currency,
    amountsEqual,
  });

  if (!validation.valid) {
    throw Object.assign(new Error(`Invalid rebind payment: ${validation.reason}`), {
      statusCode: 400,
    });
  }

  if (metaString(payment.metadata, 'userId') !== userId) {
    throw Object.assign(new Error('Payment user mismatch'), { statusCode: 403 });
  }

  const existing = await getViewerSubscription(userId);
  if (!existing) {
    throw Object.assign(new Error('Subscription not found'), { statusCode: 404 });
  }

  if (payment.status === 'succeeded') {
    const paymentMethodId = resolvePaymentMethodIdFromRebindPayment(payment, options);
    if (!paymentMethodId) {
      throw Object.assign(new Error('Payment method was not saved'), {
        statusCode: 400,
        code: 'PAYMENT_METHOD_NOT_SAVED',
      });
    }

    const paymentMethodTitle = resolvePaymentMethodTitleFromRebindPayment(payment, options);

    const { applied, alreadyApplied, staleAfterUnlink } = await fulfillRebindSubscriptionPayment({
      userId,
      providerPaymentId: payment.id,
      paymentMethodId,
      paymentMethodTitle,
    });

    const paymentMethodUpdated = applied || alreadyApplied;

    if (
      paymentMethodUpdated &&
      isResumeAutoRenewRebindPayment(payment) &&
      existing.status === 'cancel_at_period_end'
    ) {
      try {
        await patchSubscriptionAutoRenew(userId, true);
      } catch (error) {
        if (
          error instanceof SubscriptionAutoRenewPatchError &&
          error.code === 'INVALID_TRANSITION'
        ) {
          // Already active — duplicate resume-flow rebind is idempotent.
        } else {
          throw error;
        }
      }
    }

    return {
      paymentMethodUpdated,
      alreadyApplied,
      staleAfterUnlink,
    };
  }

  if (payment.status === 'canceled') {
    await updateSubscriptionPaymentStatus(payment.id, 'canceled');
  } else if (payment.status === 'waiting_for_capture') {
    await updateSubscriptionPaymentStatus(payment.id, 'waiting_for_capture');
  } else if (payment.status === 'pending') {
    await updateSubscriptionPaymentStatus(payment.id, 'pending');
  }

  return { paymentMethodUpdated: false, alreadyApplied: false, staleAfterUnlink: false };
}

export async function processRebindSubscriptionProviderPaymentWithArchive(
  payment: SubscriptionProviderPayment,
  userId: string,
  options: ProcessRebindSubscriptionProviderPaymentOptions = {}
): Promise<
  ProcessRebindSubscriptionProviderPaymentResult & {
    archive?: Awaited<ReturnType<typeof getMyArchiveForUser>>;
  }
> {
  const result = await processRebindSubscriptionProviderPayment(payment, userId, options);
  if (!result.paymentMethodUpdated) {
    return result;
  }

  const archive = await getMyArchiveForUser(userId);
  return { ...result, archive };
}

export function isPremiumRebindNotification(
  metadata: Record<string, unknown> | undefined
): boolean {
  return (
    metaString(metadata, 'productType') === PREMIUM_SUBSCRIPTION_PRODUCT_TYPE &&
    metaString(metadata, 'kind') === SUBSCRIPTION_PAYMENT_KIND_REBIND
  );
}
