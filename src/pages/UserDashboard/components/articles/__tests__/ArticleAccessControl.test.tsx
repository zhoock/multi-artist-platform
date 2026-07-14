import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArtistMonetizationProvider } from '@shared/lib/payment/ArtistMonetizationContext';
import { ArticleAccessControl } from '../ArticleAccessControl';

function renderWithMonetization(ui: React.ReactElement, monetizationEnabled = true) {
  return render(
    <ArtistMonetizationProvider value={{ monetizationEnabled, loading: false }}>
      {ui}
    </ArtistMonetizationProvider>
  );
}

describe('ArticleAccessControl', () => {
  it('opens visibility menu on icon button click without bubbling to row', async () => {
    const user = userEvent.setup();
    const onMenuOpenChange = jest.fn();

    renderWithMonetization(
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
    renderWithMonetization(
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

  it('hides subscribers-only option when monetization is disabled', () => {
    renderWithMonetization(
      <ArticleAccessControl
        articleId="article-1"
        visibility="public"
        ui={undefined}
        lang="en"
        menuOpen={true}
        onMenuOpenChange={jest.fn()}
        onPickVisibility={jest.fn()}
        getRowElement={() => document.body}
      />,
      false
    );

    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    expect(screen.queryByText(/subscribers only/i)).not.toBeInTheDocument();
  });
});
