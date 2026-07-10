import { describe, expect, test } from '@jest/globals';

import {
  formatCollectionRenewalDate,
  formatSubscriptionDaysRemainingLabel,
  getSubscriptionDaysRemaining,
  resolveCollectionSubscriptionStatus,
} from '../collectionSubscriptionStatus';

describe('resolveCollectionSubscriptionStatus', () => {
  const now = new Date('2026-07-10T12:00:00.000Z');

  test('returns active when premium and expiry is far away', () => {
    expect(
      resolveCollectionSubscriptionStatus({
        isPremium: true,
        expiresAt: '2026-07-22T12:00:00.000Z',
        now,
      })
    ).toBe('active');
  });

  test('returns expiring when premium and expiry is within threshold', () => {
    expect(
      resolveCollectionSubscriptionStatus({
        isPremium: true,
        expiresAt: '2026-07-13T12:00:00.000Z',
        now,
      })
    ).toBe('expiring');
  });

  test('returns expired when premium but expiry is in the past', () => {
    expect(
      resolveCollectionSubscriptionStatus({
        isPremium: true,
        expiresAt: '2026-07-09T12:00:00.000Z',
        now,
      })
    ).toBe('expired');
  });

  test('returns expired when support is inactive', () => {
    expect(
      resolveCollectionSubscriptionStatus({
        isPremium: false,
        expiresAt: '2026-08-03T12:00:00.000Z',
        now,
      })
    ).toBe('expired');
  });

  test('returns active when premium without expiry date', () => {
    expect(
      resolveCollectionSubscriptionStatus({
        isPremium: true,
        expiresAt: null,
        now,
      })
    ).toBe('active');
  });

  test('returns null when inactive without expiry date', () => {
    expect(
      resolveCollectionSubscriptionStatus({
        isPremium: false,
        expiresAt: null,
        now,
      })
    ).toBeNull();
  });
});

describe('getSubscriptionDaysRemaining', () => {
  test('counts remaining days from expiry timestamp', () => {
    const now = new Date('2026-07-10T12:00:00.000Z');
    expect(getSubscriptionDaysRemaining('2026-07-22T12:00:00.000Z', now)).toBe(12);
  });
});

describe('formatCollectionRenewalDate', () => {
  test('formats renewal date for ru locale', () => {
    expect(formatCollectionRenewalDate('2026-08-03T12:00:00.000Z', 'ru')).toMatch(/3/);
  });
});

describe('formatSubscriptionDaysRemainingLabel', () => {
  test('uses singular day label in English', () => {
    expect(formatSubscriptionDaysRemainingLabel(1, 'en')).toBe('1 day left');
  });

  test('uses Russian plural forms', () => {
    expect(formatSubscriptionDaysRemainingLabel(3, 'ru')).toBe('Осталось 3 дня');
    expect(formatSubscriptionDaysRemainingLabel(12, 'ru')).toBe('Осталось 12 дней');
  });
});
