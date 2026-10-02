import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, jest } from '@jest/globals';

import { VkPlusInserter } from '../SortableBlock';

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

describe('VkPlusInserter', () => {
  test('portals the block menu with fixed positioning below the trigger', async () => {
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });

    render(<VkPlusInserter onSelect={jest.fn()} onClose={jest.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Добавить блок' });
    mockRect(trigger, { top: 120, left: 24, bottom: 156, right: 60 });

    fireEvent.click(trigger);

    let menu: HTMLElement;
    await waitFor(() => {
      menu = document.querySelector('.edit-article-v2__vk-plus-menu') as HTMLElement;
      expect(menu).toBeTruthy();
      Object.defineProperty(menu, 'offsetWidth', { value: 180, configurable: true });
      Object.defineProperty(menu, 'offsetHeight', { value: 72, configurable: true });
      window.dispatchEvent(new Event('resize'));
    });

    await waitFor(() => {
      expect(menu!.parentElement).toBe(document.body);
      expect(menu!.classList.contains('edit-article-v2__vk-plus-menu--below')).toBe(true);
      expect(menu!.style.position).toBe('fixed');
      expect(menu!.style.top).toBe('164px');
      expect(menu!.style.width).toBe('max-content');
      expect(menu!.style.height).toBe('max-content');
      expect(menu!.offsetWidth).toBeLessThan(320);
      expect(menu!.offsetHeight).toBeLessThan(120);
    });
  });

  test('flips above on mobile when the editor footer leaves no room below the trigger', async () => {
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });

    render(
      <dialog className="popup" open>
        <VkPlusInserter onSelect={jest.fn()} onClose={jest.fn()} />
        <div className="edit-article-v2__footer" />
      </dialog>
    );

    const trigger = screen.getByRole('button', { name: 'Добавить блок' });
    const footer = document.querySelector('.edit-article-v2__footer') as HTMLElement;
    mockRect(trigger, { top: 692, left: 24, bottom: 728, right: 60 });
    mockRect(footer, {
      top: 760,
      bottom: 832,
      left: 0,
      right: 390,
      width: 390,
      height: 72,
    });

    fireEvent.click(trigger);

    await waitFor(() => {
      const menu = document.querySelector('.edit-article-v2__vk-plus-menu') as HTMLElement | null;
      expect(menu).toBeTruthy();
      Object.defineProperty(menu!, 'offsetWidth', { value: 180, configurable: true });
      Object.defineProperty(menu!, 'offsetHeight', { value: 72, configurable: true });
      window.dispatchEvent(new Event('resize'));
    });

    await waitFor(() => {
      const menu = document.querySelector('.edit-article-v2__vk-plus-menu') as HTMLElement;
      expect(menu.classList.contains('edit-article-v2__vk-plus-menu--above')).toBe(true);
      expect(parseFloat(menu.style.top) + 72).toBeLessThanOrEqual(760 - 8);
    });
  });

  test('flips the portaled menu above when the trigger sits near the viewport bottom', async () => {
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });

    render(<VkPlusInserter onSelect={jest.fn()} onClose={jest.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Добавить блок' });
    mockRect(trigger, { top: 728, left: 24, bottom: 764, right: 60 });

    fireEvent.click(trigger);

    await waitFor(() => {
      const menu = document.querySelector('.edit-article-v2__vk-plus-menu') as HTMLElement | null;
      expect(menu).toBeTruthy();
      Object.defineProperty(menu!, 'offsetWidth', { value: 180, configurable: true });
      Object.defineProperty(menu!, 'offsetHeight', { value: 72, configurable: true });
      window.dispatchEvent(new Event('resize'));
    });

    let menu: HTMLElement;
    await waitFor(() => {
      menu = document.querySelector('.edit-article-v2__vk-plus-menu') as HTMLElement;
      expect(menu.classList.contains('edit-article-v2__vk-plus-menu--above')).toBe(true);
      expect(parseFloat(menu!.style.top)).toBeLessThan(728);
      expect(menu!.style.width).toBe('max-content');
      expect(menu!.style.height).toBe('max-content');
      expect(menu!.offsetWidth).toBeLessThan(320);
      expect(menu!.offsetHeight).toBeLessThan(120);
    });
  });
});
