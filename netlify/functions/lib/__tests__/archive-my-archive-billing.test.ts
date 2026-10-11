/**
 * GET /api/my-archive billing read path — must not depend on PR-4 subscription_payments columns.
 */

import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import type { QueryResult } from 'pg';

jest.mock('../db', () => ({
  query: jest.fn(),
  isMissingRelationError: jest.fn(() => false),
}));

jest.mock('../subscription-access', () => ({
  hasPremiumAccess: jest.fn(() => true),
  deriveAutoRenewEnabled: jest.fn((status: string) => status === 'active'),
  normalizeCanonicalStatus: jest.fn((status: string) => status),
}));

jest.mock('../subscriptions', () => ({
  getViewerSubscription: jest.fn(),
}));

jest.mock('../subscription-renewal-nudge', () => ({
  nudgeRenewalChargeIfDueForUser: jest.fn(async () => {}),
}));

jest.mock('../subscription-billing', () => {
  const actual = jest.requireActual('../subscription-billing') as Record<string, unknown>;
  return {
    ...actual,
    findUnresolvedRenewalAttemptForSubscription: jest.fn(async () => {
      throw new Error('column sp.idempotence_key does not exist');
    }),
    findOpenRenewalPayment: jest.fn(async () => null),
  };
});

import { query } from '../db';
import { getViewerSubscription } from '../subscriptions';
import { findOpenRenewalPayment } from '../subscription-billing';
import { getMyArchiveForUser } from '../archive';

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedGetSubscription = getViewerSubscription as jest.MockedFunction<
  typeof getViewerSubscription
>;
const mockedFindOpenRenewal = findOpenRenewalPayment as jest.MockedFunction<
  typeof findOpenRenewalPayment
>;

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const EXPIRES = new Date('2026-10-11T14:00:00.000Z');

function fakeQueryResult(rows: Record<string, unknown>[] = []): QueryResult<any> {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] };
}

function activeSubscription() {
  return {
    id: 'sub-1',
    userId: USER_ID,
    status: 'active' as const,
    plan: 'explorer',
    slotsLimit: 3,
    provider: 'yookassa',
    providerSubscriptionId: 'pay-1',
    startedAt: new Date('2026-10-11T13:00:00.000Z'),
    expiresAt: EXPIRES,
    paymentMethodId: 'pm-1',
    nextChargeAt: EXPIRES,
    billingOrigin: 'production' as const,
    createdAt: new Date('2026-10-11T13:00:00.000Z'),
    updatedAt: new Date('2026-10-11T13:00:00.000Z'),
  };
}

describe('getMyArchiveForUser billing snapshot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetSubscription.mockResolvedValue(activeSubscription());
    mockedFindOpenRenewal.mockResolvedValue(null);
    mockedQuery.mockResolvedValue(fakeQueryResult([]));
  });

  test('returns billing.status active for active subscription without PR-4 payment columns', async () => {
    const dto = await getMyArchiveForUser(USER_ID);

    expect(dto.billing.status).toBe('active');
    expect(dto.billing.hasPremiumAccess).toBe(true);
    expect(dto.isPremium).toBe(true);
    expect(mockedFindOpenRenewal).toHaveBeenCalledWith(USER_ID);
  });
});
