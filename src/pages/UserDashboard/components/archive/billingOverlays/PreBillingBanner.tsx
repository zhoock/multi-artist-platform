import type { BillingSnapshot } from '@shared/api/billing';
import {
  getPlanDisplayName,
  getPlanPriceDisplayAmount,
} from '@shared/lib/payment/subscriptionPlans';

import { formatCollectionRenewalDate } from '../lib/collectionSubscriptionStatus';

import { BillingAlertBanner } from './BillingAlertBanner';

export type PreBillingBannerCopy = {
  title: string;
  body: string;
  priceCurrency: string;
};

export type PreBillingBannerProps = {
  billing: BillingSnapshot;
  lang: 'en' | 'ru';
  copy: PreBillingBannerCopy;
};

export function PreBillingBanner({ billing, lang, copy }: PreBillingBannerProps) {
  const chargeDate = billing.nextChargeAt
    ? formatCollectionRenewalDate(billing.nextChargeAt, lang)
    : null;
  const planName = billing.plan ? getPlanDisplayName(billing.plan) : '—';
  const priceAmount = billing.plan ? getPlanPriceDisplayAmount(billing.plan) : '—';

  const body = copy.body
    .replace('{date}', chargeDate ?? '—')
    .replace('{plan}', planName)
    .replace('{amount}', priceAmount)
    .replace('{currency}', copy.priceCurrency);

  return <BillingAlertBanner title={copy.title} body={body} />;
}
