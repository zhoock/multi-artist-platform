import { fetchUserNotifications, USER_NOTIFICATIONS_API_PAGE_LIMIT } from '../userNotificationsApi';

const fetchMock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock;
});

jest.mock('../auth', () => ({
  getToken: () => 'token',
}));

describe('userNotificationsApi', () => {
  test('fetchUserNotifications sends limit and cursor query params', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { notifications: [], nextCursor: 'next', unreadCount: 0 },
      }),
    });

    await fetchUserNotifications({ limit: USER_NOTIFICATIONS_API_PAGE_LIMIT, cursor: 'abc' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/user/notifications?limit=25&cursor=abc',
      expect.objectContaining({ headers: { Authorization: 'Bearer token' } })
    );
  });
});
