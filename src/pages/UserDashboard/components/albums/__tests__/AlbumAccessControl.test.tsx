import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlbumAccessControl } from '../AlbumAccessControl';

describe('AlbumAccessControl', () => {
  it('opens visibility menu on icon button click without bubbling to row', async () => {
    const user = userEvent.setup();
    const onMenuOpenChange = jest.fn();

    render(
      <div
        data-testid="album-row"
        onClick={() => {
          throw new Error('row click should not fire');
        }}
      >
        <AlbumAccessControl
          albumId="album-1"
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

    await user.click(screen.getByRole('button', { name: /album visibility/i }));

    expect(onMenuOpenChange).toHaveBeenCalledWith(true);
  });

  it('shows only visible and hidden options when menu is open', () => {
    render(
      <AlbumAccessControl
        albumId="album-1"
        visibility="public"
        ui={undefined}
        lang="en"
        menuOpen={true}
        onPickVisibility={jest.fn()}
        onMenuOpenChange={jest.fn()}
        getRowElement={() => document.body}
      />
    );

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    expect(screen.getByRole('menuitem', { name: /Visible/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Hidden/i })).toBeInTheDocument();
  });
});
