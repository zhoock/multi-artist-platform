/**
 * PR-3b — Reconcile unresolved renewal attempts before new charge selection.
 */

import { isDevPaymentModeEnabled } from './dev-payment-mode';
import {
  attachProviderPaymentId,
  claimRenewalFirstPostAt,
  getRenewalAttemptDispatchState,
  getRenewalAttemptPostIdentity,
  listRenewalAttemptsForReconciliation,
  markRenewalAttemptNeedsReview,
  type RenewalAttemptReconcileRow,
} from './subscription-billing';
import {
  acquireRenewalAttemptDispatchLease,
  attachRenewalProviderPaymentIdWithFence,
  claimRenewalFirstPostAtWithFence,
  createRenewalDispatchRunId,
  markRenewalAttemptNeedsReviewWithFence,
  releaseRenewalAttemptDispatchLease,
  type RenewalDispatchLease,
} from './subscription-renewal-dispatch-lease';
import {
  extendSubscriptionObservability,
  logSubscriptionEvent,
  SUBSCRIPTION_LOG_EVENTS,
} from './subscription-observability';
import { mapYooKassaPaymentToProviderPayment } from './subscription-provider-payment';
import { processSubscriptionProviderPaymentForRow } from './subscription-payment-router';
import {
  resolveRenewalYooKassaPostRoute,
  type RenewalYooKassaPostRoute,
} from './subscription-renewal-post-policy';
import { assessRenewalFrozenPaymentProtocol } from './subscription-renewal-db-integrity';
import type { RenewalYookassaCreatePayload } from './subscription-renewal-post-payload';
import { getYooKassaEnvCredentials } from './yookassa-env';
import {
  fetchPaymentFromYooKassaApi,
  type YooKassaPaymentApiShape,
} from './yookassa-webhook-verify';

export type RenewalReconcileAttemptOutcome =
  | 'resolved'
  | 'pending'
  | 'needs_review'
  | 'retry_later'
  | 'identity_invalid'
  | 'skipped_dev'
  | 'skipped_no_credentials';

export interface RenewalReconcileCycleResult {
  examined: number;
  resolved: number;
  pending: number;
  needsReview: number;
  retryLater: number;
  errors: number;
}

interface YooKassaCreateResponse {
  id: string;
  status: string;
}

type ReconcileAttemptWithPayment = RenewalAttemptReconcileRow & {
  yookassaPayment: YooKassaPaymentApiShape;
};

function isYooKassaGetRetryable(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}

