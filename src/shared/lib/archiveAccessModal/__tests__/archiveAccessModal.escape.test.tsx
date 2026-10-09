/** @jest-environment jsdom */

import React from 'react';
import { describe, expect, jest, test, beforeEach } from '@jest/globals';
import { render, waitFor, fireEvent } from '@testing-library/react';

import { PremiumSubscriptionProvider } from '@features/premiumSubscription';
import type { MyArchiveData } from '@shared/api/archive';
import { renderWithProviders } from '@shared/lib/test-utils';
import { ArchiveAccessModalProvider, useArchiveAccessModal } from '../archiveAccessModalContext';

const getMyArchiveMock = jest.fn<() => Promise<unknown>>();
const getTokenMock = jest.fn<() => string | null>();
const getUserMock = jest.fn<() => { id: string; email: string } | null>();
const clearPremiumCheckoutAuthIntentMock = jest.fn();

jest.mock('@shared/api/archive', () => ({
  getMyArchive: () => getMyArchiveMock(),
  getArchiveStatus: jest.fn(),
}));

jest.mock('@shared/lib/auth', () => ({
  getToken: () => getTokenMock(),
  getUser: () => getUserMock(),
  isEmailVerified: () => true,
  subscribeAuthSession: () => () => {},
  getAuthSessionIdentityKey: () => 'user:user-1',
  getAuthSessionUserSnapshot: () => getUserMock(),
}));

jest.mock('@shared/lib/authIntent', () => ({
  beginPremiumCheckoutAuthIntent: jest.fn(),
  clearPremiumCheckoutAuthIntent: () => clearPremiumCheckoutAuthIntentMock(),
}));

jest.mock('@shared/api/subscription', () => ({
  createSubscriptionPayment: jest.fn(),
  cancelScheduledSubscriptionDowngrade: jest.fn(),
  scheduleSubscriptionDowngrade: jest.fn(),
}));

jest.mock('@shared/lib/subscription/isSubscriptionAutoRenewClientEnabled', () => ({
  isSubscriptionAutoRenewClientEnabled: () => false,
}));

function OpenPremiumButton() {
  const { open } = useArchiveAccessModal();
  return (
    <button type="button" onClick={() => open()}>
      Open premium
    </button>
  );
}

function buildArchiveResponse(): MyArchiveData {
  return {
    isPremium: false,
    slotsUsed: 0,
    slotsLimit: 20,
    artists: [],
    billing: {
      status: 'expired',
      plan: null,
      slotsLimit: 20,
      expiresAt: null,
      autoRenewEnabled: false,
      hasPremiumAccess: false,
      hasSavedPaymentMethod: false,
      paymentMethodTitle: null,
      nextChargeAt: null,
      scheduledPlan: null,
      renewalAttemptCount: null,
      firstFailedAt: null,
      autoRenewResumeAllowed: false,
    },
  };
}

function dispatchDialogCancel(dialog: HTMLDialogElement) {
  dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
}

describe('ArchiveAccessModal LocalModal Escape', () => {
  beforeEach(() => {
    clearPremiumCheckoutAuthIntentMock.mockClear();
    getTokenMock.mockReturnValue('token');
    getUserMock.mockReturnValue({ id: 'user-1', email: 'u@test.com' });
    getMyArchiveMock.mockResolvedValue(buildArchiveResponse());

    jest.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function showModal(
      this: HTMLDialogElement
    ) {
      this.open = true;
    });
    jest.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function close(
      this: HTMLDialogElement
    ) {
      this.open = false;
    });
  });

  test('Escape on premium plan modal runs close cleanup', async () => {
    renderWithProviders(
      <PremiumSubscriptionProvider>
        <ArchiveAccessModalProvider>
          <OpenPremiumButton />
        </ArchiveAccessModalProvider>
      </PremiumSubscriptionProvider>
    );

    fireEvent.click(document.querySelector('button')!);

    await waitFor(() => {
      const dialogs = document.querySelectorAll('dialog');
      expect(dialogs.length).toBeGreaterThan(0);
      expect((dialogs[0] as HTMLDialogElement).open).toBe(true);
    });

    const premiumDialog = document.querySelector(
      'dialog.subscription-plan-modal'
    ) as HTMLDialogElement;
    expect(premiumDialog).toBeTruthy();

    dispatchDialogCancel(premiumDialog);

    expect(clearPremiumCheckoutAuthIntentMock).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(premiumDialog.open).toBe(false);
    });
  });
});
