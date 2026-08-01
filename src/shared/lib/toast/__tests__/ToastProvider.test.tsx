import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { toast } from '../toastApi';
import { ToastProvider } from '../ToastProvider';
import { resetToastStoreForTests } from '../toastStore';

function renderToastProvider() {
  return render(
    <ToastProvider>
      <div>App shell</div>
    </ToastProvider>
  );
}

describe('ToastProvider integration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetToastStoreForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('renders toast from toast.show()', () => {
    renderToastProvider();

    act(() => {
      toast.show({ title: 'Track deleted', variant: 'success' });
    });

    expect(screen.getByRole('status')).toHaveTextContent('Track deleted');
  });

  test('renders error toast with alert semantics', () => {
    renderToastProvider();

    act(() => {
      toast.show({ title: 'Save failed', variant: 'error' });
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Save failed');
  });

  test('renders top-layer toast inside dialog shell', () => {
    renderToastProvider();

    act(() => {
      toast.show({ title: 'Mix saved', variant: 'success', layer: 'top' });
    });

    expect(document.querySelector('dialog.toast-top-layer')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Mix saved');
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

    const user = userEvent.setup();
    renderToastProvider();

    act(() => {
      toast.show({ title: 'Account deleted', duration: null, dismissible: true });
    });

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByText('Account deleted')).not.toBeInTheDocument();
  });
});
