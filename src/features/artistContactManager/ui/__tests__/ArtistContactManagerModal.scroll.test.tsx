/** @jest-environment jsdom */

import React from 'react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, render } from '@testing-library/react';

import { __resetBodyScrollLockForTests } from '@shared/lib/hooks/useBodyScrollLock';
import { ArtistContactManagerModal } from '../ArtistContactManagerModal';

const labels = {
  title: 'Связаться с менеджером',
  description: 'По вопросам концертов',
  telegram: 'Telegram',
  email: 'Email',
  close: 'Закрыть',
  emailCopied: 'Email скопирован',
  openTelegram: 'Открыть Telegram',
  copyEmail: 'Скопировать email',
};

const TEST_MANAGER_EMAIL = 'manager@beatles.com';

jest.mock('@shared/lib/toast/toastApi', () => ({
  toast: { show: () => undefined },
}));

describe('ArtistContactManagerModal scroll on close', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    __resetBodyScrollLockForTests();
    Object.defineProperty(window, 'scrollY', { value: 420, configurable: true, writable: true });
  });

  afterEach(() => {
    jest.useRealTimers();
    __resetBodyScrollLockForTests();
  });

  test('closing does not refocus the opener and restores scrollY', () => {
    const scrollToSpy = jest.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

    const opener = document.createElement('button');
    opener.type = 'button';
    opener.textContent = 'Contact manager';
    document.body.appendChild(opener);

    act(() => {
      opener.focus();
    });
    const openerFocusSpy = jest.spyOn(opener, 'focus');

    const { rerender } = render(
      <ArtistContactManagerModal
        isOpen
        onClose={() => undefined}
        telegramUrl={null}
        managerEmail={TEST_MANAGER_EMAIL}
        labels={labels}
      />
    );

    act(() => {
      jest.runAllTimers();
    });

    scrollToSpy.mockClear();
    openerFocusSpy.mockClear();

    act(() => {
      rerender(
        <ArtistContactManagerModal
          isOpen={false}
          onClose={() => undefined}
          telegramUrl={null}
          managerEmail={TEST_MANAGER_EMAIL}
          labels={labels}
        />
      );
    });

    act(() => {
      jest.runAllTimers();
    });

    expect(scrollToSpy).toHaveBeenCalledWith(0, 420);
    expect(openerFocusSpy).not.toHaveBeenCalled();
    expect(opener).not.toHaveFocus();

    scrollToSpy.mockRestore();
    openerFocusSpy.mockRestore();
    opener.remove();
  });
});
