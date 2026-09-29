/** @jest-environment jsdom */

import { describe, expect, test } from '@jest/globals';
import { render, screen } from '@testing-library/react';

import { AlertModal } from '../AlertModal';

function getDialog(): HTMLDialogElement {
  const dialog = document.querySelector('dialog');
  if (!dialog) {
    throw new Error('Expected dialog element');
  }
  return dialog;
}

describe('AlertModal accessible name', () => {
  test('with title: dialog aria-labelledby points at the visible h2', () => {
    render(
      <AlertModal
        isOpen
        title="Upload failed"
        message="Try again later."
        onClose={() => undefined}
      />
    );

    const dialog = getDialog();
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();

    const heading = screen.getByRole('heading', { level: 2, name: 'Upload failed' });
    expect(heading).toHaveAttribute('id', labelledBy);

    const labelNode = document.getElementById(labelledBy!);
    expect(labelNode).toBe(heading);
    expect(labelNode).toHaveTextContent('Upload failed');
  });

  test('without title: dialog aria-labelledby points at the message paragraph', () => {
    render(<AlertModal isOpen message="Try again later." onClose={() => undefined} />);

    const dialog = getDialog();
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();

    const message = screen.getByText('Try again later.');
    expect(message.tagName).toBe('P');
    expect(message).toHaveAttribute('id', labelledBy);

    const labelNode = document.getElementById(labelledBy!);
    expect(labelNode).toBe(message);
  });
});
