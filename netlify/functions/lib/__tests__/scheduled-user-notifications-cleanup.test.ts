import { handler } from '../../scheduled-user-notifications-cleanup';

jest.mock('../user-notifications-db', () => ({
  purgeUserNotificationsOlderThanDays: jest.fn().mockResolvedValue(5),
  USER_NOTIFICATIONS_RETENTION_DAYS: 90,
}));

jest.mock('../subscription-renewal-scheduler-auth', () => ({
  isTrustedNetlifyPlatformSchedule: jest.fn().mockReturnValue(true),
}));

import { purgeUserNotificationsOlderThanDays } from '../user-notifications-db';

const mockPurge = purgeUserNotificationsOlderThanDays as jest.Mock;

describe('scheduled-user-notifications-cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('purges notifications older than retention window', async () => {
    const res = await handler({} as never, {} as never);
    expect(res?.statusCode).toBe(200);
    expect(mockPurge).toHaveBeenCalledWith(90);
    const body = JSON.parse(res?.body ?? '{}');
    expect(body.deleted).toBe(5);
  });
});
