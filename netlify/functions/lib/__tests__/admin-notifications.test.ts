/**
 * Unit tests: admin notifications API and auth.
 */

import type { HandlerEvent } from '@netlify/functions';
import { handler } from '../../admin-notifications';
import { query } from '../db';
import { getUserIdFromEvent, requireAdmin } from '../api-helpers';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../api-helpers', () => {
  const actual = jest.requireActual('../api-helpers') as typeof import('../api-helpers');
  return {
    ...actual,
    requireAdmin: jest.fn(),
    getUserIdFromEvent: jest.fn(),
  };
});

const NID = 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';
const ADMIN_ID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockGetUserId = getUserIdFromEvent as jest.MockedFunction<typeof getUserIdFromEvent>;

function baseEvent(overrides: Partial<HandlerEvent> = {}): HandlerEvent {
  return {
    httpMethod: 'GET',
    path: '/.netlify/functions/admin-notifications',
    headers: { authorization: 'Bearer token' },
    body: null,
    queryStringParameters: {},
    isBase64Encoded: false,
    ...overrides,
  } as HandlerEvent;
}

describe('admin-notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(ADMIN_ID);
    mockGetUserId.mockReturnValue(ADMIN_ID);
  });

  it('GET returns notifications and unreadCount from DB', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: NID,
            type: 'copyright_claim',
            title: null,
            body: '{"contentTitle":"Album"}',
            target_type: 'copyright_claim',
            target_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            is_read: false,
            created_at: new Date('2026-11-06T12:00:00.000Z'),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ c: '3' }] });

    const res = await handler(baseEvent(), {} as never);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.success).toBe(true);
    expect(body.data.unreadCount).toBe(3);
    expect(body.data.notifications[0].body).toEqual({ contentTitle: 'Album' });

    const countSql = mockQuery.mock.calls.find((c) => String(c[0]).includes('COUNT(*)'));
    expect(countSql).toBeDefined();
  });

  it('GET without auth returns 401', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    mockGetUserId.mockReturnValue(null);
    const res = await handler(baseEvent(), {} as never);
    expect(res.statusCode).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('GET as non-admin returns 403', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    mockGetUserId.mockReturnValue('listener');
    const res = await handler(baseEvent(), {} as never);
    expect(res.statusCode).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('PATCH marks read and returns unreadCount', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: NID }] })
      .mockResolvedValueOnce({ rows: [{ c: '0' }] });

    const res = await handler(
      baseEvent({
        httpMethod: 'PATCH',
        path: `/.netlify/functions/admin-notifications/${NID}`,
        body: JSON.stringify({ isRead: true }),
      }),
      {} as never
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string).data.unreadCount).toBe(0);
  });

  it('PATCH rejects extra fields', async () => {
    const res = await handler(
      baseEvent({
        httpMethod: 'PATCH',
        path: `/.netlify/functions/admin-notifications/${NID}`,
        body: JSON.stringify({ isRead: true, x: 1 }),
      }),
      {} as never
    );
    expect(res.statusCode).toBe(400);
  });
});
