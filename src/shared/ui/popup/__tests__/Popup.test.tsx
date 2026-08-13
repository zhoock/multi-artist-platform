/** @jest-environment jsdom */

import React from 'react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, render, screen } from '@testing-library/react';

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

describe('Popup initial focus', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('focuses first focusable element by default', () => {
    renderPopup(
      <div>
        <PopupCloseButton aria-label="Close">X</PopupCloseButton>
        <button type="button">Continue</button>
      </div>
    );

    act(() => {
      jest.runAllTimers();
    });

    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
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

  test('falls back to first focusable when initialFocusSelector misses', () => {
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

    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
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
});
