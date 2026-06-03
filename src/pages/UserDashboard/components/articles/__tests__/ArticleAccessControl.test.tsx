import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArticleAccessControl } from '../ArticleAccessControl';

describe('ArticleAccessControl', () => {
  it('opens visibility menu on icon button click without bubbling to row', async () => {
    const user = userEvent.setup();
    const onMenuOpenChange = jest.fn();

    render(
      <div
        data-testid="article-row"
        onClick={() => {
          throw new Error('row click should not fire');
        }}
      >
        <ArticleAccessControl
          articleId="article-1"
          visibility="public"
          ui={undefined}
          lang="en"
          menuOpen={false}
          onMenuOpenChange={onMenuOpenChange}
          onPickVisibility={jest.fn()}
          getRowElement={() => document.body}
        />
      </div>
    );

    await user.click(screen.getByRole('button', { name: /article access/i }));

    expect(onMenuOpenChange).toHaveBeenCalledWith(true);
  });

  it('shows visibility options when menu is open', () => {
    render(
      <ArticleAccessControl
        articleId="article-1"
        visibility="public"
        ui={undefined}
        lang="en"
        menuOpen={true}
        onMenuOpenChange={jest.fn()}
        onPickVisibility={jest.fn()}
        getRowElement={() => document.body}
      />
    );

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
  });
});
