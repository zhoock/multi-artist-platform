import React, { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Headphones as HeadphonesIcon,
  Play as PlayIcon,
  Users as UsersIcon,
  Heart as HeartIcon,
  CircleHelp as CircleHelpIcon,
  ChevronDown as ChevronDownIcon,
  TriangleAlert as TriangleAlertIcon,
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
import { profileAvatarPathToDisplayUrl } from '@shared/lib/profileAvatar';
import { DashboardButton, DashboardCard } from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

import './AudienceTab.scss';

type AudienceTabContentProps = {
  active: boolean;
  ui: IInterface | null;
};

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; data: ArtistAudienceResponse }
  | { kind: 'error' };

function resolveLocale(ui: IInterface | null): string {
  const sample = ui?.dashboard?.audience?.periods?.days30 ?? '';
  if (/последние/i.test(sample)) return 'ru-RU';
  return 'en-US';
}

function formatMetricValue(value: number, locale: string): string {
  return value.toLocaleString(locale);
}

function resolveSupporterAvatar(url: string | null): string | null {
  const displayUrl = profileAvatarPathToDisplayUrl(url);
  return displayUrl || null;
}

function formatPeriodLabel(period: AudiencePeriod, ui: IInterface | null): string {
  const labels = ui?.dashboard?.audience?.periods;
  if (period === '7d') return labels?.days7 ?? 'Last 7 days';
  if (period === '90d') return labels?.days90 ?? 'Last 90 days';
  return labels?.days30 ?? 'Last 30 days';
}

function formatChartAxisDate(isoDate: string, locale: string): string {
  const parsed = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

function pickChartLabelIndices(count: number, maxLabels: number): number[] {
  if (count <= 0) return [];
  if (count <= maxLabels) return Array.from({ length: count }, (_, i) => i);
  const indices: number[] = [0];
  const step = (count - 1) / (maxLabels - 1);
  for (let i = 1; i < maxLabels - 1; i += 1) {
    indices.push(Math.round(i * step));
  }
  indices.push(count - 1);
  return [...new Set(indices)].sort((a, b) => a - b);
}

function computeNiceMaxY(maxValue: number): number {
  if (maxValue <= 0) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(maxValue));
  const normalized = maxValue / magnitude;
  let nice = magnitude;
  if (normalized <= 1) nice = magnitude;
  else if (normalized <= 2) nice = 2 * magnitude;
  else if (normalized <= 5) nice = 5 * magnitude;
  else nice = 10 * magnitude;
  return Math.max(nice, 4);
}

function createEmptyAudienceResponse(period: AudiencePeriod): ArtistAudienceResponse {
  return {
    period,
    listeners: 0,
    plays: 0,
    regularListeners: 0,
    collectionCount: 0,
    listenersTimeline: [],
    topTracks: [],
    supporters: [],
    supportersTotal: 0,
  };
}

function ListenersTimelineChart({
  points,
  emptyLabel,
  locale,
  showEmptyLabel = true,
}: {
  points: AudienceTimelinePoint[];
  emptyLabel: string;
  locale: string;
  showEmptyLabel?: boolean;
}) {
  const width = 720;
  const height = 220;
  const padding = { top: 16, right: 12, bottom: 36, left: 40 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const hasPoints = points.length > 0;
  const maxRaw = hasPoints ? Math.max(...points.map((p) => p.listeners)) : 0;
  const maxY = computeNiceMaxY(maxRaw);
  const yTicks = 4;
  const yStep = maxY / yTicks;

  const coords = hasPoints
    ? points.map((point, index) => {
        const x =
          points.length === 1
            ? padding.left + innerW / 2
            : padding.left + (index / (points.length - 1)) * innerW;
        const y = padding.top + innerH - (point.listeners / maxY) * innerH;
        return { x, y, point };
      })
    : [];

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const baseline = padding.top + innerH;
  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1]?.x ?? padding.left} ${baseline} L ${coords[0]?.x ?? padding.left} ${baseline} Z`
      : '';

  const labelIndices = hasPoints ? pickChartLabelIndices(points.length, 7) : [];
  const lastCoord = coords[coords.length - 1];
  const gradientId = 'audience-chart-fill';

  return (
    <div className="audience-tab__chart-wrap">
      <svg
        className="audience-tab__chart"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={emptyLabel}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--audience-chart-accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--audience-chart-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const value = yStep * i;
          const y = padding.top + innerH - (value / maxY) * innerH;
          return (
            <g key={`y-${i}`}>
              <line
                className="audience-tab__chart-grid"
                x1={padding.left}
                y1={y}
                x2={padding.left + innerW}
                y2={y}
              />
              <text
                className="audience-tab__chart-axis-y"
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
              >
                {Math.round(value)}
              </text>
            </g>
          );
        })}

        {hasPoints ? (
          <>
            <path className="audience-tab__chart-area" d={areaPath} fill={`url(#${gradientId})`} />
            <path className="audience-tab__chart-line" d={linePath} fill="none" />
            {lastCoord ? (
              <circle
                className="audience-tab__chart-dot"
                cx={lastCoord.x}
                cy={lastCoord.y}
                r={4}
                aria-hidden
              />
            ) : null}
            {labelIndices.map((index) => {
              const c = coords[index];
              if (!c) return null;
              return (
                <text
                  key={c.point.date}
                  className="audience-tab__chart-axis-x"
                  x={c.x}
                  y={height - 8}
                  textAnchor="middle"
                >
                  {formatChartAxisDate(c.point.date, locale)}
                </text>
              );
            })}
          </>
        ) : null}
      </svg>
      {!hasPoints && showEmptyLabel ? (
        <p className="audience-tab__chart-empty">{emptyLabel}</p>
      ) : null}
    </div>
  );
}

