import { useCallback, useEffect, useId, useRef, useState } from 'react';

import type { SupportedLang } from '@shared/model/lang';
import {
  fetchAllAudienceCities,
  type AudienceListenCity,
  type AudiencePeriod,
} from '@shared/api/audience';
import { DashboardLoadingState } from '@shared/ui/dashboard';

import { AudienceAnalyticsListModalShell } from './AudienceAnalyticsListModalShell';
import { formatAudienceCountryName, formatAudienceMetricValue } from './audienceFormatters';
import { useAudienceCityRuIndex } from './useAudienceCityRuIndex';

import './AudienceAnalyticsListModal.scss';

type AudienceCitiesModalProps = {
  isOpen: boolean;
  period: AudiencePeriod;
  liveRevision?: number;
  lang: SupportedLang;
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
  liveRevision = 0,
  lang,
  title,
  closeLabel,
  cityColumnLabel,
  countryColumnLabel,
  playsColumnLabel,
  errorLabel,
  onClose,
}: AudienceCitiesModalProps) {
  const titleId = useId();
  const liveRevisionRef = useRef(liveRevision);
  const formatCity = useAudienceCityRuIndex(isOpen && lang === 'ru', lang);
  const [cities, setCities] = useState<AudienceListenCity[]>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const loadCities = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent === true;
      if (!silent) {
        setLoadState('loading');
      }
      try {
        const loaded = await fetchAllAudienceCities(period);
        setCities(loaded);
        setLoadState('success');
      } catch {
        if (!silent) {
          setLoadState('error');
          setCities([]);
        }
      }
    },
    [period]
  );

  useEffect(() => {
    if (!isOpen) {
      liveRevisionRef.current = liveRevision;
      setLoadState('idle');
      setCities([]);
      return;
    }
    void loadCities();
  }, [isOpen, loadCities]);

  useEffect(() => {
    if (!isOpen || liveRevision <= 0 || liveRevision === liveRevisionRef.current) {
      return;
    }
    liveRevisionRef.current = liveRevision;
    void loadCities({ silent: true });
  }, [isOpen, liveRevision, loadCities]);

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
                  {formatCity(row.city, row.countryCode)}
                </td>
                <td className="audience-analytics-fullscreen__td audience-analytics-fullscreen__td--country">
                  {formatAudienceCountryName(row.countryCode, lang)}
                </td>
                <td className="audience-analytics-fullscreen__td audience-analytics-fullscreen__td--plays">
                  {formatAudienceMetricValue(row.plays, lang)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AudienceAnalyticsListModalShell>
  );
}
