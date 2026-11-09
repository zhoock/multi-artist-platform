import React, { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Headphones as HeadphonesIcon,
  Play as PlayIcon,
  Users as UsersIcon,
  Heart as HeartIcon,
  TriangleAlert as TriangleAlertIcon,
  ShoppingBag as ShoppingBagIcon,
  HeartHandshake as HeartHandshakeIcon,
} from 'lucide-react';

import type { IInterface } from '@models';
import { useLang } from '@app/providers/lang';
import {
  AUDIENCE_PERIOD_OPTIONS,
  DEFAULT_AUDIENCE_PERIOD,
  type AudiencePeriod,
} from '@shared/api/audience/types';
import {
  fetchArtistAudience,
  type ArtistAudienceResponse,
  type AudienceRevenue,
  type AudienceTimelinePoint,
} from '@shared/api/audience';
import type { SupportedLang } from '@shared/model/lang';
import {
  formatAudienceCountryName,
  formatAudienceMetricValue,
  toAudienceIntlLocale,
} from './audienceFormatters';
import { useAudienceCityRuIndex } from './useAudienceCityRuIndex';
import { buildArtistPagePath } from '@shared/lib/seo/publicPagePaths';
import { AlbumCoverImage } from '@entities/album/ui/AlbumCoverImage';
import { DashboardButton, DashboardCard } from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

import { AudienceSupportersSectionHint } from './AudienceSupportersSectionHint';
import { AudienceSupporterRow } from './AudienceSupporterRow';
import { AudienceTopTracksModal } from './AudienceTopTracksModal';
import { AudienceSupportersListModal } from './AudienceSupportersListModal';
import { AudienceCitiesModal } from './AudienceCitiesModal';
import {
  beginArtistAudienceFetch,
  isArtistAudienceFetchStale,
} from './artistAudienceFetchGeneration';
import { useArtistAudienceLiveRefresh } from './useArtistAudienceLiveRefresh';
import { SettingsSelect } from '../modals/settings/SettingsSelect';

import './AudienceTab.scss';
import './AudienceAnalyticsListModal.scss';

const COMPACT_TRACKS_VISIBLE = 2;
const TRACKS_HAS_MORE_FETCH_LIMIT = 3;
const COMPACT_SUPPORTERS_VISIBLE = 2;
const COMPACT_CITIES_VISIBLE = 2;
const CITIES_HAS_MORE_FETCH_LIMIT = 3;
const DASHBOARD_SUPPORTERS_FETCH_LIMIT = 2;

type AudienceTabContentProps = {
  active: boolean;
  ui: IInterface | null;
};

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; data: ArtistAudienceResponse }
  | { kind: 'error' };

function formatMetricValue(value: number, intlLocale: string): string {
  return value.toLocaleString(intlLocale);
}

