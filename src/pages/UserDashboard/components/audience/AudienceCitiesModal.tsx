import { useCallback, useEffect, useId, useState } from 'react';

import {
  fetchAllAudienceCities,
  type AudienceListenCity,
  type AudiencePeriod,
} from '@shared/api/audience';
import { DashboardLoadingState } from '@shared/ui/dashboard';

import { AudienceAnalyticsListModalShell } from './AudienceAnalyticsListModalShell';
import { formatAudienceCountryName, formatAudienceMetricValue } from './audienceFormatters';

import './AudienceAnalyticsListModal.scss';

type AudienceCitiesModalProps = {
  isOpen: boolean;
  period: AudiencePeriod;
  locale: string;
  title: string;
  closeLabel: string;
  cityColumnLabel: string;
  countryColumnLabel: string;
  playsColumnLabel: string;
  errorLabel: string;
  onClose: () => void;
};

export function AudienceCitiesModal({
  isOpen,
  period,
  locale,
  title,
  closeLabel,
  cityColumnLabel,
  countryColumnLabel,
  playsColumnLabel,
  errorLabel,
  onClose,
}: AudienceCitiesModalProps) {
  const titleId = useId();
  const [cities, setCities] = useState<AudienceListenCity[]>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const loadCities = useCallback(async () => {
    setLoadState('loading');
    try {
      const loaded = await fetchAllAudienceCities(period);
      setCities(loaded);
      setLoadState('success');
    } catch {
      setLoadState('error');
      setCities([]);
    }
  }, [period]);

  useEffect(() => {
    if (!isOpen) {
      setLoadState('idle');
      setCities([]);
      return;
    }
    void loadCities();
  }, [isOpen, loadCities]);

  return (
    <AudienceAnalyticsListModalShell
      isOpen={isOpen}
      titleId={titleId}
      title={title}
      closeLabel={closeLabel}
      onClose={onClose}
    >
      {loadState === 'loading' ? (
        <DashboardLoadingState className="audience-analytics-fullscreen__loading" />
      ) : loadState === 'error' ? (
        <p className="audience-analytics-fullscreen__error">{errorLabel}</p>
      ) : (
        <table className="audience-analytics-fullscreen__table">
          <thead className="audience-analytics-fullscreen__thead">
            <tr>
              <th
                className="audience-analytics-fullscreen__th audience-analytics-fullscreen__th--rank"
                scope="col"
              >
                <span className="visually-hidden">#</span>
              </th>
              <th
                className="audience-analytics-fullscreen__th audience-analytics-fullscreen__th--city"
                scope="col"
              >
                {cityColumnLabel}
              </th>
              <th
                className="audience-analytics-fullscreen__th audience-analytics-fullscreen__th--country"
                scope="col"
              >
                {countryColumnLabel}
              </th>
              <th
                className="audience-analytics-fullscreen__th audience-analytics-fullscreen__th--plays"
                scope="col"
              >
                {playsColumnLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {cities.map((row) => (
              <tr
                key={`${row.countryCode}:${row.city}:${row.rank}`}
                className="audience-analytics-fullscreen__row"
              >
                <td className="audience-analytics-fullscreen__td audience-analytics-fullscreen__td--rank">
                  {row.rank}
                </td>
                <td
                  className="audience-analytics-fullscreen__td audience-analytics-fullscreen__td--title audience-analytics-fullscreen__td--city"
                  title={row.city}
                >
                  {row.city}
                </td>
                <td className="audience-analytics-fullscreen__td audience-analytics-fullscreen__td--country">
                  {formatAudienceCountryName(row.countryCode, locale)}
                </td>
                <td className="audience-analytics-fullscreen__td audience-analytics-fullscreen__td--plays">
                  {formatAudienceMetricValue(row.plays, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AudienceAnalyticsListModalShell>
  );
}
