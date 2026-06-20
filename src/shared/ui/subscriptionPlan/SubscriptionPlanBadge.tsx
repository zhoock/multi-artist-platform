import {
  getPlanDisplayName,
  type SubscriptionPlanSlug,
} from '@shared/lib/payment/subscriptionPlans';

import './subscriptionPlanBadge.scss';

type Props = {
  planSlug: SubscriptionPlanSlug;
  className?: string;
};

export function SubscriptionPlanBadge({ planSlug, className }: Props) {
  return (
    <span className={['subscription-plan-badge', className].filter(Boolean).join(' ')}>
      {getPlanDisplayName(planSlug)}
    </span>
  );
}
