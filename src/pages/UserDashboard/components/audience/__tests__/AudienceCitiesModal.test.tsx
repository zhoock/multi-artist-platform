import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import React from 'react';

import { renderWithProviders } from '@shared/lib/test-utils';

const fetchAllAudienceCitiesMock =
  jest.fn<
    (
      period: string
    ) => Promise<Array<{ rank: number; city: string; countryCode: string; plays: number }>>
  >();

jest.mock('@shared/api/audience', () => ({
  fetchAllAudienceCities: (period: string) => fetchAllAudienceCitiesMock(period),
}));

jest.mock('../geoAudienceCityRuIndex.json', () => ({
  __esModule: true,
  default: { 'VN|da nang': 'Дананг' },
}));

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'en' }),
}));

import { AudienceCitiesModal } from '../AudienceCitiesModal';

describe('AudienceCitiesModal', () => {
  beforeEach(() => {
    fetchAllAudienceCitiesMock.mockReset();
  });

  it('loads full city list for the selected period when opened', async () => {
    fetchAllAudienceCitiesMock.mockResolvedValue([
      { rank: 1, city: 'Berlin', countryCode: 'DE', plays: 5 },
    ]);

    renderWithProviders(
      <AudienceCitiesModal
        isOpen
        period="90d"
        lang="en"
        title="Cities"
        closeLabel="Close"
        cityColumnLabel="City"
        countryColumnLabel="Country"
        playsColumnLabel="Plays"
        errorLabel="Failed"
        onClose={() => {}}
      />
    );

    await waitFor(() => {
      expect(fetchAllAudienceCitiesMock).toHaveBeenCalledWith('90d');
    });

    expect(screen.getByText('Berlin')).toBeInTheDocument();
  });

  it('shows API error message in fullscreen shell', async () => {
    fetchAllAudienceCitiesMock.mockRejectedValue(new Error('fail'));

    renderWithProviders(
      <AudienceCitiesModal
        isOpen
        period="30d"
        lang="en"
        title="Cities"
        closeLabel="Close"
        cityColumnLabel="City"
        countryColumnLabel="Country"
        playsColumnLabel="Plays"
        errorLabel="Could not load cities"
        onClose={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Could not load cities')).toBeInTheDocument();
    });
  });

  it('renders fullscreen cities table when data is loaded', async () => {
    fetchAllAudienceCitiesMock.mockResolvedValue([
      { rank: 1, city: 'Berlin', countryCode: 'DE', plays: 5 },
    ]);

    renderWithProviders(
      <AudienceCitiesModal
        isOpen
        period="30d"
        lang="en"
        title="Cities"
        closeLabel="Close"
        cityColumnLabel="City"
        countryColumnLabel="Country"
        playsColumnLabel="Plays"
        errorLabel="Failed"
        onClose={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Cities' })).toBeInTheDocument();
    });

    expect(screen.getByText('Berlin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('localizes city and country for Russian UI', async () => {
    fetchAllAudienceCitiesMock.mockResolvedValue([
      { rank: 1, city: 'Da Nang', countryCode: 'VN', plays: 2 },
    ]);

    renderWithProviders(
      <AudienceCitiesModal
        isOpen
        period="30d"
        lang="ru"
        title="Города"
        closeLabel="Закрыть"
        cityColumnLabel="Город"
        countryColumnLabel="Страна"
        playsColumnLabel="Прослушивания"
        errorLabel="Ошибка"
        onClose={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Дананг')).toBeInTheDocument();
    });
    expect(screen.getByText('Вьетнам')).toBeInTheDocument();
  });
});
