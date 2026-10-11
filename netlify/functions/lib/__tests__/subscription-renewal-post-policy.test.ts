import { describe, expect, test } from '@jest/globals';

import {
  isWithinYookassaRenewalIdempotenceWindow,
  resolveRenewalYooKassaPostRoute,
  YOOKASSA_RENEWAL_IDEMPOTENCE_WINDOW_MS,
} from '../subscription-renewal-post-policy';

describe('subscription-renewal-post-policy (PR-3b)', () => {
  test('provider id routes to GET not POST', () => {
    expect(
      resolveRenewalYooKassaPostRoute({
        providerPaymentId: 'yk-1',
        firstPostAt: new Date('2026-01-01T00:00:00.000Z'),
      })
    ).toBe('provider_get');
  });

  test('missing first_post_at routes to initial_post', () => {
    expect(
      resolveRenewalYooKassaPostRoute({
        providerPaymentId: null,
        firstPostAt: null,
      })
    ).toBe('initial_post');
  });

  test('within 24h window allows repeat_post', () => {
    const firstPostAt = new Date('2026-06-01T12:00:00.000Z');
    const now = new Date(firstPostAt.getTime() + YOOKASSA_RENEWAL_IDEMPOTENCE_WINDOW_MS);
    expect(isWithinYookassaRenewalIdempotenceWindow(firstPostAt, now)).toBe(true);
    expect(
      resolveRenewalYooKassaPostRoute({
        providerPaymentId: null,
        firstPostAt,
        now,
      })
    ).toBe('repeat_post');
  });

  test('after 24h window requires needs_review', () => {
    const firstPostAt = new Date('2026-06-01T12:00:00.000Z');
    const now = new Date(firstPostAt.getTime() + YOOKASSA_RENEWAL_IDEMPOTENCE_WINDOW_MS + 1);
    expect(isWithinYookassaRenewalIdempotenceWindow(firstPostAt, now)).toBe(false);
    expect(
      resolveRenewalYooKassaPostRoute({
        providerPaymentId: null,
        firstPostAt,
        now,
      })
    ).toBe('needs_review');
  });

  test('invalid first_post_at is blocked', () => {
    expect(
      resolveRenewalYooKassaPostRoute({
        providerPaymentId: null,
        firstPostAt: 'not-a-date',
      })
    ).toBe('blocked_invalid_first_post');
  });
});
