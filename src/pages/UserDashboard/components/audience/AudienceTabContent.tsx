import React, { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Headphones as HeadphonesIcon,
  Play as PlayIcon,
  Repeat as RepeatIcon,
  HeartHandshake as HeartHandshakeIcon,
  CircleHelp as CircleHelpIcon,
} from 'lucide-react';

import type { IInterface } from '@models';
import {
  AUDIENCE_PERIOD_OPTIONS,
  DEFAULT_AUDIENCE_PERIOD,
  type AudiencePeriod,
} from '@shared/api/audience/types';
import {
  fetchArtistAudience,
  type ArtistAudienceResponse,
  type AudienceTimelinePoint,
} from '@shared/api/audience';
import {
  DashboardButton,
  DashboardCard,
  DashboardEmptyState,
  DashboardLoadingState,
  DashboardSection,
} from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

import './AudienceTab.scss';

type AudienceTabContentProps = {
  active: boolean;
  ui: IInterface | null;
};

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; data: ArtistAudienceResponse };

function resolveSupporterAvatar(url: string | null): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('http') || trimmed.startsWith('/api/proxy-image')) {
    return trimmed;
  }
  return `/api/proxy-image?path=${encodeURIComponent(trimmed)}`;
}

function formatPeriodLabel(period: AudiencePeriod, ui: IInterface | null): string {
  const labels = ui?.dashboard?.audience?.periods;
  if (period === '7d') return labels?.days7 ?? 'Last 7 days';
  if (period === '90d') return labels?.days90 ?? 'Last 90 days';
  return labels?.days30 ?? 'Last 30 days';
}

