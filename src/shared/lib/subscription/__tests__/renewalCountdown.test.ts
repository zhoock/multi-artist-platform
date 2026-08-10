import { describe, expect, test } from '@jest/globals';

import {
  formatRelativeRenewalTime,
  getRenewalCountdownTickInterval,
  isRenewalCountdownOverdue,
  RENEWAL_COUNTDOWN_OVERDUE_AWAITING,
  RENEWAL_COUNTDOWN_OVERDUE_IN_PROGRESS,
  RENEWAL_OVERDUE_IN_PROGRESS_MS,
  resolveRenewalCountdownDisplay,
} from '../renewalCountdown';

const NOW = new Date('2026-08-07T12:00:00.000Z');

function chargeAtOffset(ms: number): string {
  return new Date(NOW.getTime() + ms).toISOString();
}

describe('formatRelativeRenewalTime', () => {
  test('shows localized date when more than 2 days remain', () => {
    const label = formatRelativeRenewalTime({
      nextChargeAt: chargeAtOffset(2 * 24 * 60 * 60 * 1000 + 60_000),
      lang: 'en',
      now: NOW,
    });

    expect(label).toMatch(/Aug/);
    expect(label).toMatch(/2026/);
    expect(label).not.toMatch(/^in /);
  });

  test('shows prefixed days and hours below 2 days', () => {
    expect(
      formatRelativeRenewalTime({
        nextChargeAt: chargeAtOffset(2 * 24 * 60 * 60 * 1000),
        lang: 'en',
        now: NOW,
      })
    ).toBe('in 2 days');

    expect(
      formatRelativeRenewalTime({
        nextChargeAt: chargeAtOffset(30 * 60 * 60 * 1000),
        lang: 'en',
        now: NOW,
      })
    ).toBe('in 1 day 6 hours');

    expect(
      formatRelativeRenewalTime({
        nextChargeAt: chargeAtOffset(30 * 60 * 60 * 1000),
        lang: 'ru',
        now: NOW,
      })
    ).toBe('через 1 день 6 часов');
  });

  test('shows prefixed hours and minutes below 24 hours', () => {
    expect(
      formatRelativeRenewalTime({
        nextChargeAt: chargeAtOffset(24 * 60 * 60 * 1000),
        lang: 'en',
        now: NOW,
      })
    ).toBe('in 1 day');

    expect(
      formatRelativeRenewalTime({
        nextChargeAt: chargeAtOffset(3 * 60 * 60 * 1000 + 18 * 60 * 1000),
        lang: 'en',
        now: NOW,
      })
    ).toBe('in 3 hours 18 minutes');
  });

  test('shows prefixed minutes below 1 hour', () => {
    expect(
      formatRelativeRenewalTime({
        nextChargeAt: chargeAtOffset(12 * 60 * 1000),
        lang: 'en',
        now: NOW,
      })
    ).toBe('in 12 minutes');

    expect(
      formatRelativeRenewalTime({
        nextChargeAt: chargeAtOffset(12 * 60 * 1000),
        lang: 'ru',
        now: NOW,
      })
    ).toBe('через 12 минут');
  });

  test('shows prefixed seconds below 1 minute', () => {
    expect(
      formatRelativeRenewalTime({
        nextChargeAt: chargeAtOffset(42 * 1000),
        lang: 'en',
        now: NOW,
      })
    ).toBe('in 42 seconds');

    expect(
      formatRelativeRenewalTime({
        nextChargeAt: chargeAtOffset(42 * 1000),
        lang: 'ru',
        now: NOW,
      })
    ).toBe('через 42 секунды');
  });

  test('shows in-progress overdue message shortly after charge time', () => {
    expect(
      formatRelativeRenewalTime({
        nextChargeAt: NOW.toISOString(),
        lang: 'en',
        now: NOW,
      })
    ).toBe(RENEWAL_COUNTDOWN_OVERDUE_IN_PROGRESS.en);

    expect(
      formatRelativeRenewalTime({
        nextChargeAt: chargeAtOffset(-RENEWAL_OVERDUE_IN_PROGRESS_MS),
        lang: 'ru',
        now: NOW,
      })
    ).toBe(RENEWAL_COUNTDOWN_OVERDUE_IN_PROGRESS.ru);
  });

  test('shows awaiting confirmation after overdue grace window', () => {
    expect(
      formatRelativeRenewalTime({
        nextChargeAt: chargeAtOffset(-RENEWAL_OVERDUE_IN_PROGRESS_MS - 1000),
        lang: 'en',
        now: NOW,
      })
    ).toBe(RENEWAL_COUNTDOWN_OVERDUE_AWAITING.en);

    expect(
      formatRelativeRenewalTime({
        nextChargeAt: chargeAtOffset(-10 * 60 * 1000),
        lang: 'ru',
        now: NOW,
      })
    ).toBe(RENEWAL_COUNTDOWN_OVERDUE_AWAITING.ru);
  });

  test('uses expiresAt when nextChargeAt is stale after plan extension', () => {
    const staleChargeAt = chargeAtOffset(-10 * 60 * 1000);
    const freshExpiresAt = chargeAtOffset(4 * 60 * 1000);

    expect(
      resolveRenewalCountdownDisplay({
        nextChargeAt: staleChargeAt,
        expiresAt: freshExpiresAt,
        lang: 'ru',
        now: NOW,
      }).label
    ).toMatch(/^через /);
  });

  test('uses correct Russian declensions', () => {
    expect(
      formatRelativeRenewalTime({
        nextChargeAt: chargeAtOffset(60 * 1000),
        lang: 'ru',
        now: NOW,
      })
    ).toBe('через 1 минуту');

    expect(
      formatRelativeRenewalTime({
        nextChargeAt: chargeAtOffset(2000),
        lang: 'ru',
        now: NOW,
      })
    ).toBe('через 2 секунды');
  });
});

