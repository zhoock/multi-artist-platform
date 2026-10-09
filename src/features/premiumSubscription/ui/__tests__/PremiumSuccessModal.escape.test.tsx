/** @jest-environment jsdom */

import { describe, expect, jest, test, beforeEach } from '@jest/globals';
import { useRef } from 'react';
import { render, waitFor } from '@testing-library/react';

import { PremiumSuccessModalView } from '../PremiumSuccessModal';
import * as premiumSuccessStorage from '../../lib/premiumSuccessModalStorage';

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'en' }),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
}));

jest.mock('@shared/lib/hooks/useAppSelector', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ uiDictionary: { entries: [{}] } }),
}));

jest.mock('@shared/model/uiDictionary', () => ({
  selectUiDictionaryFirst: (state: { uiDictionary: { entries: Array<object> } }) =>
    state.uiDictionary.entries[0],
}));

jest.mock('@features/premiumSubscription/lib/PremiumSubscriptionContext', () => ({
  usePremiumSubscription: () => ({
    isPremium: true,
    slotsLimit: 20,
    slotsUsed: 0,
    planSlug: 'explorer',
    billing: {},
    loading: false,
    refetch: async () => {},
    applyArchiveSnapshot: () => {},
  }),
}));

jest.mock('@shared/lib/auth', () => ({
  getToken: () => 'token',
}));

jest.mock('@shared/api/archive', () => ({
  addArtistToArchiveApi: jest.fn(),
  getMyArchive: jest.fn(),
}));

jest.mock('../../lib/resolveCheckoutArtist', () => ({
  resolveCheckoutArtistCard: () => Promise.resolve(null),
}));

function dispatchDialogCancel(dialog: HTMLDialogElement) {
  dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
}

describe('PremiumSuccessModalView Escape', () => {
  beforeEach(() => {
    jest.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function showModal(
      this: HTMLDialogElement
    ) {
      this.open = true;
    });
    jest.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function close(
      this: HTMLDialogElement
    ) {
      this.open = false;
    });
    jest.spyOn(premiumSuccessStorage, 'markPremiumSuccessModalShown').mockImplementation(() => {});
  });

  test('cancel runs dismiss flow (onClose + mark shown)', async () => {
    const onClose = jest.fn();

    function Fixture() {
      const dialogRef = useRef<HTMLDialogElement>(null);
      return <PremiumSuccessModalView dialogRef={dialogRef} open onClose={onClose} />;
    }

    render(<Fixture />);

    await waitFor(() => {
      expect(document.querySelector('dialog')?.open).toBe(true);
    });

    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    dispatchDialogCancel(dialog);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(premiumSuccessStorage.markPremiumSuccessModalShown).toHaveBeenCalledTimes(1);
  });
});
