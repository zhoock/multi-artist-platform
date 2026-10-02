import { describe, expect, test } from '@jest/globals';

import {
  EDIT_ARTICLE_VK_PLUS_MENU_GAP_PX,
  EDIT_ARTICLE_VK_PLUS_MENU_VIEWPORT_MARGIN_PX,
  getEditArticleVkPlusMenuStyle,
} from '../editArticleVkPlusMenu';

const MENU_SIZE = { width: 180, height: 72 };
const VIEWPORT = { width: 390, height: 844 };

function mockTriggerRect(partial: Partial<DOMRect>): HTMLElement {
  const el = document.createElement('button');
  el.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      width: 36,
      height: 36,
      top: 0,
      left: 0,
      right: 36,
      bottom: 36,
      toJSON: () => ({}),
      ...partial,
    }) as DOMRect;
  return el;
}

describe('getEditArticleVkPlusMenuStyle', () => {
  test('opens below the trigger when there is enough space under it', () => {
    const trigger = mockTriggerRect({ top: 120, left: 24, bottom: 156, right: 60 });

    const { style, placement } = getEditArticleVkPlusMenuStyle(trigger, MENU_SIZE, VIEWPORT);

    expect(placement).toBe('below');
    expect(style.top).toBe(156 + EDIT_ARTICLE_VK_PLUS_MENU_GAP_PX);
    expect(style.left).toBe(24);
    expect(style.position).toBe('fixed');
    expect(style.visibility).toBe('visible');
    expect(style.width).toBe('max-content');
    expect(style.height).toBe('max-content');
    expect(style.minHeight).toBe(0);
  });

  test('opens above the trigger when the menu would sit under the viewport footer', () => {
    const margin = EDIT_ARTICLE_VK_PLUS_MENU_VIEWPORT_MARGIN_PX;
    const gap = EDIT_ARTICLE_VK_PLUS_MENU_GAP_PX;
    const triggerBottom = VIEWPORT.height - margin - gap - (MENU_SIZE.height - 8);
    const trigger = mockTriggerRect({
      top: triggerBottom - 36,
      left: 24,
      bottom: triggerBottom,
      right: 60,
    });

    const { style, placement } = getEditArticleVkPlusMenuStyle(trigger, MENU_SIZE, VIEWPORT);

    expect(placement).toBe('above');
    expect(style.top).toBe(triggerBottom - 36 - gap - MENU_SIZE.height);
    expect(style.visibility).toBe('visible');
  });

  test('keeps the menu inside the viewport horizontally on narrow screens', () => {
    const trigger = mockTriggerRect({
      top: 120,
      left: VIEWPORT.width - 20,
      bottom: 156,
      right: VIEWPORT.width + 16,
    });

    const { style } = getEditArticleVkPlusMenuStyle(trigger, MENU_SIZE, VIEWPORT);

    expect(style.left).toBe(
      VIEWPORT.width - EDIT_ARTICLE_VK_PLUS_MENU_VIEWPORT_MARGIN_PX - MENU_SIZE.width
    );
  });

  test('returns hidden fixed shell until menu dimensions are known', () => {
    const trigger = mockTriggerRect({ top: 120, bottom: 156 });

    const { style, placement } = getEditArticleVkPlusMenuStyle(trigger, null, VIEWPORT);

    expect(placement).toBe('below');
    expect(style.visibility).toBe('hidden');
    expect(style.position).toBe('fixed');
  });
});
