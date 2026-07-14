import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { fireEvent, screen, within } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';
import { PaymentSettings } from '../PaymentSettings';

const usePaymentSettingsMock = jest.fn();

jest.mock('../../model/usePaymentSettings', () => ({
  usePaymentSettings: (userId: string) => usePaymentSettingsMock(userId),
}));

function baseHookReturn(overrides: Record<string, unknown> = {}) {
  return {
    settingsMap: { yookassa: null, stripe: null },
    loading: false,
    saving: null,
    error: null,
    success: null,
    localShopId: { yookassa: '', stripe: '' },
    localSecretKey: { yookassa: '', stripe: '' },
    showForm: { yookassa: false, stripe: false },
    setActiveProvider: jest.fn(),
    setShopId: jest.fn(),
    setSecretKey: jest.fn(),
    setLocalShopId: jest.fn(),
    setLocalSecretKey: jest.fn(),
    setShowForm: jest.fn(),
    handleConnect: jest.fn(),
    handleDisconnect: jest.fn(),
    ...overrides,
  };
}

describe('PaymentSettings', () => {
  beforeEach(() => {
    usePaymentSettingsMock.mockReset();
  });

  it('renders loading state', () => {
    usePaymentSettingsMock.mockReturnValue(baseHookReturn({ loading: true }));

    const { container } = renderWithProviders(<PaymentSettings userId="user-1" />);

    expect(
      container.querySelector('.dashboard-loading-state.payment-settings__loading')
    ).toBeTruthy();
  });

  it('renders disconnected state with dashboard kit layout and connect CTA', () => {
    usePaymentSettingsMock.mockReturnValue(baseHookReturn());

    const { container } = renderWithProviders(<PaymentSettings userId="user-1" />);

    expect(container.querySelector('.dashboard-section')).toBeTruthy();
    expect(container.querySelector('.dashboard-card')).toBeTruthy();
    expect(container.querySelector('.dashboard-button--outline')).toBeTruthy();
    expect(screen.getByText('Enter Shop ID and Secret Key')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'ЮKassa', level: 3 })).toBeTruthy();
    expect(container.querySelector('.payment-settings__setup-steps-list')).toBeTruthy();
  });

  it('renders connected state with disconnect action and no status badge', () => {
    usePaymentSettingsMock.mockReturnValue(
      baseHookReturn({
        settingsMap: {
          yookassa: {
            isActive: true,
            connectedAt: '2026-01-15T12:00:00.000Z',
          },
          stripe: null,
        },
      })
    );

    const { container } = renderWithProviders(<PaymentSettings userId="user-1" />);

    expect(container.querySelector('.status-badge--published')).toBeNull();
    expect(screen.queryByText('Connected')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Disconnect' }).length).toBeGreaterThan(0);
  });

  it('opens confirmation modal instead of native confirm when disconnect is clicked', () => {
    const handleDisconnect = jest.fn();
    usePaymentSettingsMock.mockReturnValue(
      baseHookReturn({
        settingsMap: {
          yookassa: {
            isActive: true,
            connectedAt: '2026-01-15T12:00:00.000Z',
          },
          stripe: null,
        },
        handleDisconnect,
      })
    );

    const { container } = renderWithProviders(<PaymentSettings userId="user-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    const modal = container.querySelector('.confirmation-modal');
    expect(modal).toBeTruthy();
    expect(handleDisconnect).not.toHaveBeenCalled();

    fireEvent.click(within(modal as HTMLElement).getByRole('button', { name: 'Disconnect' }));
    expect(handleDisconnect).toHaveBeenCalledWith('yookassa');
  });

  it('renders connect form with dashboard rows when form is open', () => {
    usePaymentSettingsMock.mockReturnValue(
      baseHookReturn({
        showForm: { yookassa: true, stripe: false },
      })
    );

    const { container } = renderWithProviders(<PaymentSettings userId="user-1" />);

    expect(container.querySelectorAll('.dashboard-row').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByLabelText('Shop ID')).toBeTruthy();
    expect(screen.getByLabelText('Secret Key')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeTruthy();
  });
});
