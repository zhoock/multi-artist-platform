import { Clock } from 'lucide-react';

import {
  getPlanDisplayName,
  type SubscriptionPlanSlug,
} from '@shared/lib/payment/subscriptionPlans';

type Props = {
  targetPlanSlug: SubscriptionPlanSlug;
  effectiveDateLabel: string;
  titleTemplate: string;
  bodyTemplate: string;
  detailsLabel: string;
  onDetails: () => void;
};

export function SubscriptionPlanScheduledBanner({
  targetPlanSlug,
  effectiveDateLabel,
  titleTemplate,
  bodyTemplate,
  detailsLabel,
  onDetails,
}: Props) {
  const planName = getPlanDisplayName(targetPlanSlug);
  const title = titleTemplate.replace('{plan}', planName);
  const body = bodyTemplate.replace('{date}', effectiveDateLabel);

  return (
    <div className="subscription-plan-modal__scheduled-banner" role="status">
      <span className="subscription-plan-modal__scheduled-banner-icon" aria-hidden>
        <Clock size={20} strokeWidth={1.75} />
      </span>
      <div className="subscription-plan-modal__scheduled-banner-text">
        <p className="subscription-plan-modal__scheduled-banner-title">{title}</p>
        <p className="subscription-plan-modal__scheduled-banner-body">{body}</p>
      </div>
      <button
        type="button"
        className="subscription-plan-modal__scheduled-banner-details"
        onClick={onDetails}
      >
        {detailsLabel}
      </button>
    </div>
  );
}
