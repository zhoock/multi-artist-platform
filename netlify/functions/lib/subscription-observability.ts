/**
 * PR-10.3 — Structured logging, metrics, and correlation for subscription lifecycle.
 * Observability-only: must not affect business logic or return values.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';

export type SubscriptionObservabilitySource =
  | 'checkout'
  | 'webhook'
  | 'poll'
  | 'scheduler'
  | 'patch'
  | 'scheduled_plan'
  | 'rebind';

/** Stable event names for log filtering (dot notation). */
export const SUBSCRIPTION_LOG_EVENTS = {
  CHECKOUT_CREATED: 'subscription.checkout.created',
  CHECKOUT_FAILED: 'subscription.checkout.failed',
  REBIND_STARTED: 'subscription.rebind.started',
  REBIND_COMPLETED: 'subscription.rebind.completed',
  PATCH_AUTO_RENEW: 'subscription.patch.auto_renew',
  SCHEDULED_DOWNGRADE_APPLIED: 'subscription.scheduled_downgrade.applied',
  SCHEDULED_DOWNGRADE_CANCELED: 'subscription.scheduled_downgrade.canceled',
  FULFILLMENT_STARTED: 'subscription.fulfillment.started',
  FULFILLMENT_COMPLETED: 'subscription.fulfillment.completed',
  FULFILLMENT_FAILED: 'subscription.fulfillment.failed',
  FULFILLMENT_REJECTED: 'subscription.fulfillment.rejected',
  INITIAL_COMPLETED: 'subscription.initial.completed',
  RESUBSCRIBE_COMPLETED: 'subscription.resubscribe.completed',
  UPGRADE_COMPLETED: 'subscription.upgrade.completed',
  RENEWAL_SUCCEEDED: 'subscription.renewal.succeeded',
  RENEWAL_FAILED: 'subscription.renewal.failed',
  RENEWAL_EXHAUSTED: 'subscription.renewal.exhausted',
  DUNNING_STEP: 'subscription.dunning.step',
  PERIOD_ENDED: 'subscription.period.ended',
  WEBHOOK_RECEIVED: 'subscription.webhook.received',
  WEBHOOK_SKIPPED: 'subscription.webhook.skipped',
  WEBHOOK_PROCESSED: 'subscription.webhook.processed',
  WEBHOOK_ERROR: 'subscription.webhook.error',
  POLL_PROCESSED: 'subscription.poll.processed',
  POLL_ERROR: 'subscription.poll.error',
  SCHEDULER_CYCLE: 'subscription.scheduler.cycle',
  SCHEDULER_UNAUTHORIZED: 'subscription.scheduler.unauthorized',
  SCHEDULER_CHARGE: 'subscription.scheduler.charge',
  SCHEDULER_ERROR: 'subscription.scheduler.error',
} as const;

/** Counter names emitted as structured metric lines. */
export const SUBSCRIPTION_METRICS = {
  RENEWAL_SUCCEEDED: 'subscription.renewal.succeeded',
  RENEWAL_FAILED: 'subscription.renewal.failed',
  RENEWAL_EXHAUSTED: 'subscription.renewal.exhausted',
  WEBHOOK_FULFILLED: 'subscription.webhook.fulfilled',
  POLL_FULFILLED: 'subscription.poll.fulfilled',
  REBIND_COMPLETED: 'subscription.rebind.completed',
  UPGRADE_COMPLETED: 'subscription.upgrade.completed',
  INITIAL_COMPLETED: 'subscription.initial.completed',
  RESUBSCRIBE_COMPLETED: 'subscription.resubscribe.completed',
  SCHEDULED_DOWNGRADE_APPLIED: 'subscription.scheduled_downgrade.applied',
  DUNNING_STEP: 'subscription.dunning.step',
} as const;

export type SubscriptionLogEvent =
  (typeof SUBSCRIPTION_LOG_EVENTS)[keyof typeof SUBSCRIPTION_LOG_EVENTS];

export type SubscriptionMetricName =
  (typeof SUBSCRIPTION_METRICS)[keyof typeof SUBSCRIPTION_METRICS];

export interface SubscriptionObservabilityContext {
  correlationId: string;
  userId?: string;
  subscriptionId?: string;
  subscriptionPaymentId?: string;
  providerPaymentId?: string;
  kind?: string;
  source?: SubscriptionObservabilitySource;
  webhookEventId?: string;
}

