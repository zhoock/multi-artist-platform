/**
 * PR-10.3 — subscription observability unit tests.
 */

import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';

import {
  buildSubscriptionMetricCounterKey,
  emitSubscriptionMetric,
  getSubscriptionMetricCountersForTests,
  getSubscriptionObservabilityContext,
  logSubscriptionEvent,
  resetSubscriptionMetricsForTests,
  runWithSubscriptionObservability,
  SUBSCRIPTION_LOG_EVENTS,
  SUBSCRIPTION_METRICS,
} from '../subscription-observability';

describe('subscription-observability (PR-10.3)', () => {
  let logSpy: jest.SpiedFunction<typeof console.log>;

  beforeEach(() => {
    resetSubscriptionMetricsForTests();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test('runWithSubscriptionObservability propagates correlationId from subscriptionPaymentId', async () => {
    let capturedCorrelationId: string | undefined;

    await runWithSubscriptionObservability(
      {
        subscriptionPaymentId: 'pay-row-1111-2222-3333-444455556666',
        userId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        source: 'poll',
      },
      async () => {
        capturedCorrelationId = getSubscriptionObservabilityContext()?.correlationId;
      }
    );

    expect(capturedCorrelationId).toBe('pay-row-1111-2222-3333-444455556666');
  });

  test('nested runWithSubscriptionObservability inherits parent correlationId', async () => {
    let innerCorrelationId: string | undefined;

    await runWithSubscriptionObservability(
      { correlationId: 'corr-parent', userId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' },
      async () =>
        runWithSubscriptionObservability({ kind: 'renewal' }, async () => {
          innerCorrelationId = getSubscriptionObservabilityContext()?.correlationId;
        })
    );

    expect(innerCorrelationId).toBe('corr-parent');
  });

  test('logSubscriptionEvent emits structured JSON with stable event name', async () => {
    await runWithSubscriptionObservability(
      {
        correlationId: 'corr-log-test',
        userId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        subscriptionPaymentId: 'sp-1',
        kind: 'initial',
        source: 'webhook',
      },
      async () => {
        logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.FULFILLMENT_COMPLETED, {
          subscriptionActivated: true,
        });
      }
    );

    expect(logSpy).toHaveBeenCalled();
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.event).toBe('subscription.fulfillment.completed');
    expect(payload.domain).toBe('subscription');
    expect(payload.correlationId).toBe('corr-log-test');
    expect(payload.userId).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    expect(payload.kind).toBe('initial');
    expect(payload.source).toBe('webhook');
    expect(payload.subscriptionActivated).toBe(true);
    expect(payload).not.toHaveProperty('paymentMethod');
  });

  test('emitSubscriptionMetric increments in-memory counter', async () => {
    await runWithSubscriptionObservability({ correlationId: 'corr-metric' }, async () => {
      emitSubscriptionMetric(SUBSCRIPTION_METRICS.RENEWAL_SUCCEEDED, { source: 'webhook' });
      emitSubscriptionMetric(SUBSCRIPTION_METRICS.RENEWAL_SUCCEEDED, { source: 'webhook' });
    });

    const key = buildSubscriptionMetricCounterKey(SUBSCRIPTION_METRICS.RENEWAL_SUCCEEDED, {
      source: 'webhook',
    });
    expect(getSubscriptionMetricCountersForTests().get(key)).toBe(2);

    const metricLine = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(metricLine.level).toBe('metric');
    expect(metricLine.metric).toBe('subscription.renewal.succeeded');
    expect(metricLine.correlationId).toBe('corr-metric');
  });
});
