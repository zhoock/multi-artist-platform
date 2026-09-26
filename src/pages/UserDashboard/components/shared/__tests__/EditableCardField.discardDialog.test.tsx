/** @jest-environment jsdom */

import { describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import { InlineEditDiscardDialog } from '../EditableCardField';

const labels = {
  message: 'Discard unsaved changes?',
  stay: 'Keep editing',
  discard: 'Discard',
};

describe('InlineEditDiscardDialog accessibility', () => {
  test('backdrop is a native button and triggers onStay', () => {
    const onStay = jest.fn();
    render(<InlineEditDiscardDialog open labels={labels} onStay={onStay} onDiscard={jest.fn()} />);

    const backdrop = document.querySelector(
      '.edit-album-modal__inline-discard-backdrop'
    ) as HTMLButtonElement;
    expect(backdrop).toBeTruthy();
    expect(backdrop.tagName).toBe('BUTTON');

    fireEvent.click(backdrop);
    expect(onStay).toHaveBeenCalledTimes(1);
  });

  test('explicit stay button still works', () => {
    const onStay = jest.fn();
    render(<InlineEditDiscardDialog open labels={labels} onStay={onStay} onDiscard={jest.fn()} />);

    const stayButtons = screen.getAllByRole('button', { name: 'Keep editing' });
    expect(stayButtons.length).toBe(2);

    fireEvent.click(stayButtons[1]!);
    expect(onStay).toHaveBeenCalledTimes(1);
  });
});
