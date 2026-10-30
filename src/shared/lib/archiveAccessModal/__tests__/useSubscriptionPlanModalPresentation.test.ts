/** @jest-environment jsdom */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { renderHook } from '@testing-library/react';

import { useSubscriptionPlanModalPresentation } from '../useSubscriptionPlanModalPresentation';

describe('useSubscriptionPlanModalPresentation', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {
        height: 640,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('on show resets dialog scroll and sets viewport height CSS variable', () => {
    const dialog = document.createElement('dialog');
    dialog.className = 'popup local-modal subscription-plan-modal';
    dialog.innerHTML =
      '<div class="subscription-plan-modal__card"><div class="subscription-plan-modal__body"></div></div>';
    document.body.appendChild(dialog);

    const body = dialog.querySelector('.subscription-plan-modal__body') as HTMLElement;
    dialog.scrollTop = 120;
    body.scrollTop = 80;

    const dialogRef = { current: dialog };
    const onShow = jest.fn();

    renderHook(() => useSubscriptionPlanModalPresentation(dialogRef, onShow));

    dialog.dispatchEvent(new Event('show'));

    expect(dialog.scrollTop).toBe(0);
    expect(body.scrollTop).toBe(0);
    expect(dialog.style.getPropertyValue('--subscription-plan-modal-viewport-height')).toBe(
      '640px'
    );
    expect(onShow).toHaveBeenCalledTimes(1);

    dialog.dispatchEvent(new Event('close'));
    expect(dialog.style.getPropertyValue('--subscription-plan-modal-viewport-height')).toBe('');
  });
});
