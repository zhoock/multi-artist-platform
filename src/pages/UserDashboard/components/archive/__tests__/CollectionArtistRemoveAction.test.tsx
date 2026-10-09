import React from 'react';
import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { screen, fireEvent, act } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';
import type { MyArchiveArtist } from '@shared/api/archive';
import { isAutoRenewCollectionRemoveHold } from '@shared/lib/subscription/autoRenewCollectionHold';
import { RENEWAL_OVERDUE_IN_PROGRESS_MS } from '@shared/lib/subscription/renewalCountdown';
import { EMPTY_BILLING_SNAPSHOT } from '@shared/api/billing';
import { resetRenewalCountdownClockForTests } from '@shared/lib/subscription/renewalCountdownClock';

import { CollectionArtistRemoveAction } from '../CollectionArtistRemoveAction';

function lockedArtist(lockedUntil: string): MyArchiveArtist {
  return {
    id: '1',
    artistUserId: 'a1',
    slug: 'artist',
    name: 'Artist',
    genreCode: 'rock',
    genreLabel: { en: 'Rock', ru: 'Рок' },
    cover: null,
    addedAt: '2026-01-01',
    isActive: true,
    isLocked: true,
    lockedUntil,
  };
}

const defaultProps = {
  hasPremiumAccess: true,
  lang: 'en' as const,
  removeLabel: 'Remove',
  removeSubscriptionTooltip: 'Need support',
  removeLockedPeriodHint:
    'This artist is locked until the end of your current paid subscription period.',
  actionBusy: false,
  onRemove: jest.fn(),
};