describe('resolveRenewalCountdownDisplay', () => {
  test('prefers nextChargeAt countdown over expiresAt fallback', () => {
    const display = resolveRenewalCountdownDisplay({
      nextChargeAt: chargeAtOffset(5 * 60 * 1000),
      expiresAt: chargeAtOffset(30 * 24 * 60 * 60 * 1000),
      lang: 'ru',
      now: NOW,
    });

    expect(display.source).toBe('nextChargeAt');
    expect(display.label).toBe('через 5 минут');
    expect(display.isRelative).toBe(true);
    expect(display.title).toMatch(/2026/);
  });

  test('falls back to expiresAt absolute date when nextChargeAt is missing and period is far away', () => {
    const display = resolveRenewalCountdownDisplay({
      nextChargeAt: null,
      expiresAt: chargeAtOffset(30 * 24 * 60 * 60 * 1000),
      lang: 'en',
      now: NOW,
    });

    expect(display.source).toBe('expiresAt');
    expect(display.label).toMatch(/2026/);
    expect(display.isRelative).toBe(false);
    expect(display.title).toMatch(/2026/);
  });

  test('falls back to expiresAt relative countdown when nextChargeAt is missing and period is near', () => {
    const display = resolveRenewalCountdownDisplay({
      nextChargeAt: null,
      expiresAt: chargeAtOffset(5 * 60 * 1000),
      lang: 'ru',
      now: NOW,
    });

    expect(display.source).toBe('expiresAt');
    expect(display.label).toBe('через 5 минут');
    expect(display.isRelative).toBe(true);
    expect(display.title).toMatch(/2026/);
  });

  test('falls back to expiresAt absolute date when period already ended', () => {
    const expiresAt = chargeAtOffset(-5 * 60 * 1000);
    const display = resolveRenewalCountdownDisplay({
      nextChargeAt: null,
      expiresAt,
      lang: 'ru',
      now: NOW,
    });

    expect(display.source).toBe('expiresAt');
    expect(display.isRelative).toBe(false);
    expect(display.isOverdue).toBe(true);
    expect(display.label).toMatch(/2026/);
    expect(display.label).not.toMatch(/обновляется|ожидается/i);
  });

  test('returns empty display when neither timestamp is available', () => {
    expect(
      resolveRenewalCountdownDisplay({
        nextChargeAt: null,
        expiresAt: null,
        lang: 'en',
        now: NOW,
      })
    ).toEqual({
      label: null,
      title: null,
      source: null,
      isRelative: false,
      isOverdue: false,
    });
  });
});

describe('getRenewalCountdownTickInterval', () => {
  test('ticks every second only in the last minute', () => {
    expect(getRenewalCountdownTickInterval(30 * 60 * 1000)).toBe(60_000);
    expect(getRenewalCountdownTickInterval(60 * 1000)).toBe(60_000);
    expect(getRenewalCountdownTickInterval(59 * 1000)).toBe(1000);
  });

  test('ticks every minute when overdue or far away', () => {
    expect(getRenewalCountdownTickInterval(-1)).toBe(60_000);
    expect(getRenewalCountdownTickInterval(3 * 24 * 60 * 60 * 1000)).toBe(60_000);
  });
});

describe('isRenewalCountdownOverdue', () => {
  test('detects overdue charge times', () => {
    expect(isRenewalCountdownOverdue(NOW.toISOString(), NOW)).toBe(true);
    expect(isRenewalCountdownOverdue(chargeAtOffset(1000), NOW)).toBe(false);
  });
});
