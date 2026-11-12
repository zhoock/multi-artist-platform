/// <reference types="@testing-library/jest-dom" />
import { describe, test, expect, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import type { UserNotificationItem } from '@shared/lib/userNotificationsApi';
import { UserNotificationList, type UserNotificationRowCopy } from '../../index';

const rowCopy: UserNotificationRowCopy = {
  commentTitle: 'New comment',
  commentReplyTitle: 'Reply to your comment',
  commentBodyTemplate: 'On album «{{title}}»',
  likeTitle: 'New like',
  likeBodyTemplate: 'Someone liked your comment on «{{title}}»',
  collectionAddTitle: 'Collection',
  collectionAddBody: 'Another listener added you to their collection',
  collectionAddByArtistBody: '{{name}} added you to their collection',
};

const collectionAddBase: UserNotificationItem = {
  id: 'n-collection',
  type: 'collection_add',
  commentId: null,
  albumId: null,
  artistSlug: 'beatles',
  albumTitle: null,
  actorUserId: 'u-beatles',
  actorDisplayName: 'Beatles',
  isRead: false,
  createdAt: new Date().toISOString(),
};

describe('UserNotificationList row icons', () => {
  const baseComment = {
    commentId: 'c1',
    albumId: 'a1',
    artistSlug: 'beatles',
    albumTitle: 'Rubber Soul',
    actorUserId: 'u1',
    actorDisplayName: null,
    isRead: true,
    createdAt: new Date().toISOString(),
  } satisfies Omit<UserNotificationItem, 'id' | 'type'>;

  test('comment uses MessageCircle icon', () => {
    const { container } = render(
      <UserNotificationList
        items={[{ id: 'n1', type: 'comment', ...baseComment }]}
        lang="en"
        copy={rowCopy}
        onItemClick={jest.fn()}
      />
    );
    expect(container.querySelector('.lucide-message-circle')).toBeInTheDocument();
    expect(container.querySelector('.lucide-corner-up-left')).toBeNull();
    expect(container.querySelector('.lucide-heart')).toBeNull();
  });

  test('comment_reply uses CornerUpLeft icon', () => {
    const { container } = render(
      <UserNotificationList
        items={[{ id: 'n2', type: 'comment_reply', ...baseComment }]}
        lang="en"
        copy={rowCopy}
        onItemClick={jest.fn()}
      />
    );
    expect(container.querySelector('.lucide-corner-up-left')).toBeInTheDocument();
    expect(container.querySelector('.lucide-message-circle')).toBeNull();
  });

  test('comment_like uses Heart icon', () => {
    const { container } = render(
      <UserNotificationList
        items={[{ id: 'n3', type: 'comment_like', ...baseComment }]}
        lang="en"
        copy={rowCopy}
        onItemClick={jest.fn()}
      />
    );
    expect(container.querySelector('.lucide-heart')).toBeInTheDocument();
    expect(container.querySelector('.lucide-message-circle')).toBeNull();
  });
});

describe('UserNotificationList unread row icons', () => {
  test('unread non-avatar rows use icon slot without read modifier (accent via CSS)', () => {
    const unreadLike: UserNotificationItem = {
      id: 'n-like',
      type: 'comment_like',
      commentId: 'c1',
      albumId: 'a1',
      artistSlug: 'beatles',
      albumTitle: 'Rubber Soul',
      actorUserId: null,
      actorDisplayName: null,
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    const { container } = render(
      <UserNotificationList items={[unreadLike]} lang="en" copy={rowCopy} onItemClick={jest.fn()} />
    );

    const row = container.querySelector('.user-notification-list__row');
    const icon = container.querySelector('.user-notification-list__row-icon');
    expect(row).not.toHaveClass('user-notification-list__row--read');
    expect(icon).not.toHaveClass('user-notification-list__row-icon--avatar');
  });

  test('read rows keep read modifier on row', () => {
    render(
      <UserNotificationList
        items={[
          {
            id: 'n-comment',
            type: 'comment',
            commentId: 'c1',
            albumId: 'a1',
            artistSlug: 'beatles',
            albumTitle: 'Rubber Soul',
            actorUserId: 'u1',
            actorDisplayName: 'Fan',
            isRead: true,
            createdAt: new Date().toISOString(),
          },
        ]}
        lang="en"
        copy={rowCopy}
        onItemClick={jest.fn()}
      />
    );

    expect(document.querySelector('.user-notification-list__row--read')).toBeInTheDocument();
  });
});

describe('UserNotificationList collection_add avatar', () => {
  test('public artist actor uses shared AlbumCommentAvatar with image URL', () => {
    render(
      <UserNotificationList
        items={[
          {
            ...collectionAddBase,
            actorAvatarPath: 'users/u1/profile/profile-abcd-128.webp',
          },
        ]}
        lang="en"
        copy={rowCopy}
        onItemClick={jest.fn()}
      />
    );

    const avatar = document.querySelector(
      '.user-notification-list__row-icon--avatar .album-comments__avatar'
    );
    expect(avatar).toBeInTheDocument();

    const img = avatar?.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('width', '32');
    expect(img).toHaveAttribute('height', '32');
    expect(img?.getAttribute('src')).toContain('proxy-image');
  });

  test('public artist actor without avatar path shows initials fallback', () => {
    render(
      <UserNotificationList
        items={[
          {
            ...collectionAddBase,
            actorAvatarPath: null,
          },
        ]}
        lang="en"
        copy={rowCopy}
        onItemClick={jest.fn()}
      />
    );

    expect(document.querySelector('.album-comments__avatar-initial')).toHaveTextContent('B');
    expect(document.querySelector('.album-comments__avatar img')).toBeNull();
  });

  test('anonymous listener collection_add keeps icon slot without avatar component', () => {
    render(
      <UserNotificationList
        items={[
          {
            ...collectionAddBase,
            artistSlug: null,
            actorDisplayName: null,
            actorAvatarPath: null,
          },
        ]}
        lang="en"
        copy={rowCopy}
        onItemClick={jest.fn()}
      />
    );

    expect(document.querySelector('.album-comments__avatar')).toBeNull();
    expect(document.querySelector('.user-notification-list__row-icon--avatar')).toBeNull();
    expect(screen.getByText('Another listener added you to their collection')).toBeInTheDocument();
  });

  test('artist collection_add row click invokes onItemClick', () => {
    const onItemClick = jest.fn();
    const item = { ...collectionAddBase, actorAvatarPath: null };

    render(
      <UserNotificationList items={[item]} lang="en" copy={rowCopy} onItemClick={onItemClick} />
    );

    fireEvent.click(screen.getByRole('button'));
    expect(onItemClick).toHaveBeenCalledWith(item);
  });

  test('listener collection_add row is not clickable', () => {
    const onItemClick = jest.fn();
    const item = {
      ...collectionAddBase,
      artistSlug: null,
      actorDisplayName: null,
      actorAvatarPath: null,
    };

    render(
      <UserNotificationList items={[item]} lang="en" copy={rowCopy} onItemClick={onItemClick} />
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(document.querySelector('.user-notification-list__row--static')).toBeInTheDocument();
  });
});
