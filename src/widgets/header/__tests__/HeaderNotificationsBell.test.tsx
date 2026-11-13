/// <reference types="@testing-library/jest-dom" />
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@shared/lib/test-utils';
import type {
  fetchUserNotifications,
  patchUserNotificationRead,
} from '@shared/lib/userNotificationsApi';
import { HeaderNotificationsBell } from '../ui/HeaderNotificationsBell';

const fetchUserNotificationsMock = jest.fn<typeof fetchUserNotifications>();
const patchUserNotificationReadMock = jest.fn<typeof patchUserNotificationRead>();
const navigateMock = jest.fn();

jest.mock('@shared/lib/auth', () => ({
  isAuthenticated: () => true,
  getToken: () => 'token',
}));

jest.mock('@shared/lib/userNotificationsApi', () => ({
  fetchUserNotifications: (options?: { limit?: number; cursor?: string }) =>
    fetchUserNotificationsMock(options),
  patchUserNotificationRead: (id: string) => patchUserNotificationReadMock(id),
}));

const useUserNotificationsLiveRefreshMock = jest.fn();

jest.mock('@features/userNotifications/lib/useUserNotificationsLiveRefresh', () => ({
  useUserNotificationsLiveRefresh: (opts: unknown) => useUserNotificationsLiveRefreshMock(opts),
  USER_NOTIFICATIONS_LIVE_POLL_MS: 4_000,
  USER_NOTIFICATIONS_UNREAD_POLL_MS: 20_000,
}));

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom') as object;
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

function makeNotification(i: number) {
  return {
    id: `n${i}`,
    type: 'comment' as const,
    commentId: `c${i}`,
    albumId: String(i),
    artistSlug: 'my-artist',
    albumTitle: `Album ${i}`,
    actorUserId: 'a1',
    isRead: false,
    createdAt: new Date(2026, 0, i).toISOString(),
  };
}

function viewAllButton() {
  return screen.queryByRole('button', { name: /view all notifications/i });
}

function notificationsBellButton() {
  return screen.getByRole('button', { name: /^notifications$/i });
}

async function openDropdown() {
  await waitFor(() => {
    expect(notificationsBellButton()).toBeInTheDocument();
  });
  fireEvent.click(notificationsBellButton());
}

