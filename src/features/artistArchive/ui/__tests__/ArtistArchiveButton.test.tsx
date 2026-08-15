/** @jest-environment jsdom */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';

import { ArtistArchiveButton } from '../ArtistArchiveButton';

const mockOpenDashboard = jest.fn();
const mockAddToArchive = jest.fn<() => Promise<void>>();
const mockOpenPremiumModal = jest.fn();

let mockButtonState = 'can_add';

jest.mock('@shared/lib/archiveAccessModal', () => ({
  useArchiveAccessModal: () => ({
    open: mockOpenPremiumModal,
  }),
}));

jest.mock('@shared/ui/artistPageBuilder/useArtistPageBuilderNav', () => ({
  useArtistPageBuilderNav: () => ({
    openDashboard: mockOpenDashboard,
  }),
}));

jest.mock('../../lib/useArtistArchiveStatus', () => ({
  useArtistArchiveStatus: () => ({
    buttonState: mockButtonState,
    error: null,
    addToArchive: mockAddToArchive,
    activateInArchive: jest.fn(),
    clearError: jest.fn(),
  }),
}));

jest.mock('../../lib/refreshPremiumContent', () => ({
  dispatchArchiveArtistAdded: jest.fn(),
  refreshPremiumContentForArchiveChange: jest.fn(),
}));

jest.mock('../CollectionFullModal', () => ({
  CollectionFullModal: () => null,
}));

const ARTIST_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('ArtistArchiveButton', () => {
  beforeEach(() => {
    mockOpenDashboard.mockReset();
    mockAddToArchive.mockReset();
    mockOpenPremiumModal.mockReset();
    mockButtonState = 'can_add';
    mockAddToArchive.mockResolvedValue(undefined);
  });

  test('in collection + click opens Dashboard on collection tab', () => {
    mockButtonState = 'in_collection_active';

    renderWithProviders(<ArtistArchiveButton artistUserId={ARTIST_ID} monetizationEnabled />, {
      preloadedState: { lang: { current: 'ru' } },
    });

    const button = screen.getByRole('button', { name: /В коллекции/i });
    expect(button).not.toBeDisabled();

    fireEvent.click(button);

    expect(mockOpenDashboard).toHaveBeenCalledWith('collection');
    expect(mockAddToArchive).not.toHaveBeenCalled();
  });

  test('can_add still adds artist to collection', async () => {
    mockButtonState = 'can_add';

    renderWithProviders(<ArtistArchiveButton artistUserId={ARTIST_ID} monetizationEnabled />, {
      preloadedState: { lang: { current: 'ru' } },
    });

    fireEvent.click(screen.getByRole('button', { name: /Добавить в коллекцию/i }));

    await waitFor(() => {
      expect(mockAddToArchive).toHaveBeenCalledTimes(1);
    });
    expect(mockOpenDashboard).not.toHaveBeenCalled();
  });
});
