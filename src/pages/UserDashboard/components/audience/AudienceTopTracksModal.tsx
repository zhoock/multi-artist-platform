import { useCallback, useEffect, useId, useRef, useState } from 'react';

import {
  fetchAllAudienceTopTracks,
  type AudiencePeriod,
  type AudienceTopTrack,
} from '@shared/api/audience';
import { AlbumCoverImage } from '@entities/album/ui/AlbumCoverImage';
import { DashboardLoadingState } from '@shared/ui/dashboard';

import { AudienceAnalyticsListModalShell } from './AudienceAnalyticsListModalShell';

import './AudienceAnalyticsListModal.scss';

type AudienceTopTracksModalProps = {
  isOpen: boolean;
  period: AudiencePeriod;
  liveRevision?: number;
  locale: string;
  title: string;
  closeLabel: string;
  trackColumnLabel: string;
  playsColumnLabel: string;
  errorLabel: string;
  onClose: () => void;
};

function formatMetricValue(value: number, locale: string): string {
  return value.toLocaleString(locale);
}

export function AudienceTopTracksModal({
  isOpen,
  period,
  liveRevision = 0,
  locale,
  title,
  closeLabel,
  trackColumnLabel,
  playsColumnLabel,
  errorLabel,
  onClose,
}: AudienceTopTracksModalProps) {
  const titleId = useId();
  const liveRevisionRef = useRef(liveRevision);
  const [tracks, setTracks] = useState<AudienceTopTrack[]>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const loadTracks = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent === true;
      if (!silent) {
        setLoadState('loading');
      }
      try {
        const loaded = await fetchAllAudienceTopTracks(period);
        setTracks(loaded);
        setLoadState('success');
      } catch {
        if (!silent) {
          setLoadState('error');
          setTracks([]);
        }
      }
    },
    [period]
  );

  useEffect(() => {
    if (!isOpen) {
      liveRevisionRef.current = liveRevision;
      setLoadState('idle');
      setTracks([]);
      return;
    }
    void loadTracks();
  }, [isOpen, loadTracks]);

  useEffect(() => {
    if (!isOpen || liveRevision <= 0 || liveRevision === liveRevisionRef.current) {
      return;
    }
    liveRevisionRef.current = liveRevision;
    void loadTracks({ silent: true });
  }, [isOpen, liveRevision, loadTracks]);

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
                className="audience-analytics-fullscreen__th audience-analytics-fullscreen__th--cover"
                scope="col"
              >
                <span className="visually-hidden">Cover</span>
              </th>
              <th
                className="audience-analytics-fullscreen__th audience-analytics-fullscreen__th--track"
                scope="col"
              >
                {trackColumnLabel}
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
            {tracks.map((track) => (
              <tr key={track.trackId} className="audience-analytics-fullscreen__row">
                <td className="audience-analytics-fullscreen__td audience-analytics-fullscreen__td--rank">
                  {track.rank}
                </td>
                <td className="audience-analytics-fullscreen__td audience-analytics-fullscreen__td--cover">
                  <div className="audience-analytics-fullscreen__cover-frame">
                    <AlbumCoverImage
                      cover={track.albumCover ?? ''}
                      userId={track.albumUserId ?? undefined}
                      alt=""
                      className="audience-analytics-fullscreen__cover-image"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                </td>
                <td className="audience-analytics-fullscreen__td audience-analytics-fullscreen__td--title">
                  {track.title}
                </td>
                <td className="audience-analytics-fullscreen__td audience-analytics-fullscreen__td--plays">
                  {formatMetricValue(track.plays, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AudienceAnalyticsListModalShell>
  );
}
