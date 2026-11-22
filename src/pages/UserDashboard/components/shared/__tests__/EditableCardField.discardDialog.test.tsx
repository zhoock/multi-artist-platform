/** @jest-environment jsdom */

import { readFileSync } from 'node:fs';

import { describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import { InlineEditDiscardDialog } from '../EditableCardField';

const labels = {
  message: 'Discard unsaved changes?',
  stay: 'Keep editing',
  discard: 'Discard',
};

describe('InlineEditDiscardDialog accessibility', () => {
  test('discard overlay uses viewport-sized fixed positioning (not dialog layout box)', () => {
    const scss = readFileSync(
      'src/pages/UserDashboard/components/shared/EditableCardField.style.scss',
      'utf8'
    );
    const block =
      scss.match(/\.edit-album-modal__inline-discard-overlay\s*\{([^}]+)\}/s)?.[1] ?? '';

    expect(block).toMatch(/position:\s*fixed/);
    expect(block).toMatch(/inline-size:\s*100vw/);
    expect(block).toMatch(/block-size:\s*100dvb/);
    expect(block).toMatch(/min-block-size:\s*100dvb/);
  });

  test('article editor anchors discard overlay to the fullscreen shell container', () => {
    const scss = readFileSync(
      'src/pages/UserDashboard/components/modals/article/EditArticleModalV2.style.scss',
      'utf8'
    );

    expect(scss).toMatch(/&__container\s*\{[\s\S]*position:\s*relative/);
    expect(scss).toMatch(
      />\s*\.edit-album-modal__inline-discard-overlay\s*\{[\s\S]*position:\s*absolute/
    );
    expect(scss).toMatch(/inset:\s*0/);
  });
  test('backdrop is a native button and triggers onStay', () => {
    const onStay = jest.fn();
    render(<InlineEditDiscardDialog open labels={labels} onStay={onStay} onDiscard={jest.fn()} />);

    const backdrop = document.querySelector(
      '.edit-album-modal__inline-discard-backdrop'
    ) as HTMLButtonElement;
    expect(backdrop).toBeTruthy();
    expect(backdrop.tagName).toBe('BUTTON');

    fireEvent.click(backdrop);
    expect(onStay).toHaveBeenCalledTimes(1);
  });

  test('explicit stay button still works', () => {
    const onStay = jest.fn();
    render(<InlineEditDiscardDialog open labels={labels} onStay={onStay} onDiscard={jest.fn()} />);

    const stayButtons = screen.getAllByRole('button', { name: 'Keep editing' });
    expect(stayButtons.length).toBe(2);

    fireEvent.click(stayButtons[1]!);
    expect(onStay).toHaveBeenCalledTimes(1);
  });
});
