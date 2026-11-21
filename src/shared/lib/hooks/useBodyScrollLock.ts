/**
 * Lock body scroll while a modal/overlay is open.
 *
 * Только `overflow: hidden` на `html`/`body`: документ не смещается, scrollY не
 * трогаем. Refcount — несколько модалок могут быть открыты одновременно.
 *
 * Compensation: при скрытии scrollbar добавляем `padding-right: scrollbarWidth`,
 * чтобы layout не прыгал вправо (не влияет на scroll position).
 */

import { useLayoutEffect } from 'react';

type LockState = {
  count: number;
  savedBodyStyles: {
    paddingRight: string;
    overflow: string;
  };
  savedHtmlOverflow: string;
};

const lockState: LockState = {
  count: 0,
  savedBodyStyles: {
    paddingRight: '',
    overflow: '',
  },
  savedHtmlOverflow: '',
};

function getScrollbarWidth(): number {
  if (typeof window === 'undefined') return 0;
  return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
}

function applyLock(): void {
  if (typeof document === 'undefined') return;
  const { body, documentElement: html } = document;

  lockState.savedBodyStyles = {
    paddingRight: body.style.paddingRight,
    overflow: body.style.overflow,
  };
  lockState.savedHtmlOverflow = html.style.overflow;

  const scrollbarWidth = getScrollbarWidth();

  body.style.overflow = 'hidden';
  if (scrollbarWidth > 0) {
    const existing = parseFloat(lockState.savedBodyStyles.paddingRight) || 0;
    body.style.paddingRight = `${existing + scrollbarWidth}px`;
  }
  html.style.overflow = 'hidden';
}

function releaseLock(): void {
  if (typeof document === 'undefined') return;
  const { body, documentElement: html } = document;

  body.style.overflow = lockState.savedBodyStyles.overflow;
  body.style.paddingRight = lockState.savedBodyStyles.paddingRight;
  html.style.overflow = lockState.savedHtmlOverflow;
}

/**
 * Block body scroll while `active` is true. Safe to call multiple times
 * across nested modals — counts active locks and only releases on the last.
 */
export function useBodyScrollLock(active: boolean): void {
  useLayoutEffect(() => {
    if (!active) return;

    if (lockState.count === 0) {
      applyLock();
    }
    lockState.count += 1;

    return () => {
      lockState.count = Math.max(0, lockState.count - 1);
      if (lockState.count === 0) {
        releaseLock();
      }
    };
  }, [active]);
}

/** @internal Reset for tests — not for production use. */
export function __resetBodyScrollLockForTests(): void {
  if (typeof document !== 'undefined') {
    const { body, documentElement: html } = document;
    body.style.paddingRight = '';
    body.style.overflow = '';
    html.style.overflow = '';
  }
  lockState.count = 0;
}

/** @internal Test helper to read current lock count. */
export function __getBodyScrollLockCountForTests(): number {
  return lockState.count;
}
