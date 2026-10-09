/**
 * PATCH /api/subscription/auto-renew handler — error codes surfaced to client.
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { HandlerEvent } from '@netlify/functions';

jest.mock('../db', () => ({
  query: jest.fn(),
  isMissingRelationError: jest.fn(() => false),
}));

jest.mock('../api-helpers', () => {
  const actual = jest.requireActual('../api-helpers') as typeof import('../api-helpers');
  return {
    ...actual,
    getUserIdFromEvent: jest.fn(),
  };
});

jest.mock('../archive', () => ({
  getMyArchiveForUser: jest.fn(),
}));

jest.mock('../subscription-auto-renew-patch', () => ({
  patchSubscriptionAutoRenew: jest.fn(),
  SubscriptionAutoRenewPatchError: jest.requireActual('../subscription-auto-renew-patch')
    .SubscriptionAutoRenewPatchError,
}));

import { getUserIdFromEvent } from '../api-helpers';
import { getMyArchiveForUser } from '../archive';
import {
  patchSubscriptionAutoRenew,
  SubscriptionAutoRenewPatchError,
} from '../subscription-auto-renew-patch';
import { handler } from '../../patch-subscription-auto-renew';

const USER_ID = 'af97f741-8dae-410b-94a6-3f828f9140a4';

function patchEvent(autoRenewEnabled: boolean): HandlerEvent {
  return {
    httpMethod: 'PATCH',
    body: JSON.stringify({ autoRenewEnabled }),
    headers: {},
    path: '/api/subscription/auto-renew',
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    queryStringParameters: null,
    rawUrl: '',
    rawQuery: '',
    route: null,
  } as HandlerEvent;
}

describe('patch-subscription-auto-renew handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getUserIdFromEvent).mockReturnValue(USER_ID);
  });

  test('returns structured error for billing origin mismatch on enable', async () => {
    jest
      .mocked(patchSubscriptionAutoRenew)
      .mockRejectedValue(
        new SubscriptionAutoRenewPatchError(
          'Subscription billing origin is incompatible with this runtime',
          'BILLING_ORIGIN_MISMATCH',
          409
        )
      );

    const response = await handler(patchEvent(true), {} as never, jest.fn());

    expect(response?.statusCode).toBe(409);
    const body = JSON.parse(String(response?.body));
    expect(body).toMatchObject({
      success: false,
      code: 'BILLING_ORIGIN_MISMATCH',
    });
    expect(getMyArchiveForUser).not.toHaveBeenCalled();
  });

  test('returns archive after successful disable', async () => {
    jest.mocked(patchSubscriptionAutoRenew).mockResolvedValue({} as never);
    jest.mocked(getMyArchiveForUser).mockResolvedValue({
      billing: { status: 'cancel_at_period_end', autoRenewEnabled: false },
    } as never);

    const response = await handler(patchEvent(false), {} as never, jest.fn());

    expect(response?.statusCode).toBe(200);
    const body = JSON.parse(String(response?.body));
    expect(body.success).toBe(true);
    expect(body.data.archive.billing.autoRenewEnabled).toBe(false);
  });
});
