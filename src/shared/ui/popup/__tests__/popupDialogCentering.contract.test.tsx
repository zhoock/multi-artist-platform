/** @jest-environment jsdom */

import { readFileSync } from 'node:fs';
import { describe, expect, test } from '@jest/globals';
import { render } from '@testing-library/react';

import { Popup } from '@shared/ui/popup';

/**
 * Dashboard popups are `display: flex` and size every direct child.
 * The focus sentinel must stay out of that flex row. If it becomes an
 * in-flow column, the visible card is pushed to the right half of the viewport.
 */
describe('popup dialog centering contract', () => {
  test('public backdrop dialog keeps the focus sentinel as a direct child', () => {
    render(
      <Popup isActive publicBackdrop onClose={() => undefined}>
        <div className="billing-modal">
          <div className="billing-modal__card">Plan</div>
        </div>
      </Popup>
    );

    const dialog = document.querySelector('dialog.popup.local-modal');
    const sentinel = dialog?.querySelector(':scope > .popup__focus-sentinel');
    const shell = dialog?.querySelector(':scope > .billing-modal');

    expect(dialog).not.toBeNull();
    expect(sentinel).not.toBeNull();
    expect(shell).not.toBeNull();
    expect(dialog?.childElementCount).toBe(2);
  });

  test('local-modal does not pull the focus sentinel back into flow', () => {
    const localModal = readFileSync('src/shared/ui/localModal/localModal.scss', 'utf8');
    const inFlowRule = localModal.match(/>\s*:not\(\s*([^)]+)\s*\)\s*\{[^}]*position:\s*relative/s);

    expect(inFlowRule).not.toBeNull();
    expect(inFlowRule?.[1]).toContain('.popup__focus-sentinel');
  });

  test('dashboard popup child sizing does not stretch the focus sentinel', () => {
    const popupStyles = readFileSync('src/shared/ui/popup/style.scss', 'utf8');
    const childSizing = popupStyles.match(/>\s*\*:not\(\s*([\s\S]*?)\)\s*\{/);

    expect(childSizing).not.toBeNull();
    expect(childSizing?.[1]).toContain('.popup__focus-sentinel');
  });
});
