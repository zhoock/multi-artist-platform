import type { BillingSnapshot } from '@shared/api/billing';
import { getPlanDisplayName, getPlanDefinition } from '@shared/lib/payment/subscriptionPlans';

import { formatCollectionRenewalDate } from '../lib/collectionSubscriptionStatus';

import { BillingAlertBanner } from './BillingAlertBanner';

export type ScheduledDowngradeBannerCopy = {
  title: string;
  body: string;
  cta: string;
};

export type ScheduledDowngradeBannerProps = {
  billing: BillingSnapshot;
  slotsUsed: number;
  lang: 'en' | 'ru';
  copy: ScheduledDowngradeBannerCopy;
  loading?: boolean;
  onCancelScheduledDowngrade: () => void;
};

export function ScheduledDowngradeBanner({
  billing,
  slotsUsed,
  lang,
  copy,
  loading = false,
  onCancelScheduledDowngrade,
}: ScheduledDowngradeBannerProps) {
  const scheduledPlan = billing.scheduledPlan;
  const effectiveDate = billing.expiresAt
    ? formatCollectionRenewalDate(billing.expiresAt, lang)
    : null;
  const scheduledPlanName = scheduledPlan ? getPlanDisplayName(scheduledPlan) : '—';
  const scheduledLimit = scheduledPlan ? getPlanDefinition(scheduledPlan).slotsLimit : 0;

  const body = copy.body
    .replace('{date}', effectiveDate ?? '—')
    .replace('{plan}', scheduledPlanName)
    .replace('{used}', String(slotsUsed))
    .replace('{limit}', String(scheduledLimit));

  return (
    <BillingAlertBanner
      title={copy.title}
      body={body}
      ctaLabel={copy.cta}
      loading={loading}
      onAction={onCancelScheduledDowngrade}
    />
  );
}
