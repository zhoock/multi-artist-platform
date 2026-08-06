import clsx from 'clsx';
import { Calendar } from 'lucide-react';
import { type CSSProperties, useMemo } from 'react';

import type { BillingSnapshot } from '@shared/api/billing';
import type { BillingOverlay } from '@features/premiumSubscription/lib/billingOverlay';
import type { BillingScreen } from '@features/premiumSubscription/lib/billingScreen';
import { resolveDunningBannerSupplement } from '@features/premiumSubscription/lib/subscriptionBillingPolicy';
import {
  formatPlanArtistLimitParts,
  formatPlanPricePeriod,
  getPlanDisplayName,
  getPlanPriceDisplayAmount,
  resolveRecommendedPlanSlug,
  type SubscriptionPlanSlug,
} from '@shared/lib/payment/subscriptionPlans';
import { DashboardButton, DashboardCard } from '@shared/ui/dashboard';

import { BillingAlertBanner } from './billingOverlays/BillingAlertBanner';
import { CollectionBillingOverlay } from './billingOverlays/CollectionBillingOverlay';
import { formatCollectionRenewalDate } from './lib/collectionSubscriptionStatus';

export type CollectionBillingCopy = {
  billingCurrentPlanSection: string;
  billingLastPlanSection: string;
  billingSupportSection: string;
  billingSupportActiveUntil: string;
  billingNextChargeOn: string;
  billingSupportExpiredOn: string;
  billingChangePlanButton: string;
  billingRecommendedPlanSection: string;
  billingUpgradePlanButton: string;
  billingCollectionUsageSection: string;
  billingCollectionUsageCount: string;
  billingCancelledBannerTitle: string;
  billingCancelledBannerBody: string;
  billingCancelledBannerCta: string;
  billingExpiredBannerTitle: string;
  billingExpiredBannerBody: string;
  billingExpiredBannerCta: string;
  billingPaymentFailedBannerTitle: string;
  billingPaymentFailedBannerBody: string;
  billingPaymentFailedBannerCta: string;
  billingPaymentFailedNextRetry: string;
  billingPaymentFailedGraceEnds: string;
  billingDowngradeSlotsBannerTitle: string;
  billingDowngradeSlotsBannerBody: string;
  billingDowngradeSlotsBannerCta: string;
  priceCurrency: string;
  activeSlotsLabel: string;
  billingDisableAutoRenewLink: string;
};

export type CollectionBillingSummaryProps = {
  screen: BillingScreen;
  billing: BillingSnapshot;
  overlays: BillingOverlay[];
  slotsUsed: number;
  lang: 'en' | 'ru';
  copy: CollectionBillingCopy;
  changePlanLoading?: boolean;
  bannerActionLoading?: boolean;
  cancelScheduledDowngradeLoading?: boolean;
  /** When false, hides disable/resume/rebind CTAs that require SUBSCRIPTION_AUTO_RENEW_ENABLED. */
  autoRenewActionsEnabled?: boolean;
  onChangePlan: () => void;
  onBannerAction: () => void;
  onUpgradePlan: () => void;
  onCancelScheduledDowngrade?: () => void;
  onDisableAutoRenew?: () => void;
};

type PlanStatusVariant = 'active' | 'cancelled' | 'lapsed';

function planSectionLabel(screen: BillingScreen, copy: CollectionBillingCopy): string {
  if (screen === 'EXPIRED' || screen === 'PAYMENT_FAILED') {
    return copy.billingLastPlanSection;
  }
  return copy.billingCurrentPlanSection;
}

function planStatusVariant(screen: BillingScreen): PlanStatusVariant {
  switch (screen) {
    case 'ACTIVE':
      return 'active';
    case 'CANCELLED':
      return 'cancelled';
    case 'PAYMENT_FAILED':
    case 'EXPIRED':
      return 'lapsed';
    default:
      return 'active';
  }
}