type MetricCardProps = {
  icon: React.ReactNode;
  label: string;
  hint: string;
  value: number;
  locale: string;
  valueUnavailable?: boolean;
};

function MetricCard({ icon, label, hint, value, locale, valueUnavailable }: MetricCardProps) {
  const displayValue = valueUnavailable ? '—' : formatMetricValue(value, locale);

  return (
    <DashboardCard className="audience-tab__metric-card">
      <div className="audience-tab__metric-head">
        <span className="audience-tab__metric-icon-wrap" aria-hidden>
          {icon}
        </span>
        <p className="audience-tab__metric-label" title={hint}>
          {label}
        </p>
      </div>
      <p className="audience-tab__metric-value">{displayValue}</p>
    </DashboardCard>
  );
}

export function AudienceTabContent({ active, ui }: AudienceTabContentProps) {
  const copy = ui?.dashboard?.audience;
  const locale = resolveLocale(ui);
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
      setLoadState({ kind: 'success', data });
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

  const metrics = useMemo((): ArtistAudienceResponse => {
    if (loadState.kind === 'success') {
      return loadState.data;
    }
    return createEmptyAudienceResponse(period);
  }, [loadState, period]);

  const isLoading = loadState.kind === 'loading' || loadState.kind === 'idle';
  const hasLoadError = loadState.kind === 'error';
  const metricsUnavailable = hasLoadError;
  const showEmptyStateCopy = loadState.kind === 'success';

  const listNoDataLabel = copy?.blockNoData ?? 'No data yet';
  const loadErrorMessage = copy?.error ?? 'Could not load audience statistics.';
  const retryLabel = copy?.retry ?? 'Retry';
  const canExpandTracks = !metricsUnavailable && !showAllTracks && metrics.topTracks.length >= 5;

  if (!active) {
    return null;
  }

  const rootClassName = clsx(
    'audience-tab',
    isLoading && 'audience-tab--loading',
    hasLoadError && 'audience-tab--load-error'
  );

  return (
    <div className={rootClassName}>
      <div className="audience-tab__toolbar">
        <label className="audience-tab__period-select">
          <span className="audience-tab__period-select-label">{copy?.periodLabel ?? 'Period'}</span>
          <select
            className="audience-tab__period-select-control"
            value={period}
            onChange={(event) => setPeriod(event.target.value as AudiencePeriod)}
            aria-label={copy?.periodLabel ?? 'Period'}
          >
            {AUDIENCE_PERIOD_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {formatPeriodLabel(option, ui)}
              </option>
            ))}
          </select>
          <ChevronDownIcon className="audience-tab__period-select-chevron" aria-hidden />
        </label>
      </div>

      {hasLoadError ? (
        <div className="audience-tab__load-error" role="alert" aria-live="polite">
          <span className="audience-tab__load-error-icon" aria-hidden>
            <TriangleAlertIcon {...dashboardActionIconProps({ size: 18, strokeWidth: 1.75 })} />
          </span>
          <p className="audience-tab__load-error-message">{loadErrorMessage}</p>
          <DashboardButton
            type="button"
            variant="outline"
            className="audience-tab__load-error-retry"
            onClick={() => {
              void loadStats();
            }}
          >
            {retryLabel}
          </DashboardButton>
        </div>
      ) : null}

      <div className="audience-tab__metrics" aria-busy={isLoading}>
        <MetricCard
          icon={<HeadphonesIcon {...dashboardActionIconProps({ size: 16 })} />}
          label={copy?.metrics?.listeners ?? 'Listeners'}
          hint={
            copy?.metricHints?.listeners ??
            'Unique people with at least one qualified listen in the selected period.'
          }
          value={metrics.listeners}
          locale={locale}
          valueUnavailable={metricsUnavailable}
        />
        <MetricCard
          icon={<PlayIcon {...dashboardActionIconProps({ size: 16 })} />}
          label={copy?.metrics?.plays ?? 'Plays'}
          hint={
            copy?.metricHints?.plays ??
            'Qualified plays in the period — each playback session counts once per track.'
          }
          value={metrics.plays}
          locale={locale}
          valueUnavailable={metricsUnavailable}
        />
        <MetricCard
          icon={<UsersIcon {...dashboardActionIconProps({ size: 16 })} />}
          label={copy?.metrics?.regularListeners ?? 'Regular listeners'}
          hint={
            copy?.metricHints?.regularListeners ??
            'Listeners who played your music on at least 3 different days in the last 30 days.'
          }
          value={metrics.regularListeners}
          locale={locale}
          valueUnavailable={metricsUnavailable}
        />
        <MetricCard
          icon={<HeartIcon {...dashboardActionIconProps({ size: 16 })} />}
          label={copy?.metrics?.inCollections ?? 'In collections'}
          hint={
            copy?.metricHints?.inCollections ??
            'Users who currently have you in their active collection.'
          }
          value={metrics.collectionCount}
          locale={locale}
          valueUnavailable={metricsUnavailable}
        />
      </div>

      <DashboardCard className="audience-tab__chart-panel">
        <div className="audience-tab__panel-header">
          <h3 className="audience-tab__panel-title">
            {copy?.chartTitle ?? 'Unique listeners by day'}
          </h3>
        </div>
        <div className="audience-tab__chart-body">
          <ListenersTimelineChart
            points={metrics.listenersTimeline}
            emptyLabel={listNoDataLabel}
            locale={locale}
            showEmptyLabel={showEmptyStateCopy}
          />
        </div>
      </DashboardCard>

      <div className="audience-tab__columns">
        <DashboardCard className="audience-tab__list-card audience-tab__list-card--tracks">
          <div className="audience-tab__panel-header">
            <h3 className="audience-tab__panel-title">
              {copy?.topTracksTitle ?? 'Popular tracks'}
            </h3>
          </div>
          <div className="audience-tab__list-body">
            {metrics.topTracks.length === 0 ? (
              showEmptyStateCopy ? (
                <p className="audience-tab__list-empty">{listNoDataLabel}</p>
              ) : null
            ) : (
              <ol className="audience-tab__rank-list">
                {metrics.topTracks.map((track) => (
                  <li key={track.trackId} className="audience-tab__rank-row">
                    <span className="audience-tab__rank-num">
                      {String(track.rank).padStart(2, '0')}
                    </span>
                    <span className="audience-tab__rank-title">{track.title}</span>
                    <span className="audience-tab__rank-plays">
                      <PlayIcon
                        className="audience-tab__rank-play-icon"
                        {...dashboardActionIconProps({ size: 14 })}
                        aria-hidden
                      />
                      {formatMetricValue(track.plays, locale)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {canExpandTracks ? (
              <div className="audience-tab__section-footer">
                <button
                  type="button"
                  className="audience-tab__link-button"
                  onClick={() => setShowAllTracks(true)}
                >
                  {copy?.showAllTracks ?? 'Show all tracks'} →
                </button>
              </div>
            ) : null}
          </div>
        </DashboardCard>

        <DashboardCard className="audience-tab__list-card audience-tab__list-card--supporters">
          <div className="audience-tab__panel-header">
            <h3 className="audience-tab__panel-title">
              <span>{copy?.supportersTitle ?? 'Supporters'}</span>
              <span
                className="audience-tab__panel-title-hint"
                title={
                  copy?.supportersSectionHint ??
                  'Listeners with an active premium subscription who added you to their collection.'
                }
                aria-label={
                  copy?.supportersSectionHint ??
                  'Listeners with an active premium subscription who added you to their collection.'
                }
              >
                <CircleHelpIcon {...dashboardActionIconProps({ size: 14 })} />
              </span>
            </h3>
          </div>
          <div className="audience-tab__list-body">
            {metrics.supporters.length === 0 ? (
              showEmptyStateCopy ? (
                <p className="audience-tab__list-empty">{listNoDataLabel}</p>
              ) : null
            ) : (
              <ul className="audience-tab__supporters">
                {metrics.supporters.map((supporter) => {
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
                      <div className="audience-tab__supporter-meta">
                        <span className="audience-tab__supporter-name">
                          {supporter.displayName}
                        </span>
                        <span className="audience-tab__supporter-detail">
                          {copy?.supporterDetail ?? 'In collection · Active support'}
                        </span>
                      </div>
                      <span className="audience-tab__supporter-badge">
                        {copy?.supporterBadgeActive ?? 'Active'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {!showAllSupporters && metrics.supportersTotal > 5 ? (
              <div className="audience-tab__section-footer">
                <button
                  type="button"
                  className="audience-tab__link-button"
                  onClick={() => setShowAllSupporters(true)}
                >
                  {copy?.showAllSupporters ?? 'Show all supporters'} →
                </button>
              </div>
            ) : null}
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}
