/**
 * PR-10.3 — Fulfillment outcome logging/metrics (router boundary).
 */

import {
  emitSubscriptionMetric,
  extendSubscriptionObservability,
  logSubscriptionEvent,
  SUBSCRIPTION_LOG_EVENTS,
  SUBSCRIPTION_METRICS,
  type SubscriptionObservabilitySource,
} from './subscription-observability';

export type FulfillmentObservabilityResult =
  | { subscriptionActivated: boolean; alreadyFulfilled: boolean; planSlug: string }
  | { subscriptionRenewed: boolean; alreadyFulfilled: boolean; planSlug: string }
  | { paymentMethodUpdated: boolean; alreadyApplied: boolean };

export type SubscriptionFulfillmentObservabilityInput = {
  userId: string;
  kind: string;
  source: SubscriptionObservabilitySource;
  providerPaymentId: string;
  subscriptionPaymentId?: string;
  paymentStatus: string;
};

function metricSourceLabel(source: SubscriptionObservabilitySource): string {
  return source;
}

export function beginSubscriptionFulfillmentObservability(
  input: SubscriptionFulfillmentObservabilityInput
): void {
  extendSubscriptionObservability({
    userId: input.userId,
    kind: input.kind,
    source: input.source,
    providerPaymentId: input.providerPaymentId,
    subscriptionPaymentId: input.subscriptionPaymentId,
    correlationId: input.subscriptionPaymentId ?? input.providerPaymentId,
  });

  logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.FULFILLMENT_STARTED, {
    kind: input.kind,
    source: input.source,
    paymentStatus: input.paymentStatus,
  });
}

export function recordSubscriptionFulfillmentOutcome(
  kind: string,
  source: SubscriptionObservabilitySource,
  result: FulfillmentObservabilityResult
): void {
  const sourceLabel = metricSourceLabel(source);

  if ('subscriptionActivated' in result) {
    const activated = result.subscriptionActivated;
    const already = result.alreadyFulfilled;

    logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.FULFILLMENT_COMPLETED, {
      kind,
      source,
      subscriptionActivated: activated,
      alreadyFulfilled: already,
      planSlug: result.planSlug,
    });

    if (activated && !already) {
      if (kind === 'upgrade') {
        emitSubscriptionMetric(SUBSCRIPTION_METRICS.UPGRADE_COMPLETED, { source: sourceLabel });
        logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.UPGRADE_COMPLETED, {
          planSlug: result.planSlug,
        });
      } else if (kind === 'initial') {
        emitSubscriptionMetric(SUBSCRIPTION_METRICS.INITIAL_COMPLETED, { source: sourceLabel });
        logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.INITIAL_COMPLETED, {
          planSlug: result.planSlug,
        });
      }
    }

    if (source === 'webhook' && activated) {
      emitSubscriptionMetric(SUBSCRIPTION_METRICS.WEBHOOK_FULFILLED, { kind });
    }
    if (source === 'poll' && activated) {
      emitSubscriptionMetric(SUBSCRIPTION_METRICS.POLL_FULFILLED, { kind });
    }
    return;
  }

  if ('subscriptionRenewed' in result) {
    logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.FULFILLMENT_COMPLETED, {
      kind: 'renewal',
      source,
      subscriptionRenewed: result.subscriptionRenewed,
      alreadyFulfilled: result.alreadyFulfilled,
      planSlug: result.planSlug,
    });

    if (result.subscriptionRenewed && !result.alreadyFulfilled) {
      emitSubscriptionMetric(SUBSCRIPTION_METRICS.RENEWAL_SUCCEEDED, { source: sourceLabel });
      logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.RENEWAL_SUCCEEDED, {
        planSlug: result.planSlug,
      });
    }

    if (source === 'webhook' && result.subscriptionRenewed) {
      emitSubscriptionMetric(SUBSCRIPTION_METRICS.WEBHOOK_FULFILLED, { kind: 'renewal' });
    }
    if (source === 'poll' && result.subscriptionRenewed) {
      emitSubscriptionMetric(SUBSCRIPTION_METRICS.POLL_FULFILLED, { kind: 'renewal' });
    }
    return;
  }

  if ('paymentMethodUpdated' in result) {
    logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.FULFILLMENT_COMPLETED, {
      kind: 'rebind',
      source,
      paymentMethodUpdated: result.paymentMethodUpdated,
      alreadyApplied: result.alreadyApplied,
    });

    if (result.paymentMethodUpdated) {
      emitSubscriptionMetric(SUBSCRIPTION_METRICS.REBIND_COMPLETED, { source: sourceLabel });
      logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.REBIND_COMPLETED, {});
    }

    if (source === 'webhook' && result.paymentMethodUpdated) {
      emitSubscriptionMetric(SUBSCRIPTION_METRICS.WEBHOOK_FULFILLED, { kind: 'rebind' });
    }
    if (source === 'poll' && result.paymentMethodUpdated) {
      emitSubscriptionMetric(SUBSCRIPTION_METRICS.POLL_FULFILLED, { kind: 'rebind' });
    }
  }
}

export function recordSubscriptionFulfillmentRejected(
  kind: string,
  source: SubscriptionObservabilitySource,
  reason: string
): void {
  logSubscriptionEvent(
    SUBSCRIPTION_LOG_EVENTS.FULFILLMENT_REJECTED,
    { kind, source, reason },
    'warn'
  );
}

export function recordSubscriptionFulfillmentError(
  kind: string,
  source: SubscriptionObservabilitySource,
  error: unknown
): void {
  logSubscriptionEvent(
    SUBSCRIPTION_LOG_EVENTS.FULFILLMENT_FAILED,
    {
      kind,
      source,
      error: error instanceof Error ? error.message : String(error),
    },
    'error'
  );
}

/** Log resubscribe when initial fulfillment reuses a terminal subscription row. */
export function recordResubscribeCompleted(source: SubscriptionObservabilitySource): void {
  emitSubscriptionMetric(SUBSCRIPTION_METRICS.RESUBSCRIBE_COMPLETED, {
    source: metricSourceLabel(source),
  });
  logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.RESUBSCRIBE_COMPLETED, { source });
}
