import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlbumCommentComposer } from '../AlbumCommentComposer';

describe('AlbumCommentComposer', () => {
  test('shows reply banner with dismiss control', async () => {
    const user = userEvent.setup();
    const onDismissReply = jest.fn();

    render(
      <AlbumCommentComposer
        value="@Artist "
        onChange={() => undefined}
        onSubmit={() => undefined}
        placeholder="Leave a comment…"
        displayName="Viewer"
        replyBannerLabel="Replying to Artist"
        onDismissReply={onDismissReply}
        cancelLabel="Cancel"
      />
    );

    expect(screen.getByText('Replying to Artist')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDismissReply).toHaveBeenCalledTimes(1);
  });
});
