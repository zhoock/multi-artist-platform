/**
 * Album upload endpoints must reject unverified artists (P1-5 backend regression).
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

jest.mock('../email-verification', () => ({
  guardUserEmailVerifiedForUpload: jest.fn(),
}));

import { getUserIdFromEvent } from '../api-helpers';
import { guardUserEmailVerifiedForUpload } from '../email-verification';
import { handler as getTrackUploadUrlHandler } from '../../get-track-upload-url';

const mockedGetUserIdFromEvent = getUserIdFromEvent as jest.MockedFunction<
  typeof getUserIdFromEvent
>;
const mockedGuardUserEmailVerifiedForUpload =
  guardUserEmailVerifiedForUpload as jest.MockedFunction<typeof guardUserEmailVerifiedForUpload>;

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function buildPostEvent(body: Record<string, unknown>): HandlerEvent {
  return {
    httpMethod: 'POST',
    body: JSON.stringify(body),
    headers: { authorization: 'Bearer test-token' },
    path: '/api/tracks/upload-url',
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    queryStringParameters: null,
    rawUrl: '',
    rawQuery: '',
    route: null,
  } as HandlerEvent;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetUserIdFromEvent.mockReturnValue(USER_ID);
});

describe('guardUserEmailVerifiedForUpload integration', () => {
  test('get-track-upload-url rejects unverified artist before upload-url work', async () => {
    mockedGuardUserEmailVerifiedForUpload.mockResolvedValue({
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: 'Email verification required',
        code: 'EMAIL_NOT_VERIFIED',
      }),
    });

    const response = await getTrackUploadUrlHandler(
      buildPostEvent({ albumId: 'album-1', fileName: 'track.wav' }),
      {} as never
    );

    expect(response.statusCode).toBe(403);
    expect(mockedGuardUserEmailVerifiedForUpload).toHaveBeenCalledWith(USER_ID);
    const payload = JSON.parse(response.body);
    expect(payload.code).toBe('EMAIL_NOT_VERIFIED');
  });
});
