/** @jest-environment jsdom */

import React from 'react';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, render, waitFor } from '@testing-library/react';

import { EMPTY_BILLING_SNAPSHOT } from '@shared/api/billing';
import {
  PremiumSubscriptionProvider,
  usePremiumSubscription,
} from '@features/premiumSubscription/lib/PremiumSubscriptionContext';

const getMyArchiveMock = jest.fn<() => Promise<unknown>>();

jest.mock('@shared/lib/auth', () => ({
  getToken: () => 'test-token',
  AUTH_SESSION_CHANGED_EVENT: 'auth:session-changed',
}));

jest.mock('@shared/api/archive', () => ({
  getMyArchive: () => getMyArchiveMock(),
}));

function activeArchivePayload() {
  return {
    isPremium: true,
    slotsUsed: 1,
    slotsLimit: 3,
    billing: {
      ...EMPTY_BILLING_SNAPSHOT,
      status: 'active' as const,
      plan: 'explorer' as const,
      hasPremiumAccess: true,
      autoRenewEnabled: true,
      slotsLimit: 3,
      expiresAt: '2026-10-11T14:00:00.000Z',
    },
  };
}

function Probe() {
  const { billing, refetch } = usePremiumSubscription();
  return (
    <>
      <div data-testid="probe" data-status={billing.status ?? ''} />
      <button type="button" onClick={() => void refetch()}>
        refetch
      </button>
    </>
  );
}

describe('PremiumSubscriptionProvider refetch errors', () => {
  beforeEach(() => {
    getMyArchiveMock.mockReset();
  });

  test('keeps prior billing snapshot when my-archive fails after a successful load', async () => {
    getMyArchiveMock
      .mockResolvedValueOnce(activeArchivePayload())
      .mockRejectedValueOnce(new Error('Failed to load collection'));

    render(
      <PremiumSubscriptionProvider>
        <Probe />
      </PremiumSubscriptionProvider>
    );

    await waitFor(() => {
      expect(document.querySelector('[data-testid="probe"]')?.getAttribute('data-status')).toBe(
        'active'
      );
    });

    await act(async () => {
      document.querySelector('button')?.click();
    });

    await waitFor(() => {
      expect(getMyArchiveMock).toHaveBeenCalledTimes(2);
    });

    expect(document.querySelector('[data-testid="probe"]')?.getAttribute('data-status')).toBe(
      'active'
    );
  });
});