function formatAudienceMoney(amount: number, intlLocale: string, unavailable?: boolean): string {
  if (unavailable) return '—';
  const formatted = Math.round(amount).toLocaleString(intlLocale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `${formatted} ₽`;
}

const EMPTY_REVENUE: AudienceRevenue = {
  currency: 'RUB',
  albumSales: 0,
  subscriberSupport: 0,
  total: 0,
};

function formatPeriodLabel(period: AudiencePeriod, ui: IInterface | null): string {
  const labels = ui?.dashboard?.audience?.periods;
  if (period === '7d') return labels?.days7 ?? 'Last 7 days';
  if (period === '90d') return labels?.days90 ?? 'Last 90 days';
  return labels?.days30 ?? 'Last 30 days';
}

function formatChartAxisDate(isoDate: string, intlLocale: string): string {
  const parsed = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString(intlLocale, { day: 'numeric', month: 'short' });
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
    topTracksTotal: 0,
    topCities: [],
    topCitiesTotal: 0,
    supporters: [],
    supportersTotal: 0,
    revenue: { ...EMPTY_REVENUE },
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

type AudienceRevenuePanelProps = {
  revenue: AudienceRevenue;
  locale: string;
  unavailable: boolean;
  albumSalesLabel: string;
  subscriberSupportLabel: string;
};

function AudienceRevenuePanel({
  revenue,
  locale,
  unavailable,
  albumSalesLabel,
  subscriberSupportLabel,
}: AudienceRevenuePanelProps) {
  return (
    <div className="audience-tab__revenue-body audience-tab__revenue-body--summary">
      <p className="audience-tab__revenue-total">
        {formatAudienceMoney(revenue.total, locale, unavailable)}
      </p>
      <div className="audience-tab__revenue-vrule" aria-hidden />
      <ul className="audience-tab__revenue-lines">
        <li className="audience-tab__revenue-line">
          <span className="audience-tab__revenue-line-label">
            <ShoppingBagIcon
              className="audience-tab__revenue-line-icon"
              {...dashboardActionIconProps({ size: 15 })}
              aria-hidden
            />
            {albumSalesLabel}
          </span>
          <span className="audience-tab__revenue-line-value">
            {formatAudienceMoney(revenue.albumSales, locale, unavailable)}
          </span>
        </li>
        <li className="audience-tab__revenue-line">
          <span className="audience-tab__revenue-line-label">
            <HeartHandshakeIcon
              className="audience-tab__revenue-line-icon"
              {...dashboardActionIconProps({ size: 15 })}
              aria-hidden
            />
            {subscriberSupportLabel}
          </span>
          <span className="audience-tab__revenue-line-value">
            {formatAudienceMoney(revenue.subscriberSupport, locale, unavailable)}
          </span>
        </li>
      </ul>
    </div>
  );
}

export function AudienceTabContent({ active, ui }: AudienceTabContentProps) {
  const { lang: uiLang } = useLang();
  const lang = uiLang as SupportedLang;
  const copy = ui?.dashboard?.audience;
  const intlLocale = toAudienceIntlLocale(lang);
  const [period, setPeriod] = useState<AudiencePeriod>(DEFAULT_AUDIENCE_PERIOD);
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'idle' });
  const [tracksModalOpen, setTracksModalOpen] = useState(false);
  const [supportersModalOpen, setSupportersModalOpen] = useState(false);
  const [citiesModalOpen, setCitiesModalOpen] = useState(false);
  const [liveRevision, setLiveRevision] = useState(0);

  const audienceFetchParams = useMemo(
    () => ({
      period,
      tracksLimit: TRACKS_HAS_MORE_FETCH_LIMIT,
      citiesLimit: CITIES_HAS_MORE_FETCH_LIMIT,
      supportersLimit: DASHBOARD_SUPPORTERS_FETCH_LIMIT,
    }),
    [period]
  );

  const periodOptions = useMemo(
    () =>
      AUDIENCE_PERIOD_OPTIONS.map((option) => ({
        value: option,
        label: formatPeriodLabel(option, ui),
      })),
    [ui]
  );

  const loadStats = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent === true;
      if (!silent) {
        setLoadState({ kind: 'loading' });
      }
      const generation = beginArtistAudienceFetch();
      try {
        const data = await fetchArtistAudience(audienceFetchParams);
        if (isArtistAudienceFetchStale(generation)) {
          return;
        }
        setLoadState({ kind: 'success', data });
        if (silent) {
          setLiveRevision((value) => value + 1);
        }
      } catch {
        if (isArtistAudienceFetchStale(generation)) {
          return;
        }
        if (!silent) {
          setLoadState({ kind: 'error' });
        }
      }
    },
    [audienceFetchParams]
  );

  useEffect(() => {
    if (!active) return;
    void loadStats();
  }, [active, loadStats]);

  useArtistAudienceLiveRefresh({
    enabled: active && loadState.kind === 'success',
    onRefresh: () => loadStats({ silent: true }),
  });

  useEffect(() => {
    if (!active) {
      setTracksModalOpen(false);
      setSupportersModalOpen(false);
      setCitiesModalOpen(false);
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
  const showAllTracksLabel = copy?.showAll ?? copy?.showAllTracks ?? 'Show all';
  const showAllSupportersLabel = copy?.showAllSupporters ?? 'Show all supporters';
  const showAllCitiesLabel = copy?.showAllCities ?? copy?.showAll ?? 'Show all';
  const closeModalLabel = copy?.modalClose ?? 'Close';
  const compactTracks = metrics.topTracks.slice(0, COMPACT_TRACKS_VISIBLE);
  const compactSupporters = metrics.supporters.slice(0, COMPACT_SUPPORTERS_VISIBLE);
  const compactCities = metrics.topCities.slice(0, COMPACT_CITIES_VISIBLE);
  const canShowAllTracks = !metricsUnavailable && metrics.topTracksTotal > COMPACT_TRACKS_VISIBLE;
  const canShowAllSupporters =
    !metricsUnavailable && metrics.supportersTotal > COMPACT_SUPPORTERS_VISIBLE;
  const canShowAllCities = !metricsUnavailable && metrics.topCitiesTotal > COMPACT_CITIES_VISIBLE;
  const citiesEmptyLabel = copy?.citiesEmpty ?? copy?.blockNoData ?? 'No data yet';

  const needsRuCityIndex = active && lang === 'ru' && (compactCities.length > 0 || citiesModalOpen);
  const formatCity = useAudienceCityRuIndex(needsRuCityIndex, lang);

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
        <div className="audience-tab__period-select">
          <SettingsSelect
            id="audience-period-select"
            className="audience-tab__period-select-control"
            value={period}
            options={periodOptions}
            onChange={(value) => setPeriod(value as AudiencePeriod)}
            ariaLabel={copy?.periodLabel ?? 'Period'}
          />
        </div>
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
          locale={intlLocale}
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
          locale={intlLocale}
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
          locale={intlLocale}
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
          locale={intlLocale}
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
            locale={intlLocale}
            showEmptyLabel={showEmptyStateCopy}
          />
        </div>
      </DashboardCard>

      <div className="audience-tab__list-columns">
        <DashboardCard className="audience-tab__list-card audience-tab__list-card--tracks">
          <div className="audience-tab__panel-header audience-tab__panel-header--split">
            <h3 className="audience-tab__panel-title">
              {copy?.topTracksTitle ?? 'Popular tracks'}
            </h3>
            {canShowAllTracks ? (
              <button
                type="button"
                className="audience-tab__panel-show-all"
                onClick={() => setTracksModalOpen(true)}
              >
                {showAllTracksLabel}
              </button>
            ) : null}
          </div>
          <div className="audience-tab__list-body">
            {compactTracks.length === 0 ? (
              showEmptyStateCopy ? (
                <p className="audience-tab__list-empty">{listNoDataLabel}</p>
              ) : null
            ) : (
              <ol className="audience-tab__rank-list">
                {compactTracks.map((track) => (
                  <li key={track.trackId} className="audience-tab__rank-row">
                    <span className="audience-tab__rank-num">{track.rank}</span>
                    <div className="audience-tab__rank-cover-frame">
                      <AlbumCoverImage
                        cover={track.albumCover ?? ''}
                        userId={track.albumUserId ?? undefined}
                        alt=""
                        className="audience-tab__rank-cover-image"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                    <span className="audience-tab__rank-title">{track.title}</span>
                    <span className="audience-tab__rank-plays">
                      {formatMetricValue(track.plays, intlLocale)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </DashboardCard>

        <DashboardCard className="audience-tab__list-card audience-tab__list-card--supporters">
          <div className="audience-tab__panel-header audience-tab__panel-header--split">
            <h3 className="audience-tab__panel-title">
              <span>{copy?.supportersTitle ?? 'Supporters'}</span>
              <AudienceSupportersSectionHint
                ariaLabel={copy?.supportersSectionHintAria ?? 'About supporters'}
                tooltipText={
                  copy?.supportersSectionHint ??
                  'Listeners with an active Premium subscription who have added you to their collection.'
                }
              />
            </h3>
            {canShowAllSupporters ? (
              <button
                type="button"
                className="audience-tab__panel-show-all"
                onClick={() => setSupportersModalOpen(true)}
              >
                {showAllSupportersLabel}
              </button>
            ) : null}
          </div>
          <div className="audience-tab__list-body">
            {compactSupporters.length === 0 ? (
              showEmptyStateCopy ? (
                <p className="audience-tab__list-empty">{listNoDataLabel}</p>
              ) : null
            ) : (
              <ul className="audience-tab__supporters">
                {compactSupporters.map((supporter) => {
                  const slug = supporter.publicArtistSlug?.trim();
                  const artistPagePath = slug ? buildArtistPagePath(lang, slug) : null;
                  return (
                    <AudienceSupporterRow
                      key={supporter.userId}
                      supporter={supporter}
                      artistPagePath={artistPagePath}
                    />
                  );
                })}
              </ul>
            )}
          </div>
        </DashboardCard>
      </div>

      <DashboardCard className="audience-tab__list-card audience-tab__cities-card">
        <div className="audience-tab__panel-header audience-tab__panel-header--split">
          <h3 className="audience-tab__panel-title">
            <span>{copy?.citiesTitle ?? 'Cities'}</span>
          </h3>
          {canShowAllCities ? (
            <button
              type="button"
              className="audience-tab__panel-show-all"
              onClick={() => setCitiesModalOpen(true)}
            >
              {showAllCitiesLabel}
            </button>
          ) : null}
        </div>
        <div className="audience-tab__list-body">
          {compactCities.length === 0 ? (
            showEmptyStateCopy ? (
              <p className="audience-tab__list-empty">{citiesEmptyLabel}</p>
            ) : null
          ) : (
            <ol className="audience-tab__rank-list">
              {compactCities.map((row) => (
                <li
                  key={`${row.countryCode}:${row.city}:${row.rank}`}
                  className="audience-tab__rank-row audience-tab__rank-row--city"
                >
                  <span className="audience-tab__rank-num">{row.rank}</span>
                  <span className="audience-tab__rank-city" title={row.city}>
                    {formatCity(row.city, row.countryCode)}
                  </span>
                  <span className="audience-tab__rank-country">
                    {formatAudienceCountryName(row.countryCode, lang)}
                  </span>
                  <span className="audience-tab__rank-plays">
                    {formatAudienceMetricValue(row.plays, lang)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </DashboardCard>

      <DashboardCard className="audience-tab__list-card audience-tab__list-card--revenue audience-tab__revenue-card">
        <div className="audience-tab__panel-header">
          <h3 className="audience-tab__panel-title">{copy?.revenueTitle ?? 'Revenue'}</h3>
        </div>
        <AudienceRevenuePanel
          revenue={metrics.revenue}
          locale={intlLocale}
          unavailable={metricsUnavailable}
          albumSalesLabel={copy?.revenueAlbumSales ?? 'Album sales'}
          subscriberSupportLabel={copy?.revenueSubscriberSupport ?? 'Subscriber support'}
        />
      </DashboardCard>

      <div className="audience-tab__scroll-tail" aria-hidden />

      <AudienceTopTracksModal
        isOpen={tracksModalOpen}
        period={period}
        liveRevision={liveRevision}
        locale={intlLocale}
        title={copy?.topTracksTitle ?? 'Popular tracks'}
        closeLabel={closeModalLabel}
        trackColumnLabel={copy?.tracksModalTrackColumn ?? 'Track'}
        playsColumnLabel={copy?.tracksModalPlaysColumn ?? 'Plays'}
        errorLabel={loadErrorMessage}
        onClose={() => setTracksModalOpen(false)}
      />
      <AudienceSupportersListModal
        isOpen={supportersModalOpen}
        period={period}
        liveRevision={liveRevision}
        lang={lang}
        title={copy?.supportersTitle ?? 'Supporters'}
        closeLabel={closeModalLabel}
        errorLabel={loadErrorMessage}
        onClose={() => setSupportersModalOpen(false)}
      />
      <AudienceCitiesModal
        isOpen={citiesModalOpen}
        period={period}
        liveRevision={liveRevision}
        lang={lang}
        title={copy?.citiesTitle ?? 'Cities'}
        closeLabel={closeModalLabel}
        cityColumnLabel={copy?.citiesModalCityColumn ?? 'City'}
        countryColumnLabel={copy?.citiesModalCountryColumn ?? 'Country'}
        playsColumnLabel={copy?.citiesModalPlaysColumn ?? 'Plays'}
        errorLabel={loadErrorMessage}
        onClose={() => setCitiesModalOpen(false)}
      />
    </div>
  );
}
