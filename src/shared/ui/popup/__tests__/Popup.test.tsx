/** @jest-environment jsdom */

import React from 'react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, render, screen } from '@testing-library/react';

import {
  __getBodyScrollLockCountForTests,
  __resetBodyScrollLockForTests,
} from '@shared/lib/hooks/useBodyScrollLock';
import { Popup, PopupCloseButton } from '@shared/ui/popup';

function renderPopup(
  ui: React.ReactElement,
  options?: {
    autoFocusFirstElement?: boolean;
    initialFocusSelector?: string;
  }
) {
  return render(
    <Popup
      isActive
      onClose={() => undefined}
      autoFocusFirstElement={options?.autoFocusFirstElement}
      initialFocusSelector={options?.initialFocusSelector}
    >
      {ui}
    </Popup>
  );
}

describe('Popup body scroll lock', () => {
  beforeEach(() => {
    __resetBodyScrollLockForTests();
    Object.defineProperty(window, 'scrollY', { value: 200, configurable: true, writable: true });
  });

  afterEach(() => {
    __resetBodyScrollLockForTests();
  });

  test('locks underlying document while active and restores on close', () => {
    const { rerender } = render(
      <Popup isActive onClose={() => undefined}>
        <p>Modal</p>
      </Popup>
    );

    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.top).toBe('-200px');
    expect(__getBodyScrollLockCountForTests()).toBe(1);

    rerender(
      <Popup isActive={false} onClose={() => undefined}>
        <p>Modal</p>
      </Popup>
    );

    expect(document.body.style.position).toBe('');
    expect(__getBodyScrollLockCountForTests()).toBe(0);
  });
});

describe('Popup initial focus', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    __resetBodyScrollLockForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
    __resetBodyScrollLockForTests();
  });

  test('focuses neutral sentinel by default instead of the close button', () => {
    renderPopup(
      <div>
        <PopupCloseButton aria-label="Close">X</PopupCloseButton>
        <button type="button">Continue</button>
      </div>
    );

    act(() => {
      jest.runAllTimers();
    });

    expect(document.querySelector('.popup__focus-sentinel')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Close' })).not.toHaveFocus();
  });

  test('focuses initialFocusSelector target when provided', () => {
    renderPopup(
      <div>
        <PopupCloseButton aria-label="Close">X</PopupCloseButton>
        <button type="button" className="target-nav">
          Subscription
        </button>
      </div>,
      { initialFocusSelector: '.target-nav' }
    );

    act(() => {
      jest.runAllTimers();
    });

    expect(screen.getByRole('button', { name: 'Subscription' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Close' })).not.toHaveFocus();
  });

  test('initial autofocus uses focusVisible false to avoid spurious focus ring', () => {
    const focusSpy = jest.spyOn(HTMLElement.prototype, 'focus');

    renderPopup(
      <div>
        <PopupCloseButton aria-label="Close">X</PopupCloseButton>
        <button type="button" className="target-nav">
          Subscription
        </button>
      </div>,
      { initialFocusSelector: '.target-nav' }
    );

    act(() => {
      jest.runAllTimers();
    });

    expect(focusSpy).toHaveBeenCalledWith(
      expect.objectContaining({ preventScroll: true, focusVisible: false })
    );

    focusSpy.mockRestore();
  });

  test('falls back to focus sentinel when initialFocusSelector misses', () => {
    renderPopup(
      <div>
        <PopupCloseButton aria-label="Close">X</PopupCloseButton>
        <button type="button">Continue</button>
      </div>,
      { initialFocusSelector: '.missing-target' }
    );

    act(() => {
      jest.runAllTimers();
    });

    expect(document.querySelector('.popup__focus-sentinel')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Close' })).not.toHaveFocus();
  });

  test('does not move focus when autoFocusFirstElement is false', () => {
    const externalButton = document.createElement('button');
    externalButton.type = 'button';
    externalButton.textContent = 'Outside';
    document.body.appendChild(externalButton);
    externalButton.focus();

    renderPopup(
      <div>
        <PopupCloseButton aria-label="Close">X</PopupCloseButton>
      </div>,
      { autoFocusFirstElement: false }
    );

    act(() => {
      jest.runAllTimers();
    });

    expect(externalButton).toHaveFocus();
    externalButton.remove();
  });

  test('restores focus to the opener after the dialog closes', async () => {
    const externalButton = document.createElement('button');
    externalButton.type = 'button';
    externalButton.textContent = 'Outside';
    document.body.appendChild(externalButton);

    act(() => {
      externalButton.focus();
    });

    const { rerender } = render(
      <Popup isActive onClose={() => undefined}>
        <PopupCloseButton aria-label="Close">X</PopupCloseButton>
      </Popup>
    );

    act(() => {
      jest.runAllTimers();
    });

    act(() => {
      rerender(
        <Popup isActive={false} onClose={() => undefined}>
          <PopupCloseButton aria-label="Close">X</PopupCloseButton>
        </Popup>
      );
    });

    act(() => {
      jest.runAllTimers();
    });

    expect(externalButton).toHaveFocus();
    externalButton.remove();
  });
});
