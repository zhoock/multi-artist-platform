/** @jest-environment jsdom */

import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';

import { DisableAutoRenewConfirmModal } from '../DisableAutoRenewConfirmModal';

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'ru' }),
}));

jest.mock('@shared/lib/hooks/useAppSelector', () => ({
  useAppSelector: () => null,
}));

describe('DisableAutoRenewConfirmModal', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-07T18:17:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('renders calm copy without header warning icon', () => {
    render(
      <DisableAutoRenewConfirmModal
        isOpen
        nextChargeAt="2026-08-07T18:21:00.000Z"
        expiresAt="2026-08-07T18:21:00.000Z"
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />
    );

    expect(screen.getByRole('heading', { name: 'Отключить автопродление?' })).toBeTruthy();
    expect(
      screen.getByText('После отключения автопродления новые списания выполняться не будут.')
    ).toBeTruthy();
    expect(document.querySelector('.billing-modal__header-icon')).toBeNull();
    expect(document.querySelector('.billing-modal__header')).toBeTruthy();
  });

  test('shows live relative access countdown in info card', () => {
    render(
      <DisableAutoRenewConfirmModal
        isOpen
        nextChargeAt="2026-08-07T18:21:00.000Z"
        expiresAt="2026-08-07T18:21:00.000Z"
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />
    );

    const infoText = document.querySelector('.billing-modal__info-text');
    expect(infoText?.textContent).toMatch(/Доступ сохранится ещё/i);
    expect(infoText?.textContent).toMatch(/4 минуты/i);
    expect(infoText?.textContent).toMatch(/\(до .+\)/);
    expect(screen.getByText('После окончания текущего периода поддержка завершится.')).toBeTruthy();
    expect(screen.getByText('Включить автопродление можно в любой момент.')).toBeTruthy();
  });

  test('shows absolute access date for long periods', () => {
    render(
      <DisableAutoRenewConfirmModal
        isOpen
        nextChargeAt="2026-09-12T12:00:00.000Z"
        expiresAt="2026-09-12T12:00:00.000Z"
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />
    );

    const infoText = document.querySelector('.billing-modal__info-text');
    expect(infoText?.textContent).toMatch(/Доступ сохранится до/i);
    expect(infoText?.textContent).toMatch(/12/i);
    expect(infoText?.textContent).not.toMatch(/ещё/i);
  });
});
