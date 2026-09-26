/** @jest-environment jsdom */

import React from 'react';
import { describe, expect, jest, test, beforeEach } from '@jest/globals';
import { act, render, waitFor, fireEvent, screen } from '@testing-library/react';

import { PremiumSubscriptionProvider } from '@features/premiumSubscription';
import type { MyArchiveData } from '@shared/api/archive';
import { renderWithProviders } from '@shared/lib/test-utils';
import { ArchiveAccessModalProvider, useArchiveAccessModal } from '../archiveAccessModalContext';

const getMyArchiveMock = jest.fn<() => Promise<unknown>>();
const getArchiveStatusMock = jest.fn<(artistUserId: string) => Promise<unknown>>();
const getTokenMock = jest.fn<() => string | null>();
const getUserMock = jest.fn<() => { id: string; email: string } | null>();

jest.mock('@shared/api/archive', () => ({
  getMyArchive: () => getMyArchiveMock(),
  getArchiveStatus: (artistUserId: string) => getArchiveStatusMock(artistUserId),
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
  clearPremiumCheckoutAuthIntent: jest.fn(),
}));

jest.mock('@shared/api/subscription', () => ({
  createSubscriptionPayment: jest.fn(),
  cancelScheduledSubscriptionDowngrade: jest.fn(),
  scheduleSubscriptionDowngrade: jest.fn(),
}));

jest.mock('@shared/lib/subscription/isSubscriptionAutoRenewClientEnabled', () => ({
  isSubscriptionAutoRenewClientEnabled: () => false,
}));

function RequestAccessButton() {
  const { requestAccess } = useArchiveAccessModal();
  return (
    <button
      type="button"
      onClick={() =>
        void requestAccess({ artistUserId: 'artist-user-1', artistSlug: 'demo-artist' })
      }
    >
      Request access
    </button>
  );
}

function buildArchiveResponse(): MyArchiveData {
  return {
    isPremium: true,
    slotsUsed: 1,
    slotsLimit: 20,
    artists: [],
    billing: {
      status: 'active',
      plan: 'explorer',
      slotsLimit: 20,
      expiresAt: '2099-01-01T00:00:00.000Z',
      autoRenewEnabled: true,
      hasPremiumAccess: true,
      hasSavedPaymentMethod: true,
      paymentMethodTitle: null,
      nextChargeAt: null,
      scheduledPlan: null,
      renewalAttemptCount: null,
      firstFailedAt: null,
    },
  };
}

function dispatchDialogCancel(dialog: HTMLDialogElement) {
  dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
}

describe('AddArtistToArchiveModal LocalModal Escape', () => {
  beforeEach(() => {
    getTokenMock.mockReturnValue('token');
    getUserMock.mockReturnValue({ id: 'user-1', email: 'u@test.com' });
    getMyArchiveMock.mockResolvedValue(buildArchiveResponse());
    getArchiveStatusMock.mockResolvedValue({
      isPremium: true,
      artistInArchive: false,
      slotsUsed: 1,
      slotsLimit: 20,
    });

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

  test('Escape clears add-artist modal via closeAddArtist flow', async () => {
    renderWithProviders(
      <PremiumSubscriptionProvider>
        <ArchiveAccessModalProvider>
          <RequestAccessButton />
        </ArchiveAccessModalProvider>
      </PremiumSubscriptionProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Request access' }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: /Artist not in your collection|Артист не в вашей коллекции/i,
        })
      ).toBeTruthy();
    });

    const addArtistDialog = document.querySelector(
      'dialog.add-artist-to-archive-modal'
    ) as HTMLDialogElement;
    expect(addArtistDialog?.open).toBe(true);

    act(() => {
      dispatchDialogCancel(addArtistDialog);
    });

    await waitFor(() => {
      expect(addArtistDialog.open).toBe(false);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Request access' }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: /Artist not in your collection|Артист не в вашей коллекции/i,
        })
      ).toBeTruthy();
    });
  });
});
