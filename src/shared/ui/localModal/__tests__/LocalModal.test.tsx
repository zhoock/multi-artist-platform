/** @jest-environment jsdom */

import { describe, expect, jest, test, beforeEach } from '@jest/globals';
import { useRef, useState } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';

import { LocalModal } from '../LocalModal';

function dispatchDialogCancel(dialog: HTMLDialogElement) {
  dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
}

describe('LocalModal cancel (Escape) handling', () => {
  beforeEach(() => {
    jest.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function showModal(
      this: HTMLDialogElement
    ) {
      this.open = true;
    });
    jest.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function close(
      this: HTMLDialogElement
    ) {
      this.open = false;
    });
  });

  test('controlled isOpen: cancel invokes onClose and closes dialog when parent sets isOpen false', async () => {
    const onClose = jest.fn();

    function ControlledFixture() {
      const dialogRef = useRef<HTMLDialogElement>(null);
      const [open, setOpen] = useState(true);

      return (
        <LocalModal
          dialogRef={dialogRef}
          isOpen={open}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
          aria-labelledby="local-modal-test-title"
        >
          <h2 id="local-modal-test-title">Test</h2>
        </LocalModal>
      );
    }

    render(<ControlledFixture />);

    await waitFor(() => {
      expect(document.querySelector('dialog')?.open).toBe(true);
    });

    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    dispatchDialogCancel(dialog);

    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(dialog.open).toBe(false);
    });
  });

  test('imperative mode: cancel invokes onClose', async () => {
    const onClose = jest.fn();
    const dialogRef = { current: null as HTMLDialogElement | null };

    render(
      <LocalModal
        dialogRef={dialogRef}
        onClose={onClose}
        aria-labelledby="local-modal-imperative-title"
      >
        <h2 id="local-modal-imperative-title">Imperative</h2>
      </LocalModal>
    );

    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    dialogRef.current = dialog;
    dialog.showModal();

    dispatchDialogCancel(dialog);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('LocalModal backdrop button', () => {
  beforeEach(() => {
    jest.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function showModal(
      this: HTMLDialogElement
    ) {
      this.open = true;
    });
  });

  test('renders backdrop button when closeOnBackdropClick is true', () => {
    const dialogRef = { current: null as HTMLDialogElement | null };

    render(
      <LocalModal dialogRef={dialogRef} onClose={jest.fn()} aria-labelledby="backdrop-test-title">
        <h2 id="backdrop-test-title">Panel</h2>
      </LocalModal>
    );

    const backdrop = document.querySelector('.local-modal__backdrop');
    expect(backdrop).toBeTruthy();
    expect(backdrop?.getAttribute('aria-hidden')).toBe('true');
    expect(backdrop?.getAttribute('tabindex')).toBe('-1');
  });

  test('does not render backdrop when closeOnBackdropClick is false', () => {
    const dialogRef = { current: null as HTMLDialogElement | null };

    render(
      <LocalModal
        dialogRef={dialogRef}
        onClose={jest.fn()}
        closeOnBackdropClick={false}
        aria-labelledby="no-backdrop-title"
      >
        <h2 id="no-backdrop-title">Panel only</h2>
      </LocalModal>
    );

    expect(document.querySelector('.local-modal__backdrop')).toBeNull();
  });

  test('backdrop click invokes onClose once', () => {
    const onClose = jest.fn();
    const dialogRef = { current: null as HTMLDialogElement | null };

    render(
      <LocalModal dialogRef={dialogRef} onClose={onClose} aria-labelledby="backdrop-click-title">
        <div className="local-modal-test-panel">
          <h2 id="backdrop-click-title">Panel</h2>
        </div>
      </LocalModal>
    );

    const backdrop = document.querySelector('.local-modal__backdrop') as HTMLButtonElement;
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('click inside panel does not invoke onClose', () => {
    const onClose = jest.fn();
    const dialogRef = { current: null as HTMLDialogElement | null };

    render(
      <LocalModal dialogRef={dialogRef} onClose={onClose} aria-labelledby="panel-click-title">
        <div className="local-modal-test-panel">
          <h2 id="panel-click-title">Panel</h2>
          <button type="button">Inside panel</button>
        </div>
      </LocalModal>
    );

    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    dialogRef.current = dialog;
    dialog.showModal();

    const panelButton = document.querySelector(
      '.local-modal-test-panel button'
    ) as HTMLButtonElement;
    fireEvent.click(panelButton);

    expect(onClose).not.toHaveBeenCalled();
  });

  test('Escape still invokes onClose with backdrop button present', () => {
    const onClose = jest.fn();
    const dialogRef = { current: null as HTMLDialogElement | null };

    render(
      <LocalModal dialogRef={dialogRef} onClose={onClose} aria-labelledby="escape-with-backdrop">
        <h2 id="escape-with-backdrop">Title</h2>
      </LocalModal>
    );

    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    dialogRef.current = dialog;
    dialog.showModal();

    dispatchDialogCancel(dialog);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
