import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AlbumCommentDto } from '@shared/api/albumComments';
import { buildArtistPagePath } from '@shared/lib/seo/publicPagePaths';
import { AlbumCommentRow, type AlbumCommentRowLabels } from '../AlbumCommentRow';

const rowLabels: AlbumCommentRowLabels = {
  artistBadge: 'Artist',
  reply: 'Reply',
  cancel: 'Cancel',
  edited: 'edited',
  deleted: 'Deleted',
  like: 'Like',
  menu: 'Menu',
  edit: 'Edit',
  delete: 'Delete',
  report: 'Report',
  save: 'Save',
  replyPlaceholder: (name) => `Reply to ${name}`,
};

function makeComment(overrides: Partial<AlbumCommentDto> = {}): AlbumCommentDto {
  return {
    id: 'c-1',
    parentId: null,
    body: 'Great album',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    isEdited: false,
    author: {
      userId: 'u-1',
      displayName: 'Beatles',
      avatarPath: null,
      isArtist: true,
      publicSlug: 'beatles',
    },
    likeCount: 0,
    likedByViewer: false,
    replies: [],
    ...overrides,
  };
}

const noopAsync = async () => undefined;

function renderRow(comment: AlbumCommentDto, isReply = false) {
  return render(
    <MemoryRouter>
      <AlbumCommentRow
        comment={comment}
        lang="en"
        labels={rowLabels}
        isReply={isReply}
        viewerUserId={null}
        artistUserId="album-owner"
        replyingToId={null}
        onRequestReply={() => undefined}
        onCancelReply={() => undefined}
        onSubmitReply={noopAsync}
        onToggleLike={() => undefined}
        onEdit={noopAsync}
        onDelete={noopAsync}
        onReport={noopAsync}
        viewerAvatarPath={null}
        viewerDisplayName="Viewer"
        requireAuthForAction={() => false}
      />
    </MemoryRouter>
  );
}

describe('AlbumCommentRow — artist author links', () => {
  test('artist root comment: avatar and name link to public artist profile', () => {
    renderRow(makeComment());

    const expectedPath = buildArtistPagePath('en', 'beatles');
    const nameLink = document.querySelector('.album-comments__author-link');
    expect(nameLink).toHaveAttribute('href', expectedPath);
    expect(nameLink).toHaveTextContent('Beatles');

    const avatarLink = document.querySelector('.album-comments__avatar-link');
    expect(avatarLink).toHaveAttribute('href', expectedPath);
  });

  test('listener comment: avatar and name are not links', () => {
    renderRow(
      makeComment({
        author: {
          userId: 'u-2',
          displayName: 'User_4F7D',
          avatarPath: null,
          isArtist: false,
          publicSlug: null,
        },
      })
    );

    expect(screen.queryByRole('link', { name: 'User_4F7D' })).not.toBeInTheDocument();
    expect(document.querySelector('.album-comments__avatar-link')).toBeNull();
    expect(screen.getByText('User_4F7D')).toHaveClass('album-comments__author');
  });

  test('artist reply: avatar and name also link to profile', () => {
    renderRow(
      makeComment({
        id: 'reply-1',
        parentId: 'c-1',
        author: {
          userId: 'u-3',
          displayName: 'Stones',
          avatarPath: null,
          isArtist: true,
          publicSlug: 'stones',
        },
      }),
      true
    );

    const expectedPath = buildArtistPagePath('en', 'stones');
    expect(document.querySelector('.album-comments__author-link')).toHaveAttribute(
      'href',
      expectedPath
    );
    expect(document.querySelector('.album-comments__avatar-link')).toHaveAttribute(
      'href',
      expectedPath
    );
  });

  test('artist badge and time stay non-interactive links', () => {
    renderRow(makeComment());

    expect(screen.getByText('Artist')).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
  });
});
