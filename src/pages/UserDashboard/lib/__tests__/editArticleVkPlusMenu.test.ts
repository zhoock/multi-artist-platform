import { describe, expect, test } from '@jest/globals';

import {
  EDIT_ARTICLE_VK_PLUS_MENU_GAP_PX,
  EDIT_ARTICLE_VK_PLUS_MENU_VIEWPORT_MARGIN_PX,
  getEditArticleVkPlusMenuStyle,
  resolveEditArticleVkPlusMenuVerticalBounds,
} from '../editArticleVkPlusMenu';

const MENU_SIZE = { width: 180, height: 72 };
const VIEWPORT = { width: 390, height: 844 };

function mockRect(el: HTMLElement, partial: Partial<DOMRect>): void {
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
}

function mockTriggerRect(partial: Partial<DOMRect>): HTMLElement {
  const el = document.createElement('button');
  mockRect(el, partial);
  return el;
}

function mountArticleEditorShell(options: {
  triggerRect: Partial<DOMRect>;
  footerTop: number;
  footerHeight?: number;
}): HTMLElement {
  const dialog = document.createElement('dialog');
  dialog.className = 'popup';

  const content = document.createElement('div');
  content.className = 'edit-article-v2__content';
  const trigger = document.createElement('button');
  trigger.className = 'edit-article-v2__vk-plus-button';
  mockRect(trigger, options.triggerRect);
  content.appendChild(trigger);

  const footer = document.createElement('div');
  footer.className = 'edit-article-v2__footer';
  const footerHeight = options.footerHeight ?? 72;
  mockRect(footer, {
    top: options.footerTop,
    bottom: options.footerTop + footerHeight,
    left: 0,
    right: VIEWPORT.width,
    width: VIEWPORT.width,
    height: footerHeight,
  });

  dialog.append(content, footer);
  document.body.appendChild(dialog);
  return trigger;
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

  test('opens above the trigger when space below ends at the article editor footer on mobile', () => {
    const footerTop = 760;
    const trigger = mountArticleEditorShell({
      footerTop,
      triggerRect: { top: 692, left: 24, bottom: 728, right: 60 },
    });

    const { style, placement } = getEditArticleVkPlusMenuStyle(trigger, MENU_SIZE, VIEWPORT);

    expect(placement).toBe('above');
    expect(style.top).toBe(692 - EDIT_ARTICLE_VK_PLUS_MENU_GAP_PX - MENU_SIZE.height);
    expect((style.top as number) + MENU_SIZE.height).toBeLessThanOrEqual(
      footerTop - EDIT_ARTICLE_VK_PLUS_MENU_GAP_PX
    );
    document.body.innerHTML = '';
  });

  test('opens below the trigger when there is room between trigger and editor footer', () => {
    const footerTop = 820;
    const trigger = mountArticleEditorShell({
      footerTop,
      triggerRect: { top: 620, left: 24, bottom: 656, right: 60 },
    });

    const { style, placement } = getEditArticleVkPlusMenuStyle(trigger, MENU_SIZE, VIEWPORT);

    expect(placement).toBe('below');
    expect(style.top).toBe(656 + EDIT_ARTICLE_VK_PLUS_MENU_GAP_PX);
    expect((style.top as number) + MENU_SIZE.height).toBeLessThanOrEqual(
      footerTop - EDIT_ARTICLE_VK_PLUS_MENU_GAP_PX
    );
    document.body.innerHTML = '';
  });

  test('resolveEditArticleVkPlusMenuVerticalBounds uses footer top inside article dialog', () => {
    const footerTop = 760;
    const trigger = mountArticleEditorShell({
      footerTop,
      triggerRect: { top: 692, bottom: 728 },
    });

    expect(resolveEditArticleVkPlusMenuVerticalBounds(trigger, VIEWPORT)).toEqual({
      minTop: EDIT_ARTICLE_VK_PLUS_MENU_VIEWPORT_MARGIN_PX,
      maxBottom: footerTop - EDIT_ARTICLE_VK_PLUS_MENU_GAP_PX,
    });
    document.body.innerHTML = '';
  });

  test('opens above the trigger when the menu would sit under the viewport bottom', () => {
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
