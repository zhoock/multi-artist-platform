import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import { ArtistPageBuilderBlock } from '../ArtistPageBuilderBlock';

describe('ArtistPageBuilderBlock', () => {
  it('stops pointer and click bubbling so parent handlers (e.g. Hero) are not triggered', () => {
    const onAction = jest.fn();
    const onParentClick = jest.fn();
    const onParentPointerDown = jest.fn();
    const onParentMouseDown = jest.fn();

    render(
      <div
        onClick={onParentClick}
        onPointerDown={onParentPointerDown}
        onMouseDown={onParentMouseDown}
      >
        <ArtistPageBuilderBlock
          layout="section"
          icon={<span aria-hidden="true">+</span>}
          title="Band cover"
          actionLabel="Upload"
          onAction={onAction}
        />
      </div>
    );

    const button = screen.getByRole('button', { name: 'Upload' });

    fireEvent.pointerDown(button);
    fireEvent.mouseDown(button);
    fireEvent.click(button);

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onParentClick).not.toHaveBeenCalled();
    expect(onParentPointerDown).not.toHaveBeenCalled();
    expect(onParentMouseDown).not.toHaveBeenCalled();
  });
});