describe('CollectionArtistRemoveAction lock UI', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-01T12:00:00.000Z'));
    resetRenewalCountdownClockForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
    resetRenewalCountdownClockForTests();
  });

  test('shows 5 minutes in tooltip, not 1 day', () => {
    const lockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    renderWithProviders(
      <CollectionArtistRemoveAction artist={lockedArtist(lockedUntil)} {...defaultProps} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.textContent).toMatch(/5 minutes/i);
    expect(tooltip.textContent).not.toMatch(/1 day/i);
    expect(tooltip.textContent).toMatch(/current paid subscription period/i);
    expect(tooltip.textContent).not.toMatch(/30 days after being added/i);
  });

  test('shows subscription hint in lock tooltip when support is inactive', () => {
    const lockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    renderWithProviders(
      <CollectionArtistRemoveAction
        artist={lockedArtist(lockedUntil)}
        {...defaultProps}
        hasPremiumAccess={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.textContent).toMatch(/5 minutes/i);
    expect(tooltip.textContent).toMatch(/Need support/i);
  });

  test('period end: past_due billing in settlement window keeps lock UI (no trash flash)', () => {
    const nextChargeAt = '2026-06-01T12:00:00.000Z';
    jest.setSystemTime(new Date('2026-06-01T12:00:05.000Z'));

    const billingSnapshot = {
      ...EMPTY_BILLING_SNAPSHOT,
      autoRenewEnabled: true,
      hasSavedPaymentMethod: true,
      nextChargeAt,
      status: 'past_due' as const,
      hasPremiumAccess: false,
    };
    expect(isAutoRenewCollectionRemoveHold(billingSnapshot)).toBe(true);

    const lockedUntil = new Date(Date.now() - 1000).toISOString();
    const { rerender } = renderWithProviders(
      <CollectionArtistRemoveAction
        artist={lockedArtist(lockedUntil)}
        {...defaultProps}
        hasPremiumAccess={false}
        autorenewCollectionHold={isAutoRenewCollectionRemoveHold(billingSnapshot)}
        billing={billingSnapshot}
        autoRenewPendingLabel="Updating support…"
      />
    );

    expect(screen.getByRole('button', { name: 'Remove' }).className).toContain(
      'collection__lock-action-btn'
    );
    expect(screen.queryByRole('button', { name: /Need support/i })).toBeNull();

    rerender(
      <CollectionArtistRemoveAction
        artist={lockedArtist(lockedUntil)}
        {...defaultProps}
        hasPremiumAccess={false}
        autorenewCollectionHold={isAutoRenewCollectionRemoveHold(billingSnapshot)}
        billing={{ ...billingSnapshot, status: 'active' }}
        autoRenewPendingLabel="Updating support…"
      />
    );
    expect(screen.getByRole('button', { name: 'Remove' }).className).toContain(
      'collection__lock-action-btn'
    );

    act(() => {
      jest.setSystemTime(
        new Date(new Date(nextChargeAt).getTime() + RENEWAL_OVERDUE_IN_PROGRESS_MS + 1000)
      );
    });
    rerender(
      <CollectionArtistRemoveAction
        artist={lockedArtist(lockedUntil)}
        {...defaultProps}
        hasPremiumAccess={false}
        autorenewCollectionHold={isAutoRenewCollectionRemoveHold(billingSnapshot)}
        billing={billingSnapshot}
      />
    );

    expect(screen.getByRole('button', { name: /Remove\. Need support/i }).className).toContain(
      'collection__subscription-gate-btn'
    );
  });

  test('after successful renewal with expired lock shows active remove', () => {
    const lockedUntil = new Date(Date.now() - 1000).toISOString();
    renderWithProviders(
      <CollectionArtistRemoveAction
        artist={lockedArtist(lockedUntil)}
        {...defaultProps}
        hasPremiumAccess
        autorenewCollectionHold={false}
        billing={{
          ...EMPTY_BILLING_SNAPSHOT,
          expiresAt: '2026-07-01T12:00:00.000Z',
          nextChargeAt: '2026-07-01T12:00:00.000Z',
        }}
      />
    );

    const removeBtn = screen.getByRole('button', { name: 'Remove' });
    expect(removeBtn.className).toContain('collection__remove-action');
    expect(removeBtn.className).toContain('dashboard-button--destructive');
  });

  test('stale hasPremiumAccess after lock expiry keeps lock UI during autorenew hold', () => {
    const periodEnd = '2026-06-01T12:00:00.000Z';
    jest.setSystemTime(new Date('2026-06-01T12:00:02.000Z'));
    const lockedUntil = periodEnd;
    const billing = {
      ...EMPTY_BILLING_SNAPSHOT,
      autoRenewEnabled: true,
      hasSavedPaymentMethod: true,
      nextChargeAt: periodEnd,
      expiresAt: periodEnd,
      hasPremiumAccess: true,
      status: 'active' as const,
    };

    renderWithProviders(
      <CollectionArtistRemoveAction
        artist={lockedArtist(lockedUntil)}
        {...defaultProps}
        hasPremiumAccess
        autorenewCollectionHold={isAutoRenewCollectionRemoveHold(billing)}
        billing={billing}
        autoRenewPendingLabel="Updating..."
      />
    );

    const btn = screen.getByRole('button', { name: 'Remove' });
    expect(btn.className).toContain('collection__lock-action-btn');
    expect(btn.className).not.toContain('collection__remove-action');
  });

  test('shows lock with renewal label during auto-renew settlement instead of subscription gate', () => {
    const lockedUntil = new Date(Date.now() - 1000).toISOString();
    renderWithProviders(
      <CollectionArtistRemoveAction
        artist={lockedArtist(lockedUntil)}
        {...defaultProps}
        hasPremiumAccess={false}
        autorenewCollectionHold
        billing={{
          ...EMPTY_BILLING_SNAPSHOT,
          autoRenewEnabled: true,
          hasSavedPaymentMethod: true,
          nextChargeAt: new Date(Date.now() - 1000).toISOString(),
        }}
        autoRenewPendingLabel="Updating..."
      />
    );

    expect(screen.getByRole('button', { name: 'Remove' }).className).toContain(
      'collection__lock-action-btn'
    );
    expect(screen.queryByRole('button', { name: /Need support/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByRole('tooltip').textContent).toMatch(/Updating/i);
  });

  test('shows subscription gate instead of disabled destructive remove when lock expired without support', () => {
    const lockedUntil = new Date(Date.now() - 1000).toISOString();
    renderWithProviders(
      <CollectionArtistRemoveAction
        artist={lockedArtist(lockedUntil)}
        {...defaultProps}
        hasPremiumAccess={false}
        autorenewCollectionHold={false}
        billing={EMPTY_BILLING_SNAPSHOT}
      />
    );

    const btn = screen.getByRole('button', { name: /Remove\. Need support/i });
    expect(btn.className).toContain('collection__subscription-gate-btn');
    expect(btn.className).not.toContain('dashboard-button--destructive');

    fireEvent.click(btn);
    expect(screen.getByRole('tooltip').textContent).toMatch(/Need support/i);
  });

  test('switches from lock to remove when lockedUntil passes without manual reload', () => {
    const lockedUntil = new Date(Date.now() + 1000).toISOString();
    renderWithProviders(
      <CollectionArtistRemoveAction artist={lockedArtist(lockedUntil)} {...defaultProps} />
    );

    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
    expect(screen.queryByRole('tooltip')).toBeNull();

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(screen.queryByRole('tooltip')).toBeNull();
    const removeBtn = screen.getByRole('button', { name: 'Remove' });
    expect(removeBtn.className).toContain('collection__remove-action');
    expect(removeBtn.className).toContain('dashboard-button--destructive');
  });

  test('refreshes lock state when tab becomes visible after lock expired while hidden', () => {
    const lockedUntil = new Date(Date.now() + 60_000).toISOString();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });

    renderWithProviders(
      <CollectionArtistRemoveAction artist={lockedArtist(lockedUntil)} {...defaultProps} />
    );

    expect(screen.getByRole('button', { name: 'Remove' }).className).toContain(
      'collection__lock-action-btn'
    );

    act(() => {
      jest.setSystemTime(new Date(Date.now() + 120_000));
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(screen.getByRole('button', { name: 'Remove' }).className).toContain(
      'collection__remove-action'
    );
  });

  test('calls onTimeLockExpired when the time lock ends', () => {
    const onTimeLockExpired = jest.fn();
    const lockedUntil = new Date(Date.now() + 1000).toISOString();
    renderWithProviders(
      <CollectionArtistRemoveAction
        artist={lockedArtist(lockedUntil)}
        {...defaultProps}
        onTimeLockExpired={onTimeLockExpired}
      />
    );

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(onTimeLockExpired).toHaveBeenCalledTimes(1);
  });
});
