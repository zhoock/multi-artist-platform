/**
 * PR-10.1 / P0-1 — Scheduler authorization (C-2).
 * Secret-only auth; next_run payload is detection-only and must never grant access alone.
 */

import { afterEach, describe, expect, test } from '@jest/globals';
import type { HandlerEvent } from '@netlify/functions';

import {
  authorizeScheduledRenewalInvocation,
  isNetlifyScheduledInvocation,
  isTrustedNetlifyPlatformSchedule,
} from '../subscription-renewal-scheduler-auth';

const ORIGINAL_SECRET = process.env.SUBSCRIPTION_CRON_SECRET;

function scheduledBody(nextRun = new Date().toISOString()): string {
  return JSON.stringify({ next_run: nextRun });
}

function event(overrides: Partial<HandlerEvent> = {}): HandlerEvent {
  return {
    body: null,
    headers: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/.netlify/functions/scheduled-subscription-renewals',
    rawUrl: '',
    ...overrides,
  } as HandlerEvent;
}

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.SUBSCRIPTION_CRON_SECRET;
  else process.env.SUBSCRIPTION_CRON_SECRET = ORIGINAL_SECRET;
});

describe('isNetlifyScheduledInvocation', () => {
  test('detects valid next_run within 24h (detection only, not auth)', () => {
    expect(isNetlifyScheduledInvocation(scheduledBody())).toBe(true);
  });

  test('rejects missing body', () => {
    expect(isNetlifyScheduledInvocation(null)).toBe(false);
    expect(isNetlifyScheduledInvocation('')).toBe(false);
  });

  test('rejects invalid JSON and missing next_run', () => {
    expect(isNetlifyScheduledInvocation('not-json')).toBe(false);
    expect(isNetlifyScheduledInvocation(JSON.stringify({}))).toBe(false);
  });

  test('rejects next_run outside 24h window', () => {
    const stale = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    expect(isNetlifyScheduledInvocation(scheduledBody(stale))).toBe(false);
  });
});

describe('isTrustedNetlifyPlatformSchedule', () => {
  test('accepts x-nf-event: schedule', () => {
    expect(isTrustedNetlifyPlatformSchedule(event({ headers: { 'x-nf-event': 'schedule' } }))).toBe(
      true
    );
  });

  test('accepts x-netlify-event: schedule', () => {
    expect(
      isTrustedNetlifyPlatformSchedule(event({ headers: { 'x-netlify-event': 'schedule' } }))
    ).toBe(true);
  });

  test('rejects missing or wrong event header', () => {
    expect(isTrustedNetlifyPlatformSchedule(event())).toBe(false);
    expect(isTrustedNetlifyPlatformSchedule(event({ headers: { 'x-nf-event': 'invoke' } }))).toBe(
      false
    );
  });
});

describe('authorizeScheduledRenewalInvocation', () => {
  test('Test 1 — rejects forged scheduled payload without secret (security regression)', () => {
    process.env.SUBSCRIPTION_CRON_SECRET = 'configured-production-secret';
    expect(authorizeScheduledRenewalInvocation(event({ body: scheduledBody(), headers: {} }))).toBe(
      false
    );
  });

  test('security regression — scheduled payload + no secret ≠ authorized invocation', () => {
    process.env.SUBSCRIPTION_CRON_SECRET = 'configured-production-secret';
    const forged = event({ body: scheduledBody(), headers: {} });
    expect(isNetlifyScheduledInvocation(forged.body)).toBe(true);
    expect(authorizeScheduledRenewalInvocation(forged)).toBe(false);
  });

  test('Test 2 — rejects when SUBSCRIPTION_CRON_SECRET is missing (fail closed)', () => {
    delete process.env.SUBSCRIPTION_CRON_SECRET;
    expect(authorizeScheduledRenewalInvocation(event({ body: null }))).toBe(false);
    expect(authorizeScheduledRenewalInvocation(event({ body: scheduledBody(), headers: {} }))).toBe(
      false
    );
    expect(
      authorizeScheduledRenewalInvocation(
        event({ body: scheduledBody(), headers: { 'x-nf-event': 'schedule' } })
      )
    ).toBe(false);
  });

  test('Test 3 — rejects invalid secret', () => {
    process.env.SUBSCRIPTION_CRON_SECRET = 'expected-secret';
    expect(
      authorizeScheduledRenewalInvocation(
        event({ body: null, headers: { authorization: 'Bearer wrong-secret' } })
      )
    ).toBe(false);
    expect(
      authorizeScheduledRenewalInvocation(
        event({ body: scheduledBody(), headers: { 'x-subscription-cron-secret': 'wrong' } })
      )
    ).toBe(false);
  });

  test('Test 4 — authorizes valid Bearer SUBSCRIPTION_CRON_SECRET', () => {
    process.env.SUBSCRIPTION_CRON_SECRET = 'test-cron-secret-value';
    expect(
      authorizeScheduledRenewalInvocation(
        event({
          body: null,
          headers: { authorization: 'Bearer test-cron-secret-value' },
        })
      )
    ).toBe(true);
  });

  test('Test 4 — authorizes valid x-subscription-cron-secret header', () => {
    process.env.SUBSCRIPTION_CRON_SECRET = 'header-secret-value';
    expect(
      authorizeScheduledRenewalInvocation(
        event({
          body: null,
          headers: { 'x-subscription-cron-secret': 'header-secret-value' },
        })
      )
    ).toBe(true);
  });

  test('Test 5 — authorizes trusted Netlify platform schedule when server secret is configured', () => {
    process.env.SUBSCRIPTION_CRON_SECRET = 'platform-bootstrap-secret';
    expect(
      authorizeScheduledRenewalInvocation(
        event({
          body: scheduledBody(),
          headers: { 'x-nf-event': 'schedule' },
        })
      )
    ).toBe(true);
  });

  test('rejects unauthorized invocations with empty body and no headers', () => {
    delete process.env.SUBSCRIPTION_CRON_SECRET;
    expect(authorizeScheduledRenewalInvocation(event({ body: null }))).toBe(false);
  });
});