describe('HeaderNotificationsBell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useUserNotificationsLiveRefreshMock.mockClear();
    fetchUserNotificationsMock.mockResolvedValue({
      unreadCount: 0,
      nextCursor: null,
      notifications: [],
    });
    patchUserNotificationReadMock.mockResolvedValue({ unreadCount: 0 });
  });

  test('enables live refresh with faster poll while dropdown is open', async () => {
    renderWithProviders(<HeaderNotificationsBell />, {
      preloadedState: { lang: { current: 'en' } },
    });

    await waitFor(() => {
      expect(useUserNotificationsLiveRefreshMock).toHaveBeenCalled();
    });

    const bellPollArgs = () =>
      useUserNotificationsLiveRefreshMock.mock.calls
        .map((call) => call[0] as { enabled?: boolean; pollIntervalMs?: number })
        .filter((args) => typeof args.pollIntervalMs === 'number');

    const closedArgs = bellPollArgs().at(-1);
    expect(closedArgs?.enabled).toBe(true);
    expect(closedArgs?.pollIntervalMs).toBe(20_000);

    await openDropdown();

    const openArgs = bellPollArgs().at(-1);
    expect(openArgs?.pollIntervalMs).toBe(4_000);
  });

  test('fetches at most 5 notifications for dropdown', async () => {
    renderWithProviders(<HeaderNotificationsBell />, {
      preloadedState: { lang: { current: 'en' } },
    });

    await waitFor(() => {
      expect(fetchUserNotificationsMock).toHaveBeenCalled();
    });

    expect(fetchUserNotificationsMock.mock.calls[0][0]).toEqual({ limit: 5 });
  });

  test.each([
    { count: 0, label: '0 notifications' },
    { count: 3, label: '3 notifications' },
    { count: 5, label: '5 notifications' },
  ])('hides View all when user has $label', async ({ count }) => {
    fetchUserNotificationsMock.mockResolvedValue({
      unreadCount: count,
      nextCursor: null,
      notifications: Array.from({ length: count }, (_, i) => makeNotification(i + 1)),
    });

    renderWithProviders(<HeaderNotificationsBell />, {
      preloadedState: { lang: { current: 'en' } },
    });

    await openDropdown();

    if (count > 0) {
      expect(document.querySelectorAll('.user-notification-list__row')).toHaveLength(count);
    }
    expect(viewAllButton()).not.toBeInTheDocument();
  });

  test('shows View all when user has more than 5 notifications (nextCursor)', async () => {
    fetchUserNotificationsMock.mockResolvedValue({
      unreadCount: 6,
      nextCursor: 'cursor-page-2',
      notifications: [1, 2, 3, 4, 5].map(makeNotification),
    });

    renderWithProviders(<HeaderNotificationsBell />, {
      preloadedState: { lang: { current: 'en' } },
    });

    await openDropdown();

    expect(document.querySelectorAll('.user-notification-list__row')).toHaveLength(5);
    expect(viewAllButton()).toBeInTheDocument();
    fireEvent.click(viewAllButton()!);
    await waitFor(() => {
      expect(document.querySelector('dialog.popup.local-modal[open]')).toBeInTheDocument();
      expect(document.querySelector('.album-comments-fullscreen__title')).toBeInTheDocument();
    });
  });

  test('shows only 5 rows when 10+ notifications exist', async () => {
    fetchUserNotificationsMock.mockResolvedValue({
      unreadCount: 10,
      nextCursor: 'cursor',
      notifications: [1, 2, 3, 4, 5].map(makeNotification),
    });

    renderWithProviders(<HeaderNotificationsBell />, {
      preloadedState: { lang: { current: 'en' } },
    });

    await openDropdown();

    expect(document.querySelectorAll('.user-notification-list__row')).toHaveLength(5);
    expect(viewAllButton()).toBeInTheDocument();
    expect(screen.queryByText('On album «Album 6»')).not.toBeInTheDocument();
  });

  test('marks unread listener collection_add as read when dropdown opens', async () => {
    fetchUserNotificationsMock.mockResolvedValue({
      unreadCount: 2,
      nextCursor: null,
      notifications: [
        {
          id: 'n-collection-listener',
          type: 'collection_add',
          commentId: null,
          albumId: null,
          artistSlug: null,
          albumTitle: null,
          actorUserId: null,
          isRead: false,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'n-comment',
          type: 'comment',
          commentId: 'c1',
          albumId: '23',
          artistSlug: 'my-artist',
          albumTitle: '23',
          actorUserId: 'a1',
          isRead: false,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    patchUserNotificationReadMock.mockResolvedValue({ unreadCount: 1 });

    renderWithProviders(<HeaderNotificationsBell />, {
      preloadedState: { lang: { current: 'en' } },
    });

    await openDropdown();

    await waitFor(() => {
      expect(patchUserNotificationReadMock).toHaveBeenCalledWith('n-collection-listener');
      const rows = document.querySelectorAll('.user-notification-list__row');
      expect(rows[0]).toHaveClass('user-notification-list__row--read');
      expect(rows[1]).not.toHaveClass('user-notification-list__row--read');
    });
    expect(patchUserNotificationReadMock).toHaveBeenCalledTimes(1);
  });

  test('shows bell dot when unread and navigates on row click', async () => {
    fetchUserNotificationsMock.mockResolvedValue({
      unreadCount: 1,
      nextCursor: null,
      notifications: [
        {
          id: 'n1',
          type: 'comment',
          commentId: 'c1',
          albumId: '23',
          artistSlug: 'my-artist',
          albumTitle: '23',
          actorUserId: 'a1',
          isRead: false,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    renderWithProviders(<HeaderNotificationsBell />, {
      preloadedState: { lang: { current: 'en' } },
    });

    await waitFor(() => {
      expect(notificationsBellButton()).toBeInTheDocument();
    });

    expect(document.querySelector('.header__notifications-bell-dot')).toBeTruthy();

    fireEvent.click(notificationsBellButton());

    const row = await screen.findByText('On album «23»');
    fireEvent.click(row);

    await waitFor(() => {
      expect(patchUserNotificationReadMock).toHaveBeenCalledWith('n1');
      expect(navigateMock).toHaveBeenCalledWith('/en/albums/23?artist=my-artist&comment=c1');
    });
  });
});
