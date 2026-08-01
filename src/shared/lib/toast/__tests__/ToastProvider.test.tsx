import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

import { Popup } from '@shared/ui/popup';
import { toast } from '../toastApi';
import { ToastProvider } from '../ToastProvider';
import { resetToastStoreForTests } from '../toastStore';
import { installToastLayerPromotion, promoteToastLayers } from '../useToastLayerDialog';

function renderToastProvider(ui?: ReactNode) {
  return render(<ToastProvider>{ui ?? <div>App shell</div>}</ToastProvider>);
}

describe('ToastProvider integration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetToastStoreForTests();
    installToastLayerPromotion();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('renders toast from toast.show()', () => {
    renderToastProvider();

    act(() => {
      toast.show({ title: 'Track deleted', variant: 'success' });
    });

    expect(screen.getByRole('status', { hidden: true })).toHaveTextContent('Track deleted');
  });

  test('renders error toast with alert semantics', () => {
    renderToastProvider();

    act(() => {
      toast.show({ title: 'Save failed', variant: 'error' });
    });

    expect(screen.getByRole('alert', { hidden: true })).toHaveTextContent('Save failed');
  });

  test('renders top-layer toast inside dialog shell', () => {
    renderToastProvider();

    act(() => {
      toast.show({ title: 'Mix saved', variant: 'success', layer: 'top' });
    });

    expect(document.querySelector('dialog.toast-top-layer')).toBeInTheDocument();
    expect(screen.getByRole('status', { hidden: true })).toHaveTextContent('Mix saved');
  });

  test('mounts default toast viewport layer in document.body via ToastProvider portal', () => {
    renderToastProvider();

    act(() => {
      toast.show({ title: 'Track saved', variant: 'success' });
    });

    const viewportLayer = document.querySelector('dialog.toast-viewport-layer');
    expect(viewportLayer).toBeInTheDocument();
    expect(viewportLayer?.parentElement).toBe(document.body);
    expect(viewportLayer).toHaveStyle({ zIndex: '10000' });
    expect(viewportLayer?.hasAttribute('open')).toBe(true);
    expect(screen.getByRole('status', { hidden: true })).toHaveTextContent('Track saved');
  });

  test('re-promotes viewport layer when a new toast is added', () => {
    renderToastProvider();
    const showModalSpy = jest.spyOn(HTMLDialogElement.prototype, 'showModal');

    act(() => {
      toast.show({ title: 'First toast', variant: 'success' });
    });

    const callsAfterFirst = showModalSpy.mock.calls.length;

    act(() => {
      toast.show({ title: 'Second toast', variant: 'info' });
    });

    expect(showModalSpy.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    showModalSpy.mockRestore();
  });

  test('promoteToastLayers opens toast viewport layer dialog', () => {
    renderToastProvider();

    act(() => {
      toast.show({ title: 'Saved as draft', variant: 'success' });
    });

    const viewportLayer = document.querySelector(
      'dialog.toast-viewport-layer'
    ) as HTMLDialogElement;
    expect(viewportLayer).toBeInTheDocument();

    const showModalSpy = jest.spyOn(viewportLayer, 'showModal');
    const closeSpy = jest.spyOn(viewportLayer, 'close').mockImplementation(() => undefined);

    act(() => {
      promoteToastLayers();
    });

    expect(closeSpy).toHaveBeenCalled();
    expect(showModalSpy).toHaveBeenCalled();

    closeSpy.mockRestore();
    showModalSpy.mockRestore();
  });

  test('Popup.showModal re-promotes toast layers via patched showModal', () => {
    renderToastProvider(
      <Popup isActive onClose={() => undefined}>
        <div>Albums modal</div>
      </Popup>
    );

    act(() => {
      toast.show({ title: 'Saved as draft', variant: 'success' });
    });

    const viewportLayer = document.querySelector(
      'dialog.toast-viewport-layer'
    ) as HTMLDialogElement;
    const showModalSpy = jest.spyOn(viewportLayer, 'showModal');

    act(() => {
      renderToastProvider(
        <Popup isActive onClose={() => undefined}>
          <div>Albums modal</div>
        </Popup>
      );
    });

    expect(showModalSpy).toHaveBeenCalled();
    showModalSpy.mockRestore();
  });

  test('dismisses toast via toast.dismiss()', () => {
    renderToastProvider();

    let id = '';
    act(() => {
      id = toast.show({ title: 'Dismiss me', dismissible: true });
    });

    expect(screen.getByText('Dismiss me')).toBeInTheDocument();

    act(() => {
      toast.dismiss(id);
    });

    expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument();
  });

  test('close button dismisses persistent toast', async () => {
    jest.useRealTimers();
    resetToastStoreForTests();
    installToastLayerPromotion();

    const user = userEvent.setup();
    renderToastProvider();

    act(() => {
      toast.show({ title: 'Account deleted', duration: null, dismissible: true });
    });

    await user.click(screen.getByRole('button', { name: 'Close', hidden: true }));

    expect(screen.queryByText('Account deleted')).not.toBeInTheDocument();
  });
});
