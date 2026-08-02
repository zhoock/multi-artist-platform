import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { render } from '@testing-library/react';

const mockUseConsent = jest.fn<() => { status: string; accept: () => void; decline: () => void }>();
const mockInitAnalytics = jest.fn<() => Promise<void>>();

jest.mock('@shared/lib/consent', () => ({
  useConsent: () => mockUseConsent(),
}));

jest.mock('../initAnalytics', () => ({
  initAnalytics: () => mockInitAnalytics(),
}));

import { AnalyticsController } from '../AnalyticsController';

describe('AnalyticsController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitAnalytics.mockResolvedValue(undefined);
  });

  test('does not initialize analytics when consent is unknown', () => {
    mockUseConsent.mockReturnValue({ status: 'unknown', accept: jest.fn(), decline: jest.fn() });

    render(<AnalyticsController />);

    expect(mockInitAnalytics).not.toHaveBeenCalled();
  });

  test('does not initialize analytics when consent is declined', () => {
    mockUseConsent.mockReturnValue({ status: 'declined', accept: jest.fn(), decline: jest.fn() });

    render(<AnalyticsController />);

    expect(mockInitAnalytics).not.toHaveBeenCalled();
  });

  test('initializes analytics when consent is accepted', () => {
    mockUseConsent.mockReturnValue({ status: 'accepted', accept: jest.fn(), decline: jest.fn() });

    render(<AnalyticsController />);

    expect(mockInitAnalytics).toHaveBeenCalledTimes(1);
  });

  test('initializes analytics when consent changes to accepted without reload', () => {
    mockUseConsent.mockReturnValue({ status: 'unknown', accept: jest.fn(), decline: jest.fn() });

    const { rerender } = render(<AnalyticsController />);
    expect(mockInitAnalytics).not.toHaveBeenCalled();

    mockUseConsent.mockReturnValue({ status: 'accepted', accept: jest.fn(), decline: jest.fn() });
    rerender(<AnalyticsController />);

    expect(mockInitAnalytics).toHaveBeenCalledTimes(1);
  });

  test('does not re-initialize when accepted status re-renders', () => {
    mockUseConsent.mockReturnValue({ status: 'accepted', accept: jest.fn(), decline: jest.fn() });

    const { rerender } = render(<AnalyticsController />);
    rerender(<AnalyticsController />);

    expect(mockInitAnalytics).toHaveBeenCalledTimes(1);
  });
});