async function createYooKassaRenewalPayment(params: {
  idempotenceKey: string;
  payload: RenewalYookassaCreatePayload;
}): Promise<{ paymentId: string; status: string }> {
  const yookassaCreds = getYooKassaEnvCredentials();
  if (!yookassaCreds) {
    throw new Error('YooKassa is not configured');
  }

  const apiUrl = process.env.YOOKASSA_API_URL || 'https://api.yookassa.ru/v3/payments';
  const authHeader = Buffer.from(`${yookassaCreds.shopId}:${yookassaCreds.secretKey}`).toString(
    'base64'
  );

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${authHeader}`,
      'Idempotence-Key': params.idempotenceKey,
    },
    body: JSON.stringify(params.payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `YooKassa renewal create failed: ${response.status} ${errorText.slice(0, 200)}`
    );
  }

  const paymentData = (await response.json()) as YooKassaCreateResponse;
  if (!paymentData.id) {
    throw new Error('Invalid YooKassa renewal response');
  }

  return { paymentId: paymentData.id, status: paymentData.status };
}

export type GuardedRenewalPostResult =
  | { ok: true; paymentId: string; status: string; route: RenewalYooKassaPostRoute }
  | {
      ok: false;
      reason:
        | 'provider_id_use_get'
        | 'needs_review'
        | 'invalid_first_post'
        | 'identity_invalid'
        | 'not_found';
      detail?: string;
    };

/**
 * Shared POST gate for renewal attempts (PR-3b). Uses DB dispatch state; enforces 24h window on repeats.
 */
export async function guardedRenewalYooKassaPost(params: {
  subscriptionPaymentId: string;
  userId: string;
  now: Date;
  claimFirstPostWhenInitial?: boolean;
  dispatchLease?: RenewalDispatchLease;
}): Promise<GuardedRenewalPostResult> {
  const dispatch = await getRenewalAttemptDispatchState(
    params.subscriptionPaymentId,
    params.userId
  );
  if (!dispatch) {
    return { ok: false, reason: 'not_found' };
  }

  let firstPostAt = dispatch.first_post_at;
  let route = resolveRenewalYooKassaPostRoute({
    providerPaymentId: dispatch.provider_payment_id,
    firstPostAt,
    now: params.now,
  });

  if (route === 'provider_get') {
    return { ok: false, reason: 'provider_id_use_get' };
  }
  if (route === 'needs_review' || route === 'blocked_invalid_first_post') {
    if (params.dispatchLease) {
      await markRenewalAttemptNeedsReviewWithFence(params.dispatchLease);
    } else {
      await markRenewalAttemptNeedsReview(params.subscriptionPaymentId, params.userId);
    }
    return {
      ok: false,
      reason: route === 'blocked_invalid_first_post' ? 'invalid_first_post' : 'needs_review',
    };
  }

  if (route === 'initial_post' && params.claimFirstPostWhenInitial !== false) {
    const claim = params.dispatchLease
      ? await claimRenewalFirstPostAtWithFence(params.dispatchLease, params.now)
      : await claimRenewalFirstPostAt(params.subscriptionPaymentId, params.userId, params.now);
    if (claim === 'not_found' || claim === 'fence_rejected') {
      return { ok: false, reason: 'not_found' };
    }
    const refreshed = await getRenewalAttemptDispatchState(
      params.subscriptionPaymentId,
      params.userId
    );
    firstPostAt = refreshed?.first_post_at ?? firstPostAt;
    route = resolveRenewalYooKassaPostRoute({
      providerPaymentId: dispatch.provider_payment_id,
      firstPostAt,
      now: params.now,
    });
    if (route === 'needs_review' || route === 'blocked_invalid_first_post') {
      if (params.dispatchLease) {
        await markRenewalAttemptNeedsReviewWithFence(params.dispatchLease);
      } else {
        await markRenewalAttemptNeedsReview(params.subscriptionPaymentId, params.userId);
      }
      return {
        ok: false,
        reason: route === 'blocked_invalid_first_post' ? 'invalid_first_post' : 'needs_review',
      };
    }
    if (route === 'provider_get') {
      return { ok: false, reason: 'provider_id_use_get' };
    }
    if (route === 'initial_post' && claim === 'already_started') {
      route = 'repeat_post';
    }
  }

  if (route !== 'initial_post' && route !== 'repeat_post') {
    return { ok: false, reason: 'needs_review' };
  }

  if (route === 'repeat_post') {
    const repeatCheck = resolveRenewalYooKassaPostRoute({
      providerPaymentId: null,
      firstPostAt,
      now: params.now,
    });
    if (repeatCheck !== 'repeat_post') {
      if (params.dispatchLease) {
        await markRenewalAttemptNeedsReviewWithFence(params.dispatchLease);
      } else {
        await markRenewalAttemptNeedsReview(params.subscriptionPaymentId, params.userId);
      }
      return { ok: false, reason: 'needs_review' };
    }
  }

  const identity = await getRenewalAttemptPostIdentity(params.subscriptionPaymentId, params.userId);
  if (!identity.ok) {
    if (params.dispatchLease) {
      await markRenewalAttemptNeedsReviewWithFence(params.dispatchLease);
    } else {
      await markRenewalAttemptNeedsReview(params.subscriptionPaymentId, params.userId);
    }
    return { ok: false, reason: 'identity_invalid', detail: identity.reason };
  }

  const protocol = assessRenewalFrozenPaymentProtocol({
    subscriptionPaymentId: params.subscriptionPaymentId,
    idempotenceKey: identity.idempotenceKey,
    payload: identity.payload,
  });
  if (!protocol.ok) {
    if (params.dispatchLease) {
      await markRenewalAttemptNeedsReviewWithFence(params.dispatchLease);
    } else {
      await markRenewalAttemptNeedsReview(params.subscriptionPaymentId, params.userId);
    }
    return {
      ok: false,
      reason: 'needs_review',
      detail: protocol.detail,
    };
  }

  const { paymentId, status } = await createYooKassaRenewalPayment({
    idempotenceKey: identity.idempotenceKey,
    payload: identity.payload,
  });

  return {
    ok: true,
    paymentId,
    status,
    route,
  };
}

async function syncRenewalAttemptFromProviderPayment(
  attempt: ReconcileAttemptWithPayment,
  now: Date,
  dispatchLease?: RenewalDispatchLease
): Promise<RenewalReconcileAttemptOutcome> {
  const providerPayment = mapYooKassaPaymentToProviderPayment(attempt.yookassaPayment);
  if (!providerPayment) {
    logSubscriptionEvent(
      SUBSCRIPTION_LOG_EVENTS.SCHEDULER_ERROR,
      {
        subscriptionPaymentId: attempt.id,
        reason: 'renewal_reconcile_unmapped_status',
        providerStatus: attempt.yookassaPayment.status,
      },
      'warn'
    );
    return 'pending';
  }

  if (
    attempt.provider_payment_id?.trim() &&
    attempt.provider_payment_id.trim() !== providerPayment.id
  ) {
    logSubscriptionEvent(
      SUBSCRIPTION_LOG_EVENTS.SCHEDULER_ERROR,
      {
        subscriptionPaymentId: attempt.id,
        reason: 'renewal_reconcile_provider_id_mismatch',
      },
      'error'
    );
    return 'retry_later';
  }

  if (!attempt.provider_payment_id?.trim()) {
    if (dispatchLease) {
      const attachOutcome = await attachRenewalProviderPaymentIdWithFence(
        dispatchLease,
        providerPayment.id
      );
      if (attachOutcome === 'fence_rejected') {
        return 'retry_later';
      }
      if (attachOutcome === 'not_found') {
        return 'retry_later';
      }
    } else {
      await attachProviderPaymentId(attempt.id, providerPayment.id);
    }
  }

  await processSubscriptionProviderPaymentForRow(providerPayment, attempt.user_id, 'renewal', {
    observabilitySource: 'scheduler',
    subscriptionPaymentId: attempt.id,
    now,
  });

  if (providerPayment.status === 'succeeded' || providerPayment.status === 'canceled') {
    return 'resolved';
  }
  return 'pending';
}

async function fetchAndSyncProviderPayment(
  attempt: RenewalAttemptReconcileRow,
  providerPaymentId: string,
  now: Date,
  dispatchLease?: RenewalDispatchLease
): Promise<RenewalReconcileAttemptOutcome> {
  const yookassaCreds = getYooKassaEnvCredentials();
  if (!yookassaCreds) {
    return 'skipped_no_credentials';
  }

  const apiResult = await fetchPaymentFromYooKassaApi(
    providerPaymentId,
    yookassaCreds.shopId,
    yookassaCreds.secretKey
  );
  if (!apiResult.ok) {
    if (isYooKassaGetRetryable(apiResult.status)) {
      return 'retry_later';
    }
    return 'retry_later';
  }

  return syncRenewalAttemptFromProviderPayment(
    { ...attempt, provider_payment_id: providerPaymentId, yookassaPayment: apiResult.payment },
    now,
    dispatchLease
  );
}

export async function reconcileOneRenewalAttempt(
  attempt: RenewalAttemptReconcileRow,
  now: Date = new Date()
): Promise<RenewalReconcileAttemptOutcome> {
  if (isDevPaymentModeEnabled()) {
    return 'skipped_dev';
  }

  const yookassaCreds = getYooKassaEnvCredentials();
  if (!yookassaCreds) {
    return 'skipped_no_credentials';
  }

  extendSubscriptionObservability({
    subscriptionId: attempt.subscription_id ?? undefined,
    userId: attempt.user_id,
    subscriptionPaymentId: attempt.id,
    kind: 'renewal',
    source: 'scheduler',
  });

  if (attempt.dispatch_phase === 'needs_review') {
    return 'needs_review';
  }

  const route = resolveRenewalYooKassaPostRoute({
    providerPaymentId: attempt.provider_payment_id,
    firstPostAt: attempt.first_post_at,
    now,
  });

  if (route === 'needs_review' || route === 'blocked_invalid_first_post') {
    await markRenewalAttemptNeedsReview(attempt.id, attempt.user_id);
    return 'needs_review';
  }

  if (route === 'initial_post') {
    return 'pending';
  }

  const runId = createRenewalDispatchRunId();
  const acquired = await acquireRenewalAttemptDispatchLease({
    subscriptionPaymentId: attempt.id,
    userId: attempt.user_id,
    runId,
    now,
  });
  if (!acquired.ok) {
    if (acquired.reason === 'lease_held') {
      return 'retry_later';
    }
    return 'pending';
  }
  const dispatchLease = acquired.lease;

  try {
    if (route === 'provider_get') {
      const apiResult = await fetchPaymentFromYooKassaApi(
        attempt.provider_payment_id!.trim(),
        yookassaCreds.shopId,
        yookassaCreds.secretKey
      );
      if (!apiResult.ok) {
        if (isYooKassaGetRetryable(apiResult.status)) {
          logSubscriptionEvent(
            SUBSCRIPTION_LOG_EVENTS.SCHEDULER_CHARGE,
            {
              subscriptionPaymentId: attempt.id,
              outcome: 'retry_later',
              reason: 'renewal_reconcile_get_retryable',
              httpStatus: apiResult.status,
            },
            'warn'
          );
          return 'retry_later';
        }
        logSubscriptionEvent(
          SUBSCRIPTION_LOG_EVENTS.SCHEDULER_ERROR,
          {
            subscriptionPaymentId: attempt.id,
            reason: 'renewal_reconcile_get_failed',
            httpStatus: apiResult.status,
          },
          'error'
        );
        return 'retry_later';
      }

      return syncRenewalAttemptFromProviderPayment(
        { ...attempt, yookassaPayment: apiResult.payment },
        now,
        dispatchLease
      );
    }

    const postResult = await guardedRenewalYooKassaPost({
      subscriptionPaymentId: attempt.id,
      userId: attempt.user_id,
      now,
      claimFirstPostWhenInitial: false,
      dispatchLease,
    });

    if (!postResult.ok) {
      if (postResult.reason === 'identity_invalid') {
        return 'identity_invalid';
      }
      if (postResult.reason === 'needs_review' || postResult.reason === 'invalid_first_post') {
        return 'needs_review';
      }
      return 'retry_later';
    }

    const attachOutcome = await attachRenewalProviderPaymentIdWithFence(
      dispatchLease,
      postResult.paymentId
    );
    if (attachOutcome !== 'attached') {
      return 'retry_later';
    }

    return fetchAndSyncProviderPayment(
      { ...attempt, provider_payment_id: postResult.paymentId },
      postResult.paymentId,
      now,
      dispatchLease
    );
  } catch (error) {
    logSubscriptionEvent(
      SUBSCRIPTION_LOG_EVENTS.SCHEDULER_ERROR,
      {
        subscriptionPaymentId: attempt.id,
        reason: 'renewal_reconcile_post_failed',
        error: error instanceof Error ? error.message : String(error),
      },
      'error'
    );
    return 'retry_later';
  } finally {
    await releaseRenewalAttemptDispatchLease(dispatchLease, now);
  }
}

export async function reconcileUnresolvedRenewalAttempts(
  now: Date = new Date()
): Promise<RenewalReconcileCycleResult> {
  const result: RenewalReconcileCycleResult = {
    examined: 0,
    resolved: 0,
    pending: 0,
    needsReview: 0,
    retryLater: 0,
    errors: 0,
  };

  for (const attempt of await listRenewalAttemptsForReconciliation()) {
    result.examined += 1;
    try {
      const outcome = await reconcileOneRenewalAttempt(attempt, now);
      switch (outcome) {
        case 'resolved':
          result.resolved += 1;
          break;
        case 'needs_review':
        case 'identity_invalid':
          result.needsReview += 1;
          break;
        case 'retry_later':
          result.retryLater += 1;
          break;
        case 'skipped_dev':
        case 'skipped_no_credentials':
          result.pending += 1;
          break;
        default:
          result.pending += 1;
          break;
      }
    } catch {
      result.errors += 1;
    }
  }

  if (result.examined > 0) {
    logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.SCHEDULER_CHARGE, {
      outcome: 'reconcile_cycle',
      examined: result.examined,
      resolved: result.resolved,
      pending: result.pending,
      needsReview: result.needsReview,
      retryLater: result.retryLater,
      errors: result.errors,
    });
  }

  return result;
}
