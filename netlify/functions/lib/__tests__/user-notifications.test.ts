/**
 * Unit tests: user notifications API and auth.
 */

import { handler } from '../../user-notifications';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../api-helpers', () => {
  const actual = jest.requireActual('../api-helpers');
  return {
    ...actual,
    requireAuth: jest.fn(),
  };
});

import { query } from '../db';
import { requireAuth } from '../api-helpers';

const mockQuery = query as jest.Mock;
const mockRequireAuth = requireAuth as jest.Mock;

const NID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const USER = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a12';

function makeEvent(method: string, path: string, body?: string): Parameters<typeof handler>[0] {
  return {
    httpMethod: method,
    path: `/.netlify/functions/user-notifications${path}`,
    headers: { authorization: 'Bearer test' },
    body,
    isBase64Encoded: false,
  } as Parameters<typeof handler>[0];
}

describe('user-notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockReturnValue(USER);
  });

  test('GET returns notifications, nextCursor and unreadCount', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: NID,
            type: 'comment',
            comment_id: 'c1',
            album_id: '23',
            artist_slug: 'artist',
            album_title: '23',
            actor_user_id: 'actor',
            is_read: false,
            created_at: new Date('2026-01-01T12:00:00Z'),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ c: '1' }] });

    const res = await handler(
      {
        ...makeEvent('GET', '/'),
        queryStringParameters: { limit: '10' },
      } as Parameters<typeof handler>[0],
      {} as never
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body ?? '{}');
    expect(body.success).toBe(true);
    expect(body.data.unreadCount).toBe(1);
    expect(body.data.notifications[0].commentId).toBe('c1');
    expect(body.data).toHaveProperty('nextCursor');
  });

  test('PATCH marks read and returns unreadCount', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: NID }] })
      .mockResolvedValueOnce({ rows: [{ c: '0' }] });

    const res = await handler(
      makeEvent('PATCH', `/${NID}`, JSON.stringify({ isRead: true })),
      {} as never
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body ?? '{}');
    expect(body.data.unreadCount).toBe(0);
  });

  test('GET without auth returns 401', async () => {
    mockRequireAuth.mockReturnValue(null);
    const res = await handler(makeEvent('GET', '/'), {} as never);
    expect(res.statusCode).toBe(401);
  });
});