function ListenersTimelineChart({
  points,
  emptyLabel,
}: {
  points: AudienceTimelinePoint[];
  emptyLabel: string;
}) {
  if (points.length === 0) {
    return <p className="audience-tab__chart-empty">{emptyLabel}</p>;
  }

  const width = 640;
  const height = 160;
  const padding = { top: 12, right: 8, bottom: 28, left: 8 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const maxY = Math.max(1, ...points.map((p) => p.listeners));

  const coords = points.map((point, index) => {
    const x =
      points.length === 1
        ? padding.left + innerW / 2
        : padding.left + (index / (points.length - 1)) * innerW;
    const y = padding.top + innerH - (point.listeners / maxY) * innerH;
    return { x, y, point };
  });

  const polyline = coords.map((c) => `${c.x},${c.y}`).join(' ');

  return (
    <svg
      className="audience-tab__chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={emptyLabel}
    >
      <polyline className="audience-tab__chart-line" fill="none" points={polyline} />
      {coords.map(({ x, y, point }) => (
        <circle
          key={point.date}
          className="audience-tab__chart-dot"
          cx={x}
          cy={y}
          r={3}
          aria-hidden
        />
      ))}
    </svg>
  );
}

function MetricHint({ text }: { text: string }) {
  return (
    <span className="audience-tab__metric-hint" title={text} aria-label={text}>
      <CircleHelpIcon {...dashboardActionIconProps({ size: 14 })} />
    </span>
  );
}

export function AudienceTabContent({ active, ui }: AudienceTabContentProps) {
  const copy = ui?.dashboard?.audience;
  const [period, setPeriod] = useState<AudiencePeriod>(DEFAULT_AUDIENCE_PERIOD);
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'idle' });
  const [showAllTracks, setShowAllTracks] = useState(false);
  const [showAllSupporters, setShowAllSupporters] = useState(false);

  const tracksLimit = showAllTracks ? 100 : 5;
  const supportersLimit = showAllSupporters ? 100 : 5;

  const loadStats = useCallback(async () => {
    setLoadState({ kind: 'loading' });
    try {
      const data = await fetchArtistAudience({ period, tracksLimit, supportersLimit });
      setLoadState({ kind: 'ready', data });
    } catch {
      setLoadState({ kind: 'error' });
    }
  }, [period, tracksLimit, supportersLimit]);

  useEffect(() => {
    if (!active) return;
    void loadStats();
  }, [active, loadStats]);

  useEffect(() => {
    if (!active) {
      setShowAllTracks(false);
      setShowAllSupporters(false);
    }
  }, [active, period]);

  const metrics = useMemo(() => {
    if (loadState.kind !== 'ready') return null;
    return loadState.data;
  }, [loadState]);

  const hasAnyPlays = metrics ? metrics.plays > 0 : false;

  if (!active) {
    return null;
  }

  return (
    <div className="audience-tab">
      <div className="audience-tab__toolbar">
        <div
          className="audience-tab__period-switch"
          role="group"
          aria-label={copy?.periodLabel ?? 'Period'}
        >
          {AUDIENCE_PERIOD_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={clsx(
                'audience-tab__period-button',
                period === option && 'audience-tab__period-button--active'
              )}
              onClick={() => setPeriod(option)}
            >
              {formatPeriodLabel(option, ui)}
            </button>
          ))}
        </div>
      </div>

      {loadState.kind === 'loading' || loadState.kind === 'idle' ? (
        <DashboardLoadingState className="user-dashboard__tab-loading" />
      ) : null}

      {loadState.kind === 'error' ? (
        <div className="user-dashboard__error user-dashboard__error--tab-shell" role="alert">
          {copy?.error ?? 'Could not load audience statistics.'}
          <DashboardButton type="button" variant="outline" onClick={() => void loadStats()}>
            {copy?.retry ?? 'Try again'}
          </DashboardButton>
        </div>
      ) : null}

      {loadState.kind === 'ready' ? (
        <>
          {!hasAnyPlays ? (
            <DashboardEmptyState
              variant="tab"
              className="dashboard-empty-state--tab audience-tab__empty"
              title={copy?.emptyTitle ?? 'No listens yet'}
              description={
                copy?.emptyDescription ??
                'Statistics will appear after listeners play your tracks for at least 30 seconds.'
              }
            />
          ) : null}

          <div className="audience-tab__metrics">
            <DashboardCard className="audience-tab__metric-card">
              <div className="audience-tab__metric-head">
                <span className="audience-tab__metric-label">
                  {copy?.metrics?.listeners ?? 'Listeners'}
                  <MetricHint
                    text={
                      copy?.metricHints?.listeners ??
                      'Unique people with at least one qualified listen in the selected period.'
                    }
                  />
                </span>
                <HeadphonesIcon {...dashboardActionIconProps({ size: 18 })} />
              </div>
              <p className="audience-tab__metric-value">{metrics?.listeners ?? 0}</p>
            </DashboardCard>

            <DashboardCard className="audience-tab__metric-card">
              <div className="audience-tab__metric-head">
                <span className="audience-tab__metric-label">
                  {copy?.metrics?.plays ?? 'Plays'}
                  <MetricHint
                    text={
                      copy?.metricHints?.plays ??
                      'Qualified plays in the period — each playback session counts once per track.'
                    }
                  />
                </span>
                <PlayIcon {...dashboardActionIconProps({ size: 18 })} />
              </div>
              <p className="audience-tab__metric-value">{metrics?.plays ?? 0}</p>
            </DashboardCard>

            <DashboardCard className="audience-tab__metric-card">
              <div className="audience-tab__metric-head">
                <span className="audience-tab__metric-label">
                  {copy?.metrics?.regularListeners ?? 'Regular listeners'}
                  <MetricHint
                    text={
                      copy?.metricHints?.regularListeners ??
                      'Listeners who played your music on at least 3 different days in the last 30 days.'
                    }
                  />
                </span>
                <RepeatIcon {...dashboardActionIconProps({ size: 18 })} />
              </div>
              <p className="audience-tab__metric-value">{metrics?.regularListeners ?? 0}</p>
            </DashboardCard>

            <DashboardCard className="audience-tab__metric-card">
              <div className="audience-tab__metric-head">
                <span className="audience-tab__metric-label">
                  {copy?.metrics?.inCollections ?? 'In collections'}
                  <MetricHint
                    text={
                      copy?.metricHints?.inCollections ??
                      'Users who currently have you in their active collection.'
                    }
                  />
                </span>
                <HeartHandshakeIcon {...dashboardActionIconProps({ size: 18 })} />
              </div>
              <p className="audience-tab__metric-value">{metrics?.collectionCount ?? 0}</p>
            </DashboardCard>
          </div>

          {hasAnyPlays ? (
            <>
              <DashboardSection
                title={copy?.chartTitle ?? 'Unique listeners by day'}
                className="audience-tab__section"
              >
                <DashboardCard className="audience-tab__chart-card">
                  <ListenersTimelineChart
                    points={metrics?.listenersTimeline ?? []}
                    emptyLabel={copy?.chartEmpty ?? 'No daily data for this period'}
                  />
                </DashboardCard>
              </DashboardSection>

              <DashboardSection
                title={copy?.topTracksTitle ?? 'Popular tracks'}
                className="audience-tab__section"
              >
                <DashboardCard>
                  {(metrics?.topTracks ?? []).length === 0 ? (
                    <p className="audience-tab__list-empty">
                      {copy?.topTracksEmpty ?? 'No track plays yet'}
                    </p>
                  ) : (
                    <ol className="audience-tab__rank-list">
                      {(metrics?.topTracks ?? []).map((track) => (
                        <li key={track.trackId} className="audience-tab__rank-row">
                          <span className="audience-tab__rank-num">{track.rank}</span>
                          <span className="audience-tab__rank-title">{track.title}</span>
                          <span className="audience-tab__rank-value">{track.plays}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {(metrics?.topTracks ?? []).length > 0 && !showAllTracks ? (
                    <div className="audience-tab__section-footer">
                      <button
                        type="button"
                        className="audience-tab__link-button"
                        onClick={() => setShowAllTracks(true)}
                      >
                        {copy?.showAllTracks ?? 'Show all tracks'}
                      </button>
                    </div>
                  ) : null}
                </DashboardCard>
              </DashboardSection>
            </>
          ) : null}

          <DashboardSection
            title={copy?.supportersTitle ?? 'Supporters'}
            className="audience-tab__section"
          >
            <DashboardCard>
              {(metrics?.supporters ?? []).length === 0 ? (
                <p className="audience-tab__list-empty">
                  {copy?.supportersEmpty ?? 'No active supporters yet'}
                </p>
              ) : (
                <ul className="audience-tab__supporters">
                  {(metrics?.supporters ?? []).map((supporter) => {
                    const avatar = resolveSupporterAvatar(supporter.avatarUrl);
                    return (
                      <li key={supporter.userId} className="audience-tab__supporter-row">
                        <span className="audience-tab__supporter-avatar" aria-hidden>
                          {avatar ? (
                            <img src={avatar} alt="" loading="lazy" decoding="async" />
                          ) : (
                            <span className="audience-tab__supporter-initial">
                              {supporter.displayName.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                        </span>
                        <span className="audience-tab__supporter-name">
                          {supporter.displayName}
                        </span>
                        <span className="audience-tab__supporter-status">
                          {copy?.supporterStatusPremium ?? 'Premium supporter'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {!showAllSupporters && (metrics?.supportersTotal ?? 0) > 5 ? (
                <div className="audience-tab__section-footer">
                  <button
                    type="button"
                    className="audience-tab__link-button"
                    onClick={() => setShowAllSupporters(true)}
                  >
                    {copy?.showAllSupporters ?? 'Show all supporters'}
                  </button>
                </div>
              ) : null}
            </DashboardCard>
          </DashboardSection>
        </>
      ) : null}
    </div>
  );
}
