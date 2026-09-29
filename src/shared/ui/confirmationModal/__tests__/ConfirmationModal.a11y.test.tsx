/** @jest-environment jsdom */

import { describe, expect, test } from '@jest/globals';
import { render, screen } from '@testing-library/react';

import { ConfirmationModal } from '../ConfirmationModal';

function getDialog(): HTMLDialogElement {
  const dialog = document.querySelector('dialog');
  if (!dialog) {
    throw new Error('Expected dialog element');
  }
  return dialog;
}

describe('ConfirmationModal accessible name', () => {
  test('with title: dialog aria-labelledby points at the visible h2', () => {
    render(
      <ConfirmationModal
        isOpen
        title="Remove purchase?"
        message="You will lose access to this album."
        irreversibleHint={null}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />
    );

    const dialog = getDialog();
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();

    const heading = screen.getByRole('heading', { level: 2, name: 'Remove purchase?' });
    expect(heading).toHaveAttribute('id', labelledBy);

    const labelNode = document.getElementById(labelledBy!);
    expect(labelNode).toBe(heading);
  });

  test('without title: dialog aria-labelledby points at the message paragraph (route-leave style)', () => {
    render(
      <ConfirmationModal
        isOpen
        message="Leave without saving? Unsaved changes will be lost."
        irreversibleHint={null}
        cancelText="Stay"
        confirmText="Leave"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />
    );

    const dialog = getDialog();
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();

    const message = screen.getByText('Leave without saving? Unsaved changes will be lost.');
    expect(message.tagName).toBe('P');
    expect(message).toHaveAttribute('id', labelledBy);

    const labelNode = document.getElementById(labelledBy!);
    expect(labelNode).toBe(message);
  });
});
