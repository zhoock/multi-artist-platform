/** @jest-environment jsdom */

import { describe, expect, jest, test, beforeEach } from '@jest/globals';
import { useRef, useState } from 'react';
import { render, waitFor } from '@testing-library/react';

import { ListenerWelcomeModal } from '../ListenerWelcomeModal';

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'en' }),
}));

jest.mock('@shared/lib/hooks/useAppSelector', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ uiDictionary: { entries: [{ listenerWelcome: {} }] } }),
}));

jest.mock('@shared/model/uiDictionary', () => ({
  selectUiDictionaryFirst: (state: { uiDictionary: { entries: Array<object> } }) =>
    state.uiDictionary.entries[0],
}));

jest.mock('@shared/lib/hooks/useBodyScrollLock', () => ({
  useBodyScrollLock: jest.fn(),
}));

function dispatchDialogCancel(dialog: HTMLDialogElement) {
  dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
}

describe('ListenerWelcomeModal Escape', () => {
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

  test('cancel dispatches dismiss once via LocalModal', async () => {
    const onDismiss = jest.fn();

    function Fixture() {
      const dialogRef = useRef<HTMLDialogElement>(null);
      const [open, setOpen] = useState(true);

      return (
        <ListenerWelcomeModal
          dialogRef={dialogRef}
          open={open}
          onDismiss={() => {
            onDismiss();
            setOpen(false);
          }}
        />
      );
    }

    render(<Fixture />);

    await waitFor(() => {
      expect(document.querySelector('dialog')?.open).toBe(true);
    });

    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    dispatchDialogCancel(dialog);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
