import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlbumCommentsTeaser } from '../AlbumCommentsTeaser';

describe('AlbumCommentsTeaser', () => {
  test('shows empty teaser copy when there are no comments', () => {
    render(
      <AlbumCommentsTeaser
        summary={{ totalCount: 0, recentCommenters: [] }}
        loading={false}
        labels={{
          noComments: 'No comments',
          commentsCount: (n) => String(n),
          openComments: 'Open',
        }}
        onOpen={() => undefined}
      />
    );
    expect(screen.getByText('No comments')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
  });

  test('shows count when comments exist', async () => {
    const onOpen = jest.fn();
    render(
      <AlbumCommentsTeaser
        summary={{ totalCount: 24, recentCommenters: [] }}
        loading={false}
        labels={{
          noComments: 'No comments',
          commentsCount: (n) => String(n),
          openComments: 'Open',
        }}
        onOpen={onOpen}
      />
    );
    expect(screen.getByText('24')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onOpen).toHaveBeenCalled();
  });
});
