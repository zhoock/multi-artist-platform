import { AlertCircle } from 'lucide-react';

import { DashboardButton } from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

export type BillingAlertBannerProps = {
  title: string;
  body: string;
  supplementalLines?: string[];
  ctaLabel?: string;
  loading?: boolean;
  onAction?: () => void;
};

export function BillingAlertBanner({
  title,
  body,
  supplementalLines = [],
  ctaLabel,
  loading = false,
  onAction,
}: BillingAlertBannerProps) {
  return (
    <div className="collection-billing__banner">
      <span className="collection-billing__banner-icon" aria-hidden>
        <AlertCircle {...dashboardActionIconProps({ size: 20 })} />
      </span>
      <div className="collection-billing__banner-text">
        <p className="collection-billing__banner-title">{title}</p>
        <p className="collection-billing__banner-body">{body}</p>
        {supplementalLines.map((line) => (
          <p key={line} className="collection-billing__banner-supplement">
            {line}
          </p>
        ))}
      </div>
      {ctaLabel && onAction ? (
        <DashboardButton
          variant="outline"
          className="collection-billing__accent-button"
          loading={loading}
          disabled={loading}
          onClick={onAction}
        >
          {ctaLabel}
        </DashboardButton>
      ) : null}
    </div>
  );
}
