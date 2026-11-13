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

jest.mock('@shared/lib/seo/publicPagePaths', () => {
  const actual = jest.requireActual('@shared/lib/seo/publicPagePaths');
  return {
    ...actual,
    buildPublicAlbumPagePath: (lang: string, albumId: string, artistSlug: string) =>
      `/${lang}/albums/${albumId}?artist=${artistSlug}`,
  };
});

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

  test('collection_add from listener does not navigate or mark read', async () => {
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
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    });

    expect(patchMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  test('album_purchase navigates to public album page and marks read', async () => {
    const { result } = renderHook(() => useNotificationNavigation('en'));

    await act(async () => {
      await result.current.openNotification({
        id: 'n-purchase',
        type: 'album_purchase',
        commentId: null,
        albumId: 'rubber-soul',
        artistSlug: 'beatles',
        albumTitle: 'Rubber Soul',
        albumCoverPath: 'cover',
        albumCoverOwnerUserId: 'artist-1',
        actorUserId: null,
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    });

    expect(patchMock).toHaveBeenCalledWith('n-purchase');
    expect(navigateMock).toHaveBeenCalledWith('/en/albums/rubber-soul?artist=beatles');
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
