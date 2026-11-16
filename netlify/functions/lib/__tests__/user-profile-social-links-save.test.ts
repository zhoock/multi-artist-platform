import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { HandlerEvent } from '@netlify/functions';

jest.mock('../db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

jest.mock('../jwt', () => ({
  classifyAuthorizationHeader: jest.fn(() => ({
    kind: 'valid',
    userId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  })),
}));

import { query } from '../db';
import { handler } from '../../user-profile';

const OWNER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const mockQuery = query as jest.MockedFunction<typeof query>;

function makeSaveEvent(body: Record<string, unknown>): HandlerEvent {
  return {
    httpMethod: 'POST',
    path: '/api/user-profile',
    queryStringParameters: null,
    headers: { authorization: 'Bearer test-token' },
    body: JSON.stringify(body),
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    rawUrl: '/api/user-profile',
    rawQuery: '',
  } as HandlerEvent;
}

/** Parsed `social_links` JSONB passed to UPDATE. */
function savedSocialLinks(): Record<string, string> {
  const update = mockQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE users'));
  expect(update).toBeDefined();

  const sql = String(update![0]);
  const values = update![1] as unknown[];
  const match = sql.match(/social_links = \$(\d+)::jsonb/);
  expect(match).not.toBeNull();

  return JSON.parse(String(values[Number(match![1]) - 1])) as Record<string, string>;
}

describe('POST /api/user-profile — socialLinks save layer', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string) => {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (normalized.includes('social_links') && normalized.includes('SELECT')) {
        return {
          rowCount: 1,
          rows: [
            {
              social_links: {
                instagram: 'https://instagram.com/existing',
                managerEmail: 'old-manager@test.com',
                telegram: 'https://t.me/oldmanager',
              },
            },
          ],
        } as never;
      }
      if (normalized.includes('UPDATE users')) {
        return { rowCount: 1, rows: [] } as never;
      }
      return { rowCount: 0, rows: [] } as never;
    });
  });

  test('merges manager contacts without ReferenceError and keeps platform links', async () => {
    const response = await handler(
      makeSaveEvent({
        socialLinks: {
          managerEmail: 'manager@example.com',
          telegram: 'https://t.me/manager',
        },
      }),
      {} as never
    );

    expect(response?.statusCode).toBe(200);
    expect(savedSocialLinks()).toEqual({
      instagram: 'https://instagram.com/existing',
      managerEmail: 'manager@example.com',
      telegram: 'https://t.me/manager',
    });
  });

  test('manager-only patch preserves existing instagram from database row', async () => {
    const response = await handler(
      makeSaveEvent({
        socialLinks: {
          managerEmail: 'new@test.com',
        },
      }),
      {} as never
    );

    expect(response?.statusCode).toBe(200);
    expect(savedSocialLinks()).toEqual({
      instagram: 'https://instagram.com/existing',
      managerEmail: 'new@test.com',
      telegram: 'https://t.me/oldmanager',
    });
  });
});
