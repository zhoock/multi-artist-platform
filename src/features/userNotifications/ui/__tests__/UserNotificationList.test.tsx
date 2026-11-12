/// <reference types="@testing-library/jest-dom" />
import { describe, test, expect, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import type { UserNotificationItem } from '@shared/lib/userNotificationsApi';
import { UserNotificationList, type UserNotificationRowCopy } from '../../index';

const rowCopy: UserNotificationRowCopy = {
  commentTitle: 'New comment',
  commentLikeTitle: 'Comment liked',
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

  test('row click still works for collection_add', () => {
    const onItemClick = jest.fn();
    const item = { ...collectionAddBase, actorAvatarPath: null };

    render(
      <UserNotificationList items={[item]} lang="en" copy={rowCopy} onItemClick={onItemClick} />
    );

    fireEvent.click(screen.getByRole('button'));
    expect(onItemClick).toHaveBeenCalledWith(item);
  });
});