function formatDunningSupplementLines(
  billing: BillingSnapshot,
  copy: CollectionBillingCopy,
  lang: 'en' | 'ru'
): string[] {
  return resolveDunningBannerSupplement(billing).flatMap((supplement) => {
    const dateLabel = formatCollectionRenewalDate(supplement.at, lang);
    if (!dateLabel) return [];

    if (supplement.kind === 'nextRetry') {
      return [copy.billingPaymentFailedNextRetry.replace('{date}', dateLabel)];
    }

    return [copy.billingPaymentFailedGraceEnds.replace('{date}', dateLabel)];
  });
}

function PlanStatusLine({ variant, text }: { variant: PlanStatusVariant; text: string }) {
  return (
    <p
      className={clsx(
        'collection-billing__status-line',
        `collection-billing__status-line--${variant}`
      )}
    >
      {variant === 'lapsed' ? (
        <Calendar className="collection-billing__status-calendar" aria-hidden size={16} />
      ) : (
        <span className="collection-billing__status-dot" aria-hidden />
      )}
      {text}
    </p>
  );
}

export function CollectionBillingSummary({
  screen,
  billing,
  overlays,
  slotsUsed,
  lang,
  copy,
  changePlanLoading = false,
  bannerActionLoading = false,
  cancelScheduledDowngradeLoading = false,
  autoRenewActionsEnabled = true,
  onChangePlan,
  onBannerAction,
  onUpgradePlan,
  onCancelScheduledDowngrade,
  onDisableAutoRenew,
}: CollectionBillingSummaryProps) {
  const dunningSupplementLines = useMemo(
    () => (screen === 'PAYMENT_FAILED' ? formatDunningSupplementLines(billing, copy, lang) : []),
    [billing, copy, lang, screen]
  );

  if (screen === 'NONE') return null;

  const planSlug = billing.plan;
  const expiresLabel = billing.expiresAt
    ? formatCollectionRenewalDate(billing.expiresAt, lang)
    : null;
  const nextChargeLabel = billing.nextChargeAt
    ? formatCollectionRenewalDate(billing.nextChargeAt, lang)
    : null;

  const recommendedPlanSlug = resolveRecommendedPlanSlug(planSlug);
  const slotsLimit = billing.slotsLimit;
  const slotsProgress =
    slotsLimit <= 0 ? 0 : Math.min(100, Math.round((slotsUsed / slotsLimit) * 100));

  const statusVariant = planStatusVariant(screen);
  const statusText =
    statusVariant === 'lapsed'
      ? expiresLabel
        ? copy.billingSupportExpiredOn.replace('{date}', expiresLabel)
        : copy.billingSupportExpiredOn.replace('{date}', '—')
      : screen === 'ACTIVE'
        ? nextChargeLabel
          ? copy.billingNextChargeOn.replace('{date}', nextChargeLabel)
          : copy.billingNextChargeOn.replace('{date}', '—')
        : expiresLabel
          ? copy.billingSupportActiveUntil.replace('{date}', expiresLabel)
          : copy.billingSupportActiveUntil.replace('{date}', '—');

  const usageCountLabel = copy.billingCollectionUsageCount
    .replace('{used}', String(slotsUsed))
    .replace('{limit}', String(slotsLimit));

  return (
    <div className={clsx('collection-billing', `collection-billing--${screen.toLowerCase()}`)}>
      {screen === 'CANCELLED' ? (
        <BillingAlertBanner
          title={copy.billingCancelledBannerTitle}
          body={copy.billingCancelledBannerBody}
          ctaLabel={autoRenewActionsEnabled ? copy.billingCancelledBannerCta : undefined}
          loading={bannerActionLoading}
          onAction={autoRenewActionsEnabled ? onBannerAction : undefined}
        />
      ) : null}

      {screen === 'EXPIRED' ? (
        <BillingAlertBanner
          title={copy.billingExpiredBannerTitle}
          body={copy.billingExpiredBannerBody}
          ctaLabel={copy.billingExpiredBannerCta}
          loading={bannerActionLoading}
          onAction={onBannerAction}
        />
      ) : null}

      {screen === 'PAYMENT_FAILED' ? (
        <BillingAlertBanner
          title={copy.billingPaymentFailedBannerTitle}
          body={copy.billingPaymentFailedBannerBody}
          supplementalLines={dunningSupplementLines}
          ctaLabel={autoRenewActionsEnabled ? copy.billingPaymentFailedBannerCta : undefined}
          loading={bannerActionLoading}
          onAction={autoRenewActionsEnabled ? onBannerAction : undefined}
        />
      ) : null}

      {overlays.length > 0 ? (
        <div className="collection-billing__overlay-stack">
          {overlays.map((overlay) => (
            <CollectionBillingOverlay
              key={overlay}
              overlay={overlay}
              billing={billing}
              slotsUsed={slotsUsed}
              lang={lang}
              copy={copy}
              cancelScheduledDowngradeLoading={cancelScheduledDowngradeLoading}
              onCancelScheduledDowngrade={onCancelScheduledDowngrade}
            />
          ))}
        </div>
      ) : null}

      <div className="collection-billing__plan-cards">
        <DashboardCard className="collection-billing__plan-card collection-billing__plan-card--current">
          <h3 className="collection-billing__section-title">{planSectionLabel(screen, copy)}</h3>
          {planSlug ? (
            <>
              <PlanHeadline planSlug={planSlug} lang={lang} copy={copy} />
              <PlanStatusLine variant={statusVariant} text={statusText} />
              {screen === 'ACTIVE' ? (
                <div className="collection-billing__plan-action">
                  <DashboardButton
                    variant="outline"
                    loading={changePlanLoading}
                    disabled={changePlanLoading}
                    onClick={onChangePlan}
                  >
                    {copy.billingChangePlanButton}
                  </DashboardButton>
                  {autoRenewActionsEnabled && onDisableAutoRenew ? (
                    <button
                      type="button"
                      className="collection-billing__disable-autorenew"
                      disabled={changePlanLoading}
                      onClick={onDisableAutoRenew}
                    >
                      {copy.billingDisableAutoRenewLink}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
        </DashboardCard>

        {recommendedPlanSlug ? (
          <DashboardCard className="collection-billing__plan-card collection-billing__plan-card--recommended">
            <h3 className="collection-billing__section-title">
              {copy.billingRecommendedPlanSection}
            </h3>
            <PlanHeadline planSlug={recommendedPlanSlug} lang={lang} copy={copy} />
            <div className="collection-billing__plan-action">
              <DashboardButton variant="primary" onClick={onUpgradePlan}>
                {copy.billingUpgradePlanButton}
              </DashboardButton>
            </div>
          </DashboardCard>
        ) : null}
      </div>

      <DashboardCard className="collection-billing__usage-card">
        <h3 className="collection-billing__section-title">{copy.billingCollectionUsageSection}</h3>
        <p className="collection-billing__usage-count">
          <span className="collection-billing__usage-count-value">{usageCountLabel}</span>{' '}
          {copy.activeSlotsLabel}
        </p>
        <div
          className="collection-billing__usage-progress"
          aria-hidden
          style={{ '--collection-slots-progress': `${slotsProgress}%` } as CSSProperties}
        >
          <span className="collection-billing__usage-progress-fill" />
        </div>
      </DashboardCard>
    </div>
  );
}

function PlanHeadline({
  planSlug,
  lang,
  copy,
}: {
  planSlug: SubscriptionPlanSlug;
  lang: 'en' | 'ru';
  copy: CollectionBillingCopy;
}) {
  const artistLimit = formatPlanArtistLimitParts(planSlug, lang);
  const priceAmount = getPlanPriceDisplayAmount(planSlug);
  const pricePeriod = formatPlanPricePeriod(planSlug, lang);

  return (
    <div className="collection-billing__plan-headline">
      <div className="collection-billing__plan-name-row">
        <p className="collection-billing__plan-name">{getPlanDisplayName(planSlug)}</p>
        <p className="collection-billing__plan-price">
          {priceAmount} {copy.priceCurrency}
          {pricePeriod}
        </p>
      </div>
      <p className="collection-billing__plan-limit">
        <span>{artistLimit.prefix}</span>{' '}
        <span className="collection-billing__plan-limit-count">{artistLimit.count}</span>{' '}
        <span>{artistLimit.suffix}</span>
      </p>
    </div>
  );
}
