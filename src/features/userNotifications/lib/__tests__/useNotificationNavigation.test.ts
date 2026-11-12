import { renderHook, act } from '@testing-library/react';
import { useNotificationNavigation } from '../useNotificationNavigation';

const patchMock = jest.fn();
const navigateMock = jest.fn();

jest.mock('@shared/lib/userNotificationsApi', () => ({
  patchUserNotificationRead: (...args: unknown[]) => patchMock(...args),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

jest.mock('@features/albumComments', () => ({
  resolveAlbumCommentNotificationPath: () => '/en/albums/23?artist=beatles&comment=c1',
}));

describe('useNotificationNavigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    patchMock.mockResolvedValue({ unreadCount: 0 });
  });

  test('comment_like navigates via album comment deep-link path', async () => {
    const { result } = renderHook(() => useNotificationNavigation('en'));

    await act(async () => {
      await result.current.openNotification({
        id: 'n1',
        type: 'comment_like',
        commentId: 'c1',
        albumId: '23',
        artistSlug: 'beatles',
        albumTitle: 'Rubber Soul',
        actorUserId: 'liker',
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    });

    expect(patchMock).toHaveBeenCalledWith('n1');
    expect(navigateMock).toHaveBeenCalledWith('/en/albums/23?artist=beatles&comment=c1');
  });

  test('collection_add from listener navigates to audience supporters section', async () => {
    const { result } = renderHook(() => useNotificationNavigation('en'));

    await act(async () => {
      await result.current.openNotification({
        id: 'n2',
        type: 'collection_add',
        commentId: null,
        albumId: null,
        artistSlug: null,
        albumTitle: null,
        actorUserId: null,
        isRead: true,
        createdAt: new Date().toISOString(),
      });
    });

    expect(navigateMock).toHaveBeenCalledWith('/dashboard/audience?focus=supporters');
  });

  test('collection_add from artist navigates to public artist page', async () => {
    const { result } = renderHook(() => useNotificationNavigation('ru'));

    await act(async () => {
      await result.current.openNotification({
        id: 'n3',
        type: 'collection_add',
        commentId: null,
        albumId: null,
        artistSlug: 'artem-k',
        albumTitle: null,
        actorDisplayName: 'Artem K.',
        actorUserId: null,
        isRead: true,
        createdAt: new Date().toISOString(),
      });
    });

    expect(navigateMock).toHaveBeenCalledWith('/ru?artist=artem-k');
  });
});
