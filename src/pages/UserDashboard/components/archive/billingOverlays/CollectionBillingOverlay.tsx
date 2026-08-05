import {
  BILLING_OVERLAY,
  type BillingOverlay,
} from '@features/premiumSubscription/lib/billingOverlay';
import type { BillingSnapshot } from '@shared/api/billing';

import type { CollectionBillingCopy } from '../CollectionBillingSummary';

import { PreBillingBanner } from './PreBillingBanner';
import { ScheduledDowngradeBanner } from './ScheduledDowngradeBanner';

export type CollectionBillingOverlayProps = {
  overlay: BillingOverlay;
  billing: BillingSnapshot;
  slotsUsed: number;
  lang: 'en' | 'ru';
  copy: CollectionBillingCopy;
  cancelScheduledDowngradeLoading?: boolean;
  onCancelScheduledDowngrade?: () => void;
};

export function CollectionBillingOverlay({
  overlay,
  billing,
  slotsUsed,
  lang,
  copy,
  cancelScheduledDowngradeLoading = false,
  onCancelScheduledDowngrade,
}: CollectionBillingOverlayProps) {
  switch (overlay) {
    case BILLING_OVERLAY.PRE_BILLING:
      return (
        <PreBillingBanner
          billing={billing}
          lang={lang}
          copy={{
            title: copy.billingPreBillingBannerTitle,
            body: copy.billingPreBillingBannerBody,
            priceCurrency: copy.priceCurrency,
          }}
        />
      );
    case BILLING_OVERLAY.DOWNGRADE_SLOTS:
      return (
        <ScheduledDowngradeBanner
          billing={billing}
          slotsUsed={slotsUsed}
          lang={lang}
          copy={{
            title: copy.billingDowngradeSlotsBannerTitle,
            body: copy.billingDowngradeSlotsBannerBody,
            cta: copy.billingDowngradeSlotsBannerCta,
          }}
          loading={cancelScheduledDowngradeLoading}
          onCancelScheduledDowngrade={onCancelScheduledDowngrade ?? (() => undefined)}
        />
      );
    default: {
      const unreachable: never = overlay;
      return unreachable;
    }
  }
}
