import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { HandlerEvent } from '@netlify/functions';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../track-stems-cleanup', () => ({
  removeTrackStemStorage: jest.fn(),
}));

import { query } from '../db';
import { removeTrackStemStorage } from '../track-stems-cleanup';
import { handler } from '../../update-track-has-stems';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockRemoveTrackStemStorage = removeTrackStemStorage as jest.MockedFunction<
  typeof removeTrackStemStorage
>;

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function authEvent(hasStems: boolean): HandlerEvent {
  return {
    httpMethod: 'POST',
    path: '/api/stems/has-stems',
    headers: {
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ albumId: 'my-album', trackId: 'track-1', hasStems }),
    isBase64Encoded: false,
  } as HandlerEvent;
}

jest.mock('../api-helpers', () => {
  const actual = jest.requireActual('../api-helpers') as object;
  return {
    ...actual,
    getUserIdFromEvent: jest.fn(() => USER_ID),
  };
});

describe('update-track-has-stems storage cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rowCount: 1, rows: [] } as never);
    mockRemoveTrackStemStorage.mockResolvedValue(undefined);
  });

  test('purges stem folder when hasStems is false', async () => {
    const res = await handler(authEvent(false), {} as never);
    expect(res.statusCode).toBe(200);
    expect(mockRemoveTrackStemStorage).toHaveBeenCalledWith(USER_ID, 'my-album', 'track-1');
  });

  test('does not purge stem folder when hasStems is true', async () => {
    const res = await handler(authEvent(true), {} as never);
    expect(res.statusCode).toBe(200);
    expect(mockRemoveTrackStemStorage).not.toHaveBeenCalled();
  });
});