export type SubscriptionLogFields = Record<string, string | number | boolean | null | undefined>;

const observabilityStorage = new AsyncLocalStorage<SubscriptionObservabilityContext>();

/** In-memory counters for tests and local inspection; not persisted. */
const metricCounters = new Map<string, number>();

export function idSuffix(id: string | null | undefined): string | undefined {
  if (!id?.trim()) return undefined;
  return `…${id.trim().slice(-6)}`;
}

export function resolveCorrelationId(partial: Partial<SubscriptionObservabilityContext>): string {
  return (
    partial.correlationId?.trim() ||
    partial.subscriptionPaymentId?.trim() ||
    partial.providerPaymentId?.trim() ||
    observabilityStorage.getStore()?.correlationId ||
    crypto.randomUUID()
  );
}

export function getSubscriptionObservabilityContext():
  | SubscriptionObservabilityContext
  | undefined {
  return observabilityStorage.getStore();
}

export function extendSubscriptionObservability(
  partial: Partial<SubscriptionObservabilityContext>
): void {
  const current = observabilityStorage.getStore();
  if (!current) return;
  Object.assign(current, {
    ...partial,
    correlationId: partial.correlationId ?? current.correlationId,
  });
}

export async function runWithSubscriptionObservability<T>(
  partial: Partial<SubscriptionObservabilityContext>,
  fn: () => T | Promise<T>
): Promise<T> {
  const parent = observabilityStorage.getStore();
  const correlationId = resolveCorrelationId(partial);

  const ctx: SubscriptionObservabilityContext = {
    correlationId,
    ...parent,
    ...partial,
  };

  return observabilityStorage.run(ctx, () => Promise.resolve(fn()));
}

function baseLogPayload(
  event: SubscriptionLogEvent,
  fields: SubscriptionLogFields = {}
): SubscriptionLogFields {
  const ctx = observabilityStorage.getStore();

  return {
    domain: 'subscription',
    event,
    correlationId: ctx?.correlationId,
    source: ctx?.source,
    kind: ctx?.kind ?? fields.kind,
    userId: ctx?.userId,
    userIdSuffix: idSuffix(ctx?.userId),
    subscriptionId: ctx?.subscriptionId,
    subscriptionPaymentId: ctx?.subscriptionPaymentId,
    providerPaymentIdSuffix: idSuffix(ctx?.providerPaymentId),
    webhookEventId: ctx?.webhookEventId,
    ...fields,
  };
}

/** Structured lifecycle log (stdout). Never pass secrets, PAN, or raw payment payloads. */
export function logSubscriptionEvent(
  event: SubscriptionLogEvent,
  fields: SubscriptionLogFields = {},
  level: 'info' | 'warn' | 'error' = 'info'
): void {
  const payload = baseLogPayload(event, fields);
  const line = JSON.stringify(payload);

  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

/** Lightweight metric emitter — JSON line + in-memory counter; no external deps. */
export function emitSubscriptionMetric(
  metric: SubscriptionMetricName,
  labels: Record<string, string> = {},
  delta = 1
): void {
  const ctx = observabilityStorage.getStore();
  const labelKey = Object.keys(labels)
    .sort()
    .map((key) => `${key}=${labels[key]}`)
    .join(',');
  const counterKey = labelKey ? `${metric}|${labelKey}` : metric;
  metricCounters.set(counterKey, (metricCounters.get(counterKey) ?? 0) + delta);

  console.log(
    JSON.stringify({
      domain: 'subscription',
      level: 'metric',
      metric,
      delta,
      labels,
      correlationId: ctx?.correlationId,
    })
  );
}

/** Test helpers */
export function resetSubscriptionMetricsForTests(): void {
  metricCounters.clear();
}

export function getSubscriptionMetricCountersForTests(): ReadonlyMap<string, number> {
  return metricCounters;
}

export function buildSubscriptionMetricCounterKey(
  metric: SubscriptionMetricName,
  labels: Record<string, string> = {}
): string {
  const labelKey = Object.keys(labels)
    .sort()
    .map((key) => `${key}=${labels[key]}`)
    .join(',');
  return labelKey ? `${metric}|${labelKey}` : metric;
}
