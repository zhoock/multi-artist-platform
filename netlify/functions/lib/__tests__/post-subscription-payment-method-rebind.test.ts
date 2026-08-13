/**
 * Rebind checkout guard: release abandoned pending rows before the open-payment check.
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { HandlerEvent } from '@netlify/functions';
import type { QueryResult } from 'pg';

jest.mock('node:dns', () => ({
  setDefaultResultOrder: jest.fn(),
}));

jest.mock('../api-helpers', () => {
  const actual = jest.requireActual('../api-helpers') as typeof import('../api-helpers');
  return {
    ...actual,
    getUserIdFromEvent: jest.fn(),
  };
});

jest.mock('../db', () => ({
  query: jest.fn(),
  isMissingRelationError: jest.fn(() => false),
}));

jest.mock('../email-verification', () => ({
  isUserEmailVerified: jest.fn(async () => true),
}));

jest.mock('../subscription-feature-flag', () => ({
  isSubscriptionAutoRenewEnabled: jest.fn(() => true),
}));

jest.mock('../subscriptions', () => ({
  getViewerSubscription: jest.fn(),
}));

jest.mock('../complete-dev-payment', () => ({
  attachDevSucceededSubscriptionCheckout: jest.fn(),
}));

jest.mock('../dev-payment-mode', () => ({
  isDevPaymentModeEnabled: jest.fn(() => true),
  logDevPaymentSubscriptionCreate: jest.fn(),
  extractReturnToFromReturnUrl: jest.fn(() => undefined),
}));

jest.mock('../subscription-billing', () => {
  const actual = jest.requireActual(
    '../subscription-billing'
  ) as typeof import('../subscription-billing');
  return {
    ...actual,
    releaseAbandonedCheckoutPayments: jest.fn(),
    findOpenSubscriptionPayment: jest.fn(),
    createPendingSubscriptionPayment: jest.fn(),
    attachProviderPaymentId: jest.fn(),
    markSubscriptionRebindResumeAutoRenewIntent: jest.fn(),
  };
});

import { getUserIdFromEvent } from '../api-helpers';
import { query } from '../db';
import { attachDevSucceededSubscriptionCheckout } from '../complete-dev-payment';
import {
  createPendingSubscriptionPayment,
  findOpenSubscriptionPayment,
  markSubscriptionRebindResumeAutoRenewIntent,
  releaseAbandonedCheckoutPayments,
} from '../subscription-billing';
import { getViewerSubscription } from '../subscriptions';
import { handler } from '../../post-subscription-payment-method-rebind';

const USER_ID = 'af97f741-8dae-410b-94a6-3f828f9140a4';
const CHECKOUT_KINDS = new Set(['initial', 'upgrade', 'rebind']);

type FakePayment = {
  id: string;
  kind: string;
  status: string;
  provider_payment_id: string | null;
};

const mockedGetUserId = getUserIdFromEvent as jest.MockedFunction<typeof getUserIdFromEvent>;
const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedGetSubscription = getViewerSubscription as jest.MockedFunction<
  typeof getViewerSubscription
>;
const mockedReleaseAbandoned = releaseAbandonedCheckoutPayments as jest.MockedFunction<
  typeof releaseAbandonedCheckoutPayments
>;
const mockedFindOpen = findOpenSubscriptionPayment as jest.MockedFunction<
  typeof findOpenSubscriptionPayment
>;
const mockedCreatePending = createPendingSubscriptionPayment as jest.MockedFunction<
  typeof createPendingSubscriptionPayment
>;
const mockedAttachDev = attachDevSucceededSubscriptionCheckout as jest.MockedFunction<
  typeof attachDevSucceededSubscriptionCheckout
>;
const mockedMarkResumeIntent = markSubscriptionRebindResumeAutoRenewIntent as jest.MockedFunction<
  typeof markSubscriptionRebindResumeAutoRenewIntent
>;

let payments: FakePayment[] = [];

function fakeQueryResult(rows: Record<string, unknown>[] = []): QueryResult<any> {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] };
}

function rebindEvent(): HandlerEvent {
  return {
    httpMethod: 'POST',
    body: '{}',
    headers: {},
    isBase64Encoded: false,
    path: '/api/subscription/payment-method/rebind',
    rawUrl: '',
    queryStringParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
  } as HandlerEvent;
}

function seedOpenPayment(row: FakePayment): void {
  payments = [row];
}

beforeEach(() => {
  jest.clearAllMocks();
  payments = [];

  mockedGetUserId.mockReturnValue(USER_ID);
  mockedGetSubscription.mockResolvedValue({ plan: 'explorer' } as never);
  mockedQuery.mockResolvedValue(fakeQueryResult([{ email: 'zhoock@zhoock.ru' }]));
  mockedCreatePending.mockResolvedValue('new-rebind-id');
  mockedAttachDev.mockResolvedValue({ paymentId: 'dev-pay-id' });

  mockedReleaseAbandoned.mockImplementation(async () => {
    const before = payments.length;
    payments = payments.filter(
      (row) =>
        !(
          row.status === 'pending' &&
          row.provider_payment_id === null &&
          CHECKOUT_KINDS.has(row.kind)
        )
    );
    return before - payments.length;
  });

  mockedFindOpen.mockImplementation(async () => {
    const open = payments.find(
      (row) => row.status === 'pending' || row.status === 'waiting_for_capture'
    );
    return open ? { id: open.id } : null;
  });
});

describe('POST /api/subscription/payment-method/rebind checkout guard', () => {
  test('allows retry when a pending rebind has no provider_payment_id', async () => {
    seedOpenPayment({
      id: '938c0545-e1d2-4333-bd45-4a69c5da3942',
      kind: 'rebind',
      status: 'pending',
      provider_payment_id: null,
    });

    const response = await handler(rebindEvent(), {} as never);

    expect(mockedReleaseAbandoned).toHaveBeenCalledWith(USER_ID);
    expect(mockedFindOpen).toHaveBeenCalledWith(USER_ID);
    expect(mockedReleaseAbandoned.mock.invocationCallOrder[0]).toBeLessThan(
      mockedFindOpen.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
    expect(response?.statusCode).toBe(200);
    expect(mockedCreatePending).toHaveBeenCalledWith(USER_ID, 'explorer', 'rebind');
    expect(JSON.parse(String(response?.body))).toMatchObject({
      success: true,
      data: {
        paymentId: 'dev-pay-id',
        subscriptionPaymentId: 'new-rebind-id',
        devPaymentCompleted: true,
      },
    });
  });

  test('still returns 409 for waiting_for_capture with a provider payment', async () => {
    seedOpenPayment({
      id: 'live-waiting',
      kind: 'rebind',
      status: 'waiting_for_capture',
      provider_payment_id: 'yk-payment-1',
    });

    const response = await handler(rebindEvent(), {} as never);

    expect(mockedReleaseAbandoned).toHaveBeenCalledWith(USER_ID);
    expect(response?.statusCode).toBe(409);
    expect(JSON.parse(String(response?.body))).toMatchObject({
      code: 'CHECKOUT_IN_PROGRESS',
    });
    expect(mockedCreatePending).not.toHaveBeenCalled();
  });

  test('still returns 409 for pending checkout that already has provider_payment_id', async () => {
    seedOpenPayment({
      id: 'live-pending',
      kind: 'rebind',
      status: 'pending',
      provider_payment_id: 'yk-payment-2',
    });

    const response = await handler(rebindEvent(), {} as never);

    expect(response?.statusCode).toBe(409);
    expect(mockedCreatePending).not.toHaveBeenCalled();
  });
});

describe('POST /api/subscription/payment-method/rebind resume intent', () => {
  test('persists resume-auto-renew intent on the payment row', async () => {
    const response = await handler(
      {
        ...rebindEvent(),
        body: JSON.stringify({ intent: 'resume-auto-renew' }),
      },
      {} as never
    );

    expect(response?.statusCode).toBe(200);
    expect(mockedMarkResumeIntent).toHaveBeenCalledWith('new-rebind-id');
  });

  test('does not persist resume intent for ordinary rebind', async () => {
    const response = await handler(rebindEvent(), {} as never);

    expect(response?.statusCode).toBe(200);
    expect(mockedMarkResumeIntent).not.toHaveBeenCalled();
  });
});
