/**
 * PR-10.3 — lifecycle diagnostics helper tests.
 */

import { describe, expect, test, jest, beforeEach } from '@jest/globals';

jest.mock('../db', () => ({
  query: jest.fn(),
  isMissingRelationError: jest.fn(() => false),
}));

jest.mock('../subscriptions', () => ({
  getViewerSubscription: jest.fn(),
  mapSubscriptionRow: jest.fn((row: unknown) => row),
}));

import { query } from '../db';
import { dumpSubscriptionLifecycleDiagnostics } from '../subscription-lifecycle-diagnostics';
import { getViewerSubscription } from '../subscriptions';

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedGetSubscription = getViewerSubscription as jest.MockedFunction<
  typeof getViewerSubscription
>;

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const NOW = new Date('2026-08-05T12:00:00.000Z');

describe('dumpSubscriptionLifecycleDiagnostics (PR-10.3)', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
    mockedGetSubscription.mockReset();
  });

  test('returns billing screen and overlays derived read-only from snapshot', async () => {
    mockedGetSubscription.mockResolvedValue({
      id: 'sub-1',
      userId: USER_ID,
      status: 'active',
      plan: 'explorer',
      slotsLimit: 20,
      provider: 'yookassa',
      providerSubscriptionId: 'pay-1',
      startedAt: NOW,
      expiresAt: new Date('2026-09-05T12:00:00.000Z'),
      paymentMethodId: 'pm-1',
      paymentMethodTitle: '•••• 4242',
      nextChargeAt: new Date('2026-09-02T12:00:00.000Z'),
      renewalAttemptCount: 0,
      scheduledPlan: null,
      firstFailedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    mockedQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] })
      .mockResolvedValueOnce({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] });

    const dump = await dumpSubscriptionLifecycleDiagnostics(USER_ID, { now: NOW });

    expect(dump.userId).toBe(USER_ID);
    expect(dump.billingSnapshot?.status).toBe('active');
    expect(dump.billingSnapshot?.hasSavedPaymentMethod).toBe(true);
    expect(dump.billingScreen).toBe('ACTIVE');
    expect(Array.isArray(dump.billingOverlays)).toBe(true);
    expect(dump.invariantViolations).toEqual([]);
    expect(dump.payments).toEqual([]);
  });
});
