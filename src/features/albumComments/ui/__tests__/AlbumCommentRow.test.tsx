import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
  showReplies: (count) => `Show ${count} replies`,
  hideReplies: 'Hide replies',
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
      username: 'beatles',
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

type RenderRowOptions = {
  isReply?: boolean;
  repliesThreadExpanded?: boolean;
  onToggleRepliesThread?: () => void;
  children?: React.ReactNode;
};

function renderRow(comment: AlbumCommentDto, options: RenderRowOptions = {}) {
  const { isReply = false, repliesThreadExpanded, onToggleRepliesThread, children } = options;
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
        repliesThreadExpanded={repliesThreadExpanded}
        onToggleRepliesThread={onToggleRepliesThread}
      >
        {children}
      </AlbumCommentRow>
    </MemoryRouter>
  );
}

function makeNestedReply(id: string, body: string): AlbumCommentDto {
  return makeComment({
    id,
    parentId: 'c-1',
    body,
    author: {
      userId: `u-${id}`,
      displayName: `User ${id}`,
      username: `user_${id}`,
      avatarPath: null,
      isArtist: false,
      publicSlug: null,
    },
    replies: [],
  });
}

describe('AlbumCommentRow — Reply control', () => {
  test('root comment shows Reply', () => {
    renderRow(makeComment(), { isReply: false });
    expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument();
  });

  test('own root comment hides Reply', () => {
    render(
      <MemoryRouter>
        <AlbumCommentRow
          comment={makeComment({ author: { ...makeComment().author, userId: 'viewer-1' } })}
          lang="en"
          labels={rowLabels}
          viewerUserId="viewer-1"
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
          requireAuthForAction={() => true}
        />
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument();
  });

  test('own nested reply hides Reply', () => {
    render(
      <MemoryRouter>
        <AlbumCommentRow
          comment={makeNestedReply('r-own', 'My reply')}
          lang="en"
          labels={rowLabels}
          isReply
          viewerUserId="u-r-own"
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
          requireAuthForAction={() => true}
        />
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument();
  });

  test('nested reply shows Reply when viewer is not author', () => {
    renderRow(makeNestedReply('r-1', 'Nested body'), { isReply: true });
    expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument();
  });

  test('nested reply by another user shows Reply', () => {
    render(
      <MemoryRouter>
        <AlbumCommentRow
          comment={makeNestedReply('r-1', 'From Beatles')}
          lang="en"
          labels={rowLabels}
          isReply
          viewerUserId="viewer-smolyanoe"
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
          viewerDisplayName="Listener"
          requireAuthForAction={() => true}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument();
  });

  test('artist nested reply shows Reply for another viewer', () => {
    renderRow(
      makeComment({
        id: 'reply-artist',
        parentId: 'c-1',
        body: 'Artist reply',
        author: {
          userId: 'u-beatles',
          displayName: 'Beatles',
          username: 'beatles',
          avatarPath: null,
          isArtist: true,
          publicSlug: 'beatles',
        },
      }),
      { isReply: true }
    );
    expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument();
  });

  test('deleted placeholder hides author, menu, and actions', () => {
    renderRow(
      makeComment({
        deletedAt: new Date().toISOString(),
        body: 'gone',
      })
    );
    expect(screen.getByText('Deleted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Like' })).not.toBeInTheDocument();
    expect(document.querySelector('.album-comments__item--deleted-placeholder')).toBeTruthy();
  });

  test('editing hides Reply', () => {
    render(
      <MemoryRouter>
        <AlbumCommentRow
          comment={makeComment()}
          lang="en"
          labels={rowLabels}
          viewerUserId="u-1"
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
          requireAuthForAction={() => true}
        />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument();
  });

  test('does not show reply composer on own comment even when replyingToId matches', () => {
    render(
      <MemoryRouter>
        <AlbumCommentRow
          comment={makeComment({ author: { ...makeComment().author, userId: 'viewer-1' } })}
          lang="en"
          labels={rowLabels}
          viewerUserId="viewer-1"
          artistUserId="album-owner"
          replyingToId="c-1"
          onRequestReply={() => undefined}
          onCancelReply={() => undefined}
          onSubmitReply={noopAsync}
          onToggleLike={() => undefined}
          onEdit={noopAsync}
          onDelete={noopAsync}
          onReport={noopAsync}
          viewerAvatarPath={null}
          viewerDisplayName="Viewer"
          requireAuthForAction={() => true}
        />
      </MemoryRouter>
    );

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  test('clicking Reply on nested reply invokes onRequestReply with reply id', () => {
    const onRequestReply = jest.fn();
    render(
      <MemoryRouter>
        <AlbumCommentRow
          comment={makeNestedReply('nested-99', 'Nested')}
          lang="en"
          labels={rowLabels}
          isReply
          viewerUserId="viewer-1"
          artistUserId="album-owner"
          replyingToId={null}
          onRequestReply={onRequestReply}
          onCancelReply={() => undefined}
          onSubmitReply={noopAsync}
          onToggleLike={() => undefined}
          onEdit={noopAsync}
          onDelete={noopAsync}
          onReport={noopAsync}
          viewerAvatarPath={null}
          viewerDisplayName="Viewer"
          requireAuthForAction={() => true}
        />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    expect(onRequestReply).toHaveBeenCalledWith('nested-99');
  });

  test('opening reply composer on another users comment prefills @mention', () => {
    render(
      <MemoryRouter>
        <AlbumCommentRow
          comment={makeNestedReply('nested-99', '@user_nested-99 Earlier')}
          lang="en"
          labels={rowLabels}
          isReply
          viewerUserId="viewer-1"
          artistUserId="album-owner"
          replyingToId="nested-99"
          onRequestReply={() => undefined}
          onCancelReply={() => undefined}
          onSubmitReply={noopAsync}
          onToggleLike={() => undefined}
          onEdit={noopAsync}
          onDelete={noopAsync}
          onReport={noopAsync}
          viewerAvatarPath={null}
          viewerDisplayName="Viewer"
          requireAuthForAction={() => true}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('textbox')).toHaveValue('@User nested-99 ');
  });

  test('renders @mention with highlight class', () => {
    renderRow(makeComment({ body: '@beatles Sounds great' }));
    expect(document.querySelector('.album-comments__mention')).toHaveTextContent('@beatles');
  });
});

describe('AlbumCommentRow — like control', () => {
  function renderLikeRow(
    comment: AlbumCommentDto,
    options: { viewerUserId?: string | null; onToggleLike?: (id: string) => void } = {}
  ) {
    const { viewerUserId = 'viewer-1', onToggleLike = jest.fn() } = options;
    render(
      <MemoryRouter>
        <AlbumCommentRow
          comment={comment}
          lang="en"
          labels={rowLabels}
          viewerUserId={viewerUserId}
          artistUserId="album-owner"
          replyingToId={null}
          onRequestReply={() => undefined}
          onCancelReply={() => undefined}
          onSubmitReply={noopAsync}
          onToggleLike={onToggleLike}
          onEdit={noopAsync}
          onDelete={noopAsync}
          onReport={noopAsync}
          viewerAvatarPath={null}
          viewerDisplayName="Viewer"
          requireAuthForAction={() => true}
        />
      </MemoryRouter>
    );
    return { onToggleLike };
  }

  test('shows disabled Like with count 0 on own comment', () => {
    renderLikeRow(
      makeComment({
        likeCount: 0,
        likedByViewer: false,
        author: { ...makeComment().author, userId: 'viewer-1' },
      })
    );

    const like = screen.getByRole('button', { name: 'Like' });
    expect(like).toBeDisabled();
    expect(like).toHaveAttribute('aria-pressed', 'false');
    expect(within(like).getByText('0')).toBeInTheDocument();
    expect(like).not.toHaveClass('album-comments__like--active');
  });

  test('shows disabled Like with count on own comment and ignores likedByViewer', () => {
    renderLikeRow(
      makeComment({
        likeCount: 5,
        likedByViewer: true,
        author: { ...makeComment().author, userId: 'viewer-1' },
      })
    );

    const like = screen.getByRole('button', { name: 'Like' });
    expect(like).toBeDisabled();
    expect(within(like).getByText('5')).toBeInTheDocument();
    expect(like).not.toHaveClass('album-comments__like--active');
    expect(like).toHaveAttribute('aria-pressed', 'false');
  });

  test('does not toggle like when author clicks own comment', () => {
    const onToggleLike = jest.fn();
    renderLikeRow(
      makeComment({
        author: { ...makeComment().author, userId: 'viewer-1' },
      }),
      { onToggleLike }
    );

    fireEvent.click(screen.getByRole('button', { name: 'Like' }));
    expect(onToggleLike).not.toHaveBeenCalled();
  });

  test('shows Like for another user comment', () => {
    renderLikeRow(makeComment({ likeCount: 0, likedByViewer: false }), {
      viewerUserId: 'another-user',
    });

    const like = screen.getByRole('button', { name: 'Like' });
    expect(like).toBeEnabled();
    expect(like).not.toBeDisabled();
    expect(within(like).queryByText('0')).not.toBeInTheDocument();
  });

  test('another user can toggle like on someone else comment', () => {
    const onToggleLike = jest.fn();
    renderLikeRow(
      makeComment({
        likeCount: 2,
        likedByViewer: false,
        author: { ...makeComment().author, userId: 'other' },
      }),
      { viewerUserId: 'another-user', onToggleLike }
    );

    fireEvent.click(screen.getByRole('button', { name: 'Like' }));
    expect(onToggleLike).toHaveBeenCalledWith('c-1');
  });

  test('shows active like state for viewer who liked another users comment', () => {
    renderLikeRow(
      makeComment({
        likeCount: 3,
        likedByViewer: true,
        author: { ...makeComment().author, userId: 'other' },
      }),
      { viewerUserId: 'another-user' }
    );

    const like = screen.getByRole('button', { name: 'Like' });
    expect(like).toHaveClass('album-comments__like--active');
    expect(like).toHaveAttribute('aria-pressed', 'true');
    expect(within(like).getByText('3')).toBeInTheDocument();
  });

  test('author sees updated like count from other users', () => {
    renderLikeRow(
      makeComment({
        likeCount: 6,
        likedByViewer: false,
        author: { ...makeComment().author, userId: 'viewer-1' },
      })
    );

    const like = screen.getByRole('button', { name: 'Like' });
    expect(like).toBeDisabled();
    expect(within(like).getByText('6')).toBeInTheDocument();
  });
});

describe('AlbumCommentRow — artist author links', () => {
  test('artist root comment: avatar and name link to public artist profile', () => {
    renderRow(makeComment(), {});

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
          username: 'user_4f7d',
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
          username: 'stones',
          avatarPath: null,
          isArtist: true,
          publicSlug: 'stones',
        },
      }),
      { isReply: true }
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

describe('AlbumCommentRow — inline edit', () => {
  function renderOwnComment() {
    return render(
      <MemoryRouter>
        <AlbumCommentRow
          comment={makeComment()}
          lang="en"
          labels={rowLabels}
          viewerUserId="u-1"
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
          requireAuthForAction={() => true}
        />
      </MemoryRouter>
    );
  }

  test('hides context menu while editing and restores it after cancel', () => {
    renderOwnComment();

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));

    expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveClass('album-comments__edit-input');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument();
    expect(screen.getByText('Great album')).toBeInTheDocument();
  });
});

describe('AlbumCommentRow — replies thread toggle', () => {
  function ReplyHarness({
    root,
    initialExpanded = true,
  }: {
    root: AlbumCommentDto;
    initialExpanded?: boolean;
  }) {
    const [expanded, setExpanded] = useState(initialExpanded);
    return (
      <MemoryRouter>
        <AlbumCommentRow
          comment={root}
          lang="en"
          labels={rowLabels}
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
          repliesThreadExpanded={expanded}
          onToggleRepliesThread={() => setExpanded((v) => !v)}
        >
          {expanded
            ? root.replies.map((reply) => (
                <p key={reply.id} data-testid={`reply-${reply.id}`}>
                  {reply.body}
                </p>
              ))
            : null}
        </AlbumCommentRow>
      </MemoryRouter>
    );
  }

  test('root comment without replies: no toggle control', () => {
    renderRow(makeComment());
    expect(screen.queryByRole('button', { name: /Show \d+ replies/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hide replies' })).not.toBeInTheDocument();
  });

  test('root with replies: expanded by default and nested content visible', () => {
    const root = makeComment({
      replies: [makeNestedReply('r-1', 'First reply'), makeNestedReply('r-2', 'Second reply')],
    });
    render(<ReplyHarness root={root} />);

    expect(screen.getByRole('button', { name: 'Hide replies' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByTestId('reply-r-1')).toBeInTheDocument();
    expect(screen.getByTestId('reply-r-2')).toBeInTheDocument();
  });

  test('Hide replies collapses nested content', () => {
    const root = makeComment({
      replies: [makeNestedReply('r-1', 'First reply'), makeNestedReply('r-2', 'Second reply')],
    });
    render(<ReplyHarness root={root} />);

    fireEvent.click(screen.getByRole('button', { name: 'Hide replies' }));

    expect(screen.queryByTestId('reply-r-1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show 2 replies' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  test('Show N replies expands again and shows Hide replies', () => {
    const root = makeComment({
      replies: [makeNestedReply('r-1', 'First reply')],
    });
    render(<ReplyHarness root={root} />);

    fireEvent.click(screen.getByRole('button', { name: 'Hide replies' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 replies' }));

    expect(screen.getByTestId('reply-r-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide replies' })).toBeInTheDocument();
  });

  test('collapsed state is independent per root comment', () => {
    const rootA = makeComment({
      id: 'root-a',
      body: 'Root A',
      replies: [makeNestedReply('a-1', 'Reply A')],
    });
    const rootB = makeComment({
      id: 'root-b',
      body: 'Root B',
      author: {
        userId: 'u-b',
        displayName: 'Root B author',
        username: 'root_b',
        avatarPath: null,
        isArtist: false,
        publicSlug: null,
      },
      replies: [makeNestedReply('b-1', 'Reply B')],
    });

    function TwoRootsHarness() {
      const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
      const toggle = (id: string) => {
        setCollapsed((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      };
      return (
        <MemoryRouter>
          {[rootA, rootB].map((root) => {
            const expanded = !collapsed.has(root.id);
            return (
              <AlbumCommentRow
                key={root.id}
                comment={root}
                lang="en"
                labels={rowLabels}
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
                repliesThreadExpanded={expanded}
                onToggleRepliesThread={() => toggle(root.id)}
              >
                {expanded ? <p data-testid={`nested-${root.id}`}>{root.replies[0]?.body}</p> : null}
              </AlbumCommentRow>
            );
          })}
        </MemoryRouter>
      );
    }

    render(<TwoRootsHarness />);

    const rows = screen.getAllByRole('article');
    expect(rows).toHaveLength(2);
    fireEvent.click(within(rows[0]).getByRole('button', { name: 'Hide replies' }));

    expect(screen.queryByTestId('nested-root-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('nested-root-b')).toBeInTheDocument();
    expect(within(rows[0]).getByRole('button', { name: 'Show 1 replies' })).toBeInTheDocument();
    expect(within(rows[1]).getByRole('button', { name: 'Hide replies' })).toBeInTheDocument();
  });
});
