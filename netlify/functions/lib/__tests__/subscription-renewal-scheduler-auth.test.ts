/**
 * PR-10.1 — Scheduler authorization (C-2).
 */

import { afterEach, describe, expect, test } from '@jest/globals';
import type { HandlerEvent } from '@netlify/functions';

import {
  authorizeScheduledRenewalInvocation,
  isNetlifyScheduledInvocation,
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
  test('accepts valid next_run within 24h', () => {
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

describe('authorizeScheduledRenewalInvocation', () => {
  test('authorizes Netlify scheduled payload', () => {
    expect(authorizeScheduledRenewalInvocation(event({ body: scheduledBody(), headers: {} }))).toBe(
      true
    );
  });

  test('authorizes Bearer SUBSCRIPTION_CRON_SECRET', () => {
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

  test('authorizes x-subscription-cron-secret header', () => {
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

  test('rejects unauthorized invocations (fail closed)', () => {
    delete process.env.SUBSCRIPTION_CRON_SECRET;
    expect(authorizeScheduledRenewalInvocation(event({ body: null }))).toBe(false);
    expect(
      authorizeScheduledRenewalInvocation(
        event({ body: null, headers: { authorization: 'Bearer wrong' } })
      )
    ).toBe(false);
  });
});
